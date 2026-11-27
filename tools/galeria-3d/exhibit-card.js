import * as T from 'three';
import { characterMotion, characterProgress, splitGraphemes } from './text-motion.js';

const ASPECT = 1.62;
const clamp = T.MathUtils.clamp;

function cardArtwork(item, invalidate) {
  const canvas = document.createElement('canvas');
  canvas.width = 648;
  canvas.height = 400;
  const context = canvas.getContext('2d');
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  const inset = 36;
  const available = canvas.width - inset * 2;
  let lines = [], lastDraw = -1, duration = 0;

  function prepare() {
    lines = [];
    duration = 0;
    function line(text, x, y, size, weight, color, maxWidth, rightAligned = false) {
      const font = `${weight} ${size}px Sora, sans-serif`;
      context.font = font;
      const trueWidth = context.measureText(text).width;
      const compress = Math.min(1, maxWidth / Math.max(trueWidth, 1));
      const start = rightAligned ? x - trueWidth * compress : x;
      let prefix = '', count = 0;
      const glyphs = splitGraphemes(text).flatMap((glyph) => {
        const left = context.measureText(prefix).width;
        prefix += glyph;
        return glyph.trim() ? [{ glyph, left, index: count++ }] : [];
      });
      duration = Math.max(duration, characterMotion.delay + Math.max(0, count - 1) * characterMotion.stagger + characterMotion.duration);
      lines.push({ glyphs, start, y, size, font, color, compress });
    }

    line(item.id, inset, 53, 36, 500, '#fff', 185);
    line(item.category.toUpperCase(), canvas.width - inset, 53, 36, 500, '#fff', 365, true);
    const title = item.name.toLowerCase();
    context.font = '500 70px Sora, sans-serif';
    if (context.measureText(title).width > available && title.includes(' ')) {
      const end = title.lastIndexOf(' ');
      line(title.slice(0, end), inset, 171, 70, 500, '#000', available);
      line(title.slice(end + 1), inset, 239, 70, 500, '#000', available);
    } else {
      line(title, inset, 202, 70, 500, '#000', available);
    }
    line(item.material, inset, 324, 37, 400, '#000', available);
    line(item.dimensions, inset, 364, 37, 400, '#000', available);
    lastDraw = -1;
  }

  function paint(elapsed, reduced) {
    const end = reduced ? characterMotion.fade : duration;
    const frame = elapsed >= end ? Infinity : Math.floor(elapsed * 32) / 32;
    if (lastDraw === frame) return elapsed < end;
    lastDraw = frame;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#070707';
    context.fillRect(6, 6, canvas.width - 12, 76);
    context.fillRect(inset, 277, available, 3);
    for (const { glyphs, start, y, size, font, color, compress } of lines) {
      context.save();
      context.translate(start, 0);
      context.scale(compress, 1);
      context.font = font;
      context.fillStyle = color;
      for (const { glyph, left, index } of glyphs) {
        const alpha = reduced ? Math.min(1, frame / characterMotion.fade) : characterProgress(frame, index);
        if (alpha <= 0) continue;
        context.globalAlpha = alpha;
        context.fillText(glyph, left, y + (reduced ? 0 : (1 - alpha) * size * characterMotion.distance));
      }
      context.restore();
    }
    texture.needsUpdate = true;
    return elapsed < end;
  }

  prepare();
  paint(0, false);
  document.fonts?.load('500 70px Sora').then(() => {
    prepare();
    invalidate();
  }).catch(() => {});
  return { texture, paint, reset() { lastDraw = -1; } };
}

