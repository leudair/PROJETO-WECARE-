// Escritorio 3D da WeCare: recepcao, corredor e uma sala por servico.
// Um personagem anda ate a porta de cada setor, a porta de vidro abre
// sozinha e ele entra. Mesma interface da galeria antiga (makeGallery),
// para o controlador (wecare.js) continuar igual.
import * as T from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/utils/SkeletonUtils.js';
import { collection } from './collection.js';
import { createModel, disposeModel } from './models.js';

const file = (name) => window.__EXPO_FILES?.[name] ?? '/images/b/' + name;
const compact = () => matchMedia('(max-width: 700px)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const V = (x, y, z) => new T.Vector3(x, y, z);

// Medidas (metros)
const CW = 1.8;          // meia largura do corredor
const H = 3.1;           // pe direito
const DOOR_W = 1.3, DOOR_H = 2.45;
const ROOM_D = 5.4, ROOM_L = 7.2;
const END_Z = -24.4;
const doorZ = (i) => -4 - i * 4;
const sideOf = (i) => (i % 2 === 0 ? 1 : -1);
// Coordenadas dentro da sala: u = quanto entra na sala, w = ao longo do corredor
// as salas da direita sao a da esquerda girada 180 graus: todas ficam iguais vistas de dentro
const roomPoint = (i, u, y, w) => V(sideOf(i) * (CW + u), y, doorZ(i) - sideOf(i) * w);

const TXT = {
  pt: { alcance: 'Alcance', seg: 'Seguidores', eng: 'Engajamento', camp: 'Campanhas', cliques: 'Cliques', conv: 'Clientes',
    marca: 'Sua marca', botao: 'Fale com a gente', app: 'Seu app', c1: 'Olá! Queria saber sobre os serviços.',
    a1: 'Oi! Claro, já te explico tudo.', c2: 'Vocês atendem fora do Brasil?', a2: 'Sim, atendemos em vários países.',
    ent: 'Entradas', sai: 'Saídas', saldo: 'Saldo', painel: 'Painel', online: 'online agora', ia: 'Assistente WeCare' },
  en: { alcance: 'Reach', seg: 'Followers', eng: 'Engagement', camp: 'Campaigns', cliques: 'Clicks', conv: 'Customers',
    marca: 'Your brand', botao: 'Talk to us', app: 'Your app', c1: 'Hi! I would like to know about your services.',
    a1: 'Hi! Sure, I will explain everything.', c2: 'Do you work outside Brazil?', a2: 'Yes, we serve clients in many countries.',
    ent: 'Income', sai: 'Expenses', saldo: 'Balance', painel: 'Dashboard', online: 'online', ia: 'WeCare Assistant' },
  es: { alcance: 'Alcance', seg: 'Seguidores', eng: 'Interacción', camp: 'Campañas', cliques: 'Clics', conv: 'Clientes',
    marca: 'Tu marca', botao: 'Habla con nosotros', app: 'Tu app', c1: '¡Hola! Quiero saber sobre los servicios.',
    a1: '¡Hola! Claro, te explico todo.', c2: '¿Atienden fuera de Brasil?', a2: 'Sí, atendemos en varios países.',
    ent: 'Ingresos', sai: 'Gastos', saldo: 'Saldo', painel: 'Panel', online: 'en línea', ia: 'Asistente WeCare' },
};

/* ---------------- texturas desenhadas ---------------- */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function tex(c, renderer, repeat) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

function woodCanvas(seed = 7, size = 1024, planks = 6, light = 1) {
  const [c, ctx] = canvas(size, size);
  const R = rand(seed);
  const pw = size / planks;
  for (let p = 0; p < planks; p++) {
    let y = -R() * size;
    while (y < size) {
      const len = size * (0.35 + R() * 0.5);
      const hue = 24 + R() * 7, sat = 34 + R() * 12, lum = (30 + R() * 11) * light;
      ctx.fillStyle = `hsl(${hue} ${sat}% ${lum}%)`;
      ctx.fillRect(p * pw, y, pw, len);
      // veios
      for (let g = 0; g < 26; g++) {
        const gx = p * pw + R() * pw, amp = 2 + R() * 5, ph = R() * 6;
        ctx.strokeStyle = `hsla(${hue - 4} ${sat + 8}% ${lum - 8 - R() * 8}% / ${0.18 + R() * 0.3})`;
        ctx.lineWidth = 0.6 + R() * 1.6;
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const yy = y + (len * k) / 24;
          const xx = gx + Math.sin(k * 0.45 + ph) * amp;
          k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
      // brilho suave no centro da tabua
      const gr = ctx.createLinearGradient(p * pw, 0, (p + 1) * pw, 0);
      gr.addColorStop(0, 'rgba(0,0,0,.16)'); gr.addColorStop(0.5, 'rgba(255,225,190,.05)'); gr.addColorStop(1, 'rgba(0,0,0,.16)');
      ctx.fillStyle = gr; ctx.fillRect(p * pw, y, pw, len);
      ctx.fillStyle = 'rgba(12,7,4,.75)';
      ctx.fillRect(p * pw, y, pw, 2);
      y += len;
    }
    ctx.fillStyle = 'rgba(12,7,4,.8)';
    ctx.fillRect(p * pw, 0, 2, size);
  }
  return c;
}

function plasterCanvas(base, seed = 3) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  const R = rand(seed);
  for (let i = 0; i < 2600; i++) {
    const a = R() * 0.05;
    ctx.fillStyle = R() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
    ctx.fillRect(R() * 256, R() * 256, 1 + R() * 3, 1 + R() * 3);
  }
  return c;
}

function glowCanvas(color, inner = 0.0) {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 256 * inner, 128, 128, 128);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return c;
}

function fitText(ctx, text, weight, max, width) {
  let size = max;
  do { ctx.font = `${weight} ${size}px Sora, sans-serif`; size -= 2; } while (ctx.measureText(text).width > width && size > 10);
  return size + 2;
}

function signCanvas(num, name) {
  const [c, ctx] = canvas(1024, 300);
  const g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, '#1a1c20'); g.addColorStop(1, '#0d0e11');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 300);
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 1020, 296);
  ctx.fillStyle = '#d4112e'; ctx.fillRect(56, 96, 8, 108);
  ctx.font = '700 46px Sora, sans-serif'; ctx.fillStyle = '#ff3b55'; ctx.textBaseline = 'middle';
  ctx.fillText(num, 96, 104);
  ctx.fillStyle = '#ffffff';
  fitText(ctx, name, 700, 86, 860);
  ctx.fillText(name, 96, 196);
  return c;
}

