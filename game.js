import * as THREE from './vendor/three.module.min.js';

// =====================================================================
//  Flower Tycoon — raccogli, vendi, incassa, espandi.
// =====================================================================

const SAVE_KEY = 'flowerTycoon.v2';
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distXZ = (a, x, z) => Math.hypot(a.x - x, a.z - z);
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M'
  : n >= 1e4 ? (n / 1e3).toFixed(1).replace('.0', '') + 'K' : String(Math.floor(n));

// ---------------------------------------------------------------------
//  Layout: il giardino è fatto di "spiazzali" uno dopo l'altro lungo -z.
//  Ogni spiazzale ha un prodotto, un bancone, una fila di clienti e 2 aiuole.
//  Il venditore sta davanti al bancone (lato +z, verso la camera),
//  i clienti dietro e la fila prosegue verso destra fino all'ingresso.
// ---------------------------------------------------------------------
const AREA_GAP = 19.4;
const czOf = (k) => -AREA_GAP * k;
const AREA_PRODUCTS = ['rose', 'daisy', 'straw'];
const COUNTER_SIZE = { w: 3.2, d: 1.2 };
const BED_SLOTS = [{ x: -5.5, dz: 1.3 }, { x: -5.5, dz: -4.9 }];
const bedPos = (k, s) => ({ x: BED_SLOTS[s].x, z: czOf(k) + BED_SLOTS[s].dz });
const bedPadPos = (k, s) => ({ x: BED_SLOTS[s].x - 3.2, z: czOf(k) + BED_SLOTS[s].dz });
const BOUNDS = { minX: -13.5, maxX: 9.8, minZ: -8.6, maxZ: 8.6 };
const COUNTER_CAP = 75;
const CASH_VISIBLE = 150;
const QUEUE_MAX = 9;

// ---------------------------------------------------------------------
//  Renderer, scena, camera
// ---------------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5fb43a);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(14, 17, 14);
const camTarget = new THREE.Vector3(-2.8, 0, 2.6);

function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setSize(w, h);
  // Il lato corto dello schermo mostra ~10 unità di mondo (un po' di più in verticale)
  const viewH = aspect < 1 ? 13.5 / aspect : 9.5;
  camera.top = viewH / 2; camera.bottom = -viewH / 2;
  camera.left = -viewH * aspect / 2; camera.right = viewH * aspect / 2;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight(0xffffff, 0x6e9a4a, 2.1));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---------------------------------------------------------------------
//  Geometrie con colori per vertice (un solo draw call per oggetto)
// ---------------------------------------------------------------------
const VC_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function partsGeo(parts) {
  const pos = [], nor = [], col = [], c = new THREE.Color();
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    if (p.m) g.applyMatrix4(p.m);
    c.set(p.c);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
    for (let i = 0; i < P.length / 3; i++) col.push(c.r, c.g, c.b);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// Mazzo di fiori in piedi: cono di carta + fiori. Origine alla base, alto ~0.75
function bouquetGeo(paper, ribbon, flowers) {
  return partsGeo([
    { g: new THREE.ConeGeometry(0.21, 0.56, 9), m: M4(0, 0.28, 0, Math.PI), c: paper },
    { g: new THREE.CylinderGeometry(0.115, 0.1, 0.07, 9), m: M4(0, 0.17, 0), c: ribbon },
    { g: new THREE.ConeGeometry(0.06, 0.22, 5), m: M4(0.16, 0.52, 0.02, 0, 0, -0.7), c: 0x3f9e35 },
    { g: new THREE.ConeGeometry(0.06, 0.22, 5), m: M4(-0.15, 0.52, -0.04, 0, 0, 0.7), c: 0x4fb33e },
    ...flowers,
  ]);
}
const ROSE_UP = bouquetGeo(0xfff6f8, 0xf58bb0, [
  { g: new THREE.IcosahedronGeometry(0.13, 1), m: M4(0, 0.66, 0), c: 0xe8336b },
  { g: new THREE.IcosahedronGeometry(0.12, 1), m: M4(0.11, 0.58, 0.08), c: 0xff6492 },
  { g: new THREE.IcosahedronGeometry(0.12, 1), m: M4(-0.11, 0.58, 0.06), c: 0xd92a5c },
  { g: new THREE.IcosahedronGeometry(0.12, 1), m: M4(0.02, 0.58, -0.12), c: 0xff4f84 },
]);
const daisyHeads = [[0, 0.68, 0, 0], [0.11, 0.6, 0.08, -0.4], [-0.11, 0.6, 0.06, 0.4], [0.02, 0.6, -0.12, 0.2]]
  .flatMap(([x, y, z, t]) => [
    { g: new THREE.CylinderGeometry(0.14, 0.14, 0.03, 10), m: M4(x, y, z, t * 0.5, 0, t), c: 0xffffff },
    { g: new THREE.SphereGeometry(0.055, 8, 6), m: M4(x, y + 0.03, z), c: 0xffcf2e },
  ]);
const DAISY_UP = bouquetGeo(0xdff1ff, 0xffd23f, daisyHeads);

// Piantina di fragole (nell'aiuola)
const STRAW_PLANT = partsGeo([
  { g: new THREE.IcosahedronGeometry(0.2, 0), m: M4(0.1, 0.22, 0, 0, 0, 0, 1, 0.6, 1), c: 0x3f9e35 },
  { g: new THREE.IcosahedronGeometry(0.2, 0), m: M4(-0.12, 0.24, 0.06, 0, 1, 0, 1, 0.6, 1), c: 0x4fb33e },
  { g: new THREE.IcosahedronGeometry(0.18, 0), m: M4(0, 0.3, -0.12, 0, 2, 0, 1, 0.6, 1), c: 0x5cbf44 },
  ...[[0.2, 0.2, 0.12], [-0.18, 0.18, 0.18], [0.05, 0.2, 0.22], [-0.05, 0.38, 0]].flatMap(([x, y, z]) => [
    { g: new THREE.ConeGeometry(0.075, 0.16, 7), m: M4(x, y, z, Math.PI), c: 0xe8283c },
    { g: new THREE.ConeGeometry(0.05, 0.04, 5), m: M4(x, y + 0.09, z), c: 0x2f8a2a },
  ]),
]);
// Cassetta di fragole (oggetto da trasportare). Già "sdraiata", base a y=0
const STRAW_ITEM = partsGeo([
  { g: new THREE.BoxGeometry(0.58, 0.13, 0.38), m: M4(0, 0.065, 0), c: 0xd59a5a },
  { g: new THREE.BoxGeometry(0.6, 0.03, 0.4), m: M4(0, 0.13, 0), c: 0xb57a3e },
  ...[-0.18, 0, 0.18].flatMap((x) => [-0.09, 0.09].map((z) => (
    { g: new THREE.IcosahedronGeometry(0.075, 0), m: M4(x + rand(-0.02, 0.02), 0.17, z), c: 0xe8283c }))),
]);
// Un mazzo "sdraiato" per le pile: lungo l'asse x, base a y=0
const laid = (g) => g.clone().rotateZ(Math.PI / 2).translate(0.37, 0.21, 0);

const PRODUCTS = {
  rose: { name: 'Rose', price: 2, plant: ROSE_UP, item: laid(ROSE_UP), color: '#ff4f84' },
  daisy: { name: 'Margherite', price: 3, plant: DAISY_UP, item: laid(DAISY_UP), color: '#ffffff' },
  straw: { name: 'Fragole', price: 5, plant: STRAW_PLANT, item: STRAW_ITEM, color: '#e8283c' },
};

// Mazzetto di banconote
const BILL_GEO = partsGeo([
  { g: new THREE.BoxGeometry(0.58, 0.12, 0.34), m: M4(0, 0.06, 0), c: 0x2fa84f },
  { g: new THREE.BoxGeometry(0.44, 0.02, 0.22), m: M4(0, 0.125, 0), c: 0x8fe07f },
  { g: new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), m: M4(0, 0.135, 0), c: 0x2a9a45 },
]);

