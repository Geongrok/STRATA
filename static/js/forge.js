/**
 * STRATA Forge Controller
 * Interactive Composite Material Design, Classical Laminate Theory (CLT),
 * Dynamic Volume Fraction Budgeting, Automated ASTM Standards Qualification,
 * and Physical Behavior Simulation.
 * Restored to exact visual and behavioral fidelity of the original STRATA design.
 */

import { fetchHardeners, calculateComposite } from './api.js';
import { updateForgeVisual } from './three-scene.js';
import { CAT_LABELS, inr } from './atlas.js';

const MAX_REINF_ROWS = 6;
const TOTAL_VF_BUDGET = 70;

let materialsList = [];
let hardenersList = [];
let hardenerChoice = null;
let currentMatrix = null;
let currentResults = null;

// Initial state starts with 1 layer at 35% (uni), matching original STRATA
let reinforcements = [{ id: 'carbonfiber', vf: 35, orientation: 'uni', angle: 0.0 }];

const SCENARIOS = [
  { id: 'heat', label: 'Elevated Heat' },
  { id: 'cold', label: 'Cryogenic Cold' },
  { id: 'moisture', label: 'Humidity / Immersion' },
  { id: 'uv', label: 'Prolonged Sunlight' },
  { id: 'fatigue', label: 'Cyclic Loading' },
  { id: 'impact', label: 'Sudden Impact' },
  { id: 'chemical', label: 'Chemical Exposure' },
];
let activeScenario = 'heat';

const SENS = { L: 'low', M: 'moderate', H: 'high' };
const CHEMWORD = { P: 'poor', F: 'fair', G: 'good', E: 'excellent' };

const RETAIL_MULT = { element: 2.2, metal: 2, ceramic: 3, natfiber: 2.5, synfiber: 1.6, natpoly: 2.5, synpoly: 1.8, filler: 5, bio: 2.5 };
const RETAIL_SRC = {
  element: 'OnlineMetals.com · McMaster-Carr · local metal suppliers',
  metal: 'OnlineMetals.com · McMaster-Carr · metal distributors',
  ceramic: 'US Research Nanomaterials · Reade Advanced Materials · Amazon',
  natfiber: 'Amazon · Etsy fiber shops · local fabric/craft suppliers',
  synfiber: 'Rock West Composites · Fibre Glast Developments · ACP Composites',
  natpoly: 'Amazon · specialty biopolymer suppliers · Alibaba',
  synpoly: 'US Composites · TAP Plastics · McMaster-Carr · Amazon',
  filler: 'US Research Nanomaterials · Sigma-Aldrich · Graphene Supermarket',
  bio: 'Sigma-Aldrich · Carolina Biological · specialty suppliers'
};
const RETAIL_OVERRIDE = {
  carbonfiber: 'Rock West Composites · Fibre Glast Developments · DragonPlate',
  toray_t800s: 'Toray Composite Materials · Rock West Composites',
  toray_t300: 'Toray Composite Materials · Fibre Glast Developments',
  toray_t1000g: 'Toray Composite Materials · Aerospace allocated',
  eglass: 'Fibre Glast Developments · US Composites · Amazon',
  aramid: 'Rock West Composites · Fibre Glast Developments',
  kevlar_49: 'DuPont Kevlar Distributors · Fibre Glast Developments',
  uhmwpe: 'Rock West Composites · DSM Dyneema resellers',
  boron: 'Specialty Materials Inc. — aerospace-allocated, not open retail',
  basalt: 'Basaltex · Fibre Glast Developments',
  epoxy: 'West System · US Composites · Amazon',
  polyester: 'US Composites · TAP Plastics',
  vinylester: 'US Composites · Composites One',
  peek: 'Curbell Plastics · McMaster-Carr (rod/sheet stock)',
  phenolic: 'McMaster-Carr · Professional Plastics',
  pp: 'McMaster-Carr · TAP Plastics · Amazon',
  nylon6: 'McMaster-Carr · Curbell Plastics',
  pu: 'Smooth-On · Amazon',
  silicone: 'Smooth-On · Amazon',
  graphene: 'Graphene Supermarket · Sigma-Aldrich',
  cnt: 'Cheap Tubes Inc. · Sigma-Aldrich',
  silica: 'Sigma-Aldrich · Amazon (Cab-O-Sil)',
  caco3: 'Amazon · local masonry/pottery suppliers',
  nanoclay: 'Sigma-Aldrich · Nanocor resellers',
  w: 'Midwest Tungsten Service · McMaster-Carr',
  ti: 'OnlineMetals.com · titanium specialty distributors',
  tialloy: 'OnlineMetals.com · aerospace metal distributors',
  inconel: 'OnlineMetals.com · specialty superalloy distributors',
  silk: 'Etsy · specialty silk fiber suppliers',
};

function byId(id) {
  return materialsList.find(m => m.id === id);
}

function fmt(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: Number.isInteger(d) && d > 0 && n % 1 !== 0 ? 1 : 0 });
}

function usedVf(excludeIdx) {
  return reinforcements.reduce((sum, r, i) => i === excludeIdx ? sum : sum + r.vf, 0);
}

export async function initForge(allMats) {
  materialsList = allMats;

  const matrixSel = document.getElementById('sel-matrix');
  if (!matrixSel) return;

  const matrixCandidates = materialsList.filter(m => m.matrix);
  matrixSel.innerHTML = matrixCandidates.map(m => `
    <option value="${m.id}" ${m.id === 'epoxy' ? 'selected' : ''}>
      ${m.name} — ${CAT_LABELS[m.cat] || m.cat}
    </option>
  `).join('');

  matrixSel.onchange = async () => {
    await updateHardeners();
    runForge();
  };

  document.getElementById('add-reinf-btn').onclick = addReinforcementRow;

  // Make sure default reinforcement exists in materials list
  if (!byId(reinforcements[0].id)) {
    const defaultReinf = materialsList.find(m => m.id === 'toray_t300' || m.id === 'carbonfiber') || materialsList.find(m => m.reinf);
    if (defaultReinf) reinforcements[0].id = defaultReinf.id;
  }

  setupScenarioButtons();
  await updateHardeners();
  renderReinforcementRows();
  runForge();
}

