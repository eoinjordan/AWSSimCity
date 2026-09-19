import { z } from 'zod'
import type { CityModel, District, ModelView } from '../types'

const schema = z.object({
  arrivals: z.number().int().min(1).max(12).default(4),
  replicas: z.number().int().min(1).max(4).default(2),
  cache: z.boolean().default(true),
}).strict()

interface Request { id: number }
interface Worker { request: Request; zone: number; remaining: number }
interface DatabaseJob { request: Request; remaining: number }

export class AwsModel implements CityModel {
  settings = schema.parse({})
  tick = 0
  arrived = 0
  completed = 0
  rejected = 0
  cacheHits = 0
  zoneFailed = false
  databaseOnline = true
  queue: Request[] = []
  workers: Worker[] = []
  databaseQueue: Request[] = []
  databaseJob: DatabaseJob | null = null
  events: string[] = []
  history: number[] = []

  get inFlight(): number { return this.queue.length + this.workers.length + this.databaseQueue.length + Number(this.databaseJob !== null) }

  configure(patch: Record<string, unknown>): void {
    const settings = schema.parse({ ...this.settings, ...patch })
    this.settings = settings
    this.reset()
  }

  reset(): void {
    this.tick = this.arrived = this.completed = this.rejected = this.cacheHits = 0
    this.zoneFailed = false
    this.databaseOnline = true
    this.queue = []
    this.workers = []
    this.databaseQueue = []
    this.databaseJob = null
    this.events = ['Baseline restored; all three zones available.']
    this.history = []
  }

  act(action: string): void {
    if (action === 'zone') {
      this.zoneFailed = !this.zoneFailed
      this.log(this.zoneFailed ? 'AZ B unavailable; its in-flight requests fail on the next tick.' : 'AZ B restored; targets can receive new requests.')
    } else if (action === 'database') {
      this.databaseOnline = !this.databaseOnline
      this.log(this.databaseOnline ? 'Database service resumed.' : 'Database stalled; the bounded queue continues to fill.')
    } else throw new RangeError('Unknown AWS action')
  }

  step(): void {
    this.tick += 1
    const beforeCompleted = this.completed
    const beforeRejected = this.rejected
    if (this.databaseJob && this.databaseOnline) {
      this.databaseJob.remaining -= 1
      if (this.databaseJob.remaining === 0) { this.completed += 1; this.databaseJob = null }
    }
    this.workers = this.workers.filter((worker) => {
      if (this.zoneFailed && worker.zone === 1) { this.rejected += 1; return false }
      worker.remaining -= 1
      if (worker.remaining > 0) return true
      if (this.settings.cache && worker.request.id % 5 !== 0) { this.cacheHits += 1; this.completed += 1 }
      else if (this.databaseQueue.length < 12) this.databaseQueue.push(worker.request)
      else this.rejected += 1
      return false
    })
    if (!this.databaseJob && this.databaseOnline && this.databaseQueue.length) {
      this.databaseJob = { request: this.databaseQueue.shift()!, remaining: 2 }
    }
    for (let count = 0; count < this.settings.arrivals; count += 1) {
      const request = { id: this.arrived++ }
      if (this.queue.length < 24) this.queue.push(request)
      else this.rejected += 1
    }
    for (const zone of [0, 1, 2]) {
      if (this.zoneFailed && zone === 1) continue
      let used = this.workers.filter((worker) => worker.zone === zone).length
      while (used < this.settings.replicas && this.queue.length) {
        this.workers.push({ request: this.queue.shift()!, zone, remaining: 2 })
        used += 1
      }
    }
    this.history.push(this.completed - beforeCompleted)
    this.history = this.history.slice(-48)
    if (this.rejected > beforeRejected) this.log(`${this.rejected - beforeRejected} request(s) failed or rejected by a full queue.`)
    else if (this.tick % 4 === 0) this.log(`${this.completed - beforeCompleted} completions; ${this.databaseQueue.length} waiting for the database.`)
  }

  private log(message: string): void { this.events.unshift(`T${this.tick} / ${message}`); this.events = this.events.slice(0, 8) }

