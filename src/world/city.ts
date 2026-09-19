import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { District, ModelView } from '../types'

export function createCity(host: HTMLElement, onSelect: (id: string) => void, initialDark: boolean) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  host.append(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-12, 12, 9, -9, .1, 200)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minZoom = .55
  controls.maxZoom = 2.2
  controls.maxPolarAngle = Math.PI * .47
  const ambient = new THREE.HemisphereLight(0xffffff, 0x455954, 2.5)
  scene.add(ambient)
  const sun = new THREE.DirectionalLight(0xfff2de, 3.5)
  sun.position.set(-6, 18, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = sun.shadow.camera.bottom = -16
  sun.shadow.camera.right = sun.shadow.camera.top = 16
  scene.add(sun)
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x344a42, roughness: .95 })
  const ground = new THREE.Mesh(new THREE.BoxGeometry(1, .35, 1), groundMaterial)
  ground.position.y = -.25
  ground.receiveShadow = true
  scene.add(ground)
  const content = new THREE.Group()
  scene.add(content)
  const labels = document.createElement('div')
  labels.className = 'world-labels'
  host.append(labels)
  const cards = new Map<string, { group: THREE.Group; material: THREE.MeshStandardMaterial; bar: THREE.Mesh; ring: THREE.Mesh; label: HTMLElement; anchor: THREE.Vector3; corners: THREE.Vector3[] }>()
  const streams: { mesh: THREE.Mesh; path: THREE.LineCurve3; active: boolean }[] = []
  const scratch = new THREE.Vector3()
  const center = new THREE.Vector3()
  const bounds = new THREE.Box3()
  const pointer = new THREE.Vector2()
  const picker = new THREE.Raycaster()
  const placedLabels: { left: number; right: number; top: number; bottom: number }[] = []
  let signature = ''
  let currentView: 'iso' | 'plan' = 'iso'
  let dark = initialDark
  let selected = ''

  function box(group: THREE.Group, width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  function disposeContent() {
    content.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose()
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
      }
    })
    content.clear()
    cards.clear()
    streams.length = 0
    labels.replaceChildren()
  }

  function addDistrict(node: District) {
    const group = new THREE.Group()
    group.position.set(node.x, 0, node.z)
    group.userData.id = node.id
    const material = new THREE.MeshStandardMaterial({ color: node.color, emissive: node.color, emissiveIntensity: .03, roughness: .5, metalness: .12 })
    const structure = new THREE.MeshStandardMaterial({ color: 0x2c4847, roughness: .75 })
    box(group, 2.15, .16, 2.15, structure, 0, .02, 0)
    if (node.kind === 'memory') {
      for (let bank = 0; bank < 4; bank += 1) {
        box(group, .29, node.height, 1.45, material, (bank - 1.5) * .43, node.height / 2 + .12, 0)
        box(group, .32, .1, 1.5, structure, (bank - 1.5) * .43, node.height + .18, 0)
      }
    } else if (node.kind === 'gateway') {
      box(group, .32, node.height, .5, material, -.7, node.height / 2 + .12, 0)
      box(group, .32, node.height, .5, material, .7, node.height / 2 + .12, 0)
      box(group, 1.7, .3, .55, material, 0, node.height + .1, 0)
      box(group, 1.2, .12, 1.2, material, 0, .18, 0)
    } else {
      for (let tower = 0; tower < (node.kind === 'matrix' ? 1 : 3); tower += 1) {
        const width = node.kind === 'matrix' ? 1.55 : .48
        const height = node.height * (1 - tower * .18)
        const x = node.kind === 'matrix' ? 0 : (tower - 1) * .62
        box(group, width, height, 1.3, material, x, height / 2 + .12, 0)
        for (let level = 0; level < 3; level += 1) box(group, width * .8, .055, 1.34, structure, x, .3 + height * level / 3, 0)
      }
    }
    const bar = box(group, 1.75, .09, .12, new THREE.MeshBasicMaterial({ color: node.color }), 0, .17, 1)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.38, .025, 8, 60), new THREE.MeshBasicMaterial({ color: 0xffcc68 }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = .14
    ring.visible = false
    group.add(ring)
    content.add(group)
    group.updateMatrixWorld(true)
    const nodeBounds = new THREE.Box3().setFromObject(group)
    const corners: THREE.Vector3[] = []
    for (const x of [nodeBounds.min.x, nodeBounds.max.x]) for (const y of [nodeBounds.min.y, nodeBounds.max.y]) for (const z of [nodeBounds.min.z, nodeBounds.max.z]) corners.push(new THREE.Vector3(x, y, z))
    const label = document.createElement('div')
    label.className = 'node-label'
    label.innerHTML = '<strong></strong><span></span>'
    label.style.setProperty('--node', node.color)
    labels.append(label)
    cards.set(node.id, { group, material, bar, ring, label, anchor: new THREE.Vector3(node.x, node.height + .85, node.z), corners })
  }

  function frame() {
    if (!cards.size || host.clientWidth === 0 || host.clientHeight === 0) return
    bounds.setFromObject(content)
    bounds.getCenter(center)
    center.y = .5
    camera.position.copy(center).add(currentView === 'plan' ? new THREE.Vector3(0, 30, .01) : new THREE.Vector3(17, 22, 24))
    controls.target.copy(center)
    camera.lookAt(center)
    camera.updateMatrixWorld(true)
    const projected = new THREE.Box3()
    for (const card of cards.values()) for (const corner of card.corners) projected.expandByPoint(scratch.copy(corner).applyMatrix4(camera.matrixWorldInverse))
    const aspect = host.clientWidth / host.clientHeight
    const height = Math.max(projected.max.y - projected.min.y + 3, (projected.max.x - projected.min.x + 3) / aspect) * 1.12
    camera.left = -height * aspect / 2
    camera.right = height * aspect / 2
    camera.top = height / 2
    camera.bottom = -height / 2
    camera.zoom = 1
    camera.updateProjectionMatrix()
    controls.update()
  }

  function update(view: ModelView) {
    const nextSignature = view.nodes.map((node) => `${node.id}:${node.x}:${node.z}:${node.height}`).join('|')
    if (signature !== nextSignature) {
      disposeContent()
      signature = nextSignature
      view.nodes.forEach(addDistrict)
      for (const link of view.links) {
        const from = view.nodes.find((node) => node.id === link.from)
        const to = view.nodes.find((node) => node.id === link.to)
        if (!from || !to) continue
        const path = new THREE.LineCurve3(new THREE.Vector3(from.x, .27, from.z), new THREE.Vector3(to.x, .27, to.z))
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(1)), new THREE.LineBasicMaterial({ color: link.color, transparent: true, opacity: .5 }))
        content.add(line)
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(.16, .16, .16), new THREE.MeshBasicMaterial({ color: link.color }))
        content.add(mesh)
        streams.push({ mesh, path, active: link.active })
      }
      bounds.setFromObject(content)
      ground.scale.set(bounds.max.x - bounds.min.x + 2, 1, bounds.max.z - bounds.min.z + 2)
      ground.position.x = (bounds.max.x + bounds.min.x) / 2
      ground.position.z = (bounds.max.z + bounds.min.z) / 2
      frame()
    }
    for (const node of view.nodes) {
      const card = cards.get(node.id)!
      card.material.color.set(node.state === 'offline' ? '#707977' : node.color)
      card.material.emissiveIntensity = node.state === 'offline' ? 0 : .06 + node.load * .35
      card.bar.scale.x = Math.max(.02, Math.min(1, node.load))
      card.ring.visible = selected === node.id
      card.label.children[0].textContent = node.name
      card.label.children[1].textContent = node.value
      card.label.dataset.kind = node.kind
      card.label.dataset.selected = String(selected === node.id)
    }
    streams.forEach((stream, index) => { stream.active = view.links[index]?.active ?? false; stream.mesh.visible = stream.active })
    host.dataset.nodes = String(view.nodes.length)
  }

  function render(time: number) {
    controls.update()
    let framed = 0
    for (const card of cards.values()) {
      if (card.corners.every((corner) => { scratch.copy(corner).project(camera); return Math.abs(scratch.x) <= 1 && Math.abs(scratch.y) <= 1 })) framed += 1
    }
    placedLabels.length = 0
    for (const priority of [true, false]) for (const [id, card] of cards) {
      if ((id === selected) !== priority) continue
      scratch.copy(card.anchor).project(camera)
      const width = card.label.offsetWidth
      const height = card.label.offsetHeight
      if (width === 0 || height === 0) continue
      const x = THREE.MathUtils.clamp((scratch.x + 1) * host.clientWidth / 2, width / 2 + 6, host.clientWidth - width / 2 - 6)
      const y = THREE.MathUtils.clamp((1 - scratch.y) * host.clientHeight / 2, height + 6, host.clientHeight - 42)
      const rect = { left: x - width / 2 - 3, right: x + width / 2 + 3, top: y - height - 3, bottom: y + 3 }
      const overlaps = placedLabels.some((other) => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)
      card.label.style.visibility = overlaps ? 'hidden' : 'visible'
      card.label.style.left = `${x}px`
      card.label.style.top = `${y}px`
      if (!overlaps) placedLabels.push(rect)
    }
    streams.forEach((stream, index) => { if (stream.active) stream.path.getPoint((time * .28 + index * .13) % 1, stream.mesh.position) })
    renderer.render(scene, camera)
    host.dataset.rendered = 'true'
    host.dataset.framed = String(framed)
  }

  function setTheme(nextDark: boolean) {
    dark = nextDark
    scene.background = new THREE.Color(dark ? '#171f1e' : '#eaf0ed')
    groundMaterial.color.set(dark ? '#293835' : '#bfd0c7')
    ambient.intensity = dark ? 1.7 : 2.5
  }
  const resize = () => { renderer.setSize(host.clientWidth, host.clientHeight, false); frame() }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  let downX = 0
  let downY = 0
  renderer.domElement.addEventListener('pointerdown', (event) => { downX = event.clientX; downY = event.clientY })
  renderer.domElement.addEventListener('click', (event) => {
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
    picker.setFromCamera(pointer, camera)
    const hit = picker.intersectObject(content, true)[0]
    let object: THREE.Object3D | null = hit?.object ?? null
    while (object && !object.userData.id) object = object.parent
    if (object?.userData.id) onSelect(String(object.userData.id))
  })
  setTheme(dark)
  resize()
  return {
    update, render, frame, setTheme,
    select(id: string) { selected = id; for (const [key, card] of cards) { card.ring.visible = key === id; card.label.dataset.selected = String(key === id) } },
    setView(view: 'iso' | 'plan') { currentView = view; frame() },
    zoom(direction: number) { camera.zoom = THREE.MathUtils.clamp(camera.zoom * (direction > 0 ? 1.15 : 1 / 1.15), .55, 2.2); camera.updateProjectionMatrix() },
    dispose() { observer.disconnect(); controls.dispose(); disposeContent(); ground.geometry.dispose(); groundMaterial.dispose(); renderer.dispose(); renderer.domElement.remove(); labels.remove() },
  }
}