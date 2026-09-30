/**
 * STRATA Materials Atlas Controller
 * Catalogues, searches, filters, and renders industrial materials and detail sheets
 * Restored to exact visual and behavioral fidelity of the original STRATA design
 */

import { fetchMaterials, fetchMaterial } from './api.js';

export const CAT_LABELS = {
  element: 'Element',
  metal: 'Metal / Alloy',
  ceramic: 'Ceramic',
  natfiber: 'Natural Fibre',
  synfiber: 'Synthetic Fibre',
  natpoly: 'Natural Polymer',
  synpoly: 'Synthetic Polymer',
  filler: 'Nano / Particulate Filler',
  bio: 'Biomaterial'
};

export const CAT_ORDER = [
  'element', 'metal', 'ceramic', 'natfiber', 'synfiber', 'natpoly', 'synpoly', 'filler', 'bio'
];

const USD_TO_INR = 96;
export function inr(usdAmount, decimals = 0) {
  const val = (usdAmount || 0) * USD_TO_INR;
  return '₹' + val.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

let allMaterials = [];
let activeCat = null;
let searchQuery = '';

export async function initAtlas(materialsCache = null) {
  if (materialsCache && materialsCache.length > 0) {
    allMaterials = materialsCache;
  } else {
    allMaterials = await fetchMaterials();
  }

  renderTabs();
  renderAtlas();
  setupSearch();
  setupDetailOverlay();
}

export function renderTabs() {
  const tabsEl = document.getElementById('atlas-tabs');
  if (!tabsEl) return;

  const cats = ['all', ...CAT_ORDER];
  tabsEl.innerHTML = cats.map(c => `
    <div class="tab ${c === activeCat ? 'active' : ''}" data-c="${c}">
      ${c === 'all' ? 'All' : (CAT_LABELS[c] || c)}
    </div>
  `).join('');

  tabsEl.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      activeCat = (t.dataset.c === activeCat) ? null : t.dataset.c;
      renderTabs();
      renderAtlas();
    };
  });
}

export function renderAtlas() {
  const grid = document.getElementById('atlas-grid');
  const empty = document.getElementById('atlas-empty');
  if (!grid || !empty) return;

  const q = searchQuery.trim().toLowerCase();

  // If no category selected and search input is empty, show empty state
  if (activeCat === null && q === '') {
    grid.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = 'Nothing shown yet — search a material by name, or choose a category above.';
    return;
  }

  let items = (activeCat === null || activeCat === 'all')
    ? allMaterials
    : allMaterials.filter(d => d.cat === activeCat);

  if (q !== '') {
    items = items.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.cat && (CAT_LABELS[d.cat] || d.cat).toLowerCase().includes(q)) ||
      (d.note && d.note.toLowerCase().includes(q)) ||
      (d.astm && d.astm.toLowerCase().includes(q))
    );
  }

  if (items.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = 'No materials match that search.';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = items.map(d => `
    <div class="mat-card" data-id="${d.id}">
      <span class="tag">${CAT_LABELS[d.cat] || d.cat}</span>
      <span class="cost-chip">${inr(d.costLo)}-${inr(d.costHi)}/kg</span>
      <h4>${d.name}</h4>
      <div class="props">
        ρ <b>${d.rho} g/cm³</b><br>
        E <b>${d.E} GPa</b><br>
        σ <b>${d.ts} MPa</b>
      </div>
      <div class="roles-dots">
        ${d.matrix ? '<div class="dot m" title="can be matrix"></div>' : ''}
        ${d.reinf ? '<div class="dot r" title="can be reinforcement"></div>' : ''}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.mat-card').forEach(c => {
    c.onclick = () => openDetail(c.dataset.id);
  });
}

function setupSearch() {
  const input = document.getElementById('atlas-search');
  const clearBtn = document.getElementById('atlas-search-clear');
  if (!input) return;

  input.addEventListener('input', e => {
    searchQuery = e.target.value;
    if (clearBtn) clearBtn.classList.toggle('show', searchQuery.length > 0);
    renderAtlas();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchQuery = '';
      input.value = '';
      clearBtn.classList.remove('show');
      renderAtlas();
    });
  }
}

function setupDetailOverlay() {
  const overlay = document.getElementById('detail-overlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target.id === 'detail-overlay') closeDetail();
    });
  }
}

export async function openDetail(id) {
  let d = allMaterials.find(m => m.id === id);
  if (!d) {
    d = await fetchMaterial(id);
  }
  if (!d) return;

  const ov = document.getElementById('detail-overlay');
  const card = document.getElementById('detail-card');
  if (!ov || !card) return;

  card.innerHTML = `
    <span class="close" id="detail-close">CLOSE ✕</span>
    <span class="eyebrow">${CAT_LABELS[d.cat] || d.cat}</span>
    <h3>${d.name}</h3>
    <div class="detail-grid">
      <div><span>Density</span>${d.rho} g/cm³</div>
      <div><span>Tensile Modulus</span>${d.E} GPa</div>
      <div><span>Tensile Strength</span>${d.ts} MPa</div>
      <div><span>Strain to Failure</span>${d.elong}%</div>
      <div><span>Thermal Conductivity</span>${d.k} W/m·K</div>
      <div><span>CTE</span>${d.cte} ×10⁻⁶/K</div>
      <div><span>Max Service Temp</span>${d.maxT}°C</div>
      <div><span>Poisson's Ratio</span>${d.nu}</div>
      <div><span>Electrical Nature</span>${d.elec === 'C' ? 'Conductor' : (d.elec === 'S' ? 'Semiconductor' : 'Insulator')}</div>
      <div><span>Chemical Resistance</span>${{ P: 'Poor', F: 'Fair', G: 'Good', E: 'Excellent' }[d.chem] || d.chem}</div>
      <div><span>UV Sensitivity</span>${{ L: 'Low', M: 'Medium', H: 'High' }[d.uv] || d.uv}</div>
      <div><span>Moisture Sensitivity</span>${{ L: 'Low', M: 'Medium', H: 'High' }[d.moist] || d.moist}</div>
      <div><span>Cost Range</span>${inr(d.costLo)} – ${inr(d.costHi)} / kg</div>
    </div>
    <div class="note">${d.note || ''}</div>
    <div class="source-line"><b>Where it's found / made:</b> ${d.source || 'N/A'}</div>
    <div class="source-line"><b>Characterized per:</b> ${d.astm || 'N/A'}</div>
  `;

  document.getElementById('detail-close').onclick = closeDetail;
  ov.classList.add('show');
}

export function closeDetail() {
  const overlay = document.getElementById('detail-overlay');
  if (overlay) overlay.classList.remove('show');
}
