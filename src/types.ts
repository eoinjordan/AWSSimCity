export type Setting = string | number | boolean
export interface District {
  id: string
  name: string
  kind: 'gateway' | 'compute' | 'memory' | 'matrix'
  color: string
  x: number
  z: number
  height: number
  value: string
  detail: string
  source: string
  state: 'active' | 'waiting' | 'idle' | 'offline'
  load: number
}
export interface Link { from: string; to: string; color: string; active: boolean }
export interface Metric { id: string; label: string; value: string; unit: string }
export interface ModelView {
  tick: number
  status: string
  metrics: Metric[]
  nodes: District[]
  links: Link[]
  events: string[]
  history: number[]
  historyLabel: string
}
export interface CityModel {
  readonly settings: Readonly<Record<string, Setting>>
  step(): void
  reset(): void
  configure(patch: Record<string, unknown>): void
  act(action: string): void
  view(): ModelView
  snapshot(): object
}
export type Control =
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; unit: string }
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'select'; options: { value: Setting; label: string }[] }
export interface Definition {
  id: string
  name: string
  eyebrow: string
  title: string
  accent: string
  dark: boolean
  controls: Control[]
  actions: { id: string; label: string }[]
  tour: string[]
  boundary: string
  repository: string
}