// Trattorino (aratro)
const TRACTOR_GEO = partsGeo([
  { g: new THREE.BoxGeometry(0.5, 0.28, 0.9), m: M4(0, 0.38, 0.05), c: 0xe0362c },
  { g: new THREE.BoxGeometry(0.44, 0.2, 0.4), m: M4(0, 0.58, 0.3), c: 0xc82a22 },
  { g: new THREE.BoxGeometry(0.46, 0.42, 0.36), m: M4(0, 0.72, -0.2), c: 0xe0362c },
  { g: new THREE.BoxGeometry(0.4, 0.24, 0.38), m: M4(0, 0.78, -0.2), c: 0x9fe3ff },
  { g: new THREE.BoxGeometry(0.52, 0.05, 0.42), m: M4(0, 0.95, -0.2), c: 0xffffff },
  { g: new THREE.CylinderGeometry(0.04, 0.04, 0.3), m: M4(0.15, 0.82, 0.38), c: 0x333333 },
  { g: new THREE.CylinderGeometry(0.25, 0.25, 0.14, 14), m: M4(-0.31, 0.25, -0.22, 0, 0, Math.PI / 2), c: 0x262626 },
  { g: new THREE.CylinderGeometry(0.25, 0.25, 0.14, 14), m: M4(0.31, 0.25, -0.22, 0, 0, Math.PI / 2), c: 0x262626 },
  { g: new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10), m: M4(-0.31, 0.25, -0.22, 0, 0, Math.PI / 2), c: 0xffd23f },
  { g: new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10), m: M4(0.31, 0.25, -0.22, 0, 0, Math.PI / 2), c: 0xffd23f },
  { g: new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12), m: M4(-0.27, 0.14, 0.38, 0, 0, Math.PI / 2), c: 0x262626 },
  { g: new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12), m: M4(0.27, 0.14, 0.38, 0, 0, Math.PI / 2), c: 0x262626 },
  { g: new THREE.BoxGeometry(0.7, 0.2, 0.12), m: M4(0, 0.15, -0.55), c: 0x9a9a9a },
  ...[-0.24, 0, 0.24].map((x) => ({ g: new THREE.ConeGeometry(0.05, 0.18, 4), m: M4(x, 0.05, -0.58, Math.PI), c: 0x7a7a7a })),
]);

function makeItem(product) {
  const m = new THREE.Mesh(PRODUCTS[product].item, VC_MAT);
  m.castShadow = true;
  m.userData.product = product;
  return m;
}
function makeBill() {
  const m = new THREE.Mesh(BILL_GEO, VC_MAT);
  m.castShadow = true;
  return m;
}

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}
function box(w, h, d, color, x = 0, y = 0, z = 0, parent = scene, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------
//  Texture disegnate su canvas
// ---------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// Icona del prodotto (nuvolette dei clienti e pedane)
function drawProduct(ctx, product, x, y, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  if (product === 'straw') {
    ctx.fillStyle = '#e8283c';
    ctx.beginPath();
    ctx.moveTo(0, 20); ctx.bezierCurveTo(-22, 2, -18, -14, 0, -12); ctx.bezierCurveTo(18, -14, 22, 2, 0, 20);
    ctx.fill();
    ctx.fillStyle = '#ffe28a';
    for (const [px, py] of [[-7, -3], [6, -4], [0, 4], [-4, 10], [5, 9]]) ctx.fillRect(px, py, 2.5, 3.5);
    ctx.fillStyle = '#3c9a33';
    ctx.beginPath(); ctx.moveTo(-12, -14); ctx.lineTo(0, -8); ctx.lineTo(12, -14); ctx.lineTo(4, -18); ctx.lineTo(0, -24);
    ctx.lineTo(-4, -18); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = '#3c9a33'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(-3, 18, 2, 30); ctx.stroke();
    ctx.fillStyle = '#4fb33e';
    ctx.beginPath(); ctx.ellipse(-9, 20, 9, 4, -0.7, 0, TAU); ctx.fill();
    if (product === 'daisy') {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * 9, -6 + Math.sin(a) * 9, 7, 3.6, a, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#ffcf2e';
      ctx.beginPath(); ctx.arc(0, -6, 6, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#ff4f84';
      ctx.beginPath();
      ctx.moveTo(-12, -14); ctx.lineTo(-6, -4); ctx.lineTo(0, -16); ctx.lineTo(6, -4); ctx.lineTo(12, -14);
      ctx.quadraticCurveTo(14, 6, 0, 6); ctx.quadraticCurveTo(-14, 6, -12, -14);
      ctx.fill();
    }
  }
  ctx.restore();
}
function drawBillIcon(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.15);
  ctx.fillStyle = '#1f8a34'; roundRect(ctx, -22, -13, 48, 30, 4); ctx.fill();
  ctx.fillStyle = '#3cb94e'; roundRect(ctx, -26, -17, 48, 30, 4); ctx.fill();
  ctx.strokeStyle = '#1f8a34'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#9be38a'; ctx.beginPath(); ctx.arc(-2, -2, 7, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Terreno, sentieri e decorazioni (tutti gli spiazzali, anche quelli chiusi)
// ---------------------------------------------------------------------
const TOP_Z = czOf(AREA_PRODUCTS.length - 1) - 9.8;
const grassTex = canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#74c043'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,60,0,0.06)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 3, 7);
  }
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(36, 36);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshLambertMaterial({ map: grassTex }));
ground.rotation.x = -Math.PI / 2;
ground.position.z = -20;
ground.receiveShadow = true;
scene.add(ground);

const tileTex = canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#c9c1ad'; ctx.fillRect(0, 0, w, h);
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 214 + Math.floor(Math.random() * 14);
    ctx.fillStyle = `rgb(${v},${v - 6},${v - 20})`;
    ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
  }
});
tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
function path(x0, z0, x1, z1) {
  const w = x1 - x0, d = z1 - z0;
  const t = tileTex.clone();
  t.needsUpdate = true;
  t.repeat.set(w / 2.4, d / 2.4);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: t }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x0 + w / 2, 0.01, z0 + d / 2);
  m.receiveShadow = true;
  scene.add(m);
}
function hedge(x, z, w, d, h = 1.0) {
  box(w, h, d, 0x6cc83a, x, h / 2, z);
  box(w + 0.06, 0.12, d + 0.06, 0x84d94a, x, h - 0.02, z, scene, false);
}
function bush(x, z, s = 1) {
  const g = new THREE.Group();
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), mat(0x5cb836));
  leaves.position.y = 0.55; leaves.scale.set(1, 0.8, 1); leaves.castShadow = true;
  g.add(leaves);
  for (let i = 0; i < 6; i++) {
    const a = rand(0, TAU), r = rand(0.35, 0.6);
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(0xfffbe6));
    f.position.set(Math.cos(a) * r, rand(0.75, 1.0), Math.sin(a) * r);
    g.add(f);
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(0xf7d33c));
    c.position.copy(f.position).y += 0.08;
    g.add(c);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  scene.add(g);
}
function cypress(x, z, h = 3.6) {
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.65, h, 10), mat(0x3e9a32));
  t.position.set(x, h / 2, z); t.castShadow = true;
  scene.add(t);
}
function balustrade(x0, x1, z) {
  for (let x = x0; x <= x1 + 0.01; x += 2) box(0.4, 1.0, 0.4, 0xf0e9da, x, 0.5, z);
  const w = x1 - x0, cx = (x0 + x1) / 2;
  box(w + 0.4, 0.16, 0.5, 0xfaf4e6, cx, 1.05, z);
  box(w + 0.4, 0.12, 0.4, 0xf0e9da, cx, 0.1, z);
}

// Cancelli tra uno spiazzale e l'altro (spariscono quando li sblocchi)
const gates = [];
for (let k = 0; k < AREA_PRODUCTS.length; k++) {
  const cz = czOf(k);
  path(-4, cz - 4.5, 5.6, cz + 4.6);         // piazza del negozio
  path(5.6, cz - 3.8, 20, cz - 0.6);         // fila dei clienti / ingresso
  path(-13.5, cz - 2.5, -4, cz - 1.1);       // sentiero tra le aiuole
  hedge(6.4, cz - 5.6, 4.2, 1.2, 0.8);
  hedge(8.6, cz + 4.6, 1.4, 3.6, 0.8);
  bush(4.2, cz - 7.6); bush(9.4, cz + 1.3, 0.7); bush(9.4, cz - 5.2, 0.7);
  bush(-13, cz - 8); bush(8.8, cz - 8.2, 0.9); bush(-12.8, cz + 7.8, 1.1);
  cypress(9.9, cz + 8.7); cypress(-13.8, cz + 8.6, 3.2);
  // Siepe destra con il varco per i clienti
  hedge(10.8, cz + 4.9, 0.8, 9.4);
  hedge(10.8, cz - 7, 0.8, 5.6);
  for (let i = 0; i < 3; i++) bush(rand(12.5, 18), cz + rand(1.5, 9), rand(0.8, 1.3));
  for (let i = 0; i < 3; i++) bush(rand(12.5, 18), cz + rand(-9.5, -5), rand(0.8, 1.3));
  // Divisorio in alto: balaustra con cancello al centro (l'ultimo è chiuso)
  const zTop = cz - 9.8;
  if (k === AREA_PRODUCTS.length - 1) {
    balustrade(-14.6, 10.8, zTop);
  } else {
    balustrade(-14.6, -2.6, zTop);
    balustrade(2.6, 10.8, zTop);
    const gate = new THREE.Group();
    gate.position.set(0, 0, zTop);
    for (let x = -2.1; x <= 2.11; x += 0.42) box(0.12, 1.3, 0.12, 0x9c6a3c, x, 0.65, 0, gate);
    box(4.4, 0.14, 0.16, 0x7d4f2a, 0, 1.15, 0, gate);
    box(4.4, 0.14, 0.16, 0x7d4f2a, 0, 0.35, 0, gate);
    scene.add(gate);
    gates.push(gate);
  }
}
hedge(-2, 9.6, 25.2, 0.8);
hedge(-14.6, (9.6 + TOP_Z) / 2, 0.8, 9.6 - TOP_Z);
bush(-1.5, 7.9, 0.9);
for (let i = 0; i < 14; i++) bush(rand(-20, 18), rand(11, 17), rand(0.8, 1.3));