async function updateHardeners() {
  const matrixId = document.getElementById('sel-matrix').value;
  currentMatrix = byId(matrixId);
  hardenersList = await fetchHardeners(matrixId);

  const block = document.getElementById('hardener-block');
  if (!block) return;

  if (hardenersList.length === 0) {
    hardenerChoice = null;
    const why = (currentMatrix.cat === 'synpoly' && ['pp', 'nylon6', 'peek', 'pekk', 'pps'].includes(currentMatrix.id))
      ? 'a thermoplastic — it solidifies on cooling rather than curing chemically.'
      : 'processed by thermal melting or solvent drying rather than chemical polymerization.';
    block.innerHTML = `<div class="hardener-note">No curing agent required — <b>${currentMatrix.name}</b> is ${why}</div>`;
    return;
  }

  hardenerChoice = hardenersList[0].id;
  const h = hardenersList[0];
  block.innerHTML = `
    <select id="sel-hardener">
      ${hardenersList.map(item => `<option value="${item.id}">${item.name}</option>`).join('')}
    </select>
    <div class="hardener-note" id="hardener-note">
      ${h.note}
      <span class="hardener-meta">Mix ratio ${h.ratio} · cures at ${h.cureTemp}°C, post-cure ${h.postCure}°C</span>
    </div>
  `;

  document.getElementById('sel-hardener').onchange = e => {
    hardenerChoice = e.target.value;
    const selected = hardenersList.find(item => item.id === hardenerChoice);
    const noteEl = document.getElementById('hardener-note');
    if (noteEl && selected) {
      noteEl.innerHTML = `
        ${selected.note}
        <span class="hardener-meta">Mix ratio ${selected.ratio} · cures at ${selected.cureTemp}°C, post-cure ${selected.postCure}°C</span>
      `;
    }
    runForge();
  };
}

/**
 * Dynamically re-evaluates slider budgets across ALL rows so sliders never get locked
 */
function updateSlidersBudget() {
  const list = document.getElementById('reinforcement-list');
  if (!list) return;
  const used = usedVf(-1);
  const budgetEl = document.getElementById('vf-budget-readout');
  if (budgetEl) budgetEl.textContent = `${used}% of ${TOTAL_VF_BUDGET}% used`;

  list.querySelectorAll('.reinf-row').forEach(row => {
    const idx = +row.dataset.idx;
    if (idx >= reinforcements.length) return;
    const usedByOthers = usedVf(idx);
    const roomLeft = Math.max(2, TOTAL_VF_BUDGET - usedByOthers);
    const inp = row.querySelector('input[data-field="vf"]');
    const maxSpan = row.querySelector('.vf-max-readout');
    if (inp) {
      inp.max = roomLeft;
      if (+inp.value > roomLeft) {
        inp.value = roomLeft;
        reinforcements[idx].vf = roomLeft;
        const ro = row.querySelector('.vf-readout');
        if (ro) ro.textContent = roomLeft + '%';
      }
    }
    if (maxSpan) maxSpan.textContent = roomLeft + '%';
  });

  const addBtn = document.getElementById('add-reinf-btn');
  if (addBtn) {
    const full = reinforcements.length >= MAX_REINF_ROWS || used >= TOTAL_VF_BUDGET - 1;
    addBtn.classList.toggle('disabled', full);
    addBtn.textContent = reinforcements.length >= MAX_REINF_ROWS
      ? `Maximum of ${MAX_REINF_ROWS} reinforcements`
      : (used >= TOTAL_VF_BUDGET - 1 ? 'Volume fraction budget full' : '+ Add another reinforcement');
  }
}

export function renderReinforcementRows() {
  const list = document.getElementById('reinforcement-list');
  if (!list) return;

  const used = usedVf(-1);
  const budgetEl = document.getElementById('vf-budget-readout');
  if (budgetEl) budgetEl.textContent = `${used}% of ${TOTAL_VF_BUDGET}% used`;

  const reinfCandidates = materialsList.filter(d => d.reinf || d.cat === 'filler' || d.cat === 'core');

  list.innerHTML = reinforcements.map((row, i) => {
    const usedByOthers = usedVf(i);
    const roomLeft = Math.max(2, TOTAL_VF_BUDGET - usedByOthers);
    const takenIds = reinforcements.filter((r, j) => j !== i).map(r => r.id);
    const opts = reinfCandidates.filter(d => !takenIds.includes(d.id) || d.id === row.id);

    return `
      <div class="reinf-row" data-idx="${i}">
        <div class="reinf-row-head">
          <span class="reinf-row-title">Reinforcement ${i + 1}</span>
          ${reinforcements.length > 1 ? `<span class="reinf-row-remove" data-remove="${i}">✕ remove</span>` : ''}
        </div>
        <select data-field="id" data-idx="${i}">
          ${opts.map(d => `<option value="${d.id}" ${d.id === row.id ? 'selected' : ''}>${d.name} — ${CAT_LABELS[d.cat] || d.cat}</option>`).join('')}
        </select>
        <span class="sub-label">Architecture</span>
        <select data-field="orientation" data-idx="${i}">
          <option value="uni" ${row.orientation === 'uni' || row.orientation === '0' ? 'selected' : ''}>Unidirectional</option>
          <option value="woven" ${row.orientation === 'woven' ? 'selected' : ''}>Woven 0/90°</option>
          <option value="random" ${row.orientation === 'random' ? 'selected' : ''}>Random / chopped</option>
          <option value="particulate" ${row.orientation === 'particulate' ? 'selected' : ''}>Particulate</option>
          <option value="90" ${row.orientation === '90' ? 'selected' : ''}>90° Transverse</option>
          <option value="45" ${row.orientation === '45' ? 'selected' : ''}>+45° Angle Ply</option>
          <option value="-45" ${row.orientation === '-45' ? 'selected' : ''}>-45° Angle Ply</option>
          <option value="30" ${row.orientation === '30' ? 'selected' : ''}>+30° Off-Axis Ply</option>
          <option value="-30" ${row.orientation === '-30' ? 'selected' : ''}>-30° Off-Axis Ply</option>
          <option value="60" ${row.orientation === '60' ? 'selected' : ''}>+60° Off-Axis Ply</option>
          <option value="-60" ${row.orientation === '-60' ? 'selected' : ''}>-60° Off-Axis Ply</option>
        </select>
        <span class="sub-label">Volume fraction — <span class="vf-readout">${row.vf}%</span> (max <span class="vf-max-readout">${roomLeft}%</span>)</span>
        <input type="range" min="2" max="${roomLeft}" value="${Math.min(row.vf, roomLeft)}" data-field="vf" data-idx="${i}">
      </div>
    `;
  }).join('');

  list.querySelectorAll('select[data-field="id"]').forEach(sel => {
    sel.onchange = e => {
      reinforcements[+e.target.dataset.idx].id = e.target.value;
      renderReinforcementRows();
      runForge();
    };
  });

  list.querySelectorAll('select[data-field="orientation"]').forEach(sel => {
    sel.onchange = e => {
      const idx = +e.target.dataset.idx;
      const val = e.target.value;
      reinforcements[idx].orientation = val;
      reinforcements[idx].angle = !isNaN(Number(val)) ? Number(val) : (val === 'uni' ? 0.0 : null);
      runForge();
    };
  });

  list.querySelectorAll('input[data-field="vf"]').forEach(inp => {
    inp.oninput = e => {
      const idx = +e.target.dataset.idx;
      reinforcements[idx].vf = Number(e.target.value);
      const row = e.target.closest('.reinf-row');
      const ro = row.querySelector('.vf-readout');
      if (ro) ro.textContent = e.target.value + '%';
      updateSlidersBudget();
      runForge();
    };
  });

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.onclick = () => {
      reinforcements.splice(+btn.dataset.remove, 1);
      renderReinforcementRows();
      runForge();
    };
  });

  const addBtn = document.getElementById('add-reinf-btn');
  if (addBtn) {
    const full = reinforcements.length >= MAX_REINF_ROWS || used >= TOTAL_VF_BUDGET - 1;
    addBtn.classList.toggle('disabled', full);
    addBtn.textContent = reinforcements.length >= MAX_REINF_ROWS
      ? `Maximum of ${MAX_REINF_ROWS} reinforcements`
      : (used >= TOTAL_VF_BUDGET - 1 ? 'Volume fraction budget full' : '+ Add another reinforcement');
  }
}

