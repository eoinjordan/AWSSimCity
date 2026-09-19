import { mountApp } from './app'
import { AwsModel } from './sim/model'

const dispose = mountApp(new AwsModel(), {
  id: 'aws', name: 'AWS SimCity', eyebrow: 'REGION / THREE AVAILABILITY ZONES', title: 'Service resilience', accent: '#278d7c', dark: false,
  controls: [
    { key: 'arrivals', label: 'Incoming requests', kind: 'range', min: 1, max: 12, step: 1, unit: '/ tick' },
    { key: 'replicas', label: 'Targets per zone', kind: 'range', min: 1, max: 4, step: 1, unit: 'targets' },
    { key: 'cache', label: 'Cache enabled', kind: 'toggle' },
  ],
  actions: [{ id: 'zone', label: 'Toggle AZ B availability' }, { id: 'database', label: 'Toggle database service' }],
  tour: ['clients', 'alb', 'zone-1', 'cache', 'database'],
  boundary: 'Synthetic requests and model ticks. No AWS calls, cost estimates, live metrics, or real failover. Independent of Amazon Web Services.',
  repository: 'https://github.com/eoinjordan/AWSSimCity',
})
if (import.meta.hot) import.meta.hot.dispose(dispose)
