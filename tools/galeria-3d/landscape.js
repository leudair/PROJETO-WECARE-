import * as T from 'three';

import { addTerrain } from './terrain.js';
const markerPositions = [[12.9, -35.5], [7.2, -37.5], [13.4, -26.6]];
const worldVertex = `
  varying vec3 worldPoint;
  void main() {
    worldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphere = `
  uniform float daylight;
  uniform float clock;
  vec3 sunDirection() { return normalize(vec3(-0.30, mix(0.19, 0.27, daylight), -0.955)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
      mix(hash(i + vec2(0, 1)), hash(i + vec2(1)), u.x), u.y);
  }
  vec3 skyColor(vec3 direction) {
    float height = clamp(direction.y, 0.0, 1.0);
    vec3 horizon = mix(vec3(1.22, 1.14, 1.03), vec3(1.21, 1.26, 1.30), daylight);
    vec3 blue = mix(vec3(0.58, 0.72, 0.90), vec3(0.54, 0.74, 0.98), daylight);
    vec3 c = mix(horizon, blue, smoothstep(0.0, 0.30, height));
    float sunDot = max(dot(direction, sunDirection()), 0.0);
    c += vec3(0.43, 0.31, 0.22) * pow(sunDot, 25.0) * mix(0.72, 0.32, daylight);
    c += vec3(4.1, 2.35, 0.94) * smoothstep(0.99955, 0.99979, sunDot) * (1.0 - daylight * .48);
    return c;
  }