function addReinforcementRow() {
  if (reinforcements.length >= MAX_REINF_ROWS) return;
  const used = usedVf(-1);
  if (used >= TOTAL_VF_BUDGET - 1) return;
  const room = TOTAL_VF_BUDGET - used;
  const takenIds = reinforcements.map(r => r.id);
  const reinfCandidates = materialsList.filter(d => d.reinf || d.cat === 'filler' || d.cat === 'core');
  const nextMat = reinfCandidates.find(d => !takenIds.includes(d.id)) || reinfCandidates[0];

  reinforcements.push({
    id: nextMat.id,
    vf: Math.min(15, room),
    orientation: 'uni',
    angle: 0.0
  });

  renderReinforcementRows();
  runForge();
}

function setupScenarioButtons() {
  const row = document.getElementById('scenario-row');
  if (!row) return;

  row.innerHTML = SCENARIOS.map(s => `
    <div class="seg-btn ${s.id === activeScenario ? 'active' : ''}" data-s="${s.id}">
      ${s.label}
    </div>
  `).join('');

  row.querySelectorAll('.seg-btn').forEach(b => {
    b.onclick = () => {
      row.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      activeScenario = b.dataset.s;
      if (currentMatrix && reinforcements.length) {
        const reinfList = reinforcements.map(r => ({
          mat: byId(r.id),
          vf: r.vf / 100,
          orientation: r.orientation,
          angle: r.angle
        })).filter(x => x.mat);
        runBehavior(currentMatrix, reinfList);
      }
    };
  });
}