function screenBase(ctx, w, h, title) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#15171c'); g.addColorStop(1, '#0b0c10');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (title) {
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 34px Sora, sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, 48, 70);
    ctx.fillStyle = '#d4112e'; rr(ctx, w - 170, 40, 122, 40, 20); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 20px Sora, sans-serif'; ctx.fillText('WeCare', w - 150, 67);
  }
}
function curve(ctx, x, y, w, h, pts, color, fill) {
  ctx.beginPath();
  pts.forEach((p, i) => { const px = x + (w * i) / (pts.length - 1), py = y + h - h * p; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
  if (fill) {
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, fill); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fill();
  }
}
function card(ctx, x, y, w, h, label, pts, accent = '#ff3b55') {
  ctx.fillStyle = 'rgba(255,255,255,.05)'; rr(ctx, x, y, w, h, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = '600 24px Sora, sans-serif'; ctx.fillText(label, x + 24, y + 44);
  ctx.fillStyle = accent; ctx.font = '700 30px Sora, sans-serif'; ctx.fillText('↑', x + w - 46, y + 46);
  curve(ctx, x + 22, y + 66, w - 44, h - 90, pts, accent, 'rgba(212,17,46,.35)');
}
function bars(ctx, x, y, w, h, vals, color) {
  const bw = w / vals.length;
  vals.forEach((v, i) => {
    const g = ctx.createLinearGradient(0, y + h - h * v, 0, y + h);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(212,17,46,.15)');
    ctx.fillStyle = g; rr(ctx, x + i * bw + bw * 0.18, y + h - h * v, bw * 0.64, h * v, 6); ctx.fill();
  });
}

// Uma tela para cada setor. variant 0 = telão da parede, 1 e 2 = monitores
function drawScreen(kind, variant, L, posts) {
  const w = 1024, h = 576;
  const [c, ctx] = canvas(w, h);
  const up = [0.12, 0.18, 0.16, 0.27, 0.33, 0.31, 0.45, 0.52, 0.6, 0.72, 0.84, 0.95];
  const up2 = [0.2, 0.24, 0.22, 0.3, 0.38, 0.36, 0.5, 0.56, 0.66, 0.7, 0.82, 0.9];
  if (kind === 'crescimento') {
    screenBase(ctx, w, h, variant === 0 ? L.painel : '');
    if (variant === 0) {
      if (posts) {
        // grade do perfil com posts reais
        const cw = posts.width / 3, ch = posts.height / 2;
        for (let i = 0; i < 6; i++) {
          const sx = (i % 3) * cw, sy = Math.floor(i / 3) * ch;
          ctx.drawImage(posts, sx, sy, cw, ch, 48 + (i % 3) * 142, 110 + Math.floor(i / 3) * 196, 136, 190);
        }
      }
      card(ctx, 500, 110, 476, 190, L.alcance, up);
      card(ctx, 500, 320, 228, 210, L.seg, up2);
      card(ctx, 748, 320, 228, 210, L.eng, [0.3, 0.28, 0.4, 0.46, 0.5, 0.62, 0.7, 0.86]);
    } else {
      card(ctx, 40, 40, w - 80, h - 80, variant === 1 ? L.seg : L.alcance, variant === 1 ? up2 : up);
    }
  } else if (kind === 'alvo') {
    screenBase(ctx, w, h, variant === 0 ? L.camp : '');
    const y0 = variant === 0 ? 110 : 40;
    // alvo
    const cx = variant === 0 ? 210 : 230, cy = y0 + 200;
    [150, 112, 74, 38].forEach((r, i) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = i % 2 ? '#f2f2f2' : '#d4112e'; ctx.fill(); });
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx + 160, cy - 120); ctx.lineTo(cx + 6, cy - 6); ctx.stroke();
    card(ctx, 430, y0, 546, 200, L.cliques, up);
    ctx.fillStyle = 'rgba(255,255,255,.05)'; rr(ctx, 430, y0 + 220, 546, 200, 18); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = '600 24px Sora, sans-serif'; ctx.fillText(L.conv, 454, y0 + 262);
    bars(ctx, 450, y0 + 280, 506, 126, [0.25, 0.32, 0.3, 0.45, 0.5, 0.62, 0.7, 0.85, 0.95], '#ff3b55');
  } else if (kind === 'telas') {
    if (variant === 1 || variant === 2) {
      // editor de codigo
      ctx.fillStyle = '#0d1016'; ctx.fillRect(0, 0, w, h);
      const R = rand(variant * 11 + 5);
      const cols = ['#ff5c73', '#7fd1ff', '#ffd27a', '#b7f0a5', '#c9b6ff', 'rgba(255,255,255,.55)'];
      for (let l = 0; l < 16; l++) {
        let x = 70 + Math.floor(R() * 4) * 36;
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.font = '500 18px monospace'; ctx.fillText(String(l + 1), 22, 52 + l * 32);
        const n = 2 + Math.floor(R() * 4);
        for (let k = 0; k < n; k++) {
          const ww = 40 + R() * 160;
          ctx.fillStyle = cols[Math.floor(R() * cols.length)]; rr(ctx, x, 38 + l * 32, ww, 14, 7); ctx.fill();
          x += ww + 14;
        }
      }
    } else {
      ctx.fillStyle = '#0b0c10'; ctx.fillRect(0, 0, w, h);
      // site
      ctx.fillStyle = '#f4f4f2'; rr(ctx, 40, 40, 640, 496, 18); ctx.fill();
      ctx.fillStyle = '#e3e3e0'; ctx.fillRect(40, 40, 640, 46);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((cc, i) => { ctx.fillStyle = cc; ctx.beginPath(); ctx.arc(70 + i * 24, 63, 7, 0, 7); ctx.fill(); });
      ctx.fillStyle = '#121318'; ctx.font = '800 54px Sora, sans-serif'; ctx.fillText(L.marca, 84, 200);
      ctx.fillStyle = '#9a9ba0'; [0, 1, 2].forEach((k) => { rr(ctx, 84, 236 + k * 26, 380 - k * 90, 12, 6); ctx.fill(); });
      ctx.fillStyle = '#d4112e'; rr(ctx, 84, 340, 250, 60, 30); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 22px Sora, sans-serif'; ctx.fillText(L.botao, 104, 378);
      ctx.fillStyle = '#d9d9d5'; rr(ctx, 400, 300, 240, 200, 14); ctx.fill();
      const gg = ctx.createLinearGradient(400, 300, 640, 500); gg.addColorStop(0, '#d4112e'); gg.addColorStop(1, '#5a0613');
      ctx.fillStyle = gg; rr(ctx, 400, 300, 240, 200, 14); ctx.fill();
      // celular
      ctx.fillStyle = '#1b1d22'; rr(ctx, 730, 60, 250, 470, 36); ctx.fill();
      ctx.fillStyle = '#f4f4f2'; rr(ctx, 744, 74, 222, 442, 28); ctx.fill();
      ctx.fillStyle = '#121318'; ctx.font = '800 30px Sora, sans-serif'; ctx.fillText(L.app, 766, 140);
      for (let k = 0; k < 4; k++) { ctx.fillStyle = k === 0 ? '#d4112e' : '#e2e2df'; rr(ctx, 766, 170 + k * 82, 178, 68, 14); ctx.fill(); }
    }
  } else if (kind === 'balao') {
    ctx.fillStyle = '#0b141a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f2c34'; ctx.fillRect(0, 0, w, 86);
    ctx.fillStyle = '#d4112e'; ctx.beginPath(); ctx.arc(60, 43, 26, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 22px Sora, sans-serif'; ctx.fillText('W', 50, 51);
    ctx.font = '700 26px Sora, sans-serif'; ctx.fillText(L.ia, 104, 40);
    ctx.fillStyle = '#25d366'; ctx.font = '500 18px Sora, sans-serif'; ctx.fillText(L.online, 104, 66);
    const msgs = variant === 2 ? [[0, L.c2], [1, L.a2]] : [[0, L.c1], [1, L.a1], [0, L.c2], [1, L.a2]];
    let y = 120;
    ctx.font = '500 24px Sora, sans-serif';
    for (const [me, m] of msgs) {
      const tw = Math.min(ctx.measureText(m).width, 620);
      const bx = me ? w - tw - 90 : 40;
      ctx.fillStyle = me ? '#7a0c1c' : '#202c33'; rr(ctx, bx, y, tw + 50, 62, 16); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(m, bx + 25, y + 40, 620);
      y += 96;
    }
  } else {
    screenBase(ctx, w, h, variant === 0 ? L.saldo : '');
    const y0 = variant === 0 ? 110 : 40;
    ctx.fillStyle = 'rgba(255,255,255,.05)'; rr(ctx, 48, y0, 600, h - y0 - 40, 18); ctx.fill();
    curve(ctx, 76, y0 + 30, 544, h - y0 - 110, up, '#e2b85c', 'rgba(201,162,74,.35)');
    curve(ctx, 76, y0 + 30, 544, h - y0 - 110, [0.3, 0.28, 0.33, 0.3, 0.32, 0.31, 0.35, 0.33], 'rgba(255,255,255,.45)');
    [[L.ent, '#e2b85c'], [L.sai, 'rgba(255,255,255,.6)'], [L.saldo, '#ff3b55']].forEach(([lb, cc], i) => {
      ctx.fillStyle = 'rgba(255,255,255,.05)'; rr(ctx, 676, y0 + i * 136, 300, 116, 18); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = '600 24px Sora, sans-serif'; ctx.fillText(lb, 700, y0 + 44 + i * 136);
      ctx.fillStyle = cc; rr(ctx, 700, y0 + 66 + i * 136, 200 - i * 40, 14, 7); ctx.fill();
    });
  }
  return c;
}

/* ---------------- terno escuro: tinge so o que tem cor (terno, colete, gravata) ---------------- */

function suitTexture(map, renderer) {
  const im = map.image;
  const [c, ctx] = canvas(im.width, im.height);
  ctx.drawImage(im, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let k = 0; k < px.length; k += 4) {
    const r = px[k], g = px[k + 1], b = px[k + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    const t = Math.min(1, Math.max(0, (sat - 0.12) / 0.18));
    // terno grafite levemente azulado
    const v = lum * 0.32;
    px[k] = r * (1 - t) + (v * 0.92) * t;
    px[k + 1] = g * (1 - t) + (v * 0.97) * t;
    px[k + 2] = b * (1 - t) + (v * 1.12) * t;
  }
  ctx.putImageData(d, 0, 0);
  const out = new T.CanvasTexture(c);
  out.colorSpace = T.SRGBColorSpace; out.flipY = map.flipY; out.anisotropy = 4;
  return out;
}

/* ---------------- animacao: passos do Mixamo no avatar ---------------- */

function retarget(clip, root, animScene) {
  // passa a animacao do esqueleto do Mixamo para o avatar, comparando as poses no espaco do mundo
  const target = [];
  root.traverse((o) => { if (o.isSkinnedMesh) target.push(o); });
  const body = target.find((o) => /Body/.test(o.name)) ?? target[0];
  animScene.updateMatrixWorld(true);
  const nodes = [];
  animScene.traverse((o) => { if (/^mixamorig/.test(o.name)) nodes.push(o); });
  root.updateMatrixWorld(true);
  // o avatar descansa em pose A: abre os bracos em T igual ao Mixamo antes de comparar
  const wp = (o) => o.getWorldPosition(new T.Vector3());
  for (const bone of body.skeleton.bones) {
    if (!/(Shoulder|Arm|ForeArm|UpLeg|Leg)$/.test(bone.name)) continue;
    const child = bone.children.find((c) => c.isBone && animScene.getObjectByName('mixamorig' + c.name));
    const src = animScene.getObjectByName('mixamorig' + bone.name);
    if (!child || !src) continue;
    const srcChild = animScene.getObjectByName('mixamorig' + child.name);
    const dT = wp(child).sub(wp(bone)).normalize(), dS = wp(srcChild).sub(wp(src)).normalize();
    const turn = new T.Quaternion().setFromUnitVectors(dT, dS);
    const world = bone.getWorldQuaternion(new T.Quaternion());
    const parent = bone.parent.getWorldQuaternion(new T.Quaternion());
    bone.quaternion.copy(parent.invert().multiply(turn.multiply(world)));
    bone.updateMatrixWorld(true);
  }
  // diferenca entre as poses de descanso (as duas em T), osso por osso
  const localOffsets = {};
  const qa = new T.Quaternion(), qb = new T.Quaternion(), tmp = new T.Vector3(), tmp2 = new T.Vector3();
  for (const bone of body.skeleton.bones) {
    const src = animScene.getObjectByName('mixamorig' + bone.name);
    if (!src) continue;
    src.matrixWorld.decompose(tmp, qa, tmp2);
    bone.matrixWorld.decompose(tmp, qb, tmp2);
    localOffsets[bone.name] = new T.Matrix4().makeRotationFromQuaternion(qa.invert().multiply(qb));
  }
  const out = SkeletonUtils.retargetClip(body, getHelper(nodes, animScene), clip, {
    hip: 'mixamorigHips', getBoneName: (bone) => 'mixamorig' + bone.name, fps: 30, preserveBonePositions: true, localOffsets,
  });
  body.skeleton.pose();
  for (const tr of out.tracks) tr.name = tr.name.replace(/^\.bones\[([^\]]+)\]\./, '$1.');
  // posicao do quadril: so o balanco do passo, no lugar
  const hips = root.getObjectByName('Hips');
  const k = hips ? hips.position.y / 104 : 0.0098;
  out.tracks = out.tracks.filter((tr) => !/\.position$/.test(tr.name) || tr.name === 'Hips.position');
  const src = clip.tracks.find((tr) => /Hips\.position$/.test(tr.name));
  out.tracks = out.tracks.filter((tr) => tr.name !== 'Hips.position');
  if (src && hips) {
    const v = Float32Array.from(src.values);
    for (let j = 0; j < v.length; j += 3) { v[j] = (v[j] - 2.9) * k; v[j + 1] *= k; v[j + 2] = hips.position.z; }
    out.tracks.push(new T.VectorKeyframeTrack('Hips.position', src.times, v));
  }
  return out;
}
function getHelper(nodes, animScene) {
  const helper = new T.Object3D();
  helper.updateMatrixWorld = () => animScene.updateMatrixWorld(true);
  helper.skeleton = new T.Skeleton(nodes);
  // o mixer acha os ossos pelo nome dentro do esqueleto
  return helper;
}

/* ---------------- ambiente de reflexo ---------------- */

function environmentFor(renderer) {
  const env = new T.Scene();
  env.background = new T.Color(0x16130f);
  const add = (size, pos, color, power) => {
    const m = new T.Mesh(new T.PlaneGeometry(...size), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(power), side: T.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  add([1.2, 14], [0, 6, 0], 0xfff1de, 4.2);
  add([10, 3], [0, 2, -7], 0x3a3027, 1.0);
  add([10, 3], [0, 2, 7], 0x2c2620, 1.0);
  add([3, 2], [-6, 2, 0], 0xffe2c4, 1.6);
  add([3, 2], [6, 2, 2], 0xd4112e, 0.9);
  add([14, 14], [0, -5, 0], 0x3b2416, 0.8);
  const pmrem = new T.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.03);
  pmrem.dispose();
  return target.texture;
}

/* ---------------- moveis ---------------- */

function makeKit(renderer) {
  const std = (o) => new T.MeshStandardMaterial(o);
  const wood = tex(woodCanvas(7), renderer);
  const woodDark = tex(woodCanvas(21, 512, 8, 0.62), renderer);
  const wall = tex(plasterCanvas('#2e3136'), renderer, [3, 1]);
  const M = {
    floor: std({ map: wood, roughness: 0.34, metalness: 0, envMapIntensity: 0.75 }),
    wall: std({ map: wall, color: 0xffffff, roughness: 0.9, metalness: 0 }),
    wallLight: std({ color: 0x3a3d42, roughness: 0.88 }),
    ceiling: std({ color: 0x141518, roughness: 0.95 }),
    black: std({ color: 0x0c0d0f, roughness: 0.38, metalness: 0.6 }),
    blackMatte: std({ color: 0x111214, roughness: 0.7, metalness: 0.2 }),
    walnut: std({ map: woodDark, roughness: 0.5 }),
    deskTop: std({ map: woodDark, roughness: 0.42 }),
    fabric: std({ color: 0x24262a, roughness: 0.92 }),
    chrome: std({ color: 0xcfd3d8, roughness: 0.18, metalness: 1 }),
    stone: std({ color: 0x8f8a84, roughness: 0.62, metalness: 0.05 }),
    ceramic: std({ color: 0x1d1e21, roughness: 0.45, metalness: 0.1 }),
    leaf: std({ color: 0x2d5a34, roughness: 0.55, side: T.DoubleSide }),
    led: new T.MeshBasicMaterial({ color: new T.Color(0xfff1de).multiplyScalar(1.5) }),
    ledRed: new T.MeshBasicMaterial({ color: new T.Color(0xff2440).multiplyScalar(2.0) }),
    glass: new T.MeshPhysicalMaterial({ color: 0xbfd0d6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16,
      envMapIntensity: 1.6, depthWrite: false, side: T.DoubleSide }),
    frosted: new T.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide }),
    bezel: std({ color: 0x050506, roughness: 0.3, metalness: 0.4 }),
  };
  const box = (w, h, d, m) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.castShadow = true; o.receiveShadow = true; return o; };
  const cyl = (r1, r2, h, m, seg = 32) => { const o = new T.Mesh(new T.CylinderGeometry(r1, r2, h, seg), m); o.castShadow = true; o.receiveShadow = true; return o; };
  return { M, box, cyl, wood };
}