// ---------------------------------------------------------------------
//  Personaggi
// ---------------------------------------------------------------------
const SKINS = [0xf6cfa8, 0xe8b48a, 0xc68b5e, 0x8d5a3b, 0xfde0c5];
const SHIRTS = [0xe84a5f, 0x4a90e2, 0xf5a623, 0x7ed321, 0x9b59b6, 0x50e3c2, 0xff7eb6, 0x34495e, 0xffd23f];
const PANTS = [0x2c3e50, 0x4a5a7a, 0x6b4f2a, 0x3b5b3b, 0x8e8e8e, 0xd35f8d];
const HAIRS = [0x3b2414, 0x7a4a1e, 0xe0a33a, 0xc8551f, 0x1d1d1d, 0xa0a0a0];

const legGeo = new THREE.BoxGeometry(0.17, 0.5, 0.2).translate(0, -0.25, 0);
const shoeGeo = new THREE.BoxGeometry(0.19, 0.1, 0.28);
const torsoGeo = new THREE.CapsuleGeometry(0.24, 0.32, 4, 10);
const armGeo = new THREE.CylinderGeometry(0.075, 0.07, 0.44, 8).translate(0, -0.2, 0);
const handGeo = new THREE.SphereGeometry(0.08, 8, 6);
const headGeo = new THREE.SphereGeometry(0.22, 16, 12);
const hairGeo = new THREE.SphereGeometry(0.235, 16, 10, 0, TAU, 0, Math.PI * 0.55);
const eyeGeo = new THREE.SphereGeometry(0.03, 6, 4);

function makeCharacter(o) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const add = (geo, color, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z); m.castShadow = true;
    parent.add(m);
    return m;
  };
  const legL = add(legGeo, o.pants, -0.11, 0.55, 0);
  const legR = add(legGeo, o.pants, 0.11, 0.55, 0);
  add(shoeGeo, o.shoes ?? 0x4a2e1a, 0, -0.5, 0.04, legL);
  add(shoeGeo, o.shoes ?? 0x4a2e1a, 0, -0.5, 0.04, legR);
  const torso = add(torsoGeo, o.shirt, 0, 0.88, 0);
  torso.scale.z = 0.8;
  if (o.apron) {
    const ap = add(new THREE.BoxGeometry(0.4, 0.5, 0.05), o.apron, 0, 0.82, 0.19);
    ap.rotation.x = -0.05;
  }
  const armL = add(armGeo, o.shirt, -0.31, 1.08, 0);
  const armR = add(armGeo, o.shirt, 0.31, 1.08, 0);
  add(handGeo, o.skin, 0, -0.44, 0, armL);
  add(handGeo, o.skin, 0, -0.44, 0, armR);
  const head = add(headGeo, o.skin, 0, 1.42, 0);
  add(eyeGeo, 0x222222, -0.075, 0.03, 0.2, head);
  add(eyeGeo, 0x222222, 0.075, 0.03, 0.2, head);
  const hair = add(hairGeo, o.hair, 0, 0.02, -0.02, head);
  hair.rotation.x = -0.35;
  if (o.hairStyle === 'long') {
    add(new THREE.BoxGeometry(0.42, 0.42, 0.14), o.hair, 0, -0.18, -0.15, head);
  } else if (o.hairStyle === 'bun') {
    add(new THREE.SphereGeometry(0.11, 10, 8), o.hair, 0, 0.12, -0.24, head);
  }
  if (o.hat === 'straw') {
    add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), 0xf2cf6b, 0, 0.17, 0, head);
    add(new THREE.CylinderGeometry(0.2, 0.23, 0.18, 16), 0xf2cf6b, 0, 0.26, 0, head);
    add(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 16), 0xe2455f, 0, 0.2, 0, head);
  } else if (o.hat === 'cap') {
    add(new THREE.SphereGeometry(0.235, 14, 8, 0, TAU, 0, Math.PI / 2), o.capColor, 0, 0.06, 0, head);
    add(new THREE.BoxGeometry(0.3, 0.03, 0.2), o.capColor, 0, 0.07, 0.25, head);
  }
  return { group: g, body, legL, legR, armL, armR, walk: rand(0, TAU), facing: 0, speed: 0 };
}

function animateChar(c, speed, dt, carrying) {
  const s = Math.min(1, speed / 2.5);
  c.walk += dt * (4 + speed * 2.2) * (s > 0.05 ? 1 : 0);
  const sw = Math.sin(c.walk) * 0.75 * s;
  c.legL.rotation.x = sw;
  c.legR.rotation.x = -sw;
  if (carrying) {
    c.armL.rotation.x = c.armR.rotation.x = -1.35 + Math.sin(c.walk * 2) * 0.05 * s;
  } else {
    c.armL.rotation.x = -sw * 0.8;
    c.armR.rotation.x = sw * 0.8;
  }
  c.body.position.y = Math.abs(Math.cos(c.walk)) * 0.06 * s;
}

function turnTowards(c, dx, dz, dt, rate = 12) {
  const target = Math.atan2(dx, dz);
  let d = target - c.facing;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  c.facing += d * Math.min(1, dt * rate);
  c.group.rotation.y = c.facing;
}

// Muove un personaggio verso (x,z). Ritorna true quando è arrivato.
function moveTo(c, x, z, speed, dt) {
  const p = c.group.position;
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d < 0.05) { c.speed = 0; return true; }
  const step = Math.min(d, speed * dt);
  p.x += dx / d * step;
  p.z += dz / d * step;
  c.speed = speed;
  turnTowards(c, dx, dz, dt);
  return d - step < 0.05;
}

// ---------------------------------------------------------------------
//  Pile di oggetti (prodotti in braccio, sul bancone, soldi)
// ---------------------------------------------------------------------
const _v = new THREE.Vector3();
class Stack {
  constructor(parent, layout) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.items = [];
    this.incoming = 0;
    this.layout = layout;
  }
  get count() { return this.items.length; }
  get total() { return this.items.length + this.incoming; }
  slotWorld(i, out) {
    const l = this.layout(i);
    return this.group.localToWorld(out.set(l.x, l.y, l.z));
  }
  // Prenota il prossimo posto per un oggetto in volo
  reserve() {
    const i = this.total, v = new THREE.Vector3();
    this.incoming++;
    return () => this.slotWorld(Math.min(i, this.total - 1), v);
  }
  receive(mesh) { this.incoming--; this.add(mesh); }
  place(mesh, i) {
    const l = this.layout(i);
    mesh.position.set(l.x, l.y, l.z);
    mesh.rotation.set(0, l.ry || 0, 0);
  }
  add(mesh) {
    this.group.add(mesh);
    this.place(mesh, this.items.length);
    mesh.scale.setScalar(1);
    this.items.push(mesh);
  }
  pop() { return this.takeAt(this.items.length - 1); }
  // Prende l'oggetto più in alto che soddisfa la condizione
  takeWhere(pred) {
    for (let i = this.items.length - 1; i >= 0; i--) if (pred(this.items[i])) return this.takeAt(i);
    return null;
  }
  takeAt(i) {
    const m = this.items[i];
    if (!m) return null;
    const pos = m.getWorldPosition(new THREE.Vector3());
    const quat = m.getWorldQuaternion(new THREE.Quaternion());
    this.items.splice(i, 1);
    this.group.remove(m);
    for (let j = i; j < this.items.length; j++) this.place(this.items[j], j);
    m.position.copy(pos);
    m.quaternion.copy(quat);
    return m;
  }
}
const carryLayout = (i) => ({ x: 0, y: i * 0.2, z: 0 });
const ITEM_H = 0.2;

// ---------------------------------------------------------------------
//  Oggetti in volo (prodotti e banconote che saltano da un posto all'altro)
// ---------------------------------------------------------------------
const flyers = [];
function fly(mesh, toFn, dur, arc, onDone) {
  scene.add(mesh);
  flyers.push({ mesh, from: mesh.position.clone(), to: toFn, t: 0, dur, arc, onDone });
}
function updateFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    const e = k * k * (3 - 2 * k);
    const to = f.to();
    f.mesh.position.lerpVectors(f.from, to, e);
    f.mesh.position.y += Math.sin(Math.PI * k) * f.arc;
    if (k >= 1) {
      flyers.splice(i, 1);
      scene.remove(f.mesh);
      f.onDone && f.onDone(f.mesh);
    }
  }
}