export async function runForge() {
  const matrixSel = document.getElementById('sel-matrix');
  if (!matrixSel) return;

  const m = byId(matrixSel.value);
  if (!m) return;
  currentMatrix = m;

  const hardener = hardenerChoice
    ? (hardenersList.find(h => h.id === hardenerChoice) || null)
    : null;

  const reinfList = reinforcements.map(row => ({
    mat: byId(row.id),
    vf: row.vf / 100,
    orientation: row.orientation,
    angle: row.angle
  })).filter(x => x.mat);

  const verdictBox = document.getElementById('verdict-box');
  const comboText = reinfList.map(x => `${x.mat.name} (${Math.round(x.vf * 100)}%, ${x.orientation})`).join(' + ');
  const comboLabel = document.getElementById('combo-label');
  if (comboLabel) {
    comboLabel.textContent = `${m.name}${hardener ? ' / ' + hardener.name.split(' — ')[0] : ''} matrix reinforced with ${comboText}`;
  }

  // Call FastAPI backend for authoritative calculation & ASTM generation
  let c = null;
  let feas = null;
  try {
    const calcPayload = {
      matrix_id: m.id,
      hardener_id: hardener ? hardener.id : null,
      reinforcements: reinforcements.map(r => ({
        id: r.id,
        vf: r.vf / 100,
        orientation: r.orientation,
        angle: r.angle
      }))
    };
    const res = await calculateComposite(calcPayload);
    if (res) {
      c = res;
      feas = res.feasibility || { ok: true, reasons: [] };
    }
  } catch (err) {
    console.warn('Backend calculation fallback:', err);
  }

  // Fallback to local feasibility if backend unavailable
  if (!feas) {
    feas = checkFeasibilityLocal(m, hardener, reinfList);
  }

  if (!feas.ok) {
    if (verdictBox) verdictBox.innerHTML = `<div class="verdict bad"><b>✕ Not a viable composite.</b><br>${feas.reasons.join('<br>')}</div>`;
    document.getElementById('prop-table').innerHTML = '';
    document.getElementById('explain-box').innerHTML = '';
    document.getElementById('standards-card').innerHTML = '<span style="color:var(--bone-dim)">No standards to show — select a viable pair first.</span>';
    document.getElementById('behavior-out').innerHTML = '';
    document.getElementById('cost-explain').innerHTML = '';
    document.getElementById('cost-lo-label').textContent = '';
    document.getElementById('cost-hi-label').textContent = '';
    document.getElementById('cost-bar-fill').style.width = '0%';
    updateForgeVisual(null, null, null);
    renderLedger();
    return;
  }

  if (verdictBox) {
    verdictBox.innerHTML = `<div class="verdict">✓ Formable composite.${feas.reasons && feas.reasons.length ? '<br>' + feas.reasons.join('<br>') : ''}</div>`;
  }

  // Fallback to local micromechanics if backend calculation is null
  if (!c) {
    c = computeCompositeLocal(m, hardener, reinfList);
  }
  currentResults = c;

  // 1. Predicted Properties Table (exact visual match to strata.html)
  document.getElementById('prop-table').innerHTML = `
    <tr><td>Density</td><td>${fmt(c.rho)}<span class="unit">g/cm³</span></td></tr>
    <tr><td>Tensile modulus E_eff</td><td>${fmt(c.E_eff)}<span class="unit">GPa</span></td></tr>
    <tr><td>Specific stiffness (E/ρ)</td><td>${fmt(c.E_specific, 1)}<span class="unit">GPa·cm³/g</span></td></tr>
    <tr><td>In-plane shear modulus G₁₂</td><td>${fmt(c.G12)}<span class="unit">GPa</span></td></tr>
    <tr><td>Poisson's ratio ν₁₂</td><td>${fmt(c.nu12, 3)}</td></tr>
    <tr><td>Tensile strength σ_t</td><td>${fmt(c.ts, 0)}<span class="unit">MPa</span></td></tr>
    <tr><td>Compressive strength σ_c (est.)</td><td>${fmt(c.tsCompr, 0)}<span class="unit">MPa</span></td></tr>
    <tr><td>Specific strength (σ_t/ρ)</td><td>${fmt(c.ts_specific, 0)}<span class="unit">MPa·cm³/g</span></td></tr>
    <tr><td>Failure mode</td><td style="text-align:left;font-size:12.5px;">${c.failureMode}</td></tr>
    <tr><td>Thermal conductivity</td><td>${fmt(c.k_eff)}<span class="unit">W/m·K</span></td></tr>
    <tr><td>CTE — longitudinal / transverse</td><td>${fmt(c.cte1, 1)} / ${fmt(c.cte2, 1)}<span class="unit">×10⁻⁶/K</span></td></tr>
    <tr><td>Maximum service temperature</td><td>${fmt(c.maxTemp, 0)}<span class="unit">°C</span></td></tr>
    <tr><td>Electrical behaviour</td><td style="text-align:left;font-size:12.5px;">${c.electrical}</td></tr>
  `;

  // 2. Explain Box (Exact heading "How it got these properties." and formula styling)
  const strainList = reinfList.map(x => `${x.mat.name} ${fmt(x.mat.elong, 1)}%`).join(', ');
  const limiter = c.maxTemp === (c.matMaxT || m.maxT)
    ? `${m.name}${hardener ? ' (as cured)' : ''}`
    : (reinfList.find(x => x.mat.maxT === c.maxTemp)?.mat.name || m.name);

  document.getElementById('explain-box').innerHTML = `
    <b>How it got these properties.</b><br>
    Density follows the <b>rule of mixtures</b>: <span class="formula">ρc = Vm·ρm + ΣVfi·ρi</span> — each phase, including every reinforcement row, contributes in direct proportion to how much of it is present.<br><br>
    Stiffness blends E₁ = ${fmt(c.E1)} GPa (Voigt, all phases straining together) and E₂ = ${fmt(c.E2)} GPa (nested Halpin–Tsai across every reinforcement in turn), weighted by each row's own architecture and share of total reinforcement volume.<br><br>
    Strength uses ${c.strengthModel}<br>
    Failure strains in play: matrix ${fmt(m.elong, 1)}%, reinforcements — ${strainList}. This determines which governs: <b>${c.failureMode}</b>.<br><br>
    Thermal conductivity blends parallel, series, and nested-Halpin-Tsai bounds per row's architecture. CTE uses <b>Schapery's equations</b> generalized across all phases — longitudinal is the exact modulus-weighted form, transverse is Poisson-corrected using ν₁₂ = ${fmt(c.nu12, 2)}.<br><br>
    ${hardener ? `The <b>${hardener.name}</b> curing system shifts the matrix's usable temperature by ${(c.matMaxT || m.maxT) - m.maxT >= 0 ? '+' : ''}${fmt((c.matMaxT || m.maxT) - m.maxT, 0)}°C versus neat resin, and sets the real processing temperature at ${fmt(c.matProcT || m.procT, 0)}°C.<br><br>` : ''}
    Maximum service temperature is capped by whichever constituent degrades first — here, <b>${limiter}</b> at ${fmt(c.maxTemp, 0)}°C.<br><br>
    <b>In-plane shear modulus G₁₂ = ${fmt(c.G12)} GPa</b> — Halpin–Tsai (ξ = 1) applied sequentially to each reinforcement's shear modulus Gᵢ = Eᵢ/(2(1+νᵢ)).<br><br>
    <b>Compressive strength ≈ ${fmt(c.tsCompr, 0)} MPa</b> — ${c.comprModel}<br><br>
    <b>Specific indices</b>: E/ρ = ${fmt(c.E_specific, 1)} GPa·cm³/g and σ/ρ = ${fmt(c.ts_specific, 0)} MPa·cm³/g. These weight-normalised values are the primary selection metrics for structural aerospace composites (target: E/ρ > 20, σ/ρ > 200).
  `;

  // 3. Testing Standards Card (Authoritative ASTM & constituent testing)
  buildStandardsCard(m, reinfList[0]?.mat, reinfList, c.astm_card);

  // 4. Cost of the Build
  document.getElementById('cost-lo-label').textContent = `${inr(c.costLo)} / kg`;
  document.getElementById('cost-hi-label').textContent = `${inr(c.costHi)} / kg`;
  document.getElementById('cost-bar-fill').style.width = '100%';

  const massRows = c.massRows || [];
  const massBreak = [`${fmt((c.massM || 0.5) * 100, 0)}% ${m.name}`].concat(
    massRows.map(x => `${fmt((x.mass_fraction || x.mass || 0) * 100, 0)}% ${x.name || x.mat?.name || 'Reinforcement'}`)
  ).join(', ');
  const anyExpensive = reinfList.some(x => x.mat.costLo > 50);

  document.getElementById('cost-explain').innerHTML = `
    By mass, this build is roughly ${massBreak}${hardener ? ` (plus a small hardener addition, folded into the matrix cost)` : ''}.
    Raw material cost is a volume-to-mass-weighted average across every constituent's market price, plus a processing markup
    (roughly +15% for simple casting/lamination up to +60% for precision layup, autoclave cure, or infiltration routes).
    ${anyExpensive ? `<br><br><b>Heads up:</b> one or more of your reinforcements sits at the very top of the cost ledger — it typically only makes sense where its extreme performance justifies the price.` : ''}
  `;

  // 5. Behavior Simulator
  runBehavior(m, reinfList);

  // 6. 3D Visualizer & Canvas Tag
  const canvasTag = document.getElementById('canvas-tag');
  if (canvasTag) canvasTag.textContent = `${m.name} + ${comboText}`;
  updateForgeVisual(m, hardener, reinfList);

  // 7. Where To Buy Ledger Table
  renderLedger();
}

function buildStandardsCard(m, r, reinfList, serverAstmCard) {
  const cardEl = document.getElementById('standards-card');
  if (!cardEl) return;

  const matrixIsPolymer = m.cat === 'synpoly' || m.cat === 'natpoly';
  const matrixIsMetal = m.cat === 'metal' || m.cat === 'element';
  const tensileStd = matrixIsPolymer ? 'ASTM D3039 (tension — polymer-matrix laminate)'
    : matrixIsMetal ? 'ASTM D3552 (metal-matrix composite tension) / ASTM E8'
      : 'ASTM C1359 (tension — continuous-fibre ceramic-matrix)';
  const densityStd = matrixIsPolymer ? 'ASTM D792 / D1505' : matrixIsMetal ? 'ASTM B311 (or Archimedes, ASTM B962)' : 'ASTM C373 / C20';
  const vfStd = matrixIsPolymer ? 'ASTM D3171 (matrix burn-off / digestion)' : 'Areal image analysis (ASTM E562 point-count analogue)';
  const anyConductive = reinfList.some(x => x.mat.elec === 'C') || m.elec === 'C';
  const elecStd = anyConductive ? 'ASTM B193 (metallic resistivity)' : 'ASTM D257 (insulation resistance)';
  const constituentRows = [{ name: m.name + ' (matrix)', astm: m.astm }].concat(reinfList.map(x => ({ name: x.mat.name, astm: x.mat.astm })));

  let extraStandards = '';
  if (serverAstmCard && serverAstmCard.standards) {
    const additional = serverAstmCard.standards.filter(s =>
      !['Tensile Modulus & Strength (Longitudinal)', 'Composite Density', 'Reinforcement Volume Fraction'].includes(s.property_name)
    );
    if (additional.length) {
      extraStandards = additional.map(s => `
        <div class="std-row"><span class="std-prop">${s.property_name}</span><span class="std-code">${s.standard_code}</span></div>
      `).join('');
    }
  }

  cardEl.innerHTML = `
    <div class="std-row"><span class="std-prop">Tensile modulus &amp; strength</span><span class="std-code">${tensileStd}</span></div>
    <div class="std-row"><span class="std-prop">Density</span><span class="std-code">${densityStd}</span></div>
    <div class="std-row"><span class="std-prop">Reinforcement volume fraction</span><span class="std-code">${vfStd}</span></div>
    <div class="std-row"><span class="std-prop">Thermal expansion (CTE)</span><span class="std-code">ASTM E831 (TMA) · E228 (dilatometry)</span></div>
    <div class="std-row"><span class="std-prop">Thermal conductivity</span><span class="std-code">ASTM E1461 (laser flash)</span></div>
    <div class="std-row"><span class="std-prop">Electrical behaviour</span><span class="std-code">${elecStd}</span></div>
    ${extraStandards}
    ${constituentRows.map(c => `<div class="std-row"><span class="std-prop">${c.name} — constituent level</span><span class="std-code">${c.astm || 'ASTM Specification'}</span></div>`).join('')}
  `;
}

function runBehavior(m, reinfList) {
  const s = activeScenario;
  const rNames = reinfList.map(x => x.mat.name).join(' + ');
  let text = '';

  if (s === 'heat') {
    const weakest = reinfList.reduce((min, x) => x.mat.maxT < min.mat.maxT ? x : min, reinfList[0]);
    const cap = Math.min(m.maxT, weakest.mat.maxT);
    if (m.maxT < weakest.mat.maxT) {
      text = `The matrix is the weak link here. ${m.name} softens or degrades near ${m.maxT}°C — well before ${rNames} (stable to at least ${weakest.mat.maxT}°C) becomes a concern. Above that ceiling, expect the matrix to lose stiffness first, followed by reinforcement/matrix debonding and gradual loss of load transfer. Treat ${fmt(cap, 0)}°C as a hard practical limit for sustained service.`;
    } else {
      text = `Unusually, a reinforcement is the limiting factor: ${weakest.mat.name} degrades near ${weakest.mat.maxT}°C, sooner than the ${m.name} matrix (stable to ${m.maxT}°C). Past that point that reinforcement loses strength first, and the composite behaves closer to the matrix reinforced by whatever's left.`;
    }
  } else if (s === 'cold') {
    text = `Most matrices stiffen and become more brittle as temperature drops — ${m.ductile ? `${m.name} is normally ductile, so cold exposure will measurably raise its brittle-fracture risk, especially under impact.` : `${m.name} is already fairly brittle, and cold service will amplify that tendency further.`} The reinforcement phases (${rNames}) are largely unaffected by cold, so failures in cryogenic service typically initiate in the matrix or at a reinforcement/matrix interface, not in the reinforcement itself.`;
  } else if (s === 'moisture') {
    const worstReinf = reinfList.reduce((w, x) => (x.mat.moist === 'H' ? 2 : x.mat.moist === 'M' ? 1 : 0) > (w.mat.moist === 'H' ? 2 : w.mat.moist === 'M' ? 1 : 0) ? x : w, reinfList[0]);
    const worst = (m.moist === 'H' || worstReinf.mat.moist === 'H') ? 'high' : (m.moist === 'M' || worstReinf.mat.moist === 'M') ? 'moderate' : 'low';
    text = `Combined moisture sensitivity here is <b>${worst}</b>. ${m.name} has ${SENS[m.moist] || 'moderate'} moisture uptake${m.moist !== 'L' ? ' — expect swelling, plasticisation, and a drop in glass transition temperature with prolonged wet exposure' : ''}. The most moisture-sensitive reinforcement is ${worstReinf.mat.name} (${SENS[worstReinf.mat.moist] || 'moderate'})${worstReinf.mat.moist === 'H' ? ', and as a natural fibre it can also be vulnerable to fungal attack in persistently damp conditions' : ''}. ${worst === 'low' ? 'This combination should hold up well in humid or wet service.' : 'A moisture barrier coating or gelcoat is strongly advisable for anything beyond occasional dampness.'}`;
  } else if (s === 'uv') {
    const worstUv = reinfList.reduce((w, x) => (x.mat.uv === 'H' ? 2 : x.mat.uv === 'M' ? 1 : 0) > (w.mat.uv === 'H' ? 2 : w.mat.uv === 'M' ? 1 : 0) ? x : w, reinfList[0]);
    text = `${m.name} has ${SENS[m.uv] || 'moderate'} UV sensitivity${m.uv !== 'L' ? ' — expect surface chalking, yellowing, or embrittlement with unprotected outdoor exposure over months to years' : ' and should hold its properties well in direct sunlight'}. Of the reinforcements, ${worstUv.mat.name} is the most UV-sensitive (${SENS[worstUv.mat.uv] || 'moderate'})${worstUv.mat.uv === 'H' ? ', though in a composite it is normally shielded by the matrix, so surface protection of the matrix is what really matters' : ''}. ${(m.uv === 'H' || worstUv.mat.uv === 'H') ? 'A UV-stable topcoat or pigment is recommended for long-term outdoor parts.' : ''}`;
  } else if (s === 'fatigue') {
    const anyUni = reinfList.some(x => x.orientation === 'uni' || x.orientation === '0');
    const bestTough = reinfList.some(x => x.mat.tough === 'H');
    text = `${anyUni ? 'With at least one row loaded along its fibre direction, this' : 'In this off-axis or randomly oriented layup, this'} composite's fatigue life is governed mostly by the matrix. ${m.name} is ${m.ductile ? 'ductile, which tends to blunt crack tips and delay fatigue failure' : 'relatively brittle, so microcracks can initiate early in cyclic loading and accumulate steadily even at moderate stress'}. ${bestTough ? `${rNames} includes at least one high-toughness reinforcement, which helps arrest cracks before they propagate.` : `${rNames} is fairly brittle in its own right, offering little crack-arresting benefit.`} Expect the practical fatigue limit to sit well below the static tensile strength shown above — a common rule of thumb is 25-50% of static strength for polymer-matrix composites under long-term cyclic load.`;
  } else if (s === 'impact') {
    const bestTough = reinfList.reduce((b, x) => (x.mat.tough === 'H' ? 2 : x.mat.tough === 'M' ? 1 : 0) > (b.mat.tough === 'H' ? 2 : b.mat.tough === 'M' ? 1 : 0) ? x : b, reinfList[0]);
    text = `Impact resistance depends on how much energy the composite can absorb before fracturing. ${bestTough.mat.tough === 'H' ? `${bestTough.mat.name} is an excellent energy absorber under sudden load — this is exactly the kind of reinforcement used in impact- and ballistic-rated composites.` : bestTough.mat.tough === 'M' ? `${bestTough.mat.name} offers moderate impact tolerance, the best of this stack.` : `${rNames} is stiff but brittle overall, and tends to fail abruptly rather than absorb energy gracefully under sudden impact.`} ${m.ductile ? `The ${m.name} matrix is ductile and will yield locally to help dissipate impact energy.` : `The ${m.name} matrix is brittle and offers little energy absorption of its own, so most impact tolerance here comes from the reinforcement stack.`}`;
  } else if (s === 'chemical') {
    const worstChem = reinfList.reduce((w, x) => (x.mat.chem === 'P' ? 0 : x.mat.chem === 'F' ? 1 : x.mat.chem === 'G' ? 2 : 3) < (w.mat.chem === 'P' ? 0 : w.mat.chem === 'F' ? 1 : w.mat.chem === 'G' ? 2 : 3) ? x : w, reinfList[0]);
    text = `Chemical resistance is set by the weakest constituent in whatever specific environment is expected. ${m.name} has ${CHEMWORD[m.chem] || 'moderate'} chemical resistance, and the weakest reinforcement, ${worstChem.mat.name}, has ${CHEMWORD[worstChem.mat.chem] || 'moderate'} resistance. ${(m.chem === 'P' || worstChem.mat.chem === 'P') ? 'With a "poor" rating in the mix, expect noticeable attack, swelling, or degradation on contact with solvents, acids, or oils — a barrier layer or different matrix choice is worth considering for a corrosive-service part.' : 'This combination should tolerate everyday solvent, fuel, or mild-acid exposure reasonably well, though always spot-check against the specific chemical in question.'}`;
  }

  const outEl = document.getElementById('behavior-out');
  const scenObj = SCENARIOS.find(x => x.id === s);
  if (outEl && scenObj) {
    outEl.innerHTML = `<span class="scenario-label">${scenObj.label}</span>${text}`;
  }
}

