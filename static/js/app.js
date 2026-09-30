/**
 * STRATA Main Application Coordinator
 */

import { fetchMaterials } from './api.js';
import { initHero, initForge } from './three-scene.js';
import { initAtlas } from './atlas.js';
import { initForge as initForgeController } from './forge.js';
import { initChat } from './chat.js';

async function bootstrap() {
  console.log('[STRATA] Starting bootstrap sequence...');

  // 1. Initialize 3D Hero and Forge canvases immediately
  try {
    initHero();
  } catch (e) {
    console.error('[STRATA] Hero 3D init failed:', e);
  }
  try {
    initForge();
  } catch (e) {
    console.error('[STRATA] Forge 3D init failed:', e);
  }

  // 2. Fetch materials library from backend database
  try {
    const materials = await fetchMaterials();
    console.log(`[STRATA] Loaded ${materials.length} industrial and advanced materials from backend.`);

    // 3. Initialize UI controllers
    await initAtlas(materials);
    await initForgeController(materials);
    initChat();

    // Update scroll hint with actual count
    const hint = document.querySelector('.scroll-hint');
    if (hint) {
      hint.textContent = `${materials.length} CONSTITUENTS LOADED — SCROLL TO BEGIN`;
    }
    console.log('[STRATA] Bootstrap complete.');
  } catch (err) {
    console.error('[STRATA] Initialization error during data fetch or controller init:', err);
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