// ---------------------------------------------------------------------
//  Coriandoli e "pop" di costruzione
// ---------------------------------------------------------------------
const confetti = [];
const confGeo = new THREE.PlaneGeometry(0.14, 0.09);
const CONF_COLORS = [0xff4f84, 0xffd23f, 0x4a90e2, 0x7ed321, 0xffffff, 0xff8a3d];
function burst(x, z, n = 50) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial({ color: pick(CONF_COLORS), side: THREE.DoubleSide }));
    m.position.set(x, 0.5, z);
    const a = rand(0, TAU), s = rand(2, 5);
    confetti.push({ m, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rand(5, 9), life: rand(1.2, 1.8),
      spin: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)) });
    scene.add(m);
  }
}
const pops = [];
function popIn(obj, delay = 0) {
  obj.scale.setScalar(0.001);
  pops.push({ obj, t: -delay });
}
function updateFx(dt) {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.life -= dt;
    c.vy -= 14 * dt;
    c.vx *= 0.98; c.vz *= 0.98;
    c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
    c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
    if (c.m.position.y < 0.03) { c.m.position.y = 0.03; c.vy = 0; c.vx = c.vz = 0; }
    if (c.life <= 0) { scene.remove(c.m); c.m.material.dispose(); confetti.splice(i, 1); }
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += dt;
    const k = clamp(p.t / 0.45, 0, 1);
    // Rimbalzo elastico (easeOutBack)
    const c1 = 2.2, q = k - 1;
    p.obj.scale.setScalar(Math.max(0.001, k <= 0 ? 0.001 : 1 + (c1 + 1) * q * q * q + c1 * q * q));
    if (k >= 1) pops.splice(i, 1);
  }
}

// ---------------------------------------------------------------------
//  Audio (effetti sintetizzati, nessun file esterno)
// ---------------------------------------------------------------------
let actx = null;
let muted = false;
try { muted = localStorage.getItem('flowerTycoon.muted') === '1'; } catch { }
const lastSfx = {};
function tone(freq, dur, type = 'sine', vol = 0.1, slide = 0, delay = 0) {
  if (!actx || muted) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function sfx(name) {
  const now = performance.now();
  if (lastSfx[name] && now - lastSfx[name] < 45) return;
  lastSfx[name] = now;
  switch (name) {
    case 'pick': tone(rand(700, 900), 0.07, 'triangle', 0.07, 1.4); break;
    case 'drop': tone(rand(380, 460), 0.06, 'triangle', 0.07, 0.7); break;
    case 'coin': tone(1400, 0.05, 'square', 0.025); tone(2100, 0.07, 'square', 0.02, 1, 0.04); break;
    case 'pay': tone(rand(500, 560), 0.05, 'sine', 0.06, 1.2); break;
    case 'sell': tone(660, 0.08, 'triangle', 0.08); tone(990, 0.12, 'triangle', 0.08, 1, 0.07); break;
    case 'buy': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, 1, i * 0.08)); break;
  }
}
function initAudio() {
  if (actx) { actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { }
}

// ---------------------------------------------------------------------
//  Stato di gioco e salvataggio
// ---------------------------------------------------------------------
const state = {
  money: 0, stage: 0,
  capacity: 10, priceBonus: 0, speed: 5.2, gardenerCap: 6,
};
const priceOf = (product) => PRODUCTS[product].price + state.priceBonus;
let loaded = null;
try { loaded = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { }

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money, stage: state.stage, padPaid: currentPad ? currentPad.paid : 0,
    }));
  } catch { }
}

// Ostacoli: rettangoli (eventualmente ruotati) { x, z, hw, hd, rot }
const obstacles = [];
for (let k = 0; k < AREA_PRODUCTS.length; k++) {
  const cz = czOf(k);
  obstacles.push({ x: 6.4, z: cz - 5.6, hw: 2.1, hd: 0.6, rot: 0 }, { x: 8.6, z: cz + 4.6, hw: 0.7, hd: 1.8, rot: 0 });
}