function retailInfo(d) {
  const mult = RETAIL_MULT[d.cat] || 2;
  return {
    buyLo: d.costLo * mult,
    buyHi: d.costHi * mult * 1.3,
    buySrc: RETAIL_OVERRIDE[d.id] || RETAIL_SRC[d.cat] || 'Industrial materials suppliers'
  };
}

export function renderLedger() {
  const matrixSel = document.getElementById('sel-matrix');
  if (!matrixSel) return;
  const m = byId(matrixSel.value);
  const reinfIds = reinforcements.map(row => row.id);
  const items = [m, ...reinfIds.map(byId)].filter(Boolean).map(d => ({ ...d, ...retailInfo(d) })).sort((a, b) => a.buyLo - b.buyLo);

  const tbody = document.getElementById('ledger-body');
  if (!tbody) return;

  tbody.innerHTML = items.map(d => `
    <tr>
      <td>${d.name}</td>
      <td class="mono" style="color:var(--bone-dim);font-size:12px;">${CAT_LABELS[d.cat] || d.cat}</td>
      <td class="mono">${inr(d.buyLo)} – ${inr(d.buyHi)}</td>
      <td class="source-cell">${d.buySrc}</td>
    </tr>
  `).join('');
}

/* Local Micromechanics Fallback */
function halpinTsai(Em, Er, Vf, xi) {
  const eta = (Er / Em - 1) / (Er / Em + xi);
  return Em * (1 + xi * eta * Vf) / (1 - eta * Vf);
}