function chair(K) {
  const g = new T.Group();
  const seat = K.box(0.5, 0.09, 0.48, K.M.fabric); seat.position.y = 0.48;
  const back = K.box(0.48, 0.56, 0.07, K.M.fabric); back.position.set(0, 0.86, 0.23); back.rotation.x = -0.1;
  const pole = K.cyl(0.025, 0.025, 0.38, K.M.chrome, 12); pole.position.y = 0.26;
  g.add(seat, back, pole);
  for (let k = 0; k < 5; k++) {
    const leg = K.box(0.3, 0.03, 0.04, K.M.black);
    leg.position.set(Math.cos(k * 1.2566) * 0.15, 0.06, Math.sin(k * 1.2566) * 0.15);
    leg.rotation.y = -k * 1.2566;
    g.add(leg);
  }
  return g;
}

function plant(K, leaves, matrix, scale = 1) {
  const g = new T.Group();
  const pot = K.cyl(0.2 * scale, 0.15 * scale, 0.5 * scale, K.M.ceramic, 24); pot.position.y = 0.25 * scale;
  g.add(pot);
  g.userData.leaves = [];
  const R = rand(Math.floor(matrix * 1000));
  for (let k = 0; k < 16; k++) {
    const a = R() * Math.PI * 2, tilt = 0.25 + R() * 0.55, len = (0.45 + R() * 0.35) * scale;
    g.userData.leaves.push({ a, tilt, len, y: 0.5 * scale });
  }
  leaves.push(g);
  return g;
}

