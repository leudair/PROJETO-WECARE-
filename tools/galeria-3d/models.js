import * as T from 'three';
const GLTFLoader = class { loadAsync() { return Promise.reject(new Error('GLB desativado')); } };

export function surface(finish, extra = {}) {
  return new T.MeshPhysicalMaterial({
    color: finish.color, roughness: finish.roughness, metalness: finish.metalness,
    clearcoat: finish.coat ?? 0,
    clearcoatRoughness: finish.coat ? 0.16 : 0.24,
    ...(finish.glow ? { emissive: finish.color, emissiveIntensity: finish.glow } : {}),
    ...extra,
  });
}

const mesh = (geometry, material) => new T.Mesh(geometry, material);

function brushedGrain() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const line = 7 * Math.sin(y * Math.PI * 2 * 27 / 128) + 3 * Math.sin(y * Math.PI * 2 * 53 / 128);
    const fine = 2 * Math.sin((x * 7 + y * 43) * Math.PI * 2 / 128);
    const value = Math.round(216 + line + fine);
    const at = (y * 128 + x) * 4;
    pixels.data[at] = pixels.data[at + 1] = pixels.data[at + 2] = value;
    pixels.data[at + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.anisotropy = 4;
  return texture;
}

function mineralFinish(material, kind) {
  // Object-space grain has no UV seam at the lip or at the half-twist join.
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 finishPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nfinishPosition = position;');
    shader.fragmentShader = `varying vec3 finishPosition;
      float finishHash(vec3 p) { p = fract(p * .1031); p += dot(p, p.yzx + 33.33); return fract((p.x+p.y)*p.z); }
      float finishNoise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(finishHash(i),finishHash(i+vec3(1,0,0)),f.x),
          mix(finishHash(i+vec3(0,1,0)),finishHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(finishHash(i+vec3(0,0,1)),finishHash(i+vec3(1,0,1)),f.x),
          mix(finishHash(i+vec3(0,1,1)),finishHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
    ` + shader.fragmentShader;
    const stone = kind === 'vessel';
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nfloat grain=finishNoise(finishPosition*' + (stone?'110.':'75.') + ');\nroughnessFactor=clamp(roughnessFactor + (grain-.5)*' + (stone?'.16':'.012') + ',.04,1.);');
    if (stone) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb *= .88 + .24*finishNoise(finishPosition*95.);');
  };
  material.customProgramCacheKey = () => 'mineral-v1-' + kind;
}

export function panelBox(width, height, depth, radius, material) {
  // Explicit rounded-box normals keep broad faces flat and bevels continuous.
  const r = Math.min(radius, width * .49, height * .49, depth * .49);
  const divisions = 7;
  const geometry = new T.BoxGeometry(2, 2, 2, divisions, divisions, divisions);
  const pos = geometry.attributes.position, normals = geometry.attributes.normal;
  const half = [width / 2, height / 2, depth / 2];
  const inner = half.map(h => h - r);
  const v = new T.Vector3(), closest = new T.Vector3(), normal = new T.Vector3();
  const remap = (value, axis) => {
    const t = (value + 1) * divisions / 2;
    if (t <= 3) return -half[axis] + r * t / 3;
    if (t >= 4) return inner[axis] + r * (t - 4) / 3;
    return -inner[axis] + 2 * inner[axis] * (t - 3);
  };
  for (let i = 0; i < pos.count; i++) {
    v.set(remap(pos.getX(i), 0), remap(pos.getY(i), 1), remap(pos.getZ(i), 2));
    closest.set(T.MathUtils.clamp(v.x, -inner[0], inner[0]),
      T.MathUtils.clamp(v.y, -inner[1], inner[1]), T.MathUtils.clamp(v.z, -inner[2], inner[2]));
    normal.copy(v).sub(closest).normalize();
    v.copy(closest).addScaledVector(normal, r);
    pos.setXYZ(i, v.x, v.y, v.z);
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return mesh(geometry, material);
}

function turned(profile, material, segments = 96) {
  const curve = new T.SplineCurve([...profile].reverse().map(([r, y]) => new T.Vector2(r, y)));
  const points = curve.getPoints(64).map(p => new T.Vector2(Math.max(0, p.x), p.y));
  const geometry = new T.LatheGeometry(points, segments);
  const p = geometry.attributes.position, index = geometry.index;
  let volume = 0;
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  for (let i=0; i<index.count; i+=3) {
    a.fromBufferAttribute(p,index.getX(i)); b.fromBufferAttribute(p,index.getX(i+1)); c.fromBufferAttribute(p,index.getX(i+2));
    volume += a.dot(b.cross(c));
  }
  if (volume < 0) {
    for (let i=0; i<index.count; i+=3) {
      const second=index.getX(i+1); index.setX(i+1,index.getX(i+2)); index.setX(i+2,second);
    }
    const normals=geometry.attributes.normal;
    for(let i=0;i<normals.array.length;i++) normals.array[i] *= -1;
  }
  return mesh(geometry, material);
}

// Sweep a rounded rectangular cross section along a continuous side elevation.
function chair(material) {
  const path = new T.CurvePath();
  const point = ([x, y]) => new T.Vector3(x, y, 0);
  const curve = (...points) => path.add(new T.CubicBezierCurve3(...points.map(point)));
  curve([0.59, 0.045], [0.53, 0.045], [0.47, 0.045], [0.41, 0.045]);
  curve([0.41, 0.045], [0.16, 0.045], [-0.28, 0.055], [-0.49, 0.07]);
  curve([-0.49, 0.07], [-0.77, 0.08], [-0.82, 0.25], [-0.76, 0.48]);
  curve([-0.76, 0.48], [-0.70, 0.73], [-0.53, 0.83], [-0.27, 0.79]);
  curve([-0.27, 0.79], [-0.03, 0.75], [0.22, 0.69], [0.45, 0.72]);
  curve([0.45, 0.72], [0.68, 0.74], [0.68, 0.99], [0.73, 1.18]);
  curve([0.73, 1.18], [0.77, 1.36], [0.81, 1.54], [0.84, 1.72]);

  const cross = [];
  const corners = [[0.026, 0.44], [-0.026, 0.44], [-0.026, -0.44], [0.026, -0.44]];
  corners.forEach(([n, z], corner) => {
    for (let sample = 0; sample <= 5; sample++) {
      const angle = (corner + sample / 5) * Math.PI / 2;
      cross.push([n + Math.cos(angle) * 0.027, z + Math.sin(angle) * 0.027]);
    }
  });
  const positions = [], uvs = [], indices = [];
  const length = 240, ring = cross.length;
  for (let step = 0; step <= length; step++) {
    const t = step / length;
    const center = path.getPointAt(t), direction = path.getTangentAt(t);
    const end = Math.min(step, length - step);
    for (let side = 0; side < ring; side++) {
      const [n, z] = cross[side];
      const edge = Math.abs(z) / 0.467;
      const thickness = n - 0.028 * (1 - edge * edge) * Math.sin(Math.PI * t);
      positions.push(center.x - direction.y * thickness, center.y + direction.x * thickness,
        z * (0.92 + 0.08 * T.MathUtils.smoothstep(end / 24, 0, 1)));
      uvs.push(t, side / ring);
      if (step < length) {
        const a = step * ring + side, b = step * ring + (side + 1) % ring;
        indices.push(a, b, a + ring, b, b + ring, a + ring);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // End caps use independent vertices so their normals cannot pinch the ribbon.
  for (const end of [0, length]) {
    const base = positions.length / 3;
    for (let side = 0; side < ring; side++) {
      const source = (end * ring + side) * 3;
      positions.push(...positions.slice(source, source + 3));
      uvs.push(side / ring, end / length);
    }
    for (let side = 1; side < ring - 1; side++) {
      if (end === 0) indices.push(base, base + side + 1, base + side);
      else indices.push(base, base + side, base + side + 1);
    }
  }
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(geometry, material);
}

function disc(material) {
  const group = new T.Group();
  // Two fitted shells: no full sphere hidden behind the luminous diffuser.
  const shell = turned([[0,.145],[.15,.142],[.38,.12],[.57,.075],[.69,.025],
    [.728,.001],[.73,-.009],[.714,-.019],[.684,-.018],[.66,.008],
    [.54,.052],[.35,.094],[.14,.116],[0,.118]], material);
  const metal = surface({color:0xbac3c9,roughness:.24,metalness:1});
  const diffuserMaterial = surface({color:0xf3e9d7,roughness:.48,metalness:0,glow:.65},
    {clearcoat:0, sheen:.3, sheenRoughness:.7});
  const diffuser = turned([[0,-.108],[.2,-.103],[.4,-.083],[.56,-.05],
    [.66,-.019],[.685,-.01],[.68,.001],[.64,-.002],[.54,-.032],
    [.38,-.064],[.18,-.082],[0,-.085]], diffuserMaterial);
  const collar = turned([[0,.13],[.09,.13],[.101,.144],[.098,.183],
    [.078,.196],[.031,.196],[.027,.23],[0,.23]], metal, 64);
  const gasket = mesh(new T.TorusGeometry(.716,.004,8,128),
    surface({color:0x30383b,roughness:.68,metalness:0}));
  gasket.rotation.x=Math.PI/2; gasket.position.y=-.012;
  group.add(shell, diffuser, collar, gasket);
  return group;
}

function vessel(material) {
  const points = [
    [0.00, 0.025], [0.24, 0.025], [0.33, 0.060], [0.42, 0.135],
    [0.49, 0.23], [0.54, 0.35], [0.565, 0.48], [0.56, 0.56],
    [0.54, 0.575], [0.49, 0.56], [0.485, 0.49], [0.46, 0.38],
    [0.41, 0.28], [0.32, 0.205], [0.19, 0.158], [0.00, 0.15],
  ].map(([r, y]) => new T.Vector2(r, y));
  const geometry = new T.LatheGeometry(new T.SplineCurve(points).getPoints(96).map((p) => new T.Vector2(Math.max(0, p.x), p.y)), 128);
  const group = new T.Group();
  group.add(mesh(geometry, material));
  const foot = mesh(new T.CylinderGeometry(0.285, 0.30, 0.018, 96),
    surface({ color: 0x17191b, roughness: 0.86, metalness: 0.02 }));
  foot.position.y = 0.011;
  group.add(foot);
  return group;
}

function table(material) {
  const group = new T.Group();
  const top = panelBox(2.08, 0.093, 1.04, 0.015, material);
  top.position.y = 0.55;
  group.add(top);
  const machined = surface({ color: 0x9aafba, roughness: 0.31, metalness: 0.91 });
  const core = surface({ color: 0x253d4b, roughness: 0.44, metalness: 0.78 });
  const reveal = panelBox(1.96, 0.011, 0.92, 0.004, core);
  reveal.position.y = 0.496;
  group.add(reveal);
  for (const z of [-0.508, 0.508]) {
    const edge = panelBox(1.94, 0.006, 0.007, 0.002, machined);
    edge.position.set(0, 0.555, z);
    group.add(edge);
  }
  for (const x of [-0.68, 0.68]) {
    const plate = panelBox(0.089, 0.52, 0.86, 0.012, material);
    plate.position.set(x, 0.27, 0);
    plate.rotation.y = -0.08;
    group.add(plate);
    const foot = panelBox(0.12, 0.012, 0.67, 0.004, core);
    foot.position.set(x, 0.009, 0);
    group.add(foot);
  }
  return group;
}

function loop(material) {
  const steps = 256;
  const sides = 40;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let step = 0; step < steps; step++) {
    const angle = step / steps * Math.PI * 2;
    const twist = angle / 2 + 0.57;
    const cx = Math.cos(angle), cy = Math.sin(angle);
    const width = 0.267 + 0.036 * Math.cos(angle * 2 - 0.4);
    for (let side = 0; side < sides; side++) {
      const cross = side / sides * Math.PI * 2;
      const u = Math.cos(cross), v = Math.sin(cross);
      const crossWidth = width * Math.sign(u) * Math.pow(Math.abs(u), 0.22);
      const thickness = 0.027 * Math.sign(v) * Math.pow(Math.abs(v), 0.43);
      const radial = crossWidth * Math.cos(twist) - thickness * Math.sin(twist);
      positions.push(
        cx * (0.63 + radial) + cy * 0.09,
        cy * (0.67 + radial),
        crossWidth * Math.sin(twist) + thickness * Math.cos(twist) + 0.075 * Math.sin(angle * 2),
      );
      uvs.push(step / steps, side / sides);
      const next = (step + 1) % steps;
      // The half twist joins each vertex to the opposite side of the first ring.
      const seam = next === 0 ? sides / 2 : 0;
      const a = step * sides + side;
      const b = step * sides + (side + 1) % sides;
      const c = next * sides + (side + seam) % sides;
      const d = next * sides + (side + 1 + seam) % sides;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox.min.y, 0);
  return mesh(geometry, material);
}


/* ---------- WeCare: pecas dos servicos ---------- */
function telaCanvas(w, h, desenha) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  desenha(canvas.getContext('2d'), w, h);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4;
  return new T.MeshBasicMaterial({ map, toneMapped: false });
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
const branco = () => surface({ color: 0xf4f5f7, roughness: 0.32, metalness: 0.02, coat: 0.6 });
const grafite = () => surface({ color: 0x1c1e24, roughness: 0.3, metalness: 0.55 });
const cromo = () => surface({ color: 0xd8dee3, roughness: 0.12, metalness: 1 });

// 01 Crescimento: tres colunas subindo e uma seta em fita que sobe junto.
function crescimento(material) {
  const group = new T.Group();
  const alturas = [0.42, 0.74, 1.1];
  const mats = [branco(), cromo(), material];
  alturas.forEach((h, i) => {
    const col = panelBox(0.3, h, 0.3, 0.05, mats[i]);
    col.position.set(-0.42 + i * 0.42, h / 2, 0);
    group.add(col);
  });
  const base = panelBox(1.34, 0.05, 0.52, 0.02, grafite());
  base.position.y = 0.025; group.add(base);
  const curva = new T.CatmullRomCurve3([
    new T.Vector3(-0.66, 0.62, 0.22), new T.Vector3(-0.3, 0.86, 0.26),
    new T.Vector3(0.12, 1.12, 0.24), new T.Vector3(0.46, 1.42, 0.2)]);
  const fita = mesh(new T.TubeGeometry(curva, 80, 0.035, 20), material);
  group.add(fita);
  const ponta = mesh(new T.ConeGeometry(0.1, 0.22, 32), material);
  const fim = curva.getPoint(1), dir = curva.getTangent(1);
  ponta.position.copy(fim).addScaledVector(dir, 0.08);
  ponta.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
  group.add(ponta);
  return group;
}

// 02 Trafego pago: alvo de pe com uma flecha cravada no centro.
function alvo(material) {
  const group = new T.Group();
  const disco = new T.Group();
  const aneis = [0.62, 0.5, 0.38, 0.26, 0.14];
  aneis.forEach((r, i) => {
    const m = i % 2 === 0 ? material : branco();
    const peca = mesh(new T.CylinderGeometry(r, r, 0.09 + i * 0.012, 96), m);
    peca.rotation.x = Math.PI / 2;
    disco.add(peca);
  });
  const aro = mesh(new T.TorusGeometry(0.625, 0.03, 16, 128), grafite());
  disco.add(aro);
  disco.position.y = 0.86; disco.rotation.x = -0.12;
  group.add(disco);
  const pe = mesh(new T.CylinderGeometry(0.035, 0.035, 0.3, 24), grafite());
  pe.position.set(0, 0.15, -0.06); group.add(pe);
  const sapata = panelBox(0.52, 0.05, 0.3, 0.02, grafite());
  sapata.position.set(0, 0.025, -0.06); group.add(sapata);
  const flecha = new T.Group();
  const haste = mesh(new T.CylinderGeometry(0.018, 0.018, 0.78, 16), cromo());
  haste.rotation.x = Math.PI / 2; haste.position.z = 0.39; flecha.add(haste);
  for (let k = 0; k < 3; k++) {
    const pena = panelBox(0.012, 0.12, 0.2, 0.004, material);
    pena.position.z = 0.7; pena.rotation.z = k * Math.PI * 2 / 3; pena.position.y = 0;
    const suporte = new T.Group(); suporte.rotation.z = k * Math.PI * 2 / 3;
    pena.rotation.z = 0; pena.position.set(0, 0.07, 0.7); suporte.add(pena); flecha.add(suporte);
  }
  flecha.position.set(0.02, 0.88, 0.05); flecha.rotation.set(-0.22, 0.3, 0);
  group.add(flecha);
  return group;
}

// 03 Sites, aplicativos e plataformas: monitor com um site e um celular com um app.
function telas(material) {
  const group = new T.Group();
  const site = telaCanvas(1024, 600, (c, w, h) => {
    c.fillStyle = '#F3F4F7'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#121318'; c.fillRect(0, 0, w, 64);
    c.fillStyle = '#D4112E'; rr(c, 34, 20, 26, 26, 8); c.fill();
    c.fillStyle = '#fff'; c.font = '700 26px Sora, sans-serif'; c.fillText('WeCare', 72, 43);
    c.fillStyle = 'rgba(255,255,255,.55)'; [560, 660, 760].forEach(x => { rr(c, x, 26, 70, 12, 6); c.fill(); });
    c.fillStyle = '#D4112E'; rr(c, 860, 16, 130, 34, 17); c.fill();
    c.fillStyle = '#121318'; c.font = '800 58px Sora, sans-serif'; c.fillText('Seu negócio', 60, 170); c.fillText('online.', 60, 236);
    c.fillStyle = '#9AA0AC'; [290, 318].forEach(y => { rr(c, 60, y, 380, 14, 7); c.fill(); });
    c.fillStyle = '#D4112E'; rr(c, 60, 360, 210, 56, 16); c.fill();
    const g = c.createLinearGradient(560, 110, 960, 430); g.addColorStop(0, '#FF4560'); g.addColorStop(1, '#7E0A1C');
    c.fillStyle = g; rr(c, 560, 110, 400, 320, 28); c.fill();
    c.fillStyle = '#fff'; [[0, 470], [1, 470], [2, 470]].forEach(([i, y]) => { rr(c, 60 + i * 312, y, 280, 100, 18); c.fill(); });
  });
  const app = telaCanvas(360, 760, (c, w, h) => {
    c.fillStyle = '#121318'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = '700 30px Sora, sans-serif'; c.fillText('Olá!', 32, 92);
    c.fillStyle = '#8E92A0'; rr(c, 32, 112, 190, 14, 7); c.fill();
    const g = c.createLinearGradient(0, 160, 0, 360); g.addColorStop(0, '#FF4560'); g.addColorStop(1, '#A20D24');
    c.fillStyle = g; rr(c, 32, 160, 296, 200, 26); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)'; rr(c, 56, 300, 120, 16, 8); c.fill();
    c.fillStyle = '#23252E'; for (let i = 0; i < 4; i++) { rr(c, 32, 392 + i * 86, 296, 70, 18); c.fill(); }
    c.fillStyle = '#D4112E'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(68, 427 + i * 86, 16, 0, 7); c.fill(); }
    c.fillStyle = '#5A5F6C'; for (let i = 0; i < 4; i++) { rr(c, 100, 420 + i * 86, 150, 13, 6); c.fill(); }
  });
  const moldura = grafite();
  const monitor = panelBox(1.5, 0.92, 0.05, 0.04, moldura);
  monitor.position.set(-0.1, 1.0, 0); group.add(monitor);
  const vidro = mesh(new T.PlaneGeometry(1.42, 0.83), site);
  vidro.position.set(-0.1, 1.0, 0.027); group.add(vidro);
  const haste = panelBox(0.1, 0.5, 0.05, 0.02, material);
  haste.position.set(-0.1, 0.32, -0.06); group.add(haste);
  const pe = panelBox(0.5, 0.04, 0.32, 0.02, material);
  pe.position.set(-0.1, 0.02, -0.02); group.add(pe);
  const cel = new T.Group();
  const corpo = panelBox(0.38, 0.78, 0.04, 0.06, material);
  cel.add(corpo);
  const tela = mesh(new T.PlaneGeometry(0.34, 0.72), app);
  tela.position.z = 0.021; cel.add(tela);
  cel.position.set(0.66, 0.41, 0.28); cel.rotation.set(-0.06, -0.38, 0.06);
  group.add(cel);
  return group;
}

// 04 Agentes de IA: balao de conversa com os tres pontinhos de "digitando".
function balao(material) {
  const group = new T.Group();
  const forma = new T.Shape();
  const w = 1.1, h = 0.72, r = 0.32;
  forma.moveTo(-w / 2 + r, -h / 2);
  forma.lineTo(-w / 2 + 0.36, -h / 2); forma.lineTo(-w / 2 + 0.12, -h / 2 - 0.26); forma.lineTo(-w / 2 + 0.2, -h / 2);
  forma.lineTo(w / 2 - r, -h / 2); forma.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  forma.lineTo(w / 2, h / 2 - r); forma.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  forma.lineTo(-w / 2 + r, h / 2); forma.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  forma.lineTo(-w / 2, -h / 2 + r); forma.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geo = new T.ExtrudeGeometry(forma, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 8, curveSegments: 32 });
  geo.translate(0, 0, -0.1);
  const grande = mesh(geo, material);
  grande.position.set(0.08, 1.02, 0); group.add(grande);
  for (let k = 0; k < 3; k++) {
    const ponto = mesh(new T.SphereGeometry(0.075, 32, 16), branco());
    ponto.position.set(-0.2 + k * 0.28, 1.02, 0.17); group.add(ponto);
  }
  const forma2 = new T.Shape();
  const w2 = 0.62, h2 = 0.4, r2 = 0.18;
  forma2.moveTo(-w2 / 2 + r2, -h2 / 2);
  forma2.lineTo(w2 / 2 - 0.2, -h2 / 2); forma2.lineTo(w2 / 2 - 0.06, -h2 / 2 - 0.16); forma2.lineTo(w2 / 2 - 0.08, -h2 / 2);
  forma2.quadraticCurveTo(w2 / 2, -h2 / 2, w2 / 2, -h2 / 2 + r2);
  forma2.lineTo(w2 / 2, h2 / 2 - r2); forma2.quadraticCurveTo(w2 / 2, h2 / 2, w2 / 2 - r2, h2 / 2);
  forma2.lineTo(-w2 / 2 + r2, h2 / 2); forma2.quadraticCurveTo(-w2 / 2, h2 / 2, -w2 / 2, h2 / 2 - r2);
  forma2.lineTo(-w2 / 2, -h2 / 2 + r2); forma2.quadraticCurveTo(-w2 / 2, -h2 / 2, -w2 / 2 + r2, -h2 / 2);
  const geo2 = new T.ExtrudeGeometry(forma2, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 6, curveSegments: 24 });
  geo2.translate(0, 0, -0.06);
  const pequeno = mesh(geo2, branco());
  pequeno.position.set(-0.32, 0.36, -0.22); group.add(pequeno);
  for (let k = 0; k < 2; k++) {
    const linha = panelBox(0.34 - k * 0.12, 0.045, 0.02, 0.02, grafite());
    linha.position.set(-0.36 - k * 0.06, 0.41 - k * 0.1, -0.12); group.add(linha);
  }
  return group;
}

// 05 Sistemas financeiros: pilhas de moedas e um tablet com o grafico subindo.
function financas(material) {
  const group = new T.Group();
  const moeda = new T.CylinderGeometry(0.17, 0.17, 0.045, 64);
  const borda = new T.TorusGeometry(0.17, 0.008, 8, 64);
  [[-0.48, 0.18, 5], [-0.12, 0.3, 8], [0.22, 0.14, 11]].forEach(([x, z, n]) => {
    for (let k = 0; k < n; k++) {
      const m = mesh(moeda, material);
      m.position.set(x + Math.sin(k * 1.7) * 0.008, 0.0225 + k * 0.047, z + Math.cos(k * 2.3) * 0.008);
      group.add(m);
      const b = mesh(borda, material); b.rotation.x = Math.PI / 2; b.position.copy(m.position); group.add(b);
    }
  });
  const grafico = telaCanvas(640, 460, (c, w, h) => {
    c.fillStyle = '#121318'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = '700 30px Sora, sans-serif'; c.fillText('Saldo', 36, 64);
    c.fillStyle = '#8E92A0'; rr(c, 36, 84, 150, 12, 6); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2;
    for (let y = 160; y < 420; y += 64) { c.beginPath(); c.moveTo(36, y); c.lineTo(604, y); c.stroke(); }
    const pts = [[36, 390], [130, 360], [220, 372], [310, 300], [400, 310], [490, 220], [604, 150]];
    const g = c.createLinearGradient(0, 150, 0, 420); g.addColorStop(0, 'rgba(255,59,85,.55)'); g.addColorStop(1, 'rgba(255,59,85,0)');
    c.beginPath(); c.moveTo(36, 420); pts.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(604, 420); c.closePath(); c.fillStyle = g; c.fill();
    c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = '#FF3B55'; c.lineWidth = 7; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(604, 150, 11, 0, 7); c.fill();
  });
  const tablet = new T.Group();
  const corpo = panelBox(0.86, 0.62, 0.035, 0.05, grafite());
  tablet.add(corpo);
  const tela = mesh(new T.PlaneGeometry(0.8, 0.56), grafico);
  tela.position.z = 0.019; tablet.add(tela);
  tablet.position.set(0.0, 0.62, -0.28); tablet.rotation.x = -0.22;
  group.add(tablet);
  const apoio = panelBox(0.12, 0.42, 0.05, 0.02, grafite());
  apoio.position.set(0, 0.21, -0.42); apoio.rotation.x = 0.35; group.add(apoio);
  return group;
}

