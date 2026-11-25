#!/usr/bin/env node
/**
 * Render the real Moonlight Tizen Apps view at 1920x1080.
 *
 * Run from the repository root:
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *   node tools/render-catalog.mjs
 *
 * Optional:
 *   node tools/render-catalog.mjs --output catalog.jpg --theme original
 */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const output = resolve(option('--output', 'moonlight-catalog.jpg'));
const theme = option('--theme', 'original');
const indexUrl = pathToFileURL(resolve('wasm/index.html')).href;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  // Tizen-only APIs are intentionally stubbed; no host, network or streaming
  // session is needed to render the static Apps screen.
  await page.addInitScript(() => {
    window.tizen = {
      application: {
        getCurrentApplication: () => ({ getRequestedAppControl: () => null }),
      },
    };
  });
  await page.goto(indexUrl, { waitUntil: 'networkidle' });

  await page.evaluate(({ theme }) => {
    document.body.dataset.colorTheme = theme;
    document.documentElement.classList.remove('app-starting');

    // The animated HTML launch splash is a separate full-screen layer above the app.
    // Remove it (and any stream transition overlay) so the Apps grid is visible.
    document.getElementById('html-launch-splash')?.remove();
    document.getElementById('stream-transition-layer')?.remove();
    const main = document.getElementById('main-ui-layer');
    main.classList.remove('ui-inactive');
    main.style.opacity = '1';
    main.setAttribute('aria-hidden', 'false');

    document.getElementById('host-grid')?.remove();
    document.getElementById('settings-list')?.remove();
    const grid = document.getElementById('game-grid');
    grid.replaceChildren();

    const games = [
      { title: 'Cyberpunk 2077', image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2lbd.jpg' },
      { title: 'The Witcher 3: Wild Hunt', image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg' },
      { title: 'Forza Horizon 5', image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2ekt.jpg' },
    ];

    for (const [index, game] of games.entries()) {
      const card = document.createElement('div');
      card.className = 'mdl-card mdl-shadow--4dp' + (index === 0 ? ' hovered' : '');
      card.setAttribute('aria-label', game.title);
      const image = document.createElement('img');
      image.src = game.image;
      image.alt = '';
      image.style.opacity = '1';
      image.style.zIndex = '0';
      image.style.objectFit = 'cover';
      const title = document.createElement('div');
      title.className = 'mdl-card__title game-title';
      const text = document.createElement('span');
      text.className = 'game-text';
      text.textContent = game.title;
      title.append(text);
      card.append(image, title);
      grid.append(card);
    }

    grid.style.display = 'flex';
    grid.style.visibility = 'visible';
    document.getElementById('main-content')?.classList.remove('fullscreen');
    document.querySelectorAll('.ambient-wave-wrapper, .bubbles-background, .symbols-background')
      .forEach((element) => { element.style.display = ''; });

    // Freeze CSS animations and transitions for a deterministic catalog image.
    const freeze = document.createElement('style');
    freeze.textContent = `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }

    /* Keep Moonlight's original header and logo; hide unrelated overlays and views. */
    #stream-diagnostics-layer,
    #popup-layer,
    #main-content > :not(#ambient-trails):not(#ambient-bubbles):not(#ambient-symbols):not(#game-grid) {
      display: none !important;
    }
    #main-content {
      position: relative !important;
      display: flex !important;
      width: 100vw !important;
      height: 100vh !important;
      min-height: 100vh !important;
      overflow: hidden !important;
    }
    #ambient-trails,
    #ambient-bubbles,
    #ambient-symbols {
      display: block !important;
    }
    #game-grid {
      position: relative !important;
      z-index: 1 !important;
      display: flex !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      box-sizing: border-box !important;
      align-items: center !important;
      justify-content: center !important;
      align-content: center !important;
      flex-flow: row wrap !important;
      margin: 0 !important;
      padding: 40px 80px !important;
    }
    #game-grid .mdl-card.hovered { transform: scale(1.12); }
    #game-grid .mdl-card img { opacity: 1 !important; }`;
    document.head.append(freeze);
  }, { theme });

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await mkdir(resolve(output, '..'), { recursive: true });
  await page.screenshot({ path: output, type: 'jpeg', quality: 95 });
  console.log(`Rendered ${output} (1920x1080 JPEG)`);
} finally {
  await browser.close();
}
