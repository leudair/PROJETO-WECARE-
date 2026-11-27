import * as T from 'three';
import { collection, gallerySettings as settings } from './collection.js';
import { buildArchitecture, concreteTexture, setLight, studioEnvironment } from './architecture.js';
import { createModel, disposeModel, surface } from './models.js';
import { buildLandscape } from './landscape.js';
import { makeExhibitCards } from './exhibit-card.js';

const vec = (coords) => new T.Vector3(...coords);
const compact = () => matchMedia('(max-width: 700px)').matches;
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = T.MathUtils.clamp;

function displayRatio(width, height) {
  // Cap total pixels too: a large Retina window otherwise grows to 6–12 MP.
  const cap = compact() ? 1.5 : 1.75;
  return Math.min(devicePixelRatio || 1, cap, Math.sqrt(2400000 / Math.max(1, width * height)));
}

function rendererFor(host) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!context) throw new Error('WebGL 2 is unavailable');
  const renderer = new T.WebGLRenderer({ canvas, context });
  renderer.setPixelRatio(displayRatio(host.clientWidth, host.clientHeight));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = settings.light.exposure;
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  return renderer;
}

function configureStudio(scene, environment) {
  scene.background = new T.Color(0x899095);
  scene.environment = environment;
  scene.environmentIntensity = 0.95;
  setLight(scene);
}