/* ---------------- cena ---------------- */

export function makeGallery(host, hooks) {
  const canvasEl = document.createElement('canvas');
  const context = canvasEl.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!context) throw new Error('WebGL 2 is unavailable');
  const renderer = new T.WebGLRenderer({ canvas: canvasEl, context });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  canvasEl.setAttribute('aria-hidden', 'true');
  host.append(canvasEl);
  const fade = document.createElement('div');
  fade.style.cssText = 'position:absolute;inset:0;background:#0b0c0e;opacity:0;pointer-events:none;transition:opacity .32s ease';
  host.append(fade);

  const lang = (document.documentElement.lang || 'pt').slice(0, 2);
  const L = TXT[lang] ?? TXT.pt;
  const scene = new T.Scene();
  scene.background = new T.Color(0x0c0d0f);
  scene.fog = new T.Fog(0x0c0d0f, 16, 34);
  scene.environment = environmentFor(renderer);
  scene.environmentIntensity = 0.55;
  const K = makeKit(renderer);
  const { M } = K;

  const hemi = new T.HemisphereLight(0xfff2e6, 0x2a1d14, 0.55);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff0e0, 1.25);
  sun.castShadow = true;
  const sm = compact() ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 20 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  /* --- piso e teto --- */
  const floorW = 2 * (CW + ROOM_D) + 1, floorL = 32;
  const floor = new T.Mesh(new T.PlaneGeometry(floorW, floorL), M.floor);
  M.floor.map.wrapS = M.floor.map.wrapT = T.RepeatWrapping;
  M.floor.map.repeat.set(floorW / 1.2, floorL / 2.4);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 6 - floorL / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  const ceil = new T.Mesh(new T.PlaneGeometry(floorW, floorL), M.ceiling);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, 6 - floorL / 2);
  scene.add(ceil);

  const wallPlane = (w, h, pos, rotY, m = M.wall) => {
    const o = new T.Mesh(new T.PlaneGeometry(w, h), m);
    o.position.copy(pos); o.rotation.y = rotY; o.receiveShadow = true;
    scene.add(o); return o;
  };

  // faixa de LED no teto do corredor
  const strip = K.box(0.04, 0.02, 27.5, M.led); strip.castShadow = false;
  strip.position.set(0, H - 0.013, 4.6 - 27.5 / 2); scene.add(strip);
  for (const x of [-CW + 0.02, CW - 0.02]) {
    const base = K.box(0.02, 0.08, 29, M.black); base.position.set(x, 0.04, 5 - 14.5); scene.add(base);
  }

  /* --- recepcao --- */
  const RW = 3.4, RZ = 5.6;
  wallPlane(2 * RW, H, V(0, H / 2, RZ), Math.PI);
  wallPlane(RZ, H, V(-RW, H / 2, RZ / 2), Math.PI / 2);
  wallPlane(RZ, H, V(RW, H / 2, RZ / 2), -Math.PI / 2);
  for (const s of [-1, 1]) wallPlane(RW - CW, H, V(s * (RW + CW) / 2, H / 2, 0), 0);
  // painel de ripas com o logo na parede esquerda da recepcao
  const slats = new T.InstancedMesh(new T.BoxGeometry(0.05, H - 0.2, 0.04), M.walnut, 120);
  let slatCount = 0;
  const dummy = new T.Object3D();
  const addSlat = (x, y, z, rotY) => { dummy.position.set(x, y, z); dummy.rotation.set(0, rotY, 0); dummy.updateMatrix(); slats.setMatrixAt(slatCount++, dummy.matrix); };
  for (let k = 0; k < 44; k++) addSlat(-RW + 0.03, H / 2, 0.35 + k * 0.11, Math.PI / 2);
  // ripas na parede do fundo (atras do logo)
  for (let k = 0; k < 33; k++) addSlat(-CW + 0.06 + k * 0.11, H / 2, END_Z + 0.03, 0);
  slats.count = slatCount; slats.receiveShadow = true;
  scene.add(slats);
  // balcao
  const desk = new T.Group();
  const body = K.box(2.1, 1.02, 0.62, M.black); body.position.y = 0.53;
  const top = K.box(2.24, 0.05, 0.76, M.deskTop); top.position.y = 1.06;
  const ledRec = K.box(2.0, 0.02, 0.02, M.ledRed); ledRec.position.set(0, 0.05, 0.32); ledRec.castShadow = false;
  desk.add(body, top, ledRec);
  desk.position.set(2.55, 0, 2.6);
  scene.add(desk);

  /* --- parede do fundo com logo --- */
  const endWall = wallPlane(2 * CW, H, V(0, H / 2, END_Z), 0);
  const ledEnd = K.box(2 * CW - 0.1, 0.03, 0.03, M.ledRed); ledEnd.position.set(0, H - 0.18, END_Z + 0.12); ledEnd.castShadow = false; scene.add(ledEnd);
  const glow = new T.Mesh(new T.PlaneGeometry(4.2, 2.6), new T.MeshBasicMaterial({ map: tex(glowCanvas('rgba(212,17,46,.55)'), renderer),
    transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  glow.position.set(0, 1.9, END_Z + 0.08); scene.add(glow);
  const redLight = new T.PointLight(0xff2a40, 5, 7, 2); redLight.position.set(0, 2.0, END_Z + 1.0); scene.add(redLight);
  let logo;

  /* --- luzes do corredor --- */
  const lamps = [];
  for (const z of [2.6, -6, -14, -21]) {
    const p = new T.PointLight(0xffe4c8, 9, 9, 2); p.position.set(0, H - 0.35, z); scene.add(p); lamps.push(p);
  }

  /* --- folhas (todas as plantas numa malha so) --- */
  const plants = [];
  const addPlant = (x, z, scale = 1) => { const p = plant(K, plants, x * 7 + z * 3 + 11, scale); p.position.set(x, 0, z); scene.add(p); return p; };
  addPlant(-RW + 0.5, 4.7, 1.25);
  addPlant(-CW + 0.38, END_Z + 0.5, 1.2);
  addPlant(CW - 0.38, END_Z + 0.5, 1.2);

  /* --- quadros com fotos reais --- */
  const loader = new T.TextureLoader();
  const frames = [
    { src: 'equipe.jpg', w: 1.34, h: 0.76, z: -1.35 },
    { src: 'estrutura.jpg', w: 0.96, h: 0.72, z: -3.1 },
  ];
  const textures = [];
  for (const f of frames) {
    const fr = K.box(0.04, f.h + 0.08, f.w + 0.08, M.black); fr.position.set(-CW + 0.02, 1.6, f.z); scene.add(fr);
    const pic = new T.Mesh(new T.PlaneGeometry(f.w, f.h), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    pic.position.set(-CW + 0.045, 1.6, f.z); pic.rotation.y = Math.PI / 2; scene.add(pic);
    loader.load(file(f.src), (t) => { t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; pic.material.map = t; pic.material.needsUpdate = true; textures.push(t); invalidate(); });
    const spot = new T.Mesh(new T.PlaneGeometry(f.w + 0.6, 1.4), new T.MeshBasicMaterial({ map: tex(glowCanvas('rgba(255,228,196,.16)'), renderer), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    spot.position.set(-CW + 0.05, 1.75, f.z); spot.rotation.y = Math.PI / 2; scene.add(spot);
  }

  /* --- salas --- */
  const rooms = [];
  const clickable = [];
  let postsImg;
  const solidSpans = { 1: [], [-1]: [] };
  collection.forEach((item, i) => {
    const s = sideOf(i), z0 = doorZ(i);
    const rotIn = s > 0 ? -Math.PI / 2 : Math.PI / 2;   // plano olhando para o corredor
    const room = { i, s, z0, item, open: 0, light: null, screens: [] };
    solidSpans[s].push([z0 - ROOM_L / 2, z0 + ROOM_L / 2]);
    // parede do fundo e laterais
    wallPlane(ROOM_L, H, roomPoint(i, ROOM_D, H / 2, 0), rotIn);
    wallPlane(ROOM_D, H, roomPoint(i, ROOM_D / 2, H / 2, -ROOM_L / 2), s > 0 ? Math.PI : 0, M.wallLight);
    wallPlane(ROOM_D, H, roomPoint(i, ROOM_D / 2, H / 2, ROOM_L / 2), s > 0 ? 0 : Math.PI, M.wallLight);
    // divisoria de vidro com montantes
    const half = (ROOM_L - DOOR_W) / 2;
    for (const dir of [-1, 1]) {
      const wc = dir * (DOOR_W / 2 + half / 2);
      const g = new T.Mesh(new T.PlaneGeometry(half, H), M.glass);
      g.position.copy(roomPoint(i, 0, H / 2, wc)); g.rotation.y = rotIn; scene.add(g);
      const band = new T.Mesh(new T.PlaneGeometry(half, 0.26), M.frosted);
      band.position.copy(roomPoint(i, 0.005, 1.12, wc)); band.rotation.y = rotIn; scene.add(band);
      for (let k = 0; k <= 3; k++) {
        const mw = dir * (DOOR_W / 2 + (half * k) / 3);
        const mull = K.box(0.05, H, 0.05, M.black); mull.position.copy(roomPoint(i, 0, H / 2, mw)); scene.add(mull);
      }
    }
    const transom = new T.Mesh(new T.PlaneGeometry(DOOR_W, H - DOOR_H), M.glass);
    transom.position.copy(roomPoint(i, 0, (H + DOOR_H) / 2, 0)); transom.rotation.y = rotIn; scene.add(transom);
    const head = K.box(0.06, 0.06, DOOR_W, M.black); head.position.copy(roomPoint(i, 0, DOOR_H, 0)); scene.add(head);
    const sill = K.box(0.06, 0.03, ROOM_L, M.black); sill.position.copy(roomPoint(i, 0, H - 0.015, 0)); scene.add(sill);
    // porta de correr
    const door = new T.Group();
    const pane = new T.Mesh(new T.PlaneGeometry(DOOR_W - 0.04, DOOR_H - 0.04), M.glass);
    pane.rotation.y = rotIn; pane.position.y = DOOR_H / 2;
    const handle = K.box(0.04, 1.1, 0.03, M.chrome); handle.position.set(-s * 0.04, 1.1, DOOR_W / 2 - 0.16);
    door.add(pane, handle);
    for (const yy of [0.02, DOOR_H - 0.02]) { const r = K.box(0.04, 0.04, DOOR_W, M.black); r.position.y = yy; door.add(r); }
    for (const ww of [-DOOR_W / 2 + 0.02, DOOR_W / 2 - 0.02]) { const r = K.box(0.04, DOOR_H, 0.04, M.black); r.position.set(0, DOOR_H / 2, ww); door.add(r); }
    door.position.copy(roomPoint(i, -0.06, 0, 0));
    scene.add(door);
    room.door = door;
    // placa pendurada (le-se de frente do corredor)
    const sign = new T.Group();
    const signTex = () => tex(signCanvas(item.id.replace('W—', ''), item.name), renderer);
    const st = signTex();
    const face = new T.Mesh(new T.PlaneGeometry(1.15, 0.34), new T.MeshBasicMaterial({ map: st }));
    const backFace = face.clone(); backFace.rotation.y = Math.PI;
    face.position.z = 0.012; backFace.position.z = -0.012;
    const plate = K.box(1.19, 0.38, 0.02, M.black);
    const rod = K.box(0.012, 0.36, 0.012, M.black); rod.position.set(-0.45, 0.37, 0);
    const rod2 = rod.clone(); rod2.position.x = 0.45;
    sign.add(plate, face, backFace, rod, rod2);
    sign.position.copy(roomPoint(i, -0.66, H - 0.55, DOOR_W / 2 + 0.2));
    sign.rotation.y = 0;
    scene.add(sign);
    face.userData.room = i; backFace.userData.room = i; room.signMat = face.material;
    clickable.push(face, backFace, pane);
    pane.userData.room = i;
    // telao
    const scr = new T.Group();
    const bez = K.box(0.05, 1.56, 2.74, M.bezel); scr.add(bez);
    const screenMat = new T.MeshBasicMaterial({ color: 0xd8d8d8 });
    const sp = new T.Mesh(new T.PlaneGeometry(2.62, 1.47), screenMat);
    sp.rotation.y = rotIn; sp.position.x = -s * 0.03; scr.add(sp);
    scr.position.copy(roomPoint(i, ROOM_D - 0.04, 1.72, -0.2));
    scene.add(scr);
    room.screens.push([screenMat, 0]);
    sp.userData.room = i; clickable.push(sp);
    const scrGlow = new T.Mesh(new T.PlaneGeometry(3.6, 2.4), new T.MeshBasicMaterial({ map: tex(glowCanvas('rgba(140,160,190,.18)'), renderer), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    scrGlow.rotation.y = rotIn; scrGlow.position.copy(roomPoint(i, ROOM_D - 0.06, 1.72, -0.2)); scene.add(scrGlow);
    // mesa com dois monitores (virados para a porta) e cadeira
    const deskG = new T.Group();
    const dtop = K.box(0.8, 0.045, 1.7, M.deskTop); dtop.position.y = 0.74;
    deskG.add(dtop);
    for (const a of [-0.78, 0.78]) { const leg = K.box(0.72, 0.72, 0.04, M.black); leg.position.set(0, 0.36, a); deskG.add(leg); }
    [-0.36, 0.36].forEach((mz, k) => {
      const mon = new T.Group();
      const mb = K.box(0.03, 0.38, 0.64, M.bezel); mon.add(mb);
      const mm = new T.MeshBasicMaterial({ color: 0xd0d0d0 });
      const msp = new T.Mesh(new T.PlaneGeometry(0.61, 0.345), mm); msp.rotation.y = rotIn; msp.position.x = -s * 0.017; mon.add(msp);
      const stand = K.box(0.02, 0.16, 0.04, M.black); stand.position.y = -0.27; mon.add(stand);
      const foot = K.box(0.18, 0.012, 0.22, M.black); foot.position.y = -0.35; mon.add(foot);
      mon.position.set(s * 0.12, 1.12, mz); mon.rotation.y = -s * (k ? 0.12 : -0.12) * 0;
      deskG.add(mon);
      room.screens.push([mm, k + 1]);
    });
    const kb = K.box(0.16, 0.015, 0.44, M.blackMatte); kb.position.set(-s * 0.12, 0.77, 0); deskG.add(kb);
    const ch = chair(K); ch.position.set(s * 0.62, 0, 0); ch.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; deskG.add(ch);
    deskG.position.copy(roomPoint(i, 3.55, 0, -2.05));
    scene.add(deskG);
    // pedestal com o objeto do servico
    const ped = K.cyl(0.34, 0.38, 0.92, M.black, 40); ped.position.copy(roomPoint(i, 4.2, 0.46, 1.5)); scene.add(ped);
    const pedTop = K.cyl(0.345, 0.345, 0.012, M.ledRed, 40); pedTop.castShadow = false; pedTop.position.copy(roomPoint(i, 4.2, 0.925, 1.5)); scene.add(pedTop);
    const pivot = new T.Group(); pivot.position.copy(roomPoint(i, 4.2, 0.93, 1.5)); scene.add(pivot);
    room.pivot = pivot;
    pivot.userData.room = i;
    // planta, luminaria e LED vermelho
    addPlant(...[roomPoint(i, ROOM_D - 0.45, 0, ROOM_L / 2 - 0.5)].map((p) => [p.x, p.z]).flat(), 1.05);
    const pend = K.cyl(0.24, 0.3, 0.12, M.black, 32); pend.position.copy(roomPoint(i, 3.55, 2.35, -2.05)); pend.castShadow = false; scene.add(pend);
    const pendLed = new T.Mesh(new T.CircleGeometry(0.26, 32), M.led); pendLed.rotation.x = Math.PI / 2; pendLed.position.copy(roomPoint(i, 3.55, 2.289, -2.05)); scene.add(pendLed);
    const cable = K.box(0.008, H - 2.4, 0.008, M.black); cable.position.copy(roomPoint(i, 3.55, (H + 2.4) / 2, -2.05)); scene.add(cable);
    const pl = new T.PointLight(0xffdcbc, 7, 8, 2); pl.position.copy(roomPoint(i, 2.8, 2.5, -0.4)); scene.add(pl);
    room.light = pl;
    const ledR = K.box(0.03, 0.03, ROOM_L - 0.3, M.ledRed); ledR.castShadow = false; ledR.position.copy(roomPoint(i, ROOM_D - 0.08, H - 0.12, 0)); scene.add(ledR);
    const ledRoom = K.box(0.04, 0.02, ROOM_L - 1.2, M.led); ledRoom.castShadow = false; ledRoom.position.copy(roomPoint(i, 1.4, H - 0.01, 0)); scene.add(ledRoom);
    rooms.push(room);
  });

  // paredes solidas do corredor onde nao ha sala
  for (const s of [-1, 1]) {
    const spans = solidSpans[s].sort((a, b) => b[1] - a[1]);
    let z = 0;
    for (const [a, b] of spans) { if (b < z - 0.01) wallPlane(z - b, H, V(s * CW, H / 2, (z + b) / 2), s > 0 ? -Math.PI / 2 : Math.PI / 2); z = a; }
    if (z > END_Z + 0.01) wallPlane(z - END_Z, H, V(s * CW, H / 2, (z + END_Z) / 2), s > 0 ? -Math.PI / 2 : Math.PI / 2);
  }

  // folhas: uma InstancedMesh para todas as plantas
  const leafGeo = new T.SphereGeometry(1, 10, 8);
  leafGeo.scale(0.07, 0.5, 0.014); leafGeo.translate(0, 0.5, 0);
  const totalLeaves = plants.reduce((n, p) => n + p.userData.leaves.length, 0);
  const leafMesh = new T.InstancedMesh(leafGeo, M.leaf, totalLeaves);
  leafMesh.castShadow = true;
  {
    let n = 0;
    for (const p of plants) {
      p.updateMatrixWorld(true);
      for (const l of p.userData.leaves) {
        dummy.position.set(0, l.y, 0); dummy.rotation.set(0, l.a, 0); dummy.rotateX(l.tilt);
        dummy.scale.setScalar(l.len); dummy.updateMatrix();
        dummy.matrix.premultiply(p.matrixWorld);
        leafMesh.setMatrixAt(n++, dummy.matrix);
      }
    }
  }
  scene.add(leafMesh);

  /* --- personagem --- */
  const hero = new T.Group();
  scene.add(hero);
  const blob = new T.Mesh(new T.PlaneGeometry(1.1, 1.1), new T.MeshBasicMaterial({ map: tex(glowCanvas('rgba(0,0,0,.55)'), renderer), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.004; hero.add(blob);
  let mixer, actions = {}, activeAction;

  /* --- camera --- */
  const camera = new T.PerspectiveCamera(50, 1, 0.05, 60);
  const eye = V(0, 1.6, 5), look = V(0, 1.4, -10);
  const eyeGoal = eye.clone(), lookGoal = look.clone();
  const pointer = new T.Vector2();
  const pointerSmooth = new T.Vector2();

  /* --- estado --- */
  const HOME = V(0.7, 0, 1.55);
  let route = 0, walking = null, arrived = true, heading = 0.35, headingGoal = 0.35;
  let heroReady = false;
  let visible = true, obscured = false, dirty = true, lastFrame = 0, viewport;
  const clock = { last: performance.now(), getDelta() { const n = performance.now(), d = (n - this.last) / 1000; this.last = n; return d; } };

  function standFor(r) {
    if (r === 0) return { p: HOME.clone(), face: compact() ? 0.1 : -0.12 };
    if (r === collection.length + 1) return { p: V(0, 0, END_Z + 2.0), face: 0 };
    const i = r - 1, s = sideOf(i);
    const p = roomPoint(i, 2.15, 0, 0.35);
    const cam = poseFor(r).eye;
    return { p, face: Math.atan2(cam.x - p.x, cam.z - p.z) + s * 0.35 };
  }

  function poseFor(r) {
    const mob = compact();
    if (r === 0) return mob
      ? { eye: V(0.45, 1.55, 5.3), look: V(0.25, 1.0, -6) }
      : { eye: V(-0.35, 1.68, 5.2), look: V(0.1, 1.35, -8) };
    if (r === collection.length + 1) return mob
      ? { eye: V(0, 1.55, END_Z + 7.6), look: V(0, 1.2, END_Z) }
      : { eye: V(0.5, 1.6, END_Z + 6.6), look: V(0, 1.45, END_Z) };
    const i = r - 1;
    const eyeR = mob ? roomPoint(i, 0.35, 1.6, 3.15) : roomPoint(i, 0.4, 1.7, 3.1);
    const lookR = mob ? roomPoint(i, 2.7, 1.0, 0.55) : roomPoint(i, 3.4, 1.25, -0.5);
    if (!mob) {
      // no computador o texto fica a esquerda: empurra a cena para a direita
      const fwd = lookR.clone().sub(eyeR).normalize();
      const right = new T.Vector3().crossVectors(fwd, V(0, 1, 0)).normalize();
      lookR.addScaledVector(right, -1.15);
    }
    return { eye: eyeR, look: lookR };
  }

  function corridorZ(r) {
    if (r === 0) return 0.6;
    if (r === collection.length + 1) return END_Z + 3.4;
    return doorZ(r - 1);
  }

  function roomAt(p) {
    if (Math.abs(p.x) < CW - 0.05) return -1;
    let best = -1, bd = 1e9;
    rooms.forEach((r) => { const d = Math.abs(p.z - r.z0); if (Math.sign(p.x) === r.s && d < bd) { bd = d; best = r.i; } });
    return best;
  }

  function pathPoints(to, start) {
    const pts = [start.clone()];
    const zB = corridorZ(to);
    const dir = Math.sign(zB - start.z) || -1;
    const last = collection.length + 1;
    const inRoom = roomAt(start);
    if (inRoom >= 0) {
      const i = inRoom, s = sideOf(i);
      const d2 = Math.sign(zB - doorZ(i)) || -1;
      pts.push(roomPoint(i, 0.75, 0, 0.15), roomPoint(i, -0.25, 0, 0), V(s * 0.35, 0, doorZ(i) + d2 * 0.95));
    } else if (start.z > 0.4) {
      pts.push(V(-0.1, 0, 0.2));
    }
    if (to >= 1 && to <= collection.length) {
      const i = to - 1, s = sideOf(i);
      const from = pts[pts.length - 1];
      const d3 = Math.sign(doorZ(i) - from.z) || dir;
      pts.push(V(s * 0.35, 0, doorZ(i) - d3 * 0.95), roomPoint(i, -0.25, 0, 0), roomPoint(i, 0.75, 0, 0.15));
    } else if (to === last) {
      pts.push(V(0, 0, END_Z + 3.6));
    } else {
      pts.push(V(-0.25, 0, 0.0));
    }
    pts.push(standFor(to).p);
    return pts.filter((p, k) => k === 0 || p.distanceTo(pts[k - 1]) > 0.25);
  }

  function setAction(name, time = 0.3) {
    const next = actions[name];
    if (!next || next === activeAction) return;
    next.reset().setEffectiveWeight(1).fadeIn(time).play();
    activeAction?.fadeOut(time);
    activeAction = next;
  }

  function move(next) {
    if (!heroReady) { route = next; return; }
    if (next === route && !walking) return;
    hooks.arrival?.(false, next);
    arrived = false;
    const pts = pathPoints(next, hero.position);
    if (pts.length < 2) pts.push(standFor(next).p.clone().add(V(0.01, 0, 0)));
    const curve = new T.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const length = curve.getLength();
    const speed = Math.min(2.6, Math.max(1.55, length / 6));
    walking = { curve, length, s: 0, speed, to: next, cut: false };
    route = next;
    if (reduced.matches) {
      // sem animacao: vai direto
      walking.s = length;
    } else if (length > 13) {
      walking.cut = true;
      fade.style.opacity = '1';
      setTimeout(() => {
        if (!walking) return;
        walking.s = Math.max(0, length - 8.5);
        walking.cut = 'snap';
        fade.style.opacity = '0';
      }, 330);
    }
    setAction('walk', 0.25);
    invalidate();
  }

  function step(dt) {
    const mob = compact();
    if (walking && walking.cut !== true) {
      const w = walking;
      const remaining = w.length - w.s;
      const ease = Math.min(1, (w.s + 0.25) / 0.9, (remaining + 0.15) / 0.9);
      const v = w.speed * Math.max(0.35, ease);
      w.s = Math.min(w.length, w.s + v * dt);
      const u = w.s / w.length;
      const p = w.curve.getPointAt(u);
      hero.position.copy(p);
      const tg = w.curve.getTangentAt(Math.min(0.999, u + 0.01));
      if (remaining > 0.05) headingGoal = Math.atan2(tg.x, tg.z);
      if (actions.walk) actions.walk.timeScale = v / 1.3;
      // camera atras do personagem
      const fx = Math.sin(heading), fz = Math.cos(heading);
      const back = mob ? 2.9 : 2.7;
      eyeGoal.set(p.x - fx * back + fz * 0.25, 1.78, p.z - fz * back - fx * 0.25);
      lookGoal.set(p.x + fx * 2.2, 1.2, p.z + fz * 2.2);
      if (w.cut === 'snap') { w.cut = false; heading = headingGoal; eye.copy(eyeGoal); look.copy(lookGoal); }
      if (w.s >= w.length) {
        walking = null;
        setAction('idle', 0.35);
        headingGoal = standFor(route).face;
      }
    }
    if (!walking) {
      const pose = poseFor(route);
      eyeGoal.copy(pose.eye); lookGoal.copy(pose.look);
      if (!arrived && Math.abs(angleDiff(headingGoal, heading)) < 0.08) {
        arrived = true;
        hooks.arrival?.(true, route);
      }
    }
    heading += angleDiff(headingGoal, heading) * (1 - Math.exp(-(walking ? 7 : 4) * dt));
    hero.rotation.y = heading;
    const k = walking ? 3.0 : 2.2;
    eye.x = damp(eye.x, eyeGoal.x, k, dt); eye.y = damp(eye.y, eyeGoal.y, k, dt); eye.z = damp(eye.z, eyeGoal.z, k, dt);
    look.x = damp(look.x, lookGoal.x, k * 1.2, dt); look.y = damp(look.y, lookGoal.y, k * 1.2, dt); look.z = damp(look.z, lookGoal.z, k * 1.2, dt);
    pointerSmooth.x = damp(pointerSmooth.x, pointer.x, 3, dt); pointerSmooth.y = damp(pointerSmooth.y, pointer.y, 3, dt);
    camera.position.copy(eye);
    camera.position.x += pointerSmooth.x * 0.12; camera.position.y += pointerSmooth.y * 0.06;
    camera.lookAt(look);
    // portas abrem quando alguem chega perto
    for (const room of rooms) {
      const doorPos = roomPoint(room.i, 0, 0, 0);
      const dh = Math.hypot(hero.position.x - doorPos.x, hero.position.z - doorPos.z);
      const dc = Math.hypot(camera.position.x - doorPos.x, camera.position.z - doorPos.z);
      const want = dh < 2.1 || dc < 1.6 ? 1 : 0;
      room.open = damp(room.open, want, want ? 5 : 2.5, dt);
      room.door.position.z = room.z0 + room.open * (DOOR_W - 0.08);
      if (room.pivot.children[0]) room.pivot.children[0].rotation.y += dt * 0.45;
      // so acende a luz das salas perto da camera
      const dist = Math.abs(camera.position.z - room.z0);
      room.light.intensity = damp(room.light.intensity, dist < 11 ? 10 : 0, 3, dt);
    }
    // sombra acompanha o personagem
    sun.position.set(hero.position.x + 2.5, 7.5, hero.position.z + 3.5);
    sun.target.position.copy(hero.position);
    mixer?.update(dt);
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    viewport = { width, height };
    const cap = compact() ? 1.6 : 1.75;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap, Math.sqrt(2600000 / (width * height))));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width / height < 0.8 ? 62 : width / height < 1.2 ? 56 : 48;
    camera.updateProjectionMatrix();
    invalidate();
  }

  let raf = 0;
  function invalidate() { dirty = true; if (!raf && visible && !obscured) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (!visible || obscured) return;
    const dt = Math.min(0.05 * (window.__expoFast || 1), clock.getDelta());
    step(dt);
    const busy = !!walking || !arrived;
    // parado: 30 quadros por segundo bastam
    if (busy || dirty || now - lastFrame > 32) {
      renderer.render(scene, camera);
      lastFrame = now; dirty = false;
    }
    raf = requestAnimationFrame(frame);
  }

  /* --- clique nas placas, portas e telas --- */
  const ray = new T.Raycaster();
  let down;
  canvasEl.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvasEl.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    const r = canvasEl.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects([...clickable, ...rooms.map((x) => x.pivot)], true)[0];
    let o = hit?.object;
    while (o && o.userData.room === undefined) o = o.parent;
    if (o) hooks.open?.(o.userData.room);
  });
  canvasEl.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvasEl.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    canvasEl.style.cursor = 'default';
  });
  canvasEl.addEventListener('pointerleave', () => pointer.set(0, 0));

  /* --- carregamento --- */
  const watcher = new ResizeObserver(resize);
  watcher.observe(host);
  resize();

  const fontReady = (document.fonts?.load ? Promise.all([document.fonts.load('700 40px Sora'), document.fonts.load('800 40px Sora')]) : Promise.resolve()).catch(() => {});
  const img = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

  const ready = (async () => {
    const gl = new GLTFLoader();
    const [gltf, anim, posts, logoTex] = await Promise.all([
      gl.loadAsync(file('avatar.glb')),
      gl.loadAsync(file('anda.glb')),
      img(file('posts.jpg')),
      loader.loadAsync(file('logo-3d.webp')).catch(() => null),
      fontReady,
    ]);
    postsImg = posts;
    // telas
    for (const room of rooms) {
      for (const [mat, variant] of room.screens) {
        const t = tex(drawScreen(room.item.asset.shape, variant, L, postsImg), renderer);
        mat.map = t; mat.color.setHex(variant ? 0xcfcfcf : 0xe6e6e6); mat.needsUpdate = true;
      }
    }
    // placas: redesenha com a fonte carregada
    for (const room of rooms) {
      const st = tex(signCanvas(room.item.id.replace('W—', ''), room.item.name), renderer);
      room.signMat.map.dispose(); room.signMat.map = st; room.signMat.needsUpdate = true;
    }
    if (logoTex) {
      logoTex.colorSpace = T.SRGBColorSpace; logoTex.anisotropy = 8;
      const lw = 2.7, lh = lw * logoTex.image.height / logoTex.image.width;
      logo = new T.Mesh(new T.PlaneGeometry(lw, lh), new T.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.35, metalness: 0.2,
        emissive: 0xffffff, emissiveMap: logoTex, emissiveIntensity: 0.55 }));
      logo.position.set(0, 1.95, END_Z + 0.1); scene.add(logo);
      const small = new T.Mesh(new T.PlaneGeometry(0.9, 0.9 * lh / lw), new T.MeshBasicMaterial({ map: logoTex, transparent: true }));
      small.position.set(0, 0.62, 0.312); desk.add(small);
    }
    // objetos dos servicos
    await Promise.all(rooms.map(async (room) => {
      try {
        const model = await createModel(room.item, 0, null);
        model.updateMatrixWorld(true);
        const b = new T.Box3().setFromObject(model);
        const size = b.getSize(V(0, 0, 0));
        const sc = 0.62 / Math.max(size.x, size.y, size.z);
        model.scale.multiplyScalar(sc);
        const c = b.getCenter(V(0, 0, 0)).multiplyScalar(sc);
        const holder = new T.Group();
        model.position.set(-c.x, -b.min.y * sc + 0.02, -c.z);
        model.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
        holder.add(model);
        room.pivot.add(holder);
      } catch (error) { hooks.assetError?.(room.item, error); }
    }));
    // personagem
    const model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      if (/Beard/.test(o.name)) { o.visible = false; return; }
      if (o.material) { o.material.envMapIntensity = 0.8; }
      if (/Outfit/.test(o.material?.name ?? '') && o.material.map?.image) o.material.map = suitTexture(o.material.map, renderer);
    });
    for (const clip of anim.animations) actions[clip.name] = retarget(clip, model, anim.scene);
    model.updateMatrixWorld(true);
    const hb = new T.Box3().setFromObject(model);
    const sc = 1.78 / (hb.max.y - hb.min.y);
    model.scale.multiplyScalar(sc);
    hero.add(model);
    mixer = new T.AnimationMixer(model);
    for (const name in actions) actions[name] = mixer.clipAction(actions[name]);
    actions.idle?.play(); activeAction = actions.idle;
    const st = standFor(route);
    hero.position.copy(st.p); heading = headingGoal = st.face;
    const pose = poseFor(route); eye.copy(pose.eye); look.copy(pose.look);
    heroReady = true;
    // compila e mostra o primeiro quadro
    renderer.compile(scene, camera);
    step(0.016);
    renderer.render(scene, camera);
    invalidate();
  })();

  return {
    ready,
    move,
    rotate() {},
    setVisible(on) { visible = on; if (on) { clock.getDelta(); invalidate(); } },
    setObscured(on) { obscured = on; if (!on) { clock.getDelta(); invalidate(); } },
    stage(el, item, h) { return makeInspection(el, item, h); },
  };
}

/* ---------------- janela "Saiba mais": objeto girando ---------------- */

function makeInspection(host, item, hooks) {
  const canvasEl = document.createElement('canvas');
  const context = canvasEl.getContext('webgl2', { antialias: true, alpha: false });
  if (!context) { hooks.error?.(new Error('no webgl')); return { zoom() {}, dispose() {} }; }
  const renderer = new T.WebGLRenderer({ canvas: canvasEl, context });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.append(canvasEl);
  const scene = new T.Scene();
  scene.background = new T.Color(0x15171b);
  scene.environment = environmentFor(renderer);
  scene.add(new T.HemisphereLight(0xffffff, 0x302620, 0.9));
  const key = new T.DirectionalLight(0xffffff, 1.6); key.position.set(2, 4, 3); scene.add(key);
  const rim = new T.PointLight(0xff2440, 6, 8, 2); rim.position.set(-2, 1.2, -1.5); scene.add(rim);
  const camera = new T.PerspectiveCamera(35, 1, 0.04, 50);
  const pivot = new T.Group(); scene.add(pivot);
  let model, raf = 0, disposed = false, yaw = 0.3, pitch = 0, zoom = 1, diameter = 1, drag;
  const draw = () => {
    raf = 0;
    if (disposed) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    const d = diameter * Math.max(1.7, 1.34 * height / width) * zoom;
    camera.aspect = width / height; camera.position.set(d * 0.14, d * 0.26, d); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    if (!drag) yaw += 0.004;
    pivot.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(draw);
  };
  createModel(item, hooks.finish ?? 0, null).then((m) => {
    if (disposed) { disposeModel(m); return; }
    model = m;
    const b = new T.Box3().setFromObject(m);
    const size = b.getSize(V(0, 0, 0));
    diameter = Math.max(size.x, size.y, size.z, 0.25);
    m.position.sub(b.getCenter(V(0, 0, 0)));
    pivot.add(m);
    raf = requestAnimationFrame(draw);
  }).catch((e) => hooks.error?.(e));
  canvasEl.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvasEl.setPointerCapture(e.pointerId); });
  canvasEl.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drag?.id) return;
    yaw += (e.clientX - drag.x) * 0.012; pitch = T.MathUtils.clamp(pitch + (e.clientY - drag.y) * 0.009, -0.7, 0.7);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) canvasEl.addEventListener(n, () => { drag = undefined; });
  return {
    zoom(dz) { zoom = T.MathUtils.clamp(zoom + dz, 0.63, 1.36); },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (model) disposeModel(model);
      renderer.dispose(); renderer.forceContextLoss(); canvasEl.remove();
    },
  };
}