export function makeExhibitCards(collection, renderer, invalidate) {
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(0, 1, 1, 0, 1, 700);
  camera.position.z = 350;
  const artwork = collection.map((item) => cardArtwork(item, invalidate));
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: {
      artwork: { value: artwork[0].texture },
      time: { value: 0 },
      opacity: { value: 0 },
    },
    vertexShader: `
      uniform float time;
      varying vec2 paperUv;
      varying float shade;
      void main() {
        paperUv = uv;
        vec3 p = position;
        float phase = p.x * 6.7 + p.y * 3.15 - time * 1.34;
        float edge = smoothstep(0.08, 0.54, abs(p.x + p.y * 0.44));
        float crease = sin(phase) * (0.054 + edge * 0.075);
        float curl = cos(p.x * 9.2 - p.y * 5.4 + time * 1.78);
        p.z += crease + edge * curl * 0.048;
        p.y += sin(phase + 0.8) * (0.024 + edge * 0.040);
        p.x += cos(phase * 0.78) * 0.018;
        shade = 0.965 + cos(phase) * 0.045 - edge * (0.035 + curl * 0.048);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D artwork;
      uniform float opacity;
      varying vec2 paperUv;
      varying float shade;
      void main() {
        vec3 printColor = texture2D(artwork, paperUv).rgb;
        gl_FragColor = vec4(printColor * clamp(shade, 0.84, 1.0), opacity);
        #include <colorspace_fragment>
      }
    `,
  });
  const paper = new T.Mesh(new T.PlaneGeometry(1, 1, 28, 18), material);
  paper.frustumCulled = false;
  scene.add(paper);

  const vertex = new T.Vector3();
  let viewportWidth, viewportHeight, activeIndex = -1;
  let x = 0, y = 0, leftSide = true, startedAt = 0, previousPreference;

  function draw(card, time, frameTime, still, now) {
    if (!card) {
      activeIndex = -1;
      return false;
    }
    const { camera: view, viewport, amount, exhibit, index } = card;
    const { width, height } = viewport;
    if (width !== viewportWidth || height !== viewportHeight) {
      camera.right = width;
      camera.top = height;
      camera.updateProjectionMatrix();
      viewportWidth = width;
      viewportHeight = height;
    }

    const { min, max } = exhibit.bounds;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let corner = 0; corner < 8; corner++) {
      vertex.set(corner & 1 ? max.x : min.x, corner & 2 ? max.y : min.y, corner & 4 ? max.z : min.z)
        .applyMatrix4(exhibit.group.matrixWorld).project(view);
      const px = (vertex.x + 1) * width / 2;
      const py = (1 - vertex.y) * height / 2;
      left = Math.min(left, px);
      right = Math.max(right, px);
      top = Math.min(top, py);
      bottom = Math.max(bottom, py);
    }

    const narrow = width < 701;
    const labelWidth = narrow ? clamp(width * 0.35, 105, 148) : clamp(width * 0.136, 152, 211);
    const labelHeight = labelWidth / ASPECT;
    const air = narrow ? 14 : 24;
    const edge = narrow ? 15 : 24;
    const spaceLeft = left - edge;
    const spaceRight = width - edge - right;
    const roomLeft = spaceLeft > labelWidth + air;
    const roomRight = spaceRight > labelWidth + air;
    if (activeIndex !== index) {
      leftSide = roomLeft && (!roomRight || spaceLeft > spaceRight);
      startedAt = now;
      artwork[index].reset();
    }
    const useLeft = roomLeft && (leftSide || !roomRight);
    let targetX, targetY;

    if (roomLeft || roomRight) {
      targetX = useLeft ? left - air - labelWidth / 2 : right + air + labelWidth / 2;
      const floor = height - (narrow ? 158 : 144) - labelHeight / 2;
      targetY = clamp(T.MathUtils.lerp(top, bottom, 0.61), Math.min(94 + labelHeight / 2, floor), floor);
    } else {
      targetX = width - edge - labelWidth / 2;
      const floor = height - (narrow ? 110 : 142) - labelHeight / 2;
      targetY = clamp(bottom + 16 + labelHeight / 2, Math.min(height * 0.47, floor), floor);
    }
    if (activeIndex !== index || still) {
      x = targetX;
      y = targetY;
    } else {
      x = T.MathUtils.damp(x, targetX, 9, frameTime);
      y = T.MathUtils.damp(y, targetY, 9, frameTime);
    }
    activeIndex = index;
    const drift = still ? 0 : Math.sin(time * 1.12 + index);
    paper.position.set(x, height - y + drift * 4 - (1 - amount) * 9, 0);
    paper.rotation.set(-0.12 + drift * 0.065, (useLeft ? -0.21 : 0.19) + drift * 0.105, drift * 0.041);
    paper.scale.set(labelWidth, labelHeight, labelWidth);
    if (previousPreference !== still) artwork[index].reset();
    previousPreference = still;
    const animating = artwork[index].paint((now - startedAt) / 1000, still);
    material.uniforms.artwork.value = artwork[index].texture;
    material.uniforms.time.value = still ? 0 : time + index * 0.75;
    material.uniforms.opacity.value = amount;
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
    } finally {
      renderer.autoClear = autoClear;
    }
    return animating;
  }
  return draw;
}