function sequentialHalpinTsai(baseValue, Vbase, reinfList, propKey) {
  let running = baseValue, runningVol = Vbase;
  reinfList.forEach(x => {
    const localVf = x.vf / (runningVol + x.vf);
    running = halpinTsai(running, x.mat[propKey], localVf, 2);
    runningVol += x.vf;
  });
  return running;
}

function checkFeasibilityLocal(m, hardener, reinfList) {
  const reasons = [];
  let ok = true;
  const matProcT = hardener ? Math.max(m.procT || 0, hardener.postCure) : m.procT;
  if (!m.matrix) { ok = false; reasons.push(`${m.name} cannot serve as a continuous binding (matrix) phase.`); }
  reinfList.forEach(x => {
    const r = x.mat;
    if (r.id === m.id) { ok = false; reasons.push(`${m.name} paired with itself is a single homogeneous material, not a composite.`); }
    if (!r.reinf && r.cat !== 'filler' && r.cat !== 'core') { ok = false; reasons.push(`${r.name} is not typically used as a load-bearing reinforcement phase.`); }
    if (matProcT != null && r.maxT < matProcT) {
      ok = false;
      reasons.push(`${r.name} degrades or melts around ${r.maxT}°C, below the ~${matProcT}°C needed to process ${m.name}${hardener ? ` with ${hardener.name}` : ''}. Processing would destroy that reinforcement before the matrix could form around it.`);
    }
  });
  const dupIds = reinfList.map(x => x.mat.id).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dupIds.length) { ok = false; reasons.push(`The same reinforcement is selected more than once — each row should be a distinct material.`); }
  return { ok, reasons };
}