// ---------------------------------------------------------------------
//  Pedane a terra
// ---------------------------------------------------------------------
function makePadMesh(size, tex) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  g.add(m);
  // Ruota la pedana in modo che il testo si legga dalla camera
  g.rotation.y = Math.PI / 4;
  scene.add(g);
  return { group: g, mesh: m };
}
function drawSellPad(active) {
  return (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    roundRect(ctx, 14, 14, w - 28, h - 28, 34);
    ctx.fillStyle = active ? 'rgba(94, 220, 255, 0.55)' : 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = active ? '#3fd0ff' : '#ffffff';
    ctx.setLineDash(active ? [] : [34, 22]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '900 66px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 12; ctx.strokeStyle = '#ffffff';
    ctx.strokeText('VENDI', w / 2, h / 2);
    ctx.fillStyle = '#2f5fd0';
    ctx.fillText('VENDI', w / 2, h / 2);
  };
}
const sellTexOff = canvasTex(256, 256, drawSellPad(false));
const sellTexOn = canvasTex(256, 256, drawSellPad(true));
const cashTex = canvasTex(256, 256, (ctx, w, h) => {
  roundRect(ctx, 12, 12, w - 24, h - 24, 40);
  ctx.fillStyle = 'rgba(80,90,100,0.35)'; ctx.fill();
  ctx.lineWidth = 12; ctx.strokeStyle = '#3fd0ff'; ctx.stroke();
});

// ---------------------------------------------------------------------
//  Spiazzali (aree di vendita)
// ---------------------------------------------------------------------
const areas = [];
function buildArea(k, instant) {
  const cz = czOf(k);
  const product = AREA_PRODUCTS[k];
  const A = {
    k, cz, product,
    sell: { x: -0.3, z: cz + 1.75, r: 1.15 },
    cash: { x: 3.4, z: cz + 2.0, r: 1.5 },
    drop: { x: -1.9, z: cz + 1.5 },
    post: { x: 0.3, z: cz + 1.15 },
    queue: { x: -0.2, z: cz - 1.45, step: 0.95 },
    exit: [{ x: -0.2, z: cz - 2.9 }, { x: 16, z: cz - 2.9 }],
    customers: [], leaving: [], spawnTimer: 1, sellTimer: 0,
    cashier: null, beds: [], cashBonus: 0,
  };
  // Bancone con cassa
  const g = new THREE.Group();
  g.position.set(0, 0, cz);
  scene.add(g);
  const { w, d } = COUNTER_SIZE;
  box(w, 0.95, d, 0xece6d6, 0, 0.475, 0, g);
  box(w + 0.2, 0.14, d + 0.2, [0x3d63c9, 0xf0a23a, 0xd94a6a][k], 0, 1.0, 0, g);
  box(w + 0.22, 0.06, 0.08, 0x2f4ea3, 0, 0.92, -d / 2 - 0.1, g);
  const laptop = new THREE.Group();
  laptop.position.set(0.95, 1.07, -0.1);
  g.add(laptop);
  box(0.62, 0.04, 0.42, 0x2c2f38, 0, 0.02, 0.05, laptop);
  const screenM = box(0.62, 0.42, 0.04, 0x2c2f38, 0, 0.23, -0.17, laptop);
  screenM.rotation.x = -0.25;
  const scr = box(0.54, 0.34, 0.01, 0x7fd7ff, 0, 0, 0.025, screenM, false);
  scr.material = new THREE.MeshBasicMaterial({ color: 0x8fdcff });
  A.counterGroup = g;
  A.counter = new Stack(g, (i) => {
    const col = Math.floor(i / 25), j = i % 25;
    return { x: -1.2 + col * 0.46, y: 1.07 + j * ITEM_H, z: 0, ry: Math.PI / 2 };
  });
  obstacles.push({ x: 0, z: cz, hw: w / 2 + 0.1, hd: d / 2 + 0.1, rot: 0 });

  A.sellPad = makePadMesh(2.4, sellTexOff);
  A.sellPad.mesh.material = A.sellPad.mesh.material.clone();
  A.sellPad.group.position.set(A.sell.x, 0.03, A.sell.z);
  A.cashPad = makePadMesh(2.7, cashTex);
  A.cashPad.group.position.set(A.cash.x, 0.03, A.cash.z);
  A.cashStack = new Stack(A.cashPad.group, (i) => {
    const pile = i % 6, lvl = Math.floor(i / 6);
    return { x: (pile % 2) * 0.68 - 0.34, y: lvl * 0.135, z: Math.floor(pile / 2) * 0.44 - 0.44, ry: ((i * 7) % 5 - 2) * 0.03 };
  });

  areas.push(A);
  if (k > 0 && gates[k - 1]) { scene.remove(gates[k - 1]); }
  BOUNDS.minZ = cz - 8.6;
  addBed(A, 0, instant);
  if (!instant) {
    popIn(g); popIn(A.sellPad.group, 0.1); popIn(A.cashPad.group, 0.2);
    burst(0, cz, 80);
  } else {
    // Qualche prodotto già sul bancone per far partire subito le vendite
    for (let i = 0; i < 4; i++) A.counter.add(makeItem(product));
  }
  return A;
}
const areaOfProduct = (product) => areas.find((a) => a.product === product);

// ---------------------------------------------------------------------
//  Aiuole (ognuna con il suo giardiniere e il suo aratro)
// ---------------------------------------------------------------------
const plants = [];
const REGROW = 4.5;
const BED_COLS = 3, BED_ROWS = 4, BED_SP = 0.95;
function addBed(A, slot, instant) {
  const { x, z } = bedPos(A.k, slot);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = BED_COLS * BED_SP + 0.5, d = BED_ROWS * BED_SP + 0.5;
  box(w, 0.2, d, 0x8a4b2c, 0, 0.1, 0, g, false);
  box(w - 0.3, 0.04, d - 0.3, 0x6e3a20, 0, 0.21, 0, g, false);
  scene.add(g);
  const bed = { area: A, slot, x, z, product: A.product, group: g, plants: [], gardener: null, plow: null };
  for (let i = 0; i < BED_COLS; i++) for (let j = 0; j < BED_ROWS; j++) {
    const m = new THREE.Mesh(PRODUCTS[A.product].plant, VC_MAT);
    m.castShadow = true;
    const px = (i - (BED_COLS - 1) / 2) * BED_SP, pz = (j - (BED_ROWS - 1) / 2) * BED_SP;
    m.position.set(px, 0.2, pz);
    m.rotation.y = rand(0, TAU);
    g.add(m);
    const p = { bed, mesh: m, x: x + px, z: z + pz, grown: true, timer: 0, grow: 1, reservedBy: null };
    bed.plants.push(p);
    plants.push(p);
  }
  A.beds[slot] = bed;
  if (!instant) { popIn(g); burst(x, z); }
  return bed;
}
function updatePlants(dt) {
  for (const p of plants) {
    if (!p.grown) {
      p.timer -= dt * (p.bed.plow ? 1.8 : 1);
      if (p.timer <= 0) { p.grown = true; p.grow = 0; p.mesh.visible = true; }
    } else if (p.grow < 1) {
      p.grow = Math.min(1, p.grow + dt * 3);
      const k = p.grow;
      p.mesh.scale.setScalar(Math.max(0.001, k < 1 ? k * (1 + Math.sin(k * Math.PI) * 0.3) : 1));
    }
  }
}
// Raccoglie una pianta: ritorna i prodotti (2 se l'aiuola ha l'aratro)
function harvest(p, room) {
  p.grown = false;
  p.timer = REGROW + rand(0, 1.5);
  p.mesh.visible = false;
  p.reservedBy = null;
  const n = Math.min(room, p.bed.plow ? 2 : 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = makeItem(p.bed.product);
    m.position.set(p.x, 0.3 + i * 0.2, p.z);
    out.push(m);
  }
  return out;
}

function buildPlow(bed, instant) {
  const m = new THREE.Mesh(TRACTOR_GEO, VC_MAT);
  m.castShadow = true;
  m.position.set(bed.x, 0.2, bed.z);
  scene.add(m);
  bed.plow = { mesh: m, t: rand(0, 10) };
  if (!instant) { popIn(m); burst(bed.x, bed.z, 40); }
}
function updatePlows(dt) {
  for (const A of areas) for (const bed of A.beds) {
    if (!bed || !bed.plow) continue;
    const pl = bed.plow;
    pl.t += dt;
    // Il trattorino percorre l'aiuola avanti e indietro
    const nx = bed.x + Math.sin(pl.t * 0.35) * 0.95, nz = bed.z + Math.sin(pl.t * 0.9) * 1.6;
    const dx = nx - pl.mesh.position.x, dz = nz - pl.mesh.position.z;
    if (Math.hypot(dx, dz) > 1e-4) pl.mesh.rotation.y = Math.atan2(dx, dz);
    pl.mesh.position.set(nx, 0.2 + Math.abs(Math.sin(pl.t * 12)) * 0.02, nz);
  }
}

// ---------------------------------------------------------------------
//  Giocatore
// ---------------------------------------------------------------------
const player = makeCharacter({
  skin: 0xf6cfa8, shirt: 0xffffff, pants: 0x3a6fc4, hair: 0x7a4a1e, apron: 0x4caf50, hat: 'straw', shoes: 0x5a3a22,
});
player.group.position.set(-2.8, 0, 2.6);
scene.add(player.group);
const playerStack = new Stack(player.group, carryLayout);
playerStack.group.position.set(0, 0.98, 0.42);
const vel = new THREE.Vector2();
let lean = 0;

const maxLabel = new THREE.Sprite(new THREE.SpriteMaterial({
  map: canvasTex(128, 64, (ctx, w, h) => {
    ctx.font = '900 46px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = '#fff'; ctx.strokeText('MAX', w / 2, h / 2);
    ctx.fillStyle = '#e8304f'; ctx.fillText('MAX', w / 2, h / 2);
  }), depthTest: false,
}));
maxLabel.scale.set(1.3, 0.65, 1);
maxLabel.renderOrder = 10;
maxLabel.visible = false;
player.group.add(maxLabel);

// ---------------------------------------------------------------------
//  Aiutanti: giardinieri (uno per aiuola) e cassiere (una per spiazzale)
// ---------------------------------------------------------------------
const gardeners = [];
function hireGardener(bed, instant) {
  const pad = bedPadPos(bed.area.k, bed.slot);
  const ch = makeCharacter({
    skin: pick(SKINS), shirt: 0x8bc34a, pants: 0x6b4f2a, hair: pick(HAIRS), hat: 'cap', capColor: 0x2e7d32,
  });
  ch.group.position.set(pad.x, 0, pad.z);
  scene.add(ch.group);
  const stack = new Stack(ch.group, carryLayout);
  stack.group.position.set(0, 0.98, 0.42);
  const gd = { ch, stack, bed, target: null, timer: 0, mode: 'harvest' };
  bed.gardener = gd;
  gardeners.push(gd);
  if (!instant) { popIn(ch.group); burst(pad.x, pad.z, 30); }
}
function hireCashier(A, px, pz, instant) {
  const ch = makeCharacter({
    skin: pick(SKINS), shirt: [0x9b59b6, 0x2f7fd0, 0xe2455f][A.k], pants: 0x2c3e50, hair: pick(HAIRS),
    hairStyle: 'bun', apron: 0xffffff,
  });
  ch.group.position.set(instant ? A.post.x : px, 0, instant ? A.post.z : pz);
  scene.add(ch.group);
  A.cashier = { ch, atPost: !!instant };
  if (!instant) { popIn(ch.group); burst(px, pz, 30); }
}

function updateGardeners(dt) {
  for (const gd of gardeners) {
    const ch = gd.ch, p = ch.group.position, bed = gd.bed, A = bed.area;
    gd.timer -= dt;
    if (gd.mode === 'harvest') {
      if (gd.target && (!gd.target.grown || gd.target.reservedBy !== gd)) gd.target = null;
      if (!gd.target && gd.stack.total < state.gardenerCap) {
        let best = null, bd = Infinity;
        for (const pl of bed.plants) {
          if (!pl.grown || pl.grow < 1 || pl.reservedBy) continue;
          const d = distXZ(p, pl.x, pl.z);
          if (d < bd) { bd = d; best = pl; }
        }
        if (best) { best.reservedBy = gd; gd.target = best; }
      }
      if (gd.target) {
        if (moveTo(ch, gd.target.x, gd.target.z, 3.4, dt)) {
          for (const m of harvest(gd.target, state.gardenerCap - gd.stack.total)) {
            fly(m, gd.stack.reserve(), 0.22, 0.5, (mm) => gd.stack.receive(mm));
          }
          gd.target = null;
        }
      } else if (gd.stack.total > 0) {
        gd.mode = 'deliver';
      } else {
        // Aspetta accanto all'aiuola che i fiori ricrescano
        if (moveTo(ch, bed.x + 2.1, bed.z + 0.6, 3, dt)) turnTowards(ch, -1, 0, dt);
      }
      if (gd.stack.total >= state.gardenerCap) gd.mode = 'deliver';
    } else {
      if (gd.target) { gd.target.reservedBy = null; gd.target = null; }
      if (moveTo(ch, A.drop.x, A.drop.z, 3.4, dt)) {
        turnTowards(ch, -A.drop.x, -A.drop.z + A.cz, dt);
        if (gd.stack.count > 0 && gd.timer <= 0 && A.counter.total < COUNTER_CAP) {
          gd.timer = 0.09;
          const m = gd.stack.pop();
          fly(m, A.counter.reserve(), 0.25, 0.7, (mm) => A.counter.receive(mm));
          sfx('drop');
        }
        if (gd.stack.total === 0) gd.mode = 'harvest';
      }
    }
    animateChar(ch, ch.speed || 0, dt, gd.stack.total > 0);
  }
  for (const A of areas) {
    const c = A.cashier;
    if (!c) continue;
    if (!c.atPost) {
      if (moveTo(c.ch, A.post.x, A.post.z, 3, dt)) c.atPost = true;
    } else {
      c.ch.speed = 0;
      turnTowards(c.ch, 0, -1, dt);
    }
    animateChar(c.ch, c.ch.speed || 0, dt, false);
  }
}

// ---------------------------------------------------------------------
//  Clienti (ogni spiazzale ha la sua fila)
// ---------------------------------------------------------------------
function drawBubble(ctx, w, h, product, n) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#262b36';
  roundRect(ctx, 6, 6, w - 12, h - 30, 22); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w / 2 - 14, h - 25); ctx.lineTo(w / 2, h - 6); ctx.lineTo(w / 2 + 14, h - 25); ctx.fill();
  drawProduct(ctx, product, 48, 52, 1.35);
  ctx.font = '900 58px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(n), 110, 54);
}