function frame(camera, model, aspect, angle = 0) {
  model.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(model);
  const center = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3());
  const diameter = Math.max(size.x, size.y, size.z, 0.25);
  const distance = diameter * Math.max(1.7, 1.33 / aspect);
  camera.aspect = aspect;
  camera.position.set(center.x + distance * (0.18 + angle), center.y + distance * 0.24, center.z + distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

export function makeGallery(host, hooks) {
  const renderer = rendererFor(host);
  const scene = new T.Scene();
  scene.background = new T.Color(0xe9eff1);
  scene.fog = new T.FogExp2(0xdce6ec, 0.0065);
  const environment = studioEnvironment(renderer);
  scene.environment = environment;
  scene.environmentIntensity = 0.58;
  const ambient = new T.HemisphereLight(0xf6fbff, 0xdce1e3, 0.88);
  const daylight = new T.DirectionalLight(0xf6f9ff, 0.78);
  daylight.position.set(7, 12, 4);
  scene.add(daylight);
  scene.add(ambient);
  const stone = concreteTexture(2);
  const { floor, illuminate, mounts } = buildArchitecture(scene, collection, stone);
  const animateLandscape = buildLandscape(scene);
  const drawCard = makeExhibitCards(collection, renderer, invalidate);
  const camera = new T.PerspectiveCamera(settings.fieldOfView, 1, 0.06, 500);
  const finalStop = collection.length + 1;
  const lastExhibit = collection.length;
  const weights = collection.map(() => 0);
  const exhibits = collection.map((item, i) => {
    const pivot = new T.Group();
    pivot.position.set(...item.position);
    pivot.userData.index = i;
    const group = new T.Group();
    group.rotation.order = 'YXZ';
    group.rotation.y = item.rotation;
    group.scale.setScalar(item.scale);
    pivot.add(group);
    scene.add(pivot);
    if (item.motion?.swing) {
      const length = Math.max(0.2, mounts[i] - item.position[1]);
      pivot.position.y += length;
      group.position.y = -length;
      const cap = 0.17 * item.scale;
      const cable = new T.Mesh(new T.CylinderGeometry(0.009, 0.009, length - cap, 10),
        surface({ color: 0x938e87, roughness: 0.27, metalness: 0.82 }));
      cable.position.y = -(length - cap) / 2;
      pivot.add(cable);
    }
    return { item, pivot, group, yaw: 0, pitch: 0, yawTarget: 0, pitchTarget: 0 };
  });
  const hitTargets = exhibits.map(({ group }) => group);

  const studio = new T.Scene();
  configureStudio(studio, environment);
  const studioCamera = new T.PerspectiveCamera(36, 1, 0.04, 40);
  let viewport, eyes, targets, routeFov, entranceFov, horizonFov;
  let destination = 0, current = 0, speed = 0, travel = null, dirty = true, visible = true;
  let raf = 0, frameTime = 0, clock = 0, lost = false, obscured = false;
  let prepared = false, firstFrame = true, resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  let drag, skipClick = false;
  const canvas = renderer.domElement;
  const location = new T.Vector2();
  const ray = new T.Raycaster();

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    viewport = { width: Math.round(width), height: Math.round(height) };
    const mobile = compact();
    const poses = [mobile ? settings.entranceMobile : settings.entrance,
      ...collection.map((it) => mobile ? it.mobile : it.camera),
      { eye: [0.15, 1.92, -35.3], target: [-2.6, 2.05, -65] },
      { eye: [2.5, 2.92, -43.5], target: [-9.6, 2.15, -71] },
      { eye: [12.8, 4.3, -48], target: [-11, 1.9, -42] },
      mobile ? settings.horizonMobile : settings.horizon];
    eyes = new T.CatmullRomCurve3(poses.map((pose) => vec(pose.eye)), false, 'catmullrom', 0.32);
    targets = new T.CatmullRomCurve3(poses.map((pose) => vec(pose.target)), false, 'catmullrom', 0.32);
    camera.aspect = viewport.width / viewport.height;
    routeFov = mobile ? settings.mobileFieldOfView : settings.fieldOfView;
    horizonFov = mobile ? settings.horizonMobileFieldOfView : routeFov;
    const halfHeight = Math.tan(T.MathUtils.degToRad(routeFov / 2));
    // Keep the entrance composition in frame on narrow desktop windows.
    const entranceScale = mobile ? 1 : clamp(1.4 / camera.aspect, 1, 1.8);
    entranceFov = T.MathUtils.radToDeg(2 * Math.atan(halfHeight * entranceScale));
    renderer.setPixelRatio(displayRatio(viewport.width, viewport.height));
    renderer.setSize(viewport.width, viewport.height, false);
    camera.updateProjectionMatrix();
    const reflectSize = mobile ? 512 : 768;
    floor.getRenderTarget().setSize(reflectSize, Math.round(reflectSize * Math.min(1.15, viewport.height / viewport.width)));
    invalidate();
  }

  function draw(now) {
    raf = 0;
    if (lost || !visible || document.hidden || obscured || !viewport || !prepared) return;
    const still = motionPreference.matches;
    const delta = frameTime ? Math.min(0.06, (now - frameTime) / 1000) : 0.016;
    frameTime = now;
    if (!still) clock += delta;
    if (travel) {
      const t = Math.max(0, (now - travel.time) / 1000);
      const { offset, momentum, rate } = travel;
      const decay = Math.exp(-rate * t);
      const remainder = (offset + momentum * t) * decay;
      speed = momentum * decay - rate * remainder;
      current = clamp(destination + remainder, 0, finalStop);
      if (still || (Math.abs(remainder) < 0.004 && Math.abs(speed) < 0.05)) {
        current = destination;
        speed = 0;
        travel = null;
      }
      dirty = true;
    }
    const alive = !still && (current > 0.005 || destination > 0);
    if (dirty || alive) {
      const crossing = clamp(current - lastExhibit, 0, 1);
      const exteriorTravel = crossing * (0.25 + crossing * (1.5 - crossing * 0.75));
      const progress = (Math.min(current, lastExhibit) + exteriorTravel * 4) / (lastExhibit + 4);
      let rotating = false;
      exhibits.forEach((exhibit, i) => {
        const { item, pivot, group, yawTarget, pitchTarget } = exhibit;
        // The swing uses the ceiling pivot. Manual rotation stays on the object itself.
        const weight = 1 - T.MathUtils.smoothstep(Math.abs(current - i - 1), 0.06, 0.87);
        weights[i] = weight;
        const { lift = 0.26, bob = 0.045, tilt = 0.043, pace = 0.95, swing = 0, turn = 0 } = item.motion ?? {};
        const t = clock * pace + i * 0.72;
        const wave = still ? 0 : Math.sin(t);
        if (swing) {
          pivot.rotation.set(weight * wave * swing * 0.28, 0, weight * wave * swing);
        } else {
          pivot.position.y = item.position[1] + weight * (lift + bob * wave);
          pivot.rotation.set(weight * wave * tilt * 0.48, 0, weight * wave * tilt);
        }
        exhibit.yaw = still ? yawTarget : T.MathUtils.damp(exhibit.yaw, yawTarget, 17, delta);
        exhibit.pitch = still ? pitchTarget : T.MathUtils.damp(exhibit.pitch, pitchTarget, 17, delta);
        group.rotation.y = item.rotation + exhibit.yaw + weight * wave * turn;
        group.rotation.x = exhibit.pitch;
        rotating ||= Math.abs(exhibit.yaw - yawTarget) + Math.abs(exhibit.pitch - pitchTarget) > 0.001;
      });
      illuminate(current, weights);
      ambient.intensity = 0.88 + current * 0.025;
      animateLandscape(still ? 0 : clock, T.MathUtils.smoothstep(exteriorTravel, 0.34, 0.96) * 0.89);
      const nearFov = T.MathUtils.lerp(entranceFov, routeFov, clamp(current, 0, 1));
      const horizonBlend = T.MathUtils.smoothstep(current, finalStop - 1, finalStop);
      const fov = T.MathUtils.lerp(nearFov, horizonFov, horizonBlend);
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(eyes.getPoint(progress));
      camera.lookAt(targets.getPoint(progress));
      try {
        renderer.render(scene, camera);
        if (firstFrame) {
          firstFrame = false;
          resolveReady();
        }
        const distance = Math.abs(destination - current);
        const exhibit = exhibits[destination - 1];
        const card = exhibit?.bounds && distance < 0.41 ? {
          camera, viewport, exhibit, index: destination - 1,
          amount: 1 - T.MathUtils.smoothstep(distance, 0.045, 0.41),
        } : null;
        rotating = drawCard(card, clock, delta, still, now) || rotating;
      } catch (error) {
        lost = true;
        rejectReady(error);
        hooks.fallback('The 3D gallery is temporarily unavailable. Please reload to return to the exhibition.');
        console.warn('Gallery render unavailable:', error.message);
        return;
      }
      hooks.arrival(destination === finalStop && crossing > 0.9);
      dirty = rotating;
    }
    if (travel || alive || dirty) raf = requestAnimationFrame(draw);
    else frameTime = 0;
  }

  function invalidate() {
    dirty = true;
    if (!raf && prepared && !lost && visible && !document.hidden && !obscured) raf = requestAnimationFrame(draw);
  }

  function move(next) {
    if (destination === next) return;
    destination = next;
    const offset = current - next;
    const cruise = 7.3 / Math.pow(Math.max(1, Math.abs(offset)), 0.39);
    const rate = next === finalStop ? Math.min(cruise, 2.55) : cruise;
    travel = { offset, momentum: speed + rate * offset, rate, time: performance.now() };
    invalidate();
  }

  function capture(model, item) {
    if (item.asset.kind === 'image') return item.asset.src;
    if (!viewport || lost) return '';
    const prepared = model.clone();
    prepared.rotation.y += item.asset.shape === 'chair' ? -0.43 : 0.14;
    studio.add(prepared);
    renderer.setPixelRatio(1);
    renderer.setSize(720, 520, false);
    frame(studioCamera, prepared, 720 / 520, -0.07);
    renderer.render(studio, studioCamera);
    const image = renderer.domElement.toDataURL('image/webp', 0.87);
    studio.remove(prepared);
    resize();
    return image;
  }

  function hit(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    location.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(location, camera);
    const intersect = ray.intersectObjects(hitTargets, true)[0];
    let node = intersect?.object;
    while (node && node.userData.index === undefined) node = node.parent;
    return node?.userData.index;
  }

  const watcher = new ResizeObserver(resize);
  watcher.observe(host);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    hooks.fallback('The 3D gallery is temporarily unavailable. Please reload to return to the exhibition.');
  });
  function rotate(index, yaw, pitch = 0) {
    const exhibit = exhibits[index];
    if (!exhibit) return;
    exhibit.yawTarget += yaw;
    exhibit.pitchTarget = clamp(exhibit.pitchTarget + pitch, -0.48, 0.48);
    invalidate();
  }

  const turnable = (i) => i !== undefined && i + 1 === destination && Math.abs(destination - current) < 0.48;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    skipClick = false;
    const index = hit(event);
    if (turnable(index)) drag = { index, id: event.pointerId, x: event.clientX, y: event.clientY, rotating: false };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) {
      const index = hit(event);
      canvas.style.cursor = turnable(index) ? 'grab' : (index === undefined ? '' : 'pointer');
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.rotating) {
      if (Math.hypot(dx, dy) < 6) return;
      if (event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) {
        drag = undefined;
        skipClick = true;
        return;
      }
      drag.rotating = true;
      skipClick = true;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      hooks.didRotate();
    }
    rotate(drag.index, dx * 0.012, dy * 0.006);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  function endDrag(event) {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    canvas.style.cursor = turnable(hit(event)) ? 'grab' : '';
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('click', (event) => {
    if (skipClick) {
      skipClick = false;
      return;
    }
    const index = hit(event);
    if (index !== undefined) hooks.open(index);
  });
  motionPreference.addEventListener('change', invalidate);

  document.addEventListener('visibilitychange', () => {
    frameTime = 0;
    if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!document.hidden) invalidate();
  });
  resize();
  const modelsReady = collection.map(async (item, i) => {
    try {
      const model = await createModel(item, 0, stone);
      model.traverse((part) => { if (part.isMesh) { part.castShadow = true; part.receiveShadow = true; } });
      exhibits[i].bounds = new T.Box3().setFromObject(model);
      exhibits[i].group.add(model);
      invalidate();
      const preview = item.image || capture(model, item);
      if (preview) hooks.preview(i, preview);
    } catch (error) {
      hooks.assetError(item, error);
    }
  });

  Promise.all(modelsReady).then(async () => {
    // Prepare shader programs before exposing navigation, using parallel compilation
    // where the browser supports it. No partially built scene is presented.
    camera.position.copy(eyes.getPoint(0));
    camera.lookAt(targets.getPoint(0));
    illuminate(0, weights);
    await renderer.compileAsync(scene, camera);
    prepared = true;
    invalidate();
  }).catch(rejectReady);

  return {
    ready, move, rotate,
    setVisible(on) { visible = on; frameTime = 0; if (on) invalidate(); },
    setObscured(on) { obscured = on; frameTime = 0; if (!on) invalidate(); },
    stage(host, item, hooks) { return makeInspection(host, item, stone, hooks); },
  };
}

