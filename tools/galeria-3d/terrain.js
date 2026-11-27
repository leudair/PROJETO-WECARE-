import * as T from 'three';

const mix = T.MathUtils.lerp;
const smooth = T.MathUtils.smoothstep;
const TAU = Math.PI * 2;

function duneHeight(x, z, radius, bearing) {
  const shoreline = 91 + 8 * Math.sin(bearing * 3 + 0.65) + 5 * Math.cos(bearing * 5 - 0.3);
  const inland = radius - shoreline;
  const shoreSlope = smooth(inland, -3, 20);
  const distantSlope = 1 - smooth(inland, 115, 165);
  const drift = x * 0.57 + z * 0.82;
  const crosswind = x * -0.82 + z * 0.57;
  const alongWind = drift + Math.sin(crosswind * 0.029) * 10.5 + Math.sin(crosswind * 0.060 - 0.7) * 3;
  const modulation = 0.61 + 0.39 * Math.cos(crosswind * 0.035 + drift * 0.009) ** 2;
  const cycle = alongWind / 41 - Math.floor(alongWind / 41);
  const longRidge = cycle < 0.76 ? smooth(cycle, 0, 0.76) : 1 - smooth(cycle, 0.76, 1);
  const slipFace = (0.5 + 0.5 * Math.sin(alongWind * 0.29 + crosswind * 0.022 + 0.5)) ** 2;
  const crest = (longRidge * 6.4 + slipFace * 1.45) * modulation;
  return -2.8 + shoreSlope * (2.42 + crest * distantSlope);
}

export function addTerrain(scene, daylight) {
  const columns = 385;
  const rows = 97;
  const positions = new Float32Array(columns * rows * 3);
  const indices = [];
  for (let j = 0; j < rows; j++) {
    const radius = mix(73, 286, j / (rows - 1));
    for (let i = 0; i < columns; i++) {
      const bearing = i / (columns - 1) * TAU;
      const x = Math.sin(bearing) * radius;
      const z = -Math.cos(bearing) * radius;
      const a = j * columns + i;
      positions.set([x, duneHeight(x, z, radius, bearing), z - 36], a * 3);
      if (i < columns - 1 && j < rows - 1) {
        const next = a + columns;
        indices.push(a, a + 1, next, a + 1, next + 1, next);
      }
    }
  }

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new T.ShaderMaterial({
    uniforms: { daylight },
    vertexShader: `
      varying vec3 positionInWorld;
      varying vec3 sandNormal;
      void main() {
        positionInWorld = position;
        sandNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float daylight;
      varying vec3 positionInWorld;
      varying vec3 sandNormal;

      void main() {
        vec3 normal = normalize(sandNormal);
        vec2 ground = positionInWorld.xz;
        vec3 sun = normalize(vec3(-0.76, 0.59, -0.27));
        float light = dot(normal, sun);
        float tone = smoothstep(0.22, 0.82, light);
        vec3 coolSand = mix(vec3(.43, .52, .61), vec3(.47, .56, .65), daylight);
        vec3 warmSand = mix(vec3(1.10, 1.04, .94), vec3(1.13, 1.12, 1.06), daylight);
        vec3 color = mix(coolSand, warmSand, tone);
        float distanceToDune = distance(cameraPosition, positionInWorld);
        float nearDetail = 1.0 - smoothstep(72.0, 143.0, distanceToDune);
        float ripple = sin(dot(ground, vec2(2.1, 3.2)) + sin(ground.x * .14 + ground.y * .22) * 1.8);
        color *= 1.0 + ripple * nearDetail * .017;
        float haze = smoothstep(110.0, 272.0, distanceToDune) * .56;
        color = mix(color, vec3(1.00, 1.06, 1.13), haze);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  scene.add(new T.Mesh(geometry, material));
}
