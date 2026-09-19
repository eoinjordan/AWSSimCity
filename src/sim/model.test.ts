import assert from 'node:assert/strict'
import test from 'node:test'
import { AwsModel } from './model.ts'

test('all requests reconcile across overload, failure, and recovery', () => {
  const model = new AwsModel()
  model.configure({ arrivals: 12, replicas: 1 })
  for (let tick = 0; tick < 120; tick += 1) {
    if (tick === 20 || tick === 70) model.act('zone')
    if (tick === 30 || tick === 80) model.act('database')
    model.step()
    assert.equal(model.arrived, model.completed + model.rejected + model.inFlight)
    assert.ok(model.queue.length <= 24)
    assert.ok(model.databaseQueue.length <= 12)
  }
  assert.ok(model.rejected > 0)
  assert.ok(model.completed > 0)
})

test('cache bypass increases database pressure under the same arrivals', () => {
  const cached = new AwsModel()
  const uncached = new AwsModel()
  uncached.configure({ cache: false })
  for (let tick = 0; tick < 80; tick += 1) { cached.step(); uncached.step() }
  assert.ok(cached.completed > uncached.completed)
  assert.ok(uncached.rejected > cached.rejected)
})

test('invalid configuration is rejected before state changes', () => {
  const model = new AwsModel()
  model.step()
  const before = model.snapshot()
  for (const patch of [{ arrivals: NaN }, { replicas: 0 }, { cache: 'yes' }, { unknown: 1 }]) {
    assert.throws(() => model.configure(patch))
    assert.deepEqual(model.snapshot(), before)
  }
})

test('reset and replay preserve configuration and exact request state', () => {
  const model = new AwsModel()
  model.configure({ arrivals: 6, replicas: 3 })
  const run = () => { for (let tick = 0; tick < 40; tick += 1) { if (tick === 5) model.act('zone'); model.step() } }
  run()
  const expected = model.snapshot()
  model.reset()
  run()
  assert.deepEqual(model.snapshot(), expected)
})