// Genera los iconos PNG de la PWA a partir de public/icon.svg (usa Chromium de Playwright).
// Uso: node scripts/generate-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public');
const svg = readFileSync(join(publicDir, 'icon.svg'), 'utf8');
const targets = [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
];

const browser = await chromium.launch();
try {
  for (const [name, size] of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
    );
    await page.screenshot({ path: join(publicDir, name), omitBackground: true });
    await page.close();
    console.log(`Generado ${name}`);
  }
} finally {
  await browser.close();
}