function computeCompositeLocal(m, hardener, reinfList) {
  const VfTotal = reinfList.reduce((s, x) => s + x.vf, 0);
  const Vm = 1 - VfTotal;
  const matMaxT = m.maxT + (hardener ? hardener.tgShift : 0);
  const matProcT = hardener ? Math.max(m.procT || 0, hardener.postCure) : m.procT;

  const rho = Vm * m.rho + reinfList.reduce((s, x) => s + x.vf * x.mat.rho, 0);
  const E1 = Vm * m.E + reinfList.reduce((s, x) => s + x.vf * x.mat.E, 0);
  const E2 = sequentialHalpinTsai(m.E, Vm, reinfList, 'E');

  const archWeight = o => (o === 'uni' || o === '0') ? [1, 0] : o === 'woven' ? [0.5, 0.5] : o === 'random' ? [0.375, 0.625] : [0, 1];
  let wE1 = 0, wE2 = 0;
  reinfList.forEach(x => {
    const [a, b] = archWeight(x.orientation);
    const share = x.vf / Math.max(VfTotal, 1e-4);
    wE1 += share * a;
    wE2 += share * b;
  });
  const E_eff = wE1 * E1 + wE2 * E2;

  const fibreRows = reinfList.filter(x => x.orientation !== 'particulate');
  const particulateRows = reinfList.filter(x => x.orientation === 'particulate');

  let matrixTs = m.ts;
  particulateRows.forEach(x => { matrixTs = Math.max(matrixTs * (1 - 1.21 * Math.pow(x.vf, 2 / 3)), 0.15 * m.ts); });

  let ts, strengthModel, failureMode;
  if (fibreRows.length === 0) {
    ts = matrixTs;
    strengthModel = 'Nicolais–Narkis equation — particulate reinforcement concentrates stress rather than sharing load, so composite strength is bounded by (knocked-down) matrix.';
    failureMode = 'Matrix-controlled — cracks nucleate at particle/matrix interface';
  } else {
    const epsM = m.elong / 100;
    const strains = fibreRows.map(x => x.mat.elong / 100).concat([epsM]);
    const governingStrain = Math.min(...strains);
    const etaOf = o => (o === 'uni' || o === '0') ? 1.0 : (o === 'woven' ? 0.375 : 0.2);
    const fibreContribution = fibreRows.reduce((s, x) => s + etaOf(x.orientation) * x.vf * Math.min(x.mat.E * 1000 * governingStrain, x.mat.ts), 0);
    const matrixStressAtGoverning = Math.min(m.E * 1000 * governingStrain, matrixTs);
    ts = fibreContribution + Vm * matrixStressAtGoverning;
    const governingIsMatrix = governingStrain === epsM && fibreRows.every(x => x.mat.elong / 100 >= epsM);
    failureMode = governingIsMatrix
      ? 'Matrix-controlled — the binder reaches its failure strain first, cracks, and sheds load to the reinforcement'
      : 'Fibre-controlled — the most strain-limited reinforcement fails first, triggering load redistribution';
    strengthModel = `Strain-compatibility modified rule of mixtures (Kelly–Tyson / Hull & Clyne) across all fibre-type rows, using Krenchel orientation efficiency factors, governed by a limiting strain of ${(governingStrain * 100).toFixed(2)}%${particulateRows.length ? ' — matrix term additionally knocked down by the Nicolais–Narkis particulate effect.' : '.'}`;
  }

  const k1 = Vm * m.k + reinfList.reduce((s, x) => s + x.vf * x.mat.k, 0);
  const k2 = 1 / ((Vm / Math.max(m.k, 1e-4)) + reinfList.reduce((s, x) => s + x.vf / Math.max(x.mat.k, 1e-4), 0));
  const k_iso = sequentialHalpinTsai(m.k, Vm, reinfList, 'k');
  const kArchWeight = o => (o === 'uni' || o === '0') ? [1, 0, 0] : (o === 'woven' || o === 'random') ? [0.5, 0.5, 0] : [0, 0, 1];
  let wk1 = 0, wk2 = 0, wk3 = 0;
  reinfList.forEach(x => { const [a, b, c] = kArchWeight(x.orientation); const share = x.vf / Math.max(VfTotal, 1e-4); wk1 += share * a; wk2 += share * b; wk3 += share * c; });
  const k_eff = wk1 * k1 + wk2 * k2 + wk3 * k_iso;

  const sumViEi = reinfList.reduce((s, x) => s + x.vf * x.mat.E, 0);
  const cte1 = (Vm * m.E * m.cte + reinfList.reduce((s, x) => s + x.vf * x.mat.E * x.mat.cte, 0)) / Math.max(Vm * m.E + sumViEi, 1e-4);
  const nu12 = Vm * m.nu + reinfList.reduce((s, x) => s + x.vf * (x.mat.nu || 0.22), 0);
  const cte2 = (1 + m.nu) * m.cte * Vm + reinfList.reduce((s, x) => s + (1 + (x.mat.nu || 0.22)) * x.mat.cte * x.vf, 0) - cte1 * nu12;

  const maxTemp = Math.min(matMaxT, ...reinfList.map(x => x.mat.maxT));

  let electrical = 'Insulating';
  const conductiveRows = reinfList.filter(x => x.mat.elec === 'C');
  if (m.elec === 'C') { electrical = 'Conductive — metallic matrix dominates'; }
  else if (conductiveRows.length) {
    const totalConductiveVf = conductiveRows.reduce((s, x) => s + x.vf, 0);
    const percOf = o => (o === 'uni' || o === '0') ? 0.12 : o === 'woven' ? 0.15 : o === 'random' ? 0.20 : 0.25;
    const minPerc = Math.min(...conductiveRows.map(x => percOf(x.orientation)));
    electrical = totalConductiveVf >= minPerc
      ? 'Conductive — reinforcement network exceeds the electrical percolation threshold'
      : 'Mostly insulating — conductive filler present but below the percolation threshold for a continuous network';
  }

  const GmBase = m.E / (2 * (1 + m.nu));
  const reinfListG = reinfList.map(x => ({ ...x, mat: { ...x.mat, G: x.mat.E / (2 * (1 + (x.mat.nu || 0.22))) } }));
  const G12 = sequentialHalpinTsai(GmBase, Vm, reinfListG, 'G');

  const VfFiber = reinfList.filter(x => x.orientation !== 'particulate').reduce((s, x) => s + x.vf, 0);
  let tsCompr, comprModel;
  if (VfFiber === 0) {
    tsCompr = ts * (m.ductile ? 1.0 : 1.05);
    comprModel = 'Particulate reinforcement behaves similarly in tension and compression — estimated at parity with the tensile value.';
  } else if (m.ductile) {
    tsCompr = ts * 0.95;
    comprModel = `Ductile ${m.name} matrix — compressive yield strength ≈ tensile yield.`;
  } else {
    const rosenEst = (G12 * 1000) / (2 * Math.max(1 - VfFiber, 0.05));
    tsCompr = Math.min(rosenEst, ts * 0.65);
    comprModel = `Rosen microbuckling (misalignment-corrected): σ_c ≈ G₁₂/(2(1−Vf_fibre)) = ${fmt(rosenEst, 0)} MPa, capped at 0.65×σ_t.`;
  }

  const E_specific = E_eff / Math.max(rho, 1e-4);
  const ts_specific = ts / Math.max(rho, 1e-4);

  const totalVolMass = Vm * m.rho + reinfList.reduce((s, x) => s + x.vf * x.mat.rho, 0);
  const massM = (Vm * m.rho) / Math.max(totalVolMass, 1e-4);
  const massRows = reinfList.map(x => ({ name: x.mat.name, mass_fraction: (x.vf * x.mat.rho) / Math.max(totalVolMass, 1e-4) }));
  const hardenerCostBump = hardener ? hardener.costBump : 0;
  const rawCostLo = massM * (m.costLo + hardenerCostBump) + reinfList.reduce((s, x) => s + ((x.vf * x.mat.rho) / Math.max(totalVolMass, 1e-4)) * x.mat.costLo, 0);
  const rawCostHi = massM * (m.costHi + hardenerCostBump) + reinfList.reduce((s, x) => s + ((x.vf * x.mat.rho) / Math.max(totalVolMass, 1e-4)) * x.mat.costHi, 0);
  const costLo = rawCostLo * 1.15;
  const costHi = rawCostHi * 1.60;

  return {
    rho, E1, E2, E_eff, ts, tsCompr, comprModel, G12, nu12, E_specific, ts_specific,
    strengthModel, failureMode, k_eff, cte1, cte2, maxTemp, matMaxT, matProcT,
    electrical, costLo, costHi, massM, massRows
  };
}

