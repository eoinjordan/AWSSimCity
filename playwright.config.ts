import { defineConfig } from '@playwright/test'

const port = Number(process.env.TEST_PORT ?? 4190)
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: `http://127.0.0.1:${port}/__pages_test__/`,
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort --base=/__pages_test__/`,
    url: `http://127.0.0.1:${port}/__pages_test__/`,
    reuseExistingServer: false,
    timeout: 120000,
  },
})