function spawnCustomer(A) {
  const ch = makeCharacter({
    skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIRS),
    hairStyle: pick(['short', 'long', 'bun', 'short']),
  });
  ch.group.position.set(13, 0, A.queue.z + rand(-0.3, 0.3));
  scene.add(ch.group);
  const stack = new Stack(ch.group, carryLayout);
  stack.group.position.set(0, 0.98, 0.42);
  const maxWant = Math.min(7, 3 + Math.floor(state.stage / 4));
  const want = randInt(1, maxWant);
  const c = document.createElement('canvas');
  c.width = 160; c.height = 120;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  bubble.scale.set(1.25, 0.94, 1);
  bubble.position.y = 2.35;
  bubble.renderOrder = 11;
  bubble.visible = false;
  ch.group.add(bubble);
  A.customers.push({ ch, stack, want, bubble, canvas: c, tex, shown: -1, speed: rand(3, 3.5), wp: 0 });
}

function refreshBubble(A, cu) {
  const left = cu.want - cu.stack.total;
  if (left === cu.shown) return;
  cu.shown = left;
  drawBubble(cu.canvas.getContext('2d'), cu.canvas.width, cu.canvas.height, A.product, left);
  cu.tex.needsUpdate = true;
}

// Più aiutanti lavorano nello spiazzale, più clienti arrivano
function spawnInterval(A) {
  let boost = 1;
  for (const bed of A.beds) {
    if (!bed) continue;
    boost += 0.45;
    if (bed.gardener) boost += 0.9;
    if (bed.plow) boost += 0.9;
  }
  if (A.cashier) boost += 0.4;
  return Math.max(0.45, 3.4 / boost);
}

function updateCustomers(A, dt) {
  A.spawnTimer -= dt;
  if (A.spawnTimer <= 0 && A.customers.length < QUEUE_MAX) {
    const s = spawnInterval(A);
    A.spawnTimer = rand(s * 0.7, s * 1.3);
    spawnCustomer(A);
  }
  A.customers.forEach((cu, i) => {
    const arrived = moveTo(cu.ch, A.queue.x + i * A.queue.step, A.queue.z, cu.speed, dt);
    if (arrived) turnTowards(cu.ch, i === 0 ? 0 : -1, i === 0 ? 1 : 0, dt);
    cu.arrived = arrived;
    cu.bubble.visible = i === 0 && arrived && cu.stack.total < cu.want;
    if (cu.bubble.visible) refreshBubble(A, cu);
    animateChar(cu.ch, arrived ? 0 : cu.speed, dt, cu.stack.total > 0);
  });
  for (let i = A.leaving.length - 1; i >= 0; i--) {
    const cu = A.leaving[i];
    const w = A.exit[cu.wp];
    if (moveTo(cu.ch, w.x, w.z, cu.speed, dt)) {
      cu.wp++;
      if (cu.wp >= A.exit.length) {
        scene.remove(cu.ch.group);
        cu.tex.dispose();
        cu.bubble.material.dispose();
        A.leaving.splice(i, 1);
        continue;
      }
    }
    animateChar(cu.ch, cu.speed, dt, true);
  }
}

// ---------------------------------------------------------------------
//  Vendita
// ---------------------------------------------------------------------
function payOut(A, amount) {
  // Le banconote volano dal bancone alla pedana dei soldi
  const price = priceOf(A.product);
  const nBills = Math.max(1, Math.min(Math.floor(amount / price), 12));
  const each = Math.floor(amount / nBills);
  const rest = amount - each * nBills;
  for (let i = 0; i < nBills; i++) {
    const value = each + (i === 0 ? rest : 0);
    if (A.cashStack.total >= CASH_VISIBLE) { A.cashBonus += value; continue; }
    const m = makeBill();
    m.userData.value = value;
    m.position.set(0, 1.2, A.cz);
    setTimeout(() => fly(m, A.cashStack.reserve(), 0.45, 1.2, (mm) => A.cashStack.receive(mm)), i * 60);
  }
  sfx('sell');
}

function updateSelling(A, dt) {
  A.sellTimer -= dt;
  const playerSelling = distXZ(player.group.position, A.sell.x, A.sell.z) < A.sell.r;
  const seller = playerSelling || (A.cashier && A.cashier.atPost);
  A.sellPad.mesh.material.map = seller ? sellTexOn : sellTexOff;
  const front = A.customers[0];
  if (!front || !front.arrived || !seller || A.counter.count === 0 || A.sellTimer > 0) return;
  if (front.stack.total >= front.want) return;
  A.sellTimer = 0.12;
  const m = A.counter.pop();
  fly(m, front.stack.reserve(), 0.28, 0.8, (mm) => {
    front.stack.receive(mm);
    sfx('drop');
    if (front.stack.count >= front.want && !front.paid) {
      front.paid = true;
      payOut(A, front.want * priceOf(A.product));
      A.customers.splice(A.customers.indexOf(front), 1);
      front.bubble.visible = false;
      A.leaving.push(front);
    }
  });
}

// ---------------------------------------------------------------------
//  Sblocchi (pedane da pagare)
// ---------------------------------------------------------------------
const shopPos = (k) => ({ x: -1.8, z: czOf(k) + 5.4 });
const U = {
  bed: (k, s, cost) => ({ name: 'Nuova aiuola', desc: PRODUCTS[AREA_PRODUCTS[k]].name, icon: AREA_PRODUCTS[k], cost,
    ...bedPos(k, s), apply: (i) => addBed(areas[k], s, i) }),
  gardener: (k, s, cost) => ({ name: 'Giardiniere', desc: 'per questa aiuola', cost, ...bedPadPos(k, s),
    apply: (i) => hireGardener(areas[k].beds[s], i) }),
  plow: (k, s, cost) => ({ name: 'Aratro', desc: 'raccolto doppio!', cost, ...bedPadPos(k, s),
    apply: (i) => buildPlow(areas[k].beds[s], i) }),
  cashier: (k, cost) => ({ name: 'Cassiera', desc: 'vende al posto tuo', cost, x: -3.4, z: czOf(k) + 4.4,
    apply: (i) => hireCashier(areas[k], -3.4, czOf(k) + 4.4, i) }),
  area: (k, cost) => ({ name: 'Nuovo spiazzale', desc: PRODUCTS[AREA_PRODUCTS[k]].name, icon: AREA_PRODUCTS[k], cost,
    x: 0, z: czOf(k - 1) - 7.4, apply: (i) => buildArea(k, i) }),
  shop: (k, name, desc, cost, fn) => ({ name, desc, cost, ...shopPos(k), apply: fn }),
};
const UPGRADES = [
  // Spiazzale 1: rose
  U.bed(0, 1, 20),
  U.cashier(0, 40),
  U.gardener(0, 0, 70),
  U.shop(0, 'Braccia forti', '+10 in braccio', 100, () => { state.capacity += 10; }),
  U.plow(0, 0, 140),
  U.gardener(0, 1, 190),
  U.plow(0, 1, 250),
  // Spiazzale 2: margherite
  U.area(1, 350),
  U.bed(1, 1, 420),
  U.cashier(1, 500),
  U.gardener(1, 0, 600),
  U.shop(1, 'Scarpe veloci', 'corri più veloce', 700, () => { state.speed *= 1.25; }),
  U.plow(1, 0, 800),
  U.gardener(1, 1, 950),
  U.plow(1, 1, 1100),
  U.shop(1, 'Carta regalo', 'tutto costa +$1', 1300, () => { state.priceBonus += 1; }),
  // Spiazzale 3: fragole
  U.area(2, 1600),
  U.bed(2, 1, 1900),
  U.cashier(2, 2200),
  U.gardener(2, 0, 2600),
  U.plow(2, 0, 3000),
  U.shop(2, 'Cesti grandi', 'aiutanti +4', 3400, () => { state.gardenerCap += 4; }),
  U.gardener(2, 1, 3800),
  U.plow(2, 1, 4300),
  U.shop(2, 'Braccia forti', '+10 in braccio', 5000, () => { state.capacity += 10; }),
  { name: 'Fontana', desc: 'il giardino più bello!', cost: 6000, x: 4.6, z: 5.6, apply: (i) => buildFountain(4.6, 5.6, i) },
];
function getUpgrade(i) {
  if (i < UPGRADES.length) return UPGRADES[i];
  const k = i - UPGRADES.length;
  return U.shop(AREA_PRODUCTS.length - 1, 'Prezzi più alti', 'tutto costa +$1',
    Math.round(7000 * Math.pow(1.5, k) / 10) * 10, () => { state.priceBonus += 1; });
}