export function getCurrentForgeContext() {
  const matrixSel = document.getElementById('sel-matrix');
  if (!matrixSel) return '';
  const m = byId(matrixSel.value);
  if (!m) return '';
  const hardener = hardenerChoice
    ? (hardenersList.find(h => h.id === hardenerChoice) || null)
    : null;
  const reinfList = reinforcements.map(row => ({
    mat: byId(row.id),
    vf: row.vf / 100,
    orientation: row.orientation
  })).filter(x => x.mat);

  const c = currentResults || computeCompositeLocal(m, hardener, reinfList);
  let ctx = `Matrix: ${m.name} (${CAT_LABELS[m.cat] || m.cat})`;
  if (hardener) ctx += `, cured with ${hardener.name}`;
  ctx += '\nReinforcements: ' + reinfList.map(x => `${x.mat.name} at ${Math.round(x.vf * 100)}% vol (${x.orientation})`).join(', ');
  if (c) {
    ctx += `\n\nComputed composite properties:
- Density: ${fmt(c.rho)} g/cm³
- Tensile modulus E_eff: ${fmt(c.E_eff)} GPa (E₁=${fmt(c.E1)} GPa longitudinal, E₂=${fmt(c.E2)} GPa transverse)
- Specific stiffness E/ρ: ${fmt(c.E_specific, 1)} GPa·cm³/g
- In-plane shear modulus G₁₂: ${fmt(c.G12)} GPa | Poisson's ratio ν₁₂: ${fmt(c.nu12, 3)}
- Tensile strength σ_t: ${fmt(c.ts, 0)} MPa | Compressive strength σ_c (est.): ${fmt(c.tsCompr, 0)} MPa
- Specific strength σ/ρ: ${fmt(c.ts_specific, 0)} MPa·cm³/g
- Failure mode: ${c.failureMode}
- Thermal conductivity: ${fmt(c.k_eff)} W/m·K
- CTE (longitudinal / transverse): ${fmt(c.cte1, 1)} / ${fmt(c.cte2, 1)} ×10⁻⁶/K
- Max service temperature: ${fmt(c.maxTemp, 0)}°C
- Electrical: ${c.electrical}`;
  }
  return ctx;
}

