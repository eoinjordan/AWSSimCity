import { test, expect } from '@playwright/test'
import { PNG } from 'pngjs'
import { readFile } from 'node:fs/promises'

async function open(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await expect(page.locator('#scene')).toHaveAttribute('data-rendered', 'true')
  await expect(page.locator('#app')).toHaveAttribute('data-tick', '0')
  return errors
}

async function pixels(page) {
  return PNG.sync.read(await page.locator('#scene > canvas').screenshot({ style: '.world-labels { visibility: hidden !important; }' }))
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`production scene and both views fit at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors = await open(page)
    for (const view of ['iso', 'plan']) {
      await page.locator(`button[data-view="${view}"]`).click()
      await expect(page.locator('#scene')).toHaveAttribute('data-framed', await page.locator('#scene').getAttribute('data-nodes'))
      const image = await pixels(page)
      const colors = new Set()
      let colored = 0
      for (let index = 0; index < image.data.length; index += 64) {
        const [red, green, blue] = image.data.subarray(index, index + 3)
        colors.add(`${red >> 4},${green >> 4},${blue >> 4}`)
        if (Math.max(red, green, blue) - Math.min(red, green, blue) > 30) colored += 1
      }
      expect(colors.size).toBeGreaterThan(25)
      expect(colored).toBeGreaterThan(60)
      expect(image.width).toBeGreaterThan(300)
      expect(image.height).toBeGreaterThan(250)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const labels = await page.locator('.node-label:visible').evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
      }))
      for (let first = 0; first < labels.length; first += 1) for (let second = first + 1; second < labels.length; second += 1) {
        const left = labels[first]
        const right = labels[second]
        expect(left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top).toBe(false)
      }
      await page.screenshot({ path: test.info().outputPath(`${view}.png`), fullPage: true })
    }
    expect(errors).toEqual([])
  })
}

test('explicit steps update the model and pixels, reset and configuration restart the run', async ({ page }) => {
  const errors = await open(page)
  await expect(page.locator('#run-state')).toHaveText('PAUSED')
  const before = await pixels(page)
  for (let count = 0; count < 3; count += 1) await page.locator('#step').click()
  await expect(page.locator('#app')).toHaveAttribute('data-tick', '3')
  const after = await pixels(page)
  let changed = 0
  for (let index = 0; index < before.data.length; index += 4) if (Math.abs(before.data[index] - after.data[index]) > 10 || Math.abs(before.data[index + 1] - after.data[index + 1]) > 10) changed += 1
  expect(changed).toBeGreaterThan(40)
  await page.locator('#theme').click()
  await expect(page.locator('#app')).toHaveAttribute('data-tick', '3')
  await page.locator('#controls input[type="range"]').first().focus()
  await page.keyboard.press('End')
  await expect(page.locator('#app')).toHaveAttribute('data-tick', '0')
  await page.locator('#step').click()
  await page.locator('#reset').click()
  await expect(page.locator('#app')).toHaveAttribute('data-tick', '0')
  expect(errors).toEqual([])
})

test('interventions, keyboard inspection, tour, and export work', async ({ page }) => {
  const errors = await open(page)
  await page.locator('#actions button').first().click()
  await expect(page.locator('#events')).not.toBeEmpty()
  await page.getByRole('tab', { name: 'Experiment', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Inspector', exact: true })).toBeFocused()
  await page.locator('#node-index button').last().click()
  await expect(page.locator('#district-detail')).not.toBeEmpty()
  await expect(page.locator('#district-source')).toHaveAttribute('href', /^https:\/\//)
  await page.locator('#tour-start').click()
  await expect(page.locator('#tour')).toBeVisible()
  await page.locator('#tour-next').click()
  await expect(page.locator('#tour-count')).toContainText('2 /')
  await page.keyboard.press('Escape')
  await expect(page.locator('#tour')).toBeHidden()
  const downloaded = page.waitForEvent('download')
  await page.locator('#export').click()
  const artifact = await downloaded
  const snapshot = JSON.parse(await readFile(await artifact.path(), 'utf8'))
  expect(snapshot.schema).toBe('simcity/v1')
  expect(snapshot.kind).toBe('illustrative-model')
  expect(snapshot.settings).toBeTruthy()
  expect(errors).toEqual([])
})

test('foreground playback advances and pauses on mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  await expect.poll(async () => Number(await page.locator('#app').getAttribute('data-tick'))).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click()
  await expect(page.locator('#run-state')).toHaveText('PAUSED')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('WebGL failure preserves model controls and inspection', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (kind === 'webgl2' || kind === 'webgl') return null
      return original.call(this, kind, ...args)
    }
  })
  await page.goto('./')
  await expect(page.getByRole('alert')).toContainText('WebGL2 unavailable')
  await page.locator('#step').click()
  await expect(page.locator('#app')).toHaveAttribute('data-tick', '1')
  await page.getByRole('tab', { name: 'Inspector', exact: true }).click()
  await expect(page.locator('#district-name')).not.toBeEmpty()
})

test('zone and database faults remain visible while requests are conserved', async ({ page }) => {
  await open(page)
  await page.locator('[data-action="zone"]').click()
  await expect(page.locator('#status')).toHaveText('ZONE DEGRADED')
  await page.locator('[data-action="database"]').click()
  await expect(page.locator('#status')).toHaveText('DATABASE STALLED')
  for (let count = 0; count < 10; count += 1) await page.locator('#step').click()
  const metric = async (id) => Number(await page.locator(`#metric-${id}`).textContent())
  expect(await metric('arrivals')).toBe(await metric('completed') + await metric('rejected') + await metric('inflight'))
})