import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import './ui.css'
import { Timer } from 'three'
import { createElement, Boxes, Play, Pause, SkipForward, RotateCcw, Focus, ZoomIn, ZoomOut, Sun, Moon, Route, X, ChevronLeft, ChevronRight, Download, ExternalLink, Zap, type IconNode } from 'lucide'
import { createCity } from './world/city'
import type { CityModel, Definition } from './types'

const icon = (node: IconNode) => createElement(node, { width: '18', height: '18', 'aria-hidden': 'true', 'stroke-width': '1.7' }).outerHTML
const tool = (id: string, label: string, node: IconNode) => `<button id="${id}" class="tool" type="button" aria-label="${label}" title="${label}">${icon(node)}</button>`

export function mountApp(model: CityModel, definition: Definition) {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let running = !reduced.matches
  let dark = definition.dark
  let remainder = 0
  let animationTime = 0
  let selected = definition.tour[0]
  let tourIndex: number | null = null
  let currentTab = 'controls'
  let nodeSignature = ''
  let view = model.view()
  let city: ReturnType<typeof createCity> | null = null
  document.title = definition.name
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.setProperty('--accent', definition.accent)
  app.innerHTML = `<header class="topbar"><a class="brand" href="./">${icon(Boxes)}<h1>${definition.name}</h1></a><div class="header-state"><i></i><span id="status"></span></div><nav>${tool('tour-start', 'Guided tour', Route)}${tool('theme', 'Change theme', dark ? Sun : Moon)}${tool('export', 'Export model snapshot', Download)}<a class="tool" href="${definition.repository}" target="_blank" rel="noreferrer" aria-label="Source repository" title="Source repository">${icon(ExternalLink)}</a></nav></header>
    <main class="workspace"><section class="primary"><div class="workspace-heading"><div><p class="eyebrow">${definition.eyebrow}</p><h2>${definition.title}</h2></div><div class="view-switch" role="group" aria-label="Camera view"><button type="button" data-view="iso" aria-pressed="true">City</button><button type="button" data-view="plan" aria-pressed="false">Plan</button></div></div><div id="metrics" class="metrics"></div><div class="viewport"><div id="scene" aria-label="Interactive architecture scene"></div><div class="camera-tools">${tool('home', 'Frame architecture', Focus)}${tool('zoom-in', 'Zoom in', ZoomIn)}${tool('zoom-out', 'Zoom out', ZoomOut)}</div><div class="scene-caption"><span class="model-mark">MODEL</span><span>SCHEMATIC TOPOLOGY / SCALED FLOW</span></div><section id="tour" class="tour" hidden><div><p id="tour-count" class="eyebrow"></p><strong id="tour-title"></strong></div><div>${tool('tour-prev', 'Previous district', ChevronLeft)}${tool('tour-next', 'Next district', ChevronRight)}${tool('tour-close', 'Close tour', X)}</div></section></div><div class="transport"><div>${tool('play', 'Pause simulation', Pause)}${tool('step', 'Step simulation', SkipForward)}${tool('reset', 'Reset run', RotateCcw)}<span id="tick"></span></div><strong id="run-state"></strong></div><section class="history-band"><div><span id="history-label" class="eyebrow"></span><strong id="history-current"></strong></div><div id="history" class="history" role="img"></div></section></section>
    <aside><div class="tabs" role="tablist" aria-label="Model panels"><button role="tab" id="tab-controls" aria-controls="panel-controls" aria-selected="true">Experiment</button><button role="tab" id="tab-inspector" aria-controls="panel-inspector" aria-selected="false" tabindex="-1">Inspector</button></div><div id="panel-controls" role="tabpanel" aria-labelledby="tab-controls"><section class="panel-section"><h3>Configuration</h3><div id="controls"></div></section><section class="panel-section"><h3>Interventions</h3><div id="actions" class="actions"></div></section><section class="panel-section"><h3>Event log</h3><ol id="events" class="events"></ol></section></div><div id="panel-inspector" role="tabpanel" aria-labelledby="tab-inspector" hidden><section class="panel-section"><p id="district-kind" class="eyebrow"></p><h2 id="district-name"></h2><strong id="district-value" class="district-value"></strong><p id="district-detail" class="detail"></p><a id="district-source" target="_blank" rel="noreferrer" class="source-link">Primary reference ${icon(ExternalLink)}</a></section><section class="panel-section"><h3>Architecture index</h3><div id="node-index" class="node-index"></div></section></div><footer><span class="model-mark">EDUCATIONAL PREVIEW</span><p>${definition.boundary}</p></footer></aside></main><div id="notice" role="status" aria-live="polite"></div>`
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
  get('metrics').innerHTML = view.metrics.map((metric) => `<div><span>${metric.label}</span><strong id="metric-${metric.id}"></strong><small>${metric.unit}</small></div>`).join('')
  get('history').innerHTML = Array.from({ length: 48 }, () => '<i></i>').join('')
  get('controls').innerHTML = definition.controls.map((control) => {
    const current = model.settings[control.key]
    if (control.kind === 'toggle') return `<label class="toggle" for="control-${control.key}"><span>${control.label}</span><input id="control-${control.key}" type="checkbox" ${current ? 'checked' : ''}></label>`
    if (control.kind === 'select') return `<label class="field" for="control-${control.key}"><span>${control.label}</span><select id="control-${control.key}">${control.options.map((option) => `<option value="${option.value}" ${option.value === current ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>`
    return `<label class="field" for="control-${control.key}"><span>${control.label}<output id="value-${control.key}"></output></span><input id="control-${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current}"></label>`
  }).join('')
  get('actions').innerHTML = definition.actions.map((action) => `<button type="button" data-action="${action.id}">${icon(Zap)}<span>${action.label}</span></button>`).join('')
  function setTab(tab: string) {
    currentTab = tab
    for (const name of ['controls', 'inspector']) {
      get(`tab-${name}`).setAttribute('aria-selected', String(name === tab))
      get(`tab-${name}`).tabIndex = name === tab ? 0 : -1
      get(`panel-${name}`).hidden = name !== tab
    }
  }
  function inspect(id: string, showPanel = false) {
    const node = view.nodes.find((entry) => entry.id === id) ?? view.nodes[0]
    selected = node.id
    get('district-kind').textContent = `${node.kind} / ${node.state}`
    get('district-name').textContent = node.name
    get('district-value').textContent = node.value
    get('district-detail').textContent = node.detail
    get<HTMLAnchorElement>('district-source').href = node.source
    for (const button of get('node-index').querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.node === selected))
    city?.select(selected)
    if (showPanel) setTab('inspector')
  }
  function notify(message: string) { get('notice').textContent = message }
  function refresh() {
    view = model.view()
    app.dataset.tick = String(view.tick)
    app.dataset.app = definition.id
    get('status').textContent = view.status
    get('tick').textContent = `TICK ${String(view.tick).padStart(4, '0')}`
    get('run-state').textContent = running ? 'RUNNING' : 'PAUSED'
    const playLabel = running ? 'Pause simulation' : 'Resume simulation'
    get('play').innerHTML = icon(running ? Pause : Play)
    get('play').setAttribute('aria-label', playLabel)
    get('play').title = playLabel
    for (const metric of view.metrics) get(`metric-${metric.id}`).textContent = metric.value
    for (const control of definition.controls) {
      const input = get<HTMLInputElement | HTMLSelectElement>(`control-${control.key}`)
      if (control.kind === 'toggle') (input as HTMLInputElement).checked = Boolean(model.settings[control.key])
      else input.value = String(model.settings[control.key])
      if (control.kind === 'range') get(`value-${control.key}`).textContent = `${model.settings[control.key]}${control.unit ? ` ${control.unit}` : ''}`
    }
    get('events').replaceChildren(...view.events.map((event) => { const item = document.createElement('li'); item.textContent = event; return item }))
    get('history-label').textContent = view.historyLabel
    const latest = view.history.at(-1) ?? 0
    get('history-current').textContent = Number.isInteger(latest) ? String(latest) : latest.toFixed(3)
    get('history').setAttribute('aria-label', `${view.historyLabel}: ${view.history.join(', ') || 'No samples'}`)
    const peak = Math.max(1, ...view.history)
    for (const [index, bar] of [...get('history').children].entries()) (bar as HTMLElement).style.height = `${Math.max(2, (view.history[index] ?? 0) / peak * 48)}px`
    const nextSignature = view.nodes.map((node) => node.id).join('|')
    if (nodeSignature !== nextSignature) {
      nodeSignature = nextSignature
      get('node-index').innerHTML = view.nodes.map((node) => `<button type="button" data-node="${node.id}" aria-pressed="false"><i style="background:${node.color}"></i><span>${node.name}</span>${icon(ChevronRight)}</button>`).join('')
      for (const button of get('node-index').querySelectorAll<HTMLButtonElement>('button')) button.addEventListener('click', () => inspect(button.dataset.node!, true))
    }
    city?.update(view)
    inspect(selected)
  }
  try { city = createCity(get('scene'), (id) => inspect(id, true), dark) }
  catch { get('scene').innerHTML = '<div class="fallback" role="alert">WebGL2 unavailable. Model controls and inspector remain active.</div>' }
  model.reset()
  refresh()
  for (const control of definition.controls) {
    const input = get<HTMLInputElement | HTMLSelectElement>(`control-${control.key}`)
    input.addEventListener('input', () => {
      const value = control.kind === 'toggle' ? (input as HTMLInputElement).checked : control.kind === 'range' || control.kind === 'select' && typeof control.options[0].value === 'number' ? Number(input.value) : input.value
      try { model.configure({ [control.key]: value }); remainder = animationTime = 0; refresh(); notify('') }
      catch { notify('Configuration rejected; model state retained.') }
    })
  }
  for (const button of get('actions').querySelectorAll<HTMLButtonElement>('button')) button.addEventListener('click', () => { model.act(button.dataset.action!); refresh() })
  get('play').addEventListener('click', () => { running = !running; refresh() })
  get('step').addEventListener('click', () => { running = false; model.step(); animationTime += .65; refresh() })
  get('reset').addEventListener('click', () => { model.reset(); remainder = animationTime = 0; refresh(); notify('') })
  get('home').addEventListener('click', () => city?.frame())
  get('zoom-in').addEventListener('click', () => city?.zoom(1))
  get('zoom-out').addEventListener('click', () => city?.zoom(-1))
  get('theme').addEventListener('click', () => { dark = !dark; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; get('theme').innerHTML = icon(dark ? Sun : Moon); city?.setTheme(dark) })
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-view]')) button.addEventListener('click', () => { for (const other of document.querySelectorAll('button[data-view]')) other.setAttribute('aria-pressed', String(other === button)); city?.setView(button.dataset.view as 'iso' | 'plan') })
  for (const name of ['controls', 'inspector']) {
    const tab = get(`tab-${name}`)
    tab.addEventListener('click', () => setTab(name))
    tab.addEventListener('keydown', (event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setTab(event.key === 'Home' ? 'controls' : event.key === 'End' ? 'inspector' : currentTab === 'controls' ? 'inspector' : 'controls'); get(`tab-${currentTab}`).focus() } })
  }
  function closeTour() { tourIndex = null; get('tour').hidden = true }
  function showTour(index: number) {
    if (index >= definition.tour.length) { closeTour(); return }
    tourIndex = Math.max(0, index)
    inspect(definition.tour[tourIndex], true)
    get('tour').hidden = false
    get('tour-count').textContent = `DISTRICT ${tourIndex + 1} / ${definition.tour.length}`
    get('tour-title').textContent = get('district-name').textContent
    get<HTMLButtonElement>('tour-prev').disabled = tourIndex === 0
  }
  get('tour-start').addEventListener('click', () => tourIndex === null ? showTour(0) : closeTour())
  get('tour-prev').addEventListener('click', () => showTour((tourIndex ?? 0) - 1))
  get('tour-next').addEventListener('click', () => showTour((tourIndex ?? 0) + 1))
  get('tour-close').addEventListener('click', closeTour)
  get('export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(model.snapshot(), null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${definition.id}-model.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('Illustrative model snapshot exported.')
  })
  const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeTour() }
  document.addEventListener('keydown', keydown)
  const visibility = () => { remainder = 0 }
  document.addEventListener('visibilitychange', visibility)
  const motion = () => { if (reduced.matches) { running = false; remainder = 0; refresh() } }
  reduced.addEventListener('change', motion)
  const timer = new Timer()
  timer.connect(document)
  let animationId = 0
  function animate(timestamp: number) {
    animationId = requestAnimationFrame(animate)
    timer.update(timestamp)
    const delta = Math.max(0, Math.min(timer.getDelta(), .15))
    if (running && !document.hidden) {
      remainder += delta
      animationTime += delta
      while (remainder >= .65) { remainder -= .65; model.step(); refresh() }
    }
    city?.render(reduced.matches ? view.tick * .65 : animationTime)
  }
  animationId = requestAnimationFrame(animate)
  return () => { cancelAnimationFrame(animationId); timer.dispose(); document.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motion); city?.dispose() }
}