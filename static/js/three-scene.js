/**
 * STRATA Three.js 3D Visualizer
 * Hero floating constellation network & Forge 3D Microstructure Visualizer
 * Restored to exact visual fidelity of the original STRATA design
 */

/* =====================================================================
   THREE.JS — HERO CONSTELLATION & ORBITS
===================================================================== */
let heroScene, heroCam, heroRenderer, heroGroup;

export function initHero() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  heroScene = new THREE.Scene();
  heroCam = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  heroCam.position.set(0, 0, 26);
  heroRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  heroRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  heroRenderer.setSize(window.innerWidth, window.innerHeight);

  heroGroup = new THREE.Group();
  heroScene.add(heroGroup);

  const colors = [0x4F9C86, 0xE8A23D, 0x6C90AD];
  // lattice of nodes + connecting edges, like a crystal / molecular structure
  const nodeCount = 90;
  const positions = [];
  const nodeGeo = new THREE.SphereGeometry(0.16, 12, 12);
  for (let i = 0; i < nodeCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const rad = 9 + Math.random() * 6;
    const x = rad * Math.sin(phi) * Math.cos(theta);
    const y = rad * Math.sin(phi) * Math.sin(theta) * 0.6;
    const z = rad * Math.cos(phi);
    positions.push(new THREE.Vector3(x, y, z));
    const mat = new THREE.MeshBasicMaterial({ color: colors[i % 3], transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(nodeGeo, mat);
    mesh.position.copy(positions[i]);
    heroGroup.add(mesh);
  }

  // connect nearby nodes with thin lines for a lattice look
  const lineMat = new THREE.LineBasicMaterial({ color: 0x2A2E33, transparent: true, opacity: 0.5 });
  const linePts = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (positions[i].distanceTo(positions[j]) < 4.2) {
        linePts.push(positions[i], positions[j]);
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
  heroGroup.add(new THREE.LineSegments(lineGeo, lineMat));

  // orbiting rings (esoteric flourish)
  for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.TorusGeometry(11 + i * 2.2, 0.02, 8, 100);
    const ringMat = new THREE.MeshBasicMaterial({ color: colors[i], transparent: true, opacity: 0.35 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2 + i * 0.5;
    ring.rotation.y = i * 0.7;
    heroGroup.add(ring);
  }

  window.addEventListener('resize', () => {
    if (!heroCam || !heroRenderer) return;
    heroCam.aspect = window.innerWidth / window.innerHeight;
    heroCam.updateProjectionMatrix();
    heroRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  animateHero();
}

function animateHero() {
  requestAnimationFrame(animateHero);
  if (heroGroup) {
    heroGroup.rotation.y += 0.0012;
    heroGroup.rotation.x = Math.sin(Date.now() * 0.0001) * 0.15;
  }
  if (heroRenderer && heroScene && heroCam) {
    heroRenderer.render(heroScene, heroCam);
  }
}

/* =====================================================================
   THREE.JS — FORGE MICROSTRUCTURE VISUAL
===================================================================== */
let forgeScene, forgeCam, forgeRenderer, forgeGroup;
let dragging = false, lastX = 0, lastY = 0, rotY = 0.4, rotX = -0.25;

export function initForge() {
  const canvas = document.getElementById('forge-canvas');
  const wrap = document.getElementById('forge-canvas-wrap');
  if (!canvas || !wrap || typeof THREE === 'undefined') return;

  forgeScene = new THREE.Scene();
  forgeCam = new THREE.PerspectiveCamera(45, wrap.clientWidth / wrap.clientHeight, 0.1, 100);
  forgeCam.position.set(0, 0, 11);
  forgeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  forgeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  forgeRenderer.setSize(wrap.clientWidth, wrap.clientHeight);

  const light1 = new THREE.DirectionalLight(0xffffff, 1.1);
  light1.position.set(4, 6, 8);
  forgeScene.add(light1);
  forgeScene.add(new THREE.AmbientLight(0x556677, 0.9));

  forgeGroup = new THREE.Group();
  forgeScene.add(forgeGroup);

  canvas.addEventListener('mousedown', e => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => dragging = false);
  window.addEventListener('mousemove', e => {
    if (!dragging || !forgeGroup) return;
    rotY += (e.clientX - lastX) * 0.006;
    rotX += (e.clientY - lastY) * 0.006;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  canvas.addEventListener('touchstart', e => {
    dragging = true;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', () => dragging = false);
  window.addEventListener('touchmove', e => {
    if (!dragging || !forgeGroup) return;
    rotY += (e.touches[0].clientX - lastX) * 0.006;
    rotX += (e.touches[0].clientY - lastY) * 0.006;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (!forgeCam || !forgeRenderer || !wrap) return;
    forgeCam.aspect = wrap.clientWidth / wrap.clientHeight;
    forgeCam.updateProjectionMatrix();
    forgeRenderer.setSize(wrap.clientWidth, wrap.clientHeight);
  });

  animateForge();
}

export function addReinforcementLayer(mat, vf, orientation, boxSize, layerIndex, totalLayers, angle) {
  if (!forgeGroup || !mat) return '';

  const reinfColor = mat.color || '#E8A23D';
  const metallic = new Set(['element', 'metal']);
  const reinfShininess = metallic.has(mat.cat) ? 110 : (mat.cat === 'ceramic' || mat.cat === 'filler') ? 60 : (mat.cat === 'synfiber' || mat.cat === 'natfiber') ? 25 : 15;
  const reinfMat = new THREE.MeshPhongMaterial({ color: reinfColor, shininess: reinfShininess });
  const Vfc = Math.min(Math.max(vf, 0.02), 0.74); // physical square-packing caps out near pi/4
  const layerShift = totalLayers > 1 ? (layerIndex / totalLayers - 0.5) * boxSize * 0.5 : 0;
  let tagSuffix = '';

  const orient = (orientation || 'uni').toString().toLowerCase().trim();

  if (orient === 'particulate') {
    const rp = 0.14;
    const boxVol = Math.pow(boxSize * 0.9, 3);
    let n = Math.round((Vfc * boxVol) / ((4 / 3) * Math.PI * Math.pow(rp, 3)));
    n = Math.min(n, 220);
    const geo = new THREE.SphereGeometry(rp, 10, 10);
    const placed = [];
    for (let i = 0; i < n; i++) {
      let pos, tries = 0;
      do {
        pos = new THREE.Vector3(
          (Math.random() - 0.5) * boxSize * 0.86,
          (Math.random() - 0.5) * boxSize * 0.86,
          (Math.random() - 0.5) * boxSize * 0.86
        );
        tries++;
      } while (tries < 6 && placed.some(p => p.distanceTo(pos) < rp * 1.9));
      placed.push(pos);
      const mesh = new THREE.Mesh(geo, reinfMat);
      mesh.position.copy(pos);
      forgeGroup.add(mesh);
    }
    tagSuffix = `${mat.name}: ${n} particles @ ${Math.round(Vfc * 100)}%`;
  } else if (orient === 'woven') {
    const rf = 0.07;
    const spacing = (2 * rf) * Math.sqrt(Math.PI / (4 * Vfc));
    const nSide = Math.min(13, Math.max(2, Math.floor((boxSize * 0.8) / spacing)));
    const actualVf = (nSide * nSide * Math.PI * rf * rf) / Math.pow(nSide * spacing, 2);
    const span = (nSide - 1) * spacing;
    const rodLen = Math.min(nSide * spacing, boxSize * 0.92);
    const warpGeo = new THREE.CylinderGeometry(rf, rf, rodLen, 8);
    const weftGeo = new THREE.CylinderGeometry(rf, rf, rodLen, 8);
    const plyPitch = spacing * 1.5;
    const plyCount = Math.min(5, Math.max(1, Math.floor((boxSize * 0.75) / plyPitch)));
    for (let p = 0; p < plyCount; p++) {
      const zPly = layerShift + (p - (plyCount - 1) / 2) * plyPitch;
      for (let i = 0; i < nSide; i++) {
        const warp = new THREE.Mesh(warpGeo, reinfMat);
        warp.position.set(i * spacing - span / 2, 0, zPly + (i % 2 === 0 ? rf * 1.15 : -rf * 1.15));
        forgeGroup.add(warp);
      }
      for (let j = 0; j < nSide; j++) {
        const weft = new THREE.Mesh(weftGeo, reinfMat);
        weft.rotation.z = Math.PI / 2;
        weft.position.set(0, j * spacing - span / 2, zPly + (j % 2 === 0 ? -rf * 1.15 : rf * 1.15));
        forgeGroup.add(weft);
      }
    }
    tagSuffix = `${mat.name}: plain-weave, ${plyCount} plies, spacing ${spacing.toFixed(2)}, areal Vf ≈ ${Math.round(actualVf * 100)}%`;
  } else if (orient === 'random') {
    const rf = 0.07;
    const spacing = (2 * rf) * Math.sqrt(Math.PI / (4 * Vfc));
    const nSide = Math.min(13, Math.max(2, Math.floor((boxSize * 0.8) / spacing)));
    const actualVf = (nSide * nSide * Math.PI * rf * rf) / Math.pow(nSide * spacing, 2);
    const count = nSide * nSide;
    const geo = new THREE.CylinderGeometry(rf * 0.95, rf * 0.95, boxSize * 0.34, 6);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, reinfMat);
      mesh.position.set(
        (Math.random() - 0.5) * boxSize * 0.86,
        (Math.random() - 0.5) * boxSize * 0.86,
        layerShift + (Math.random() - 0.5) * boxSize * 0.4
      );
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.35;
      forgeGroup.add(mesh);
    }
    tagSuffix = `${mat.name}: ${count} random chopped, areal Vf ≈ ${Math.round(actualVf * 100)}%`;
  } else {
    // Unidirectional or angled ply
    let plyAngleDeg = 0;
    if (angle !== undefined && angle !== null) plyAngleDeg = Number(angle);
    else if (!isNaN(Number(orient))) plyAngleDeg = Number(orient);
    else if (orient === 'uni') plyAngleDeg = 0;

    const angleRad = (plyAngleDeg * Math.PI) / 180;
    const rf = 0.07;
    const spacing = (2 * rf) * Math.sqrt(Math.PI / (4 * Vfc));
    const nSide = Math.min(13, Math.max(2, Math.floor((boxSize * 0.8) / spacing)));
    const actualVf = (nSide * nSide * Math.PI * rf * rf) / Math.pow(nSide * spacing, 2);
    const span = (nSide - 1) * spacing;
    const geo = new THREE.CylinderGeometry(rf, rf, boxSize * 0.92, 8);

    if (plyAngleDeg === 0) {
      for (let i = 0; i < nSide; i++) {
        for (let j = 0; j < nSide; j++) {
          const mesh = new THREE.Mesh(geo, reinfMat);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(i * spacing - span / 2, j * spacing - span / 2, layerShift);
          forgeGroup.add(mesh);
        }
      }
      tagSuffix = `${mat.name}: square-packed, spacing ${spacing.toFixed(2)}, areal Vf ≈ ${Math.round(actualVf * 100)}%`;
    } else {
      const rotZ = (Math.PI / 2) - angleRad;
      for (let i = 0; i < nSide; i++) {
        for (let j = 0; j < nSide; j++) {
          const d = i * spacing - span / 2;
          const mesh = new THREE.Mesh(geo, reinfMat);
          const posX = -d * Math.sin(angleRad);
          const posY = d * Math.cos(angleRad);
          mesh.position.set(posX, posY, layerShift + (j * spacing - span / 2) * 0.2);
          mesh.rotation.x = Math.PI / 2;
          mesh.rotation.z = rotZ;
          forgeGroup.add(mesh);
        }
      }
      tagSuffix = `${mat.name}: square-packed (${plyAngleDeg}°), spacing ${spacing.toFixed(2)}, areal Vf ≈ ${Math.round(actualVf * 100)}%`;
    }
  }
  return tagSuffix;
}

export function updateForgeVisual(m, hardener, reinfList) {
  if (!forgeGroup) return;
  while (forgeGroup.children.length) forgeGroup.remove(forgeGroup.children[0]);
  if (!m || !reinfList || !reinfList.length) return;

  const boxSize = 5;
  const matColor = m.color || '#556677';
  const metallic = new Set(['element', 'metal']);
  const matOpacity = metallic.has(m.cat) ? 0.38 : (m.cat === 'ceramic' ? 0.3 : 0.2);
  const matShininess = metallic.has(m.cat) ? 110 : (m.cat === 'ceramic' ? 40 : 12);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(boxSize, boxSize, boxSize),
    new THREE.MeshPhongMaterial({ color: matColor, transparent: true, opacity: matOpacity, shininess: matShininess, depthWrite: false })
  );
  forgeGroup.add(box);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: matColor }));
  forgeGroup.add(edges);

  const tagParts = reinfList.map((x, i) => addReinforcementLayer(x.mat, x.vf, x.orientation, boxSize, i, reinfList.length, x.angle));
  const tagEl = document.getElementById('canvas-tag');
  if (tagEl) {
    const validParts = tagParts.filter(Boolean);
    tagEl.textContent = validParts.length ? `drag to rotate · ${validParts.join(' · ')}` : 'drag to rotate';
  }
}

function animateForge() {
  requestAnimationFrame(animateForge);
  if (forgeGroup) {
    forgeGroup.rotation.y = rotY;
    forgeGroup.rotation.x = rotX;
    if (!dragging) {
      rotY += 0.0022;
    }
  }
  if (forgeRenderer && forgeScene && forgeCam) {
    forgeRenderer.render(forgeScene, forgeCam);
  }
}
