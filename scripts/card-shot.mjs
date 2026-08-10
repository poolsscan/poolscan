/**
 * Render a post card to PNG.
 *
 * The /card route serves the card as standalone HTML, so screenshotting it at a
 * fixed viewport gives a ready-to-post image with the real brand fonts — no
 * design tool in the loop.
 *
 *   pnpm dev                      # in another terminal
 *   node scripts/card-shot.mjs "<card url>" out.png
 *
 * Needs Playwright available (NODE_PATH=$(npm root -g) if it's installed globally).
 */
import { createRequire } from "node:module";

// Resolved through require so a globally-installed Playwright on NODE_PATH is
// found — ESM import ignores NODE_PATH entirely.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/card-shot.mjs "<url>" <out.png>');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 675 },
  deviceScaleFactor: 2, // 2400x1350 — crisp after social-media recompression
});
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200); // let the webfonts actually paint
await page.screenshot({ path: out });
await browser.close();
console.log("saved", out);
