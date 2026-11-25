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
    // Apps mode exposes only artwork regeneration and the gamepad test action.
    ['settingsBtn', 'refreshHostsBtn', 'supportBtn', 'restoreDefaultsBtn'].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.style.display = 'none';
    });
    const gamepadButton = document.getElementById('gamepadTestBtn');
    if (gamepadButton) { gamepadButton.hidden = false; gamepadButton.style.display = ''; }
    const regenerateButton = document.getElementById('regenerateAppImagesBtn');
    if (regenerateButton) { regenerateButton.hidden = false; regenerateButton.style.display = ''; }
    const grid = document.getElementById('game-grid');
    grid.replaceChildren();

    const desktopIcon = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
      '<rect width="512" height="512" fill="#282C38"/>' +
      '<rect x="142" y="132" width="228" height="166" rx="14" fill="none" stroke="#f4f4f4" stroke-width="18"/>' +
      '<path d="M224 370h64M256 298v72M204 370h104" fill="none" stroke="#f4f4f4" stroke-width="18" stroke-linecap="round"/>' +
      '</svg>'
    );
    const retrobatLogo = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
      '<rect width="512" height="512" fill="#171923"/>' +
      '<path d="M118 194c8-34 38-58 73-58h130c35 0 65 24 73 58l23 101c8 35-32 61-60 39l-49-39H204l-49 39c-28 22-68-4-60-39z" fill="#e34b62"/>' +
      '<path d="M166 215h62m-31-31v62" stroke="#fff" stroke-width="17" stroke-linecap="round"/>' +
      '<circle cx="336" cy="207" r="12" fill="#fff"/><circle cx="366" cy="237" r="12" fill="#fff"/>' +
      '<text x="256" y="405" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="48" font-weight="700" letter-spacing="2">RETROBAT</text>' +
      '</svg>'
    );
    const playniteLogo = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
      '<rect width="512" height="512" fill="#171923"/>' +
      '<path d="M135 366V143h127c73 0 116 37 116 101s-43 102-116 102h-49v20z" fill="#7b68ee"/>' +
      '<path d="M213 204v79h47c29 0 45-14 45-40s-16-39-45-39z" fill="#171923"/>' +
      '<text x="256" y="430" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="48" font-weight="700">PLAYNITE</text>' +
      '</svg>'
    );
    const games = [
      { title: 'Desktop', image: desktopIcon },
      { title: 'Retrobat', image: retrobatLogo },
      { title: 'Playnite', image: playniteLogo },
      { title: 'Cyberpunk 2077', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/library_600x900_2x.jpg' },
      { title: 'The Witcher 3: Wild Hunt', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/292030/library_600x900_2x.jpg' },
      { title: 'Forza Horizon 5', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1551360/library_600x900_2x.jpg' },
      { title: 'Red Dead Redemption 2', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/library_600x900_2x.jpg' },
      { title: 'Baldur’s Gate 3', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/library_600x900_2x.jpg' },
      { title: 'Elden Ring', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/library_600x900_2x.jpg' },
      { title: 'Grand Theft Auto V', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/271590/library_600x900_2x.jpg' },
      { title: 'Sekiro: Shadows Die Twice', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/814380/library_600x900_2x.jpg' },
      { title: 'Hogwarts Legacy', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/990080/library_600x900_2x.jpg' },
      { title: 'Resident Evil 4', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2050650/library_600x900_2x.jpg' },
      { title: 'God of War', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1593500/library_600x900_2x.jpg' },
      { title: 'Horizon Zero Dawn', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1151640/library_600x900_2x.jpg' },
      { title: 'Marvel’s Spider-Man Remastered', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1817070/library_600x900_2x.jpg' },
      { title: 'Starfield', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1716740/library_600x900_2x.jpg' },
      { title: 'Apex Legends', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1172470/library_600x900_2x.jpg' },
      { title: 'Destiny 2', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1085660/library_600x900_2x.jpg' },
      { title: 'Rust', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/252490/library_600x900_2x.jpg' },
      { title: 'Dota 2', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/library_600x900_2x.jpg' },
      { title: 'Lethal Company', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1966720/library_600x900_2x.jpg' },
    ];

    for (const [index, game] of games.entries()) {
      // Match the real DOM produced by showApps() in platform/index.js.
      const card = document.createElement('div');
      card.id = `game-container-${index + 1}`;
      card.className = 'game-container mdl-card mdl-shadow--4dp' + (index === 2 ? ' current-game-active hovered' : '');
      card.setAttribute('role', 'link');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', game.title);

      const cell = document.createElement('div');
      cell.id = `game-${index + 1}`;
      cell.className = 'mdl-card__title mdl-card--expand';

      const title = document.createElement('div');
      title.className = 'game-title mdl-card__title-text';

      const text = document.createElement('span');
      text.className = 'game-text';
      text.textContent = game.title;
      if (game.title.length <= 20) text.classList.add('disable-animation');

      title.append(text);
      cell.append(title);
      card.append(cell);

      const image = document.createElement('img');
      image.src = game.image;
      image.alt = '';
      image.className = 'fade-in';
      card.append(image);
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
      flex-direction: column !important;
      width: 100% !important;
      min-height: 0 !important;
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
      flex: 1 1 auto !important;
      width: auto !important;
      height: auto !important;
      min-height: 0 !important;
      box-sizing: border-box !important;
      align-items: center !important;
      justify-content: flex-start !important;
      align-content: flex-start !important;
      flex-flow: row wrap !important;
      margin: 15px 0 !important;
      padding: 15px 80px !important;
    }
    #game-grid .mdl-card.hovered { transform: scale(1.12); }
    #game-grid .mdl-card img { opacity: 1 !important; }`;
    document.head.append(freeze);
  }, { theme });

  await page.evaluate(() => document.fonts.ready);
  // Wait for all cover images to finish decoding before taking the screenshot.
  const imageResults = await page.evaluate(async () => {
    const images = [...document.querySelectorAll('#game-grid img')];
    return Promise.all(images.map(async (image) => {
      try {
        await image.decode();
        return { src: image.currentSrc, loaded: image.naturalWidth > 0 };
      } catch {
        return { src: image.currentSrc || image.src, loaded: false };
      }
    }));
  });
  const failedImages = imageResults.filter((image) => !image.loaded);
  if (failedImages.length) {
    console.warn(`Could not load ${failedImages.length} game cover(s):`);
    failedImages.forEach((image) => console.warn(image.src));
  }
  await mkdir(resolve(output, '..'), { recursive: true });
  await page.screenshot({ path: output, type: 'jpeg', quality: 95 });
  console.log(`Rendered ${output} (1920x1080 JPEG)`);
} finally {
  await browser.close();
}