function makeInspection(host, item, stone, hooks) {
  const renderer = rendererFor(host);
  const scene = new T.Scene();
  const environment = studioEnvironment(renderer);
  configureStudio(scene, environment);
  scene.background.setHex(0xe0e6e8);
  renderer.toneMappingExposure = 1.07;
  const camera = new T.PerspectiveCamera(35, 1, 0.04, 50);
  const pivot = new T.Group();
  scene.add(pivot);
  const baseAngle = item.asset.shape === 'chair' ? -0.38 : 0.12;
  let model, disposed = false, sequence = 0, raf = 0;
  let pitch = 0, yaw = baseAngle, zoom = 1, drag;
  let dimensions, objectDiameter = 1;

  function draw() {
    raf = 0;
    if (disposed || !dimensions || !model) return;
    const { width, height } = dimensions;
    const distance = objectDiameter * Math.max(1.68, 1.34 * height / width) * zoom;
    camera.aspect = width / height;
    camera.position.set(distance * 0.14, distance * 0.26, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    pivot.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
  }

  function schedule() {
    if (!raf && !disposed) raf = requestAnimationFrame(draw);
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    dimensions = { width, height };
    renderer.setSize(width, height, false);
    schedule();
  }

  function remove(model) {
    pivot.remove(model);
    if (item.asset.kind !== 'glb') {
      disposeModel(model);
      return;
    }
    model.traverse((child) => {
      if (!child.isMesh) return;
      for (const material of [child.material].flat()) {
        if (material.userData.ownedFinish) material.dispose();
      }
    });
  }

  async function setFinish(index) {
    const request = ++sequence;
    try {
      const object = await createModel(item, index, stone);
      if (disposed || request !== sequence) { remove(object); return; }
      if (model) remove(model);
      model = object;
      model.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(model);
      const size = bounds.getSize(new T.Vector3());
      objectDiameter = Math.max(size.x, size.y, size.z, 0.25);
      model.position.sub(bounds.getCenter(new T.Vector3()));
      pivot.add(model);
      schedule();
    } catch (error) {
      if (!disposed && request === sequence) hooks.error(error);
    }
  }

  function rotate(dx, dy) {
    yaw += dx;
    pitch = clamp(pitch + dy, -0.72, 0.72);
    schedule();
  }

  const canvas = renderer.domElement;
  canvas.removeAttribute('aria-hidden');
  canvas.setAttribute('aria-label', 'Rotate object with the arrow keys or by dragging');
  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drag?.id) return;
    rotate((event.clientX - drag.x) * 0.012, (event.clientY - drag.y) * 0.009);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  for (const eventName of ['lostpointercapture', 'pointercancel', 'pointerup']) {
    canvas.addEventListener(eventName, () => { drag = undefined; canvas.classList.remove('dragging'); });
  }
  canvas.addEventListener('keydown', (event) => {
    const directions = { ArrowLeft: [-0.18, 0], ArrowRight: [0.18, 0], ArrowUp: [0, -0.14], ArrowDown: [0, 0.14] };
    if (!directions[event.key]) return;
    event.preventDefault();
    rotate(...directions[event.key]);
  });

  const watcher = new ResizeObserver(resize);
  watcher.observe(host);
  resize();
  setFinish(hooks.finish);
  return {
    setFinish, rotate,
    zoom(delta) { zoom = clamp(zoom + delta, 0.63, 1.36); schedule(); },
    dispose() {
      disposed = true;
      watcher.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (model) remove(model);
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
