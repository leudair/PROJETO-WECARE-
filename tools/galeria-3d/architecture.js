import * as T from 'three';
import { Reflector } from '../vendor/Reflector.js';
import { gallerySettings as settings } from './collection.js';
import { panelBox, surface } from './models.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element.getContext('2d');
}

export function concreteTexture(scale = 1) {
  const w = 768, h = 512;
  const ctx = canvas(w, h);
  const random = seeded(827);
  const data = ctx.createImageData(w, h);
  const clouds = Array.from({ length: 24 }, () => [random() * w, random() * h, 15 + random() * 80, random() * 35 - 18]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let value = 186 + (random() - 0.5) * (13 + 7 * scale) +
        Math.sin(x * 0.072 + Math.sin(y * 0.023)) * 4 +
        Math.sin(y * 0.12 + x * 0.09) * 2.3;
      for (const [cx, cy, radius, density] of clouds) {
        const d = ((x - cx) ** 2 + (y - cy) ** 2) / (radius * radius);
        if (d < 1) value += (1 - d) ** 2 * density;
      }
      const i = (y * w + x) * 4;
      data.data[i] = value;
      data.data[i + 1] = value + 1;
      data.data[i + 2] = value + 2;
      data.data[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  for (let i = 0; i < 3900; i++) {
    const x = random() * w, y = random() * h;
    const r = 0.18 + Math.pow(random(), 6) * 2.1 * scale;
    ctx.fillStyle = 'rgba(17,20,23,' + (random() * 0.31) + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.7, r, random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new T.CanvasTexture(ctx.canvas);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function studioEnvironment(renderer) {
  const studio = new T.Scene();
  studio.background = new T.Color(0x58616a);
  const card = (size, position, color, power) => {
    const mat = new T.MeshBasicMaterial({ color, side: T.DoubleSide });
    mat.color.multiplyScalar(power);
    const m = new T.Mesh(new T.PlaneGeometry(...size), mat);
    m.position.set(...position);
    m.lookAt(0, 0, 0);
    studio.add(m);
  };
  card([11, 14], [0, 5, 0], 0xc0cbd7, 0.66);
  card([6, 11], [-4, 1, 0], 0xe1eaf0, 1.15);
  card([3, 10], [4, 0.3, 0.4], 0x232a30, 0.56);
  card([0.17, 11], [3.2, 1.2, -0.25], 0xe8f4ff, 8.0);
  card([6, 0.31], [0, 2.0, -3.2], 0xe8f4ff, 6.5);
  card([9, 0.16], [0, 1.84, 3.85], 0xeef6ff, 4.3);
  card([7, 1.0], [0.4, -1.8, 3.2], 0xb6c5d2, 1.1);
  card([9, 11], [0, -4, 0], 0x767d85, 0.56);
  const pmrem = new T.PMREMGenerator(renderer);
  const target = pmrem.fromScene(studio, 0.015, 0.1, 16);
  pmrem.dispose();
  studio.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    node.material.dispose();
  });
  return target.texture;
}

export function setLight(scene) {
  const { sky, ground, ambient, key } = settings.light;
  scene.add(new T.HemisphereLight(sky, ground, ambient));
  const light = new T.DirectionalLight(0xe6f3ff, key);
  light.position.set(-3, 6, 7.5);
  scene.add(light);
}

function box(scene, size, at, material) {
  const radius = Math.min(0.022, Math.min(...size) * 0.18);
  const node = radius > 0.003 && !material.transparent
    ? panelBox(...size, radius, material)
    : new T.Mesh(new T.BoxGeometry(...size), material);
  node.receiveShadow = !material.transparent;
  node.position.set(...at);
  scene.add(node);
  return node;
}

function galleryFloor(scene, concrete) {
  const { width, front, back, finish } = settings.room;
  const source = Reflector.ReflectorShader;
  const shader = {
    ...source,
    uniforms: {
      ...source.uniforms,
      concrete: { value: concrete },
      route: { value: 0 },
    },
    vertexShader: 'varying vec2 floorUV;\n' + source.vertexShader.replace('void main() {', 'void main() { floorUV = uv;'),
    fragmentShader: `
      varying vec2 floorUV;
      uniform sampler2D concrete;
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float route;
      varying vec4 vUv;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec2 uv = vUv.xy / vUv.w;
        float grit = texture2D(concrete, floorUV * vec2(2.3, 10.0)).r;
        float seamX = smoothstep(0.0015, 0.005, abs(fract(floorUV.x * 4.0) - 0.5));
        float seamY = smoothstep(0.0010, 0.004, abs(fract(floorUV.y * 12.0) - 0.5));
        float distortion = (grit - 0.72) * 0.002;
        vec3 a = texture2D(tDiffuse, uv + vec2(distortion, 0.001)).rgb * 0.46;
        a += texture2D(tDiffuse, uv + vec2(-0.003, 0.003)).rgb * 0.22;
        a += texture2D(tDiffuse, uv + vec2(0.003, -0.003)).rgb * 0.22;
        a += texture2D(tDiffuse, uv + vec2(0.0, 0.008)).rgb * 0.10;
        float bay = (1.0 - floorUV.y) * 6.0;
        float lit = smoothstep(-0.8, 1.5, route - bay);
        vec3 diffuse = color * (0.56 + grit * 0.04) * (0.93 + lit * 0.09);
        vec3 col = diffuse + min(a, vec3(1.6)) * (0.13 + lit * 0.035);
        col *= mix(0.92, 1.0, seamX * seamY);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  };
  const geometry = new T.PlaneGeometry(width + 0.025, front - back);
  const reflection = new Reflector(geometry, {
    color: finish.floor, textureWidth: 768, textureHeight: 512, multisample: 0, shader,
  });
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.set(0, 0.003, (front + back) / 2);
  scene.add(reflection);
  return reflection;
}

function castShadow(scene, x, z, width, depth, y = 0.014, strength = 0.28) {
  const ctx = canvas(128, 128);
  const wash = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  wash.addColorStop(0, 'rgba(13,16,18,.8)');
  wash.addColorStop(0.56, 'rgba(13,16,18,.52)');
  wash.addColorStop(1, 'rgba(13,16,18,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 128, 128);
  const map = new T.CanvasTexture(ctx.canvas);
  const mesh = new T.Mesh(new T.PlaneGeometry(width, depth),
    new T.MeshBasicMaterial({ map, opacity: strength, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function hangPrint(scene, x, y, z, variant, frameMaterial) {
  const ctx = canvas(320, 368);
  ctx.fillStyle = '#ded7c7';
  ctx.fillRect(0, 0, 320, 368);
  ctx.fillStyle = variant ? '#26353b' : '#a95835';
  ctx.fillRect(36, 35, 248, 296);
  ctx.save();
  ctx.beginPath();
  ctx.rect(36, 35, 248, 296);
  ctx.clip();
  for (let line = 0; line < 28; line++) {
    const t = line / 27;
    ctx.strokeStyle = variant ? (line % 5 === 0 ? '#cb9d72' : '#a4b1a6') : '#f0cda2';
    ctx.lineWidth = line % 5 === 0 ? 1.9 : 0.8;
    ctx.globalAlpha = 0.45 + t * 0.49;
    ctx.beginPath();
    ctx.moveTo(38, 82 + t * 254);
    ctx.bezierCurveTo(137, 22 + t * 110, 166, 340 - t * 245, 282, 270 - t * 154);
    ctx.stroke();
  }
  ctx.restore();
  const map = new T.CanvasTexture(ctx.canvas);
  map.colorSpace = T.SRGBColorSpace;
  const mount = new T.Group();
  mount.position.set(x, y, z);
  mount.rotation.y = Math.PI / 2;
  const frame = panelBox(0.84, 0.96, 0.058, 0.012, frameMaterial);
  const print = new T.Mesh(new T.PlaneGeometry(0.79, 0.91),
    new T.MeshStandardMaterial({ map, roughness: 0.96, emissive: 0x7c6852, emissiveIntensity: 0.16 }));
  print.position.z = 0.035;
  mount.add(frame, print);
  scene.add(mount);
}

function buildFixtures(scene, spot, mount, metal) {
  const holder = new T.Group();
  holder.position.copy(spot.position);
  const direction = spot.target.position.clone().sub(spot.position).normalize();
  holder.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), direction);
  const shade = new T.Mesh(new T.CylinderGeometry(0.125, 0.148, 0.27, 28), metal);
  shade.position.y = -0.07;
  const lens = new T.MeshBasicMaterial({ color: 0x2c2723 });
  const diffuser = new T.Mesh(new T.CylinderGeometry(0.104, 0.113, 0.014, 28), lens);
  diffuser.position.y = -0.21;
  holder.add(shade, diffuser);
  scene.add(holder);
  const stemLength = mount - spot.position.y;
  const stem = new T.Mesh(new T.CylinderGeometry(0.026, 0.026, stemLength, 12), metal);
  stem.position.set(spot.position.x, mount - stemLength / 2, spot.position.z);
  scene.add(stem);
  box(scene, [0.32, 0.058, 0.22], [spot.position.x, mount - 0.035, spot.position.z], metal);
  spot.position.addScaledVector(direction, 0.22);
  return lens;
}

export function buildArchitecture(scene, items, concrete) {
  const { width, height, front, back, lightStrips, finish } = settings.room;
  const wallMat = new T.MeshStandardMaterial({ color: finish.wall, roughness: 0.49, envMapIntensity: 0.52 });
  const ceilingMat = wallMat.clone();
  ceilingMat.color.setHex(finish.ceiling);
  const seams = new T.MeshStandardMaterial({ color: 0xc0cbd0, roughness: 0.98, envMapIntensity: 0.30 });
  const stripColor = new T.Color(finish.strip);
  const exteriorStrip = new T.Color(0xf1f9ff);
  const exteriorLamp = new T.Color(0xffefd9);
  const frame = surface({ color: 0xd8e0e3, roughness: 0.33, metalness: 0.30 });
  const fixture = surface({ color: 0xb4c0c6, roughness: 0.28, metalness: 0.46 });
  const brass = surface({ color: 0xa17654, roughness: 0.38, metalness: 0.8 });
  const podium = surface({ color: 0xe4e8e9, roughness: 0.34, metalness: 0.13 },
    { envMapIntensity: 0.64 });
  const glass = new T.MeshPhysicalMaterial({
    color: 0xe2f2f6, metalness: 0.05, roughness: 0.055, envMapIntensity: 1.15, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.46,
    transparent: true, opacity: 0.12, side: T.DoubleSide, depthWrite: false,
  });
  const bays = [];

  let start = front;
  for (const [i, end] of [...lightStrips, back].entries()) {
    const length = start - end;
    const half = width / 2 - 0.17 * i;
    const top = height - 0.12 * i;
    const middle = (start + end) / 2;
    for (const sign of [-1, 1]) {
      if (sign === 1) {
        const inset = i < lightStrips.length - 2 ? Math.min(0.62, length * 0.11) : 0;
        const span = length - inset * 2;
        box(scene, [0.025, top - 0.24, span], [half, top / 2, middle], glass);
        if (inset) {
          for (const z of [start - inset / 2, end + inset / 2]) {
            box(scene, [0.21, top, inset], [half + 0.105, top / 2, z], wallMat);
          }
        }
        for (const y of [0.09, top - 0.1]) {
          box(scene, [0.12, 0.16, span], [half, y, middle], frame);
        }
        for (const z of [start - inset, middle, end + inset]) {
          box(scene, [0.11, top, 0.062], [half, top / 2, z], frame);
        }
        continue;
      }
      box(scene, [0.21, top, length], [sign * (half + 0.105), top / 2, middle], wallMat);
      const seam = sign * (half - 0.003);
      box(scene, [0.004, 0.008, length - 0.01], [seam, 1.38, middle], seams);
      box(scene, [0.004, 0.006, length - 0.01], [seam, 2.77, middle], seams);
      box(scene, [0.004, top, 0.006], [seam, top / 2, middle], seams);
    }
    box(scene, [half * 2 + 0.42, 0.18, length], [0, top + 0.09, middle], ceilingMat);
    if (i < lightStrips.length) {
      const bridge = i === 0 ? 0.98 : i === 1 ? 0.31 : 0.22;
      const span = half - bridge;
      box(scene, [half * 2, 0.11, 0.37], [0, top - 0.046, end], ceilingMat);
      const strip = new T.MeshBasicMaterial({ color: finish.strip });
      box(scene, [span * 2, 0.017, 0.067], [0, top - 0.11, end + 0.12], strip);
      for (const sign of [-1, 1]) {
        box(scene, [bridge, top, 0.38], [sign * (half - bridge / 2), top / 2, end], wallMat);
      }
      const wash = new T.PointLight(i === 0 ? 0xfff2e4 : 0xdeedff, 0, 9.5, 2);
      wash.position.set(0, top - 0.79, end + 0.5);
      scene.add(wash);
      const stop = i === 0 ? 0.65 :
        T.MathUtils.lerp(1.8, items.length + 0.65, (i - 1) / Math.max(1, lightStrips.length - 2));
      bays.push({ strip, wash, stop, color: wash.color.clone() });
    }
    start = end;
  }
  const endHalf = width / 2 - 0.17 * lightStrips.length;
  const endHeight = height - 0.12 * lightStrips.length;
  for (const x of [-endHalf + 0.06, endHalf - 0.06]) {
    box(scene, [0.12, endHeight, 0.1], [x, endHeight / 2, back], frame);
  }
  box(scene, [endHalf * 2, 0.13, 0.14], [0, endHeight - 0.065, back], frame);
  box(scene, [endHalf * 2, 0.11, 0.14], [0, 0.055, back], frame);
  const endTint = new T.MeshBasicMaterial({
    color: 0xd4e2e7, transparent: true, opacity: 0.26, depthWrite: false, fog: false,
  });
  const endPane = new T.Mesh(new T.PlaneGeometry(endHalf * 2, endHeight), endTint);
  endPane.position.set(0, endHeight / 2, back + 0.025);
  scene.add(endPane);
  box(scene, [width + 0.1, 0.8, front - back + 0.13], [0, -0.42, (front + back) / 2], frame);
  box(scene, [width + 0.21, 0.065, front - back + 0.16], [0, -0.049, (front + back) / 2], fixture);

  hangPrint(scene, -4.53, 1.82, 4.4, false, frame);
  hangPrint(scene, -4.29, 1.82, -1.32, true, frame);
  hangPrint(scene, -4.15, 1.84, -7.66, false, frame);
  const sample = new T.Mesh(new T.TorusGeometry(0.24, 0.065, 14, 48), brass);
  sample.rotation.set(-0.79, 0.36, 0.12);
  sample.position.set(-3.75, 0.24, 0.46);
  scene.add(sample);
  castShadow(scene, -3.75, 0.46, 0.72, 0.58);
  for (const [x, z, yaw] of [[3.42, -8.15, 0.22], [3.09, -17.43, -0.31], [-3.17, -24.05, 0.18]]) {
    const tray = panelBox(0.55, 0.055, 0.36, 0.012, frame);
    const swatch = panelBox(0.36, 0.08, 0.19, 0.012, brass);
    tray.position.set(x, 0.031, z);
    swatch.position.set(x + 0.02, 0.095, z - 0.016);
    tray.rotation.y = yaw;
    swatch.rotation.y = yaw + 0.21;
    scene.add(tray, swatch);
  }
  const floor = galleryFloor(scene, concrete);
  const shadowFloor = new T.Mesh(new T.PlaneGeometry(width, front - back),
    new T.ShadowMaterial({ opacity: 0.085, depthWrite: false }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.set(0, 0.009, (front + back) / 2);
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  const spots = items.map((item, index) => {
    const [x, y, z] = item.position;
    const [w, h, d] = item.plinth;
    const platform = panelBox(w, h, d, 0.013, podium);
    platform.position.set(x, h / 2 - 0.005, z);
    platform.receiveShadow = true;
    platform.castShadow = true;
    scene.add(platform);
    castShadow(scene, x, z, w * 1.3, d * 1.26);
    const shadow = item.motion?.swing ? null :
      castShadow(scene, x, z, w * 0.72, d * 0.79, h + 0.012, 0.34);
    const mount = height - Math.max(0, lightStrips.filter((strip) => z < strip).length) * 0.12;
    const spot = new T.SpotLight(item.motion?.light ?? 0xe5edff, 0, 9.2, 0.58, 0.84, 2);
    spot.castShadow = true;
    const shadowSize = matchMedia('(max-width: 700px)').matches ? 512 : 1024;
    spot.shadow.mapSize.set(shadowSize, shadowSize);
    spot.shadow.camera.near = 0.15;
    spot.shadow.camera.far = 10;
    spot.shadow.bias = -0.00015;
    spot.shadow.normalBias = 0.018;
    spot.shadow.focus = 0.85;
    spot.shadow.radius = 3;
    spot.shadow.intensity = 0.68;
    spot.position.set(x * 0.81, mount - 0.48, z + 0.42);
    spot.target.position.set(x, y + 0.15, z - 0.1);
    scene.add(spot, spot.target);
    const lens = buildFixtures(scene, spot, mount, fixture);
    return { spot, lens, shadow, mount, stop: index + 1, color: spot.color.clone() };
  });

  function illuminate(progress, weights) {
    floor.material.uniforms.route.value = progress + 0.45;
    endTint.opacity = 0.26 * (1 - T.MathUtils.smoothstep(progress, items.length - 2.1, items.length + 0.4));
    endPane.visible = endTint.opacity > 0.005;
    const exterior = T.MathUtils.smoothstep(progress, items.length + 0.2, items.length + 0.9);
    for (const { strip, wash, stop, color } of bays) {
      const reveal = T.MathUtils.smoothstep(progress, stop - 0.85, stop + 0.12);
      wash.intensity = 1.4 + reveal * 20 + (stop < 1 ? 4 : 0) + exterior * 10;
      wash.color.copy(color).lerp(exteriorStrip, exterior * 0.84);
      strip.color.copy(stripColor).lerp(exteriorStrip, exterior)
        .multiplyScalar(0.28 + reveal * 3.4 + (stop < 1 ? 0.35 : 0));
    }
    for (const [index, { spot, lens, shadow, stop, color }] of spots.entries()) {
      const reveal = T.MathUtils.smoothstep(progress, stop - 0.64, stop - 0.02);
      const weight = weights[index];
      const moving = weight > 0.001;
      if (spot.shadow.autoUpdate !== moving) spot.shadow.needsUpdate = true;
      spot.shadow.autoUpdate = moving;
      spot.intensity = reveal * (7 + weight * 56) + (index === 0 ? 22 : 0.35) + exterior * 67;
      spot.color.copy(color).lerp(exteriorLamp, exterior * 0.78);
      lens.color.copy(spot.color).multiplyScalar(0.045 + spot.intensity * 0.062);
      if (shadow) {
        shadow.material.opacity = 0.34 - weight * 0.19;
        shadow.scale.setScalar(1 + weight * 0.3);
      }
    }
  }
  return { floor, illuminate, mounts: spots.map(({ mount }) => mount) };
}