`;

export function buildLandscape(scene) {
  const clock = { value: 0 };
  const daylight = { value: 0 };
  addTerrain(scene, daylight);
  const sky = new T.Mesh(new T.SphereGeometry(380, 40, 24), new T.ShaderMaterial({
    vertexShader: worldVertex, side: T.BackSide, depthWrite: false,
    uniforms: { clock, daylight },
    fragmentShader: `
      varying vec3 worldPoint;
      ${atmosphere}
      void main() {
        vec3 direction = normalize(worldPoint - cameraPosition);
        vec3 c = skyColor(direction);
        float bearing = atan(direction.x, -direction.z);
        vec2 p = vec2(bearing * 7.0 - clock * 0.035, direction.y * 74.0);
        p.y += noise(vec2(bearing * 5.5, clock * 0.018)) * 2.7;
        float cloud = noise(p) * 0.58 + noise(p * 2.1) * 0.28 + noise(p * 5.2) * 0.14;
        float veil = smoothstep(0.47, 0.74, cloud) * smoothstep(0.018, 0.085, direction.y);
        c = mix(c, mix(vec3(1.16, 1.09, 1.06), vec3(1.20, 1.23, 1.28), daylight), veil * 0.42);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.position.set(0, 0, -45);
  sky.renderOrder = 10;
  scene.add(sky);
  const waterMaterial = new T.ShaderMaterial({
    vertexShader: `
      uniform float clock;
      varying vec3 worldPoint;
      void main() {
        vec3 point = (modelMatrix * vec4(position, 1.0)).xyz;
        point.y += sin(dot(point.xz, vec2(0.25, 0.97)) * 1.25 - clock * 1.04) * 0.035
          + sin(dot(point.xz, vec2(-0.42, 0.91)) * 2.9 - clock * 1.42) * 0.014;
        worldPoint = point;
        gl_Position = projectionMatrix * viewMatrix * vec4(point, 1.0);
      }
    `,
    uniforms: { clock, daylight, markers: { value: markerPositions.map(([x, z]) => new T.Vector2(x, z)) } },
    fragmentShader: `
      varying vec3 worldPoint;
      uniform vec2 markers[3];
      ${atmosphere}
      vec3 ripple(vec2 p, vec2 direction, float frequency, float speed, float amplitude) {
        float phase = dot(direction, p) * frequency + clock * speed;
        return vec3(direction.x * cos(phase), sin(phase), direction.y * cos(phase)) * amplitude;
      }
      void main() {
        vec2 p = worldPoint.xz;
        vec3 v = normalize(cameraPosition - worldPoint);
        float distanceToEye = length(cameraPosition - worldPoint);
        float detail = 1.0 - smoothstep(24.0, 106.0, distanceToEye);
        float gust = noise(p * 0.126 + vec2(-clock * 0.1, clock * 0.04));
        vec2 warped = p + vec2(gust * 0.7, -gust * 1.2);
        vec3 wave = ripple(warped, vec2(0.25, 0.97), 1.25, -1.04, 0.086)
          + ripple(warped, vec2(-0.42, 0.91), 2.9, -1.42, 0.051)
          + ripple(p, vec2(0.7, 0.71), 5.1, -1.76, 0.029)
          + ripple(p, vec2(0.93, -0.36), 9.5, 2.05, 0.025 * detail)
          + ripple(p, vec2(-0.79, -0.68), 21.0, 2.9, 0.009 * detail);
        for (int i = 0; i < 3; i++) {
          vec2 wakeVector = p - markers[i];
          float wakeDistance = max(length(wakeVector), 0.04);
          float bump = sin(wakeDistance * 7.4 - clock * 2.55 + float(i)) * exp(-wakeDistance * 1.32) * 0.046;
          wave.xz += wakeVector / wakeDistance * bump;
        }
        vec3 normal = normalize(vec3(wave.x, 1.0, wave.z));
        vec3 reflection = reflect(-v, normal);
        float fresnel = pow(1.0 - max(dot(v, normal), 0.0), 4.0);
        vec3 reflectColor = skyColor(reflection);
        vec3 color = mix(mix(vec3(0.19, 0.35, 0.46), vec3(0.22, 0.39, 0.51), daylight), reflectColor * 0.59, 0.15 + fresnel * 0.70);
        float spec = pow(max(dot(reflection, sunDirection()), 0.0), 115.0);
        float curl = noise(p * vec2(1.8, 3.7) + vec2(clock * 0.08, 0.0));
        color += vec3(0.88, 0.75, 0.54) * spec * (0.44 + curl * 0.85) * (1.0 - daylight * .48);
        color += vec3(0.047, 0.065, 0.076) * (wave.y + curl * 0.3) * (1.0 - daylight * 0.52);
        float facadeDistance = (4.15 - worldPoint.x) / min(-0.025, reflection.x);
        vec3 facade = worldPoint + reflection * facadeDistance;
        float facadeMask = step(0.0, facadeDistance) * step(-35.9, facade.z) * step(facade.z, 11.9)
          * step(0.0, facade.y) * step(facade.y, 4.24) * step(reflection.x, 0.0);
        float windows = smoothstep(0.08, 0.28, abs(fract((facade.z + 36.0) * 0.29) - 0.5));
        float bands = pow(max(0.0, sin(facade.y * 4.65 + gust * 0.2)), 2.6);
        color = mix(color, vec3(0.61, 0.71, 0.77) + vec3(0.23, 0.24, 0.23) * bands * windows * (0.30 + curl * 0.6),
          facadeMask * (0.25 + fresnel * 0.5) * daylight);
        vec2 lightPoint = p + reflection.xz * (0.53 / max(0.04, reflection.y));
        for (int i = 0; i < 3; i++) {
          float miss = length((lightPoint - markers[i]) * vec2(1.65, 0.68));
          color += vec3(0.58, 0.43, 0.23) * exp(-miss * 3.2) * daylight * (0.23 + curl * 0.42);
        }
        float mist = smoothstep(54.0, 151.0, distanceToEye);
        vec3 farWater = mix(vec3(0.52, 0.64, 0.71), vec3(0.60, 0.72, 0.78), daylight);
        color = mix(color, farWater, mist);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const water = new T.Mesh(new T.PlaneGeometry(356, 360, 256, 256), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.73, -36);
  water.renderOrder = 8;
  scene.add(water);

  const markers = makeWaterMarkers(scene);
  return (time, exterior) => {
    clock.value = time;
    daylight.value = exterior;
    for (const [i, { group, lamp, halo }] of markers.entries()) {
      const phase = time * 1.42 + i * 2.1;
      group.position.y = -0.70 + Math.sin(phase) * 0.043;
      group.rotation.set(0.075 * Math.sin(phase + 0.5), 0, 0.085 * Math.cos(phase * 0.84));
      lamp.color.setHex(0xffbe76).multiplyScalar(0.2 + exterior * 1.6);
      halo.material.opacity = exterior * 0.28;
    }
  };
}

function makeWaterMarkers(scene) {
  const hull = new T.MeshStandardMaterial({ color: 0xb7c6cb, metalness: 0.30, roughness: 0.42, fog: false });
  const band = new T.MeshStandardMaterial({ color: 0xbbad93, metalness: 0.46, roughness: 0.44, fog: false });
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  const context = glow.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255, 204, 143, 0.92)');
  gradient.addColorStop(0.25, 'rgba(255, 166, 85, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 134, 50, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const haloMap = new T.CanvasTexture(glow);
  haloMap.colorSpace = T.SRGBColorSpace;

  return markerPositions.map(([x, z]) => {
    const group = new T.Group();
    group.position.set(x, -0.70, z);
    const shoulder = new T.Mesh(new T.CylinderGeometry(0.19, 0.26, 0.19, 24), hull);
    shoulder.position.y = 0.07;
    const collar = new T.Mesh(new T.CylinderGeometry(0.083, 0.088, 0.11, 20), band);
    collar.position.y = 0.22;
    const post = new T.Mesh(new T.CylinderGeometry(0.042, 0.046, 0.21, 16), hull);
    post.position.y = 0.36;
    const lamp = new T.MeshBasicMaterial({ color: 0xffc58a, fog: false });
    const lens = new T.Mesh(new T.SphereGeometry(0.061, 16, 10), lamp);
    lens.position.y = 0.49;
    const halo = new T.Sprite(new T.SpriteMaterial({ map: haloMap, transparent: true, depthWrite: false, fog: false }));
    halo.position.y = 0.49;
    halo.scale.setScalar(0.76);
    group.add(shoulder, collar, post, lens, halo);
    scene.add(group);
    return { group, lamp, halo };
  });
}
