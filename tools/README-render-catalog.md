# Moonlight catalog renderer

This helper renders the actual HTML/CSS interface from `wasm/index.html` in headless Chromium. It does not modify application sources or require a Tizen TV, a Sunshine host, or a streaming session.

## Requirements

- Node.js 18+
- Playwright and its Chromium browser

## Render

From the repository root:

```sh
npm install --no-save playwright
npx playwright install chromium
node tools/render-catalog.mjs
```

The output is `moonlight-catalog.jpg` at 1920x1080. Use `--output path/to/file.jpg` to change the destination and `--theme original` to select a color theme.

The script injects sample game cards into the real `#game-grid` element and stubs only the Tizen application API needed during page startup. It does not change tracked application files.