  view(): ModelView {
    const source = 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html'
    const nodes: District[] = [
      { id: 'clients', name: 'Clients', kind: 'gateway', color: '#d59a30', x: -7, z: 0, height: 1.1, value: `${this.settings.arrivals} / tick`, detail: 'Synthetic arrivals enter a 24-request ingress queue. A full queue rejects new requests. No traffic reaches AWS.', source, state: 'active', load: this.settings.arrivals / 12 },
      { id: 'alb', name: 'Load balancer', kind: 'gateway', color: '#1c9e91', x: -4, z: 0, height: 1.5, value: `${this.queue.length} queued`, detail: 'Available worker slots receive queued requests in a deterministic zone order. This finite-capacity routing example is not the ALB routing algorithm, health-check timing, or an AWS quota.', source, state: this.queue.length > 0 ? 'waiting' : 'active', load: this.queue.length / 24 },
      ...[0, 1, 2].map((zone): District => {
        const used = this.workers.filter((worker) => worker.zone === zone).length
        const offline = this.zoneFailed && zone === 1
        return { id: `zone-${zone}`, name: `AZ ${['A', 'B', 'C'][zone]}`, kind: 'compute', color: ['#30978a', '#557dbc', '#c56782'][zone], x: 0, z: (zone - 1) * 3.5, height: 1.6, value: offline ? 'Unavailable' : `${used} / ${this.settings.replicas} busy`, detail: 'Each target handles one request in two model ticks. Replicas are fixed by the control, not an Auto Scaling policy. Zone failure drops its in-flight requests; retries and health-check convergence are omitted.', source: 'https://docs.aws.amazon.com/whitepapers/latest/aws-fault-isolation-boundaries/availability-zones.html', state: offline ? 'offline' : used ? 'active' : 'idle', load: used / this.settings.replicas }
      }),
      { id: 'cache', name: 'Cache', kind: 'memory', color: '#a2a533', x: 4, z: -2.8, height: 1.2, value: this.settings.cache ? `${this.cacheHits} hits` : 'Bypassed', detail: 'A fixed request-ID pattern produces four hits out of five when enabled. Hits complete after worker service; misses enter the database queue. This is not an ElastiCache implementation or an observed hit rate.', source: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html', state: this.settings.cache ? 'active' : 'offline', load: this.settings.cache ? .8 : 0 },
      { id: 'database', name: 'Database', kind: 'memory', color: '#bd6476', x: 4, z: 2.8, height: 2, value: `${this.databaseQueue.length} / 12 queued`, detail: 'One illustrative database worker takes two ticks per request. A full waiting queue rejects work. Multi-AZ database replication, automatic failover, durability, SQL execution, and AWS performance are not modeled.', source: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html', state: this.databaseOnline ? this.databaseQueue.length ? 'waiting' : 'active' : 'offline', load: this.databaseQueue.length / 12 },
    ]
    return { tick: this.tick, status: !this.databaseOnline ? 'DATABASE STALLED' : this.zoneFailed ? 'ZONE DEGRADED' : 'THREE ZONES AVAILABLE', nodes,
      links: [{ from: 'clients', to: 'alb', color: '#d59a30', active: true }, ...[0, 1, 2].flatMap((zone) => [{ from: 'alb', to: `zone-${zone}`, color: '#279e92', active: !(this.zoneFailed && zone === 1) }, { from: `zone-${zone}`, to: 'cache', color: '#a2a533', active: this.settings.cache && !(this.zoneFailed && zone === 1) }, { from: `zone-${zone}`, to: 'database', color: '#bd6476', active: this.databaseOnline && !(this.zoneFailed && zone === 1) }])],
      metrics: [{ id: 'arrivals', label: 'Arrived', value: String(this.arrived), unit: 'requests' }, { id: 'completed', label: 'Completed', value: String(this.completed), unit: 'requests' }, { id: 'rejected', label: 'Failed / rejected', value: String(this.rejected), unit: 'requests' }, { id: 'inflight', label: 'Queued / in flight', value: String(this.inFlight), unit: 'requests' }],
      events: this.events, history: this.history, historyLabel: 'Completions / model tick' }
  }

  snapshot(): object {
    return structuredClone({ schema: 'simcity/v1', app: 'aws', kind: 'illustrative-model', settings: this.settings, tick: this.tick, arrived: this.arrived, completed: this.completed, rejected: this.rejected, cacheHits: this.cacheHits, queue: this.queue, workers: this.workers, databaseQueue: this.databaseQueue, databaseJob: this.databaseJob, zoneFailed: this.zoneFailed, databaseOnline: this.databaseOnline })
  }
}