let fountain = null;
function buildFountain(x, z, instant) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const stone = 0xece6d6;
  const addM = (geo, color, y, basic) => {
    const m = new THREE.Mesh(geo, basic ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }) : mat(color));
    m.position.y = y; m.castShadow = !basic; m.receiveShadow = true;
    g.add(m);
    return m;
  };
  addM(new THREE.CylinderGeometry(1.7, 1.8, 0.5, 28), stone, 0.25);
  addM(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 28), 0x5ec8f0, 0.48, true);
  addM(new THREE.CylinderGeometry(0.22, 0.3, 1.4, 14), stone, 0.9);
  addM(new THREE.CylinderGeometry(0.7, 0.4, 0.2, 20), stone, 1.6);
  addM(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 20), 0x5ec8f0, 1.7, true);
  const jet = addM(new THREE.CylinderGeometry(0.05, 0.12, 0.7, 10), 0xbdeeff, 2.0, true);
  g.userData.jet = jet;
  scene.add(g);
  fountain = g;
  obstacles.push({ x, z, hw: 1.7, hd: 1.7, rot: 0 });
  if (!instant) { popIn(g); burst(x, z, 80); }
}

let currentPad = null;
function drawPad(ctx, w, h, up, remaining) {
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 12, 12, w - 24, h - 24, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fill();
  const prog = 1 - remaining / up.cost;
  if (prog > 0) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(76, 205, 92, 0.85)';
    ctx.fillRect(0, h - h * prog, w, h * prog);
    ctx.restore();
  }
  roundRect(ctx, 12, 12, w - 24, h - 24, 36);
  ctx.lineWidth = 12; ctx.strokeStyle = '#3fd0ff'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2b3a1e';
  ctx.font = '900 36px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(up.name, w / 2, 56, w - 44);
  if (up.desc) {
    ctx.font = '700 24px "Trebuchet MS", Arial, sans-serif';
    ctx.fillStyle = '#4b5a3e';
    ctx.fillText(up.desc, w / 2 + (up.icon ? 14 : 0), 92, w - 70);
    if (up.icon) {
      const tw = Math.min(ctx.measureText(up.desc).width, w - 70);
      drawProduct(ctx, up.icon, w / 2 - tw / 2 - 6, 92, 0.65);
    }
  }
  drawBillIcon(ctx, 70, 160, 1.3);
  ctx.font = '900 52px "Trebuchet MS", Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 9; ctx.strokeStyle = '#2b3a1e';
  ctx.textAlign = 'left';
  ctx.strokeText(fmt(remaining), 112, 164);
  ctx.fillText(fmt(remaining), 112, 164);
}
function spawnPad(index, paid = 0) {
  const up = getUpgrade(index);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const pad = makePadMesh(2.5, tex);
  pad.group.position.set(up.x, 0.04, up.z);
  popIn(pad.group);
  currentPad = { up, index, paid: Math.min(paid, up.cost - 1), canvas: c, tex, ...pad, shown: -1, stand: 0, acc: 0, fx: 0 };
  redrawPad();
}
function redrawPad() {
  const p = currentPad;
  const rem = p.up.cost - p.paid;
  if (rem === p.shown) return;
  p.shown = rem;
  drawPad(p.canvas.getContext('2d'), 256, 256, p.up, rem);
  p.tex.needsUpdate = true;
}
function completePad() {
  const p = currentPad;
  scene.remove(p.group);
  p.tex.dispose();
  p.mesh.material.dispose();
  p.mesh.geometry.dispose();
  currentPad = null;
  p.up.apply(false);
  burst(p.up.x, p.up.z, 60);
  sfx('buy');
  state.stage++;
  save();
  setTimeout(() => spawnPad(state.stage), 700);
}
function updatePad(dt) {
  const p = currentPad;
  if (!p) return;
  const on = distXZ(player.group.position, p.up.x, p.up.z) < 1.25;
  p.stand = on ? p.stand + dt : 0;
  if (p.stand > 0.25 && state.money > 0) {
    const rate = Math.max(18, p.up.cost / 1.6);
    p.acc += rate * dt;
    let amt = Math.floor(p.acc);
    p.acc -= amt;
    amt = Math.min(amt, state.money, p.up.cost - p.paid);
    if (amt > 0) {
      state.money -= amt;
      p.paid += amt;
      updateMoney();
      p.fx -= dt;
      if (p.fx <= 0) {
        p.fx = 0.07;
        const m = makeBill();
        m.position.copy(player.group.position).y += 1.4;
        const to = new THREE.Vector3(p.up.x, 0.1, p.up.z);
        fly(m, () => to, 0.3, 1, () => { });
        sfx('pay');
      }
    }
    redrawPad();
    if (p.paid >= p.up.cost) completePad();
  }
}

// ---------------------------------------------------------------------
//  Freccia guida + suggerimenti
// ---------------------------------------------------------------------
const arrow = new THREE.Group();
{
  const m = new THREE.MeshLambertMaterial({ color: 0x47b4ff, emissive: 0x1b5f9a });
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 4), m);
  head.rotation.x = Math.PI; head.rotation.y = Math.PI / 4;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.6, 0.32), m);
  shaft.position.y = 0.6; shaft.rotation.y = Math.PI / 4;
  arrow.add(head, shaft);
  arrow.traverse((o) => { o.castShadow = true; });
  scene.add(arrow);
}
const hintEl = document.getElementById('hint');
let hintText = '';
function setHint(text) {
  if (text === hintText) return;
  hintText = text;
  if (text) hintEl.textContent = text;
  hintEl.classList.toggle('show', !!text);
}
const arrowPos = new THREE.Vector3();
function nearestTo(pp, list) {
  let best = null, bd = Infinity;
  for (const it of list) {
    const d = distXZ(pp, it.x, it.z);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
function updateGuide(t) {
  const pp = player.group.position;
  let target = null, hint = '';
  const pad = currentPad;
  const padLeft = pad ? pad.up.cost - pad.paid : Infinity;
  const tutorial = state.stage < 4;
  const top = playerStack.items[playerStack.count - 1];
  const sellArea = top && areaOfProduct(top.userData.product);
  if (pad && state.money >= padLeft) {
    target = pad.up; hint = 'Sblocca: ' + pad.up.name + '!';
  } else if (tutorial && areas[0].cashStack.count > 0) {
    target = areas[0].cash; hint = 'Raccogli i soldi!';
  } else if (tutorial && sellArea && sellArea.counter.total < COUNTER_CAP) {
    target = sellArea.sell; hint = 'Porta i fiori al bancone!';
  } else if (tutorial && !areas[0].cashier && areas[0].counter.count > 0 && areas[0].customers[0]?.arrived) {
    target = areas[0].sell; hint = 'Resta su VENDI per servire i clienti!';
  } else if (tutorial) {
    target = nearestTo(pp, plants.filter((p) => p.grown));
    if (target) hint = 'Raccogli i fiori!';
  } else if (!pad || state.money < padLeft) {
    // Dopo il tutorial: segnala la pila di soldi più grande se è bella alta
    const rich = areas.filter((a) => a.cashStack.count >= 40).sort((a, b) => b.cashStack.count - a.cashStack.count)[0];
    if (rich) target = rich.cash;
  }
  // Nasconde la freccia quando ci sei già sopra
  if (target && distXZ(pp, target.x, target.z) < 1.0) target = null;
  arrow.visible = !!target;
  if (target) {
    arrowPos.set(target.x, 2.6 + Math.sin(t * 6) * 0.25, target.z);
    arrow.position.lerp(arrowPos, arrow.userData.init ? 0.2 : 1);
    arrow.userData.init = true;
    arrow.rotation.y += 0.02;
  } else {
    arrow.userData.init = false;
  }
  setHint(hint);
}

// ---------------------------------------------------------------------
//  Input: joystick virtuale + tastiera
// ---------------------------------------------------------------------
const joyEl = document.getElementById('joy');
const knobEl = document.getElementById('knob');
const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const JOY_R = 50;
canvas.addEventListener('pointerdown', (e) => {
  if (joy.active) return;
  initAudio();
  joy.active = true; joy.id = e.pointerId;
  joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = joy.dy = 0;
  joyEl.style.display = 'block';
  joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px';
  knobEl.style.transform = '';
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
  joy.dx = dx / JOY_R; joy.dy = dy / JOY_R;
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
});
const endJoy = (e) => {
  if (e.pointerId !== joy.id) return;
  joy.active = false; joy.id = null; joy.dx = joy.dy = 0;
  joyEl.style.display = 'none';
};
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);
addEventListener('contextmenu', (e) => e.preventDefault());

const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.code); initAudio(); });
addEventListener('keyup', (e) => keys.delete(e.code));

