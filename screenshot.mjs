import puppeteer from 'puppeteer';
import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = join(__dirname, 'temporary screenshots');

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] ? `-${process.argv[3]}` : '';

async function nextIndex(dir) {
  try {
    const files = await readdir(dir);
    const nums = files.map(f => parseInt(f.match(/^screenshot-(\d+)/)?.[1] || '0')).filter(Boolean);
    return nums.length ? Math.max(...nums) + 1 : 1;
  } catch { return 1; }
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const n = await nextIndex(OUT_DIR);
  const filename = `screenshot-${n}${label}.png`;
  const outPath = join(OUT_DIR, filename);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.screenshot({ path: outPath, fullPage: false });
  await browser.close();

  console.log(`Saved: ${outPath}`);
})();