const shapes = { chair, light: disc, vessel, table, loop, crescimento, alvo, telas, balao, financas };

async function makePanel(asset) {
  const group = new T.Group();
  const [w, h] = asset.size ?? [1.25, 0.95];
  const texture = await new T.TextureLoader().loadAsync(asset.src);
  texture.colorSpace = T.SRGBColorSpace;
  const backing = panelBox(w + 0.04, h + 0.04, 0.04, 0.006, surface({
    color: 0x515962, roughness: 0.46, metalness: 0.77,
  }));
  const print = mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: texture, toneMapped: false }));
  print.position.z = 0.025;
  group.add(backing, print);
  group.position.y = h * 0.5 + 0.025;
  return group;
}

const glbs = new Map();

export async function createModel(item, finishIndex, stone) {
  const variant = item.finishes[finishIndex] ?? item.finishes[0];
  const { asset } = item;
  if (asset.kind === 'image') return makePanel(asset);
  if (asset.kind === 'glb') {
    if (!glbs.has(asset.src)) {
      const request = new GLTFLoader().loadAsync(asset.src).catch((error) => {
        glbs.delete(asset.src);
        throw error;
      });
      glbs.set(asset.src, request);
    }
    const model = (await glbs.get(asset.src)).scene.clone(true);
    model.scale.setScalar(asset.scale ?? 1);
    model.rotation.y = asset.rotation ?? 0;
    model.updateMatrixWorld(true);
    model.position.y -= new T.Box3().setFromObject(model).min.y;
    if (asset.finishMaterial) {
      model.traverse((child) => {
        if (!child.isMesh) return;
        const finish = (original) => {
          if (original.name !== asset.finishMaterial) return original;
          const replacement = original.clone();
          replacement.color.setHex(variant.color);
          if ('roughness' in replacement) replacement.roughness = variant.roughness;
          if ('metalness' in replacement) replacement.metalness = variant.metalness;
          replacement.userData.ownedFinish = true;
          return replacement;
        };
        child.material = Array.isArray(child.material) ? child.material.map(finish) : finish(child.material);
      });
    }
    return model;
  }
  const extra = { side: T.DoubleSide };
  if (asset.shape === 'vessel') Object.assign(extra, { bumpMap: stone, bumpScale: 0.006 });
  if (asset.shape === 'light') Object.assign(extra, { clearcoat: 0.12, sheen: 0.14, sheenColor: new T.Color(0xf5eee1) });
  if (asset.shape === 'table') {
    Object.assign(extra, { bumpMap: brushedGrain(), bumpScale: asset.shape === 'table' ? 0.0018 : 0.0009 });
  }
  const material = surface(variant, extra);
  if (asset.shape === 'table') material.userData.ownedBumpMap = extra.bumpMap;
  if (asset.shape === 'vessel' || asset.shape === 'loop') mineralFinish(material, asset.shape);
  const model = shapes[asset.shape](material);
  return model;
}

export function disposeModel(model) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry.dispose();
    for (const material of [child.material].flat()) {
      material.map?.dispose();
      material.userData.ownedBumpMap?.dispose();
      material.dispose();
    }
  });
}