function inputVector() {
  let sx = joy.dx, sy = joy.dy;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) sy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) sy += 1;
  const len = Math.hypot(sx, sy);
  if (len > 1) { sx /= len; sy /= len; }
  if (len < 0.12) return null;
  // Da direzione sullo schermo a direzione nel mondo (camera isometrica a 45°)
  return { x: (sx + sy) / Math.SQRT2, z: (sy - sx) / Math.SQRT2 };
}

// ---------------------------------------------------------------------
//  Logica del giocatore
// ---------------------------------------------------------------------
let harvestTimer = 0, depositTimer = 0, collectTimer = 0;
function updatePlayer(dt) {
  const p = player.group.position;
  const dir = inputVector();
  const targetV = dir ? { x: dir.x * state.speed, z: dir.z * state.speed } : { x: 0, z: 0 };
  vel.x += (targetV.x - vel.x) * Math.min(1, dt * 14);
  vel.y += (targetV.z - vel.y) * Math.min(1, dt * 14);
  p.x += vel.x * dt;
  p.z += vel.y * dt;
  // Collisioni
  const r = 0.35;
  for (const o of obstacles) {
    // Porta il giocatore nel sistema locale dell'ostacolo
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const dx = p.x - o.x, dz = p.z - o.z;
    let u = dx * c - dz * s, v = dx * s + dz * c;
    const ex = o.hw + r, ez = o.hd + r;
    if (Math.abs(u) < ex && Math.abs(v) < ez) {
      if (ex - Math.abs(u) < ez - Math.abs(v)) u = Math.sign(u) * ex; else v = Math.sign(v) * ez;
      p.x = o.x + u * c + v * s;
      p.z = o.z - u * s + v * c;
    }
  }
  p.x = clamp(p.x, BOUNDS.minX, BOUNDS.maxX);
  p.z = clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ);
  const speed = Math.hypot(vel.x, vel.y);
  if (speed > 0.3) turnTowards(player, vel.x, vel.y, dt, 14);
  animateChar(player, speed, dt, playerStack.total > 0);

  // La torre di prodotti ondeggia quando corri
  lean += ((speed / state.speed) - lean) * Math.min(1, dt * 5);
  playerStack.items.forEach((m, i) => {
    m.position.z = -lean * 0.0035 * i * i;
    m.position.x = Math.sin(performance.now() / 300 + i * 0.3) * 0.004 * i * lean;
  });
  maxLabel.visible = playerStack.total >= state.capacity;
  maxLabel.position.set(0, 1.5 + Math.max(playerStack.count, 3) * ITEM_H + 0.4, 0.42);

  // Raccolta
  harvestTimer -= dt;
  const room = state.capacity - playerStack.total;
  if (harvestTimer <= 0 && room > 0) {
    for (const pl of plants) {
      if (pl.grown && pl.grow >= 1 && distXZ(p, pl.x, pl.z) < 0.95) {
        if (pl.reservedBy) pl.reservedBy.target = null;
        for (const m of harvest(pl, room)) {
          fly(m, playerStack.reserve(), 0.22, 0.6, (mm) => playerStack.receive(mm));
        }
        sfx('pick');
        harvestTimer = 0.06;
        break;
      }
    }
  }
  depositTimer -= dt;
  collectTimer -= dt;
  for (const A of areas) {
    // Consegna al bancone (solo i prodotti di questo spiazzale)
    if (depositTimer <= 0 && A.counter.total < COUNTER_CAP && distXZ(p, A.sell.x, A.sell.z) < A.sell.r + 0.3) {
      const m = playerStack.takeWhere((it) => it.userData.product === A.product);
      if (m) {
        depositTimer = 0.07;
        fly(m, A.counter.reserve(), 0.25, 0.7, (mm) => A.counter.receive(mm));
        sfx('drop');
      }
    }
    // Raccolta soldi
    if (collectTimer <= 0 && A.cashStack.count > 0 && distXZ(p, A.cash.x, A.cash.z) < A.cash.r) {
      collectTimer = 0.025;
      const n = Math.min(A.cashStack.count, Math.max(1, Math.ceil(A.cashStack.count / 25)));
      for (let i = 0; i < n; i++) {
        const m = A.cashStack.pop();
        const value = m.userData.value + A.cashBonus;
        A.cashBonus = 0;
        fly(m, () => _v.copy(player.group.position).setY(1.6), 0.22, 0.6, () => {
          state.money += value;
          updateMoney(true);
          sfx('coin');
        });
      }
    }
  }
}

// ---------------------------------------------------------------------
//  HUD
// ---------------------------------------------------------------------
const moneyEl = document.getElementById('money');
const moneyText = document.getElementById('moneyText');
function updateMoney(bump) {
  moneyText.textContent = fmt(state.money);
  if (bump) {
    moneyEl.classList.remove('bump');
    void moneyEl.offsetWidth;
    moneyEl.classList.add('bump');
  }
}
const muteBtn = document.getElementById('mute');
const refreshMute = () => { muteBtn.textContent = muted ? '🔇' : '🔊'; };
refreshMute();
muteBtn.addEventListener('click', () => {
  muted = !muted;
  initAudio();
  refreshMute();
  try { localStorage.setItem('flowerTycoon.muted', muted ? '1' : '0'); } catch { }
});
const menu = document.getElementById('menu');
let paused = true;
let resetting = false;
document.getElementById('menuBtn').addEventListener('click', () => { paused = true; menu.classList.remove('hidden'); });
document.getElementById('resume').addEventListener('click', () => { paused = false; menu.classList.add('hidden'); });
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Vuoi davvero ricominciare da zero? Perderai tutti i progressi.')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch { }
  resetting = true;
  location.reload();
});
document.getElementById('play').addEventListener('click', () => {
  initAudio();
  document.getElementById('start').classList.add('hidden');
  paused = false;
});
addEventListener('visibilitychange', () => { if (document.hidden && !resetting) save(); });
addEventListener('pagehide', () => { if (!resetting) save(); });

// ---------------------------------------------------------------------
//  Avvio: costruisce il mondo dal salvataggio
// ---------------------------------------------------------------------
buildArea(0, true);
if (loaded && typeof loaded.stage === 'number') {
  state.money = Math.max(0, loaded.money | 0);
  for (let i = 0; i < loaded.stage; i++) getUpgrade(i).apply(true);
  state.stage = loaded.stage;
}
spawnPad(state.stage, loaded ? Math.max(0, loaded.padPaid | 0) : 0);
updateMoney();
setInterval(() => { if (!paused) save(); }, 4000);

// ---------------------------------------------------------------------
//  Ciclo principale
// ---------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;
const debug = { timeScale: 1 };
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05) * debug.timeScale;
  if (!paused) {
    elapsed += dt;
    updatePlayer(dt);
    updatePlants(dt);
    updatePlows(dt);
    updateGardeners(dt);
    for (const A of areas) { updateCustomers(A, dt); updateSelling(A, dt); }
    updatePad(dt);
    updateGuide(elapsed);
    if (fountain) fountain.userData.jet.scale.y = 1 + Math.sin(elapsed * 8) * 0.12;
  }
  updateFlyers(dt);
  updateFx(dt);
  // Camera che segue il giocatore
  camTarget.lerp(player.group.position, Math.min(1, dt * 5));
  camera.position.copy(camTarget).add(CAM_OFFSET);
  camera.lookAt(camTarget);
  sun.position.copy(camTarget).add(new THREE.Vector3(-6, 16, 8));
  sun.target.position.copy(camTarget);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Utile per i test automatici
window.__game = {
  debug, state, player, plants, areas, playerStack, get pad() { return currentPad; },
};
