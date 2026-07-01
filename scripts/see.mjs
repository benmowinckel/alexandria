#!/usr/bin/env node
/**
 * see.mjs — Visual capture tool for Claude Code.
 *
 * Usage:
 *   node scripts/see.mjs <url> [--full] [--dark] [--wait <ms>]
 *   node scripts/see.mjs localhost [--port 3000]
 *
 * Captures screenshots at three breakpoints (desktop 1440, tablet 768, mobile 390).
 * Outputs PNG paths for Claude to read with the Read tool.
 *
 * Options:
 *   --full        Full-page screenshot (default: viewport only)
 *   --dark        Force dark mode (prefers-color-scheme: dark)
 *   --wait <ms>   Wait after load before capture (default: 1000)
 *   --port <n>    Port for localhost (default: 3000)
 *   --out <dir>   Output directory (default: <repo-root>/.see/)
 *   --only <bp>   Single breakpoint: desktop, tablet, or mobile
 *   --video       Record a scroll-through video (webm). Scrolls top to bottom slowly.
 *   --scroll <ms> Scroll duration in ms (default: 5000, only with --video)
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync, readdirSync, unlinkSync, statSync, renameSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node see.mjs <url> [--full] [--dark] [--wait ms] [--port n] [--only bp] [--video] [--scroll ms]');
  process.exit(1);
}

// Parse args
function getFlag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = getFlag('out', resolve(repoRoot, '.see'));

const flags = {
  full: args.includes('--full'),
  dark: args.includes('--dark'),
  video: args.includes('--video'),
  wait: parseInt(getFlag('wait', '1000')),
  port: parseInt(getFlag('port', '3000')),
  out: outDir,
  only: getFlag('only', null),
  scroll: parseInt(getFlag('scroll', '5000')),
};

let target = args[0];

// Resolve target
if (target === 'localhost' || target === 'local') {
  target = `http://localhost:${flags.port}`;
} else if (!target.startsWith('http') && !target.startsWith('file://')) {
  if (existsSync(target)) {
    target = `file://${resolve(target)}`;
  } else {
    target = `https://${target}`;
  }
}

// Ensure output dir
mkdirSync(flags.out, { recursive: true });

// Clean old files (keep last 30 images + 10 videos)
try {
  const allFiles = readdirSync(flags.out);
  const images = allFiles.filter(f => f.endsWith('.png'))
    .map(f => ({ name: f, time: statSync(resolve(flags.out, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const f of images.slice(30)) unlinkSync(resolve(flags.out, f.name));

  const videos = allFiles.filter(f => f.endsWith('.webm'))
    .map(f => ({ name: f, time: statSync(resolve(flags.out, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const f of videos.slice(10)) unlinkSync(resolve(flags.out, f.name));
} catch { /* ignore cleanup errors */ }

// Breakpoints
// mobile/tablet emulate touch (hasTouch) so input-method media queries —
// (hover: none) and (pointer: coarse) — match like a real device, not just a
// narrow window. Detect input method, not screen size (design.md).
const allViewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024, touch: true },
  { name: 'mobile', width: 390, height: 844, touch: true },
];
const viewports = flags.only
  ? allViewports.filter(v => v.name === flags.only)
  : allViewports;

// Timestamp for this capture
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const slug = new URL(target).hostname.replace(/[^a-z0-9]/gi, '_') || 'local';

async function smoothScroll(page, durationMs) {
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (scrollHeight <= 0) return;

  const steps = Math.ceil(durationMs / 50); // 50ms per frame = 20fps scroll
  const stepPx = scrollHeight / steps;

  for (let i = 0; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(stepPx * i));
    await page.waitForTimeout(50);
  }

  // Pause at bottom
  await page.waitForTimeout(1000);

  // Scroll back up (faster)
  for (let i = steps; i >= 0; i--) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(stepPx * i));
    await page.waitForTimeout(30);
  }

  await page.waitForTimeout(500);
}

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const paths = [];

  for (const vp of viewports) {
    const contextOptions = {
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      colorScheme: flags.dark ? 'dark' : 'light',
      hasTouch: Boolean(vp.touch),
      isMobile: Boolean(vp.touch),
    };

    // Enable video recording
    if (flags.video) {
      contextOptions.recordVideo = {
        dir: flags.out,
        size: { width: vp.width, height: vp.height },
      };
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    try {
      await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
    } catch {
      try {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch (e) {
        console.error(`Failed to load ${target} at ${vp.name}: ${e.message}`);
        await context.close();
        continue;
      }
    }

    await page.waitForTimeout(flags.wait);

    // Screenshots (always, even with --video)
    const imgFilename = `${slug}_${vp.name}_${ts}.png`;
    const imgFilepath = resolve(flags.out, imgFilename);
    await page.screenshot({ path: imgFilepath, fullPage: flags.full, type: 'png' });
    paths.push(imgFilepath);
    console.log(imgFilepath);

    // Video: scroll through the page to capture hover areas, animations, scroll triggers
    if (flags.video) {
      // Hover over key interactive elements to trigger hover states
      const interactiveSelectors = ['a', 'button', '[role="button"]', 'input', '.card', '[class*="hover"]'];
      for (const sel of interactiveSelectors) {
        try {
          const elements = await page.$$(sel);
          for (const el of elements.slice(0, 5)) { // max 5 per type
            await el.hover({ timeout: 500 }).catch(() => {});
            await page.waitForTimeout(300);
          }
        } catch { /* skip */ }
      }

      // Smooth scroll to capture scroll-triggered animations
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(300);
      await smoothScroll(page, flags.scroll);

      // Close context to finalize video
      const video = page.video();
      await context.close();

      if (video) {
        const tempPath = await video.path();
        const videoFilename = `${slug}_${vp.name}_${ts}.webm`;
        const videoFilepath = resolve(flags.out, videoFilename);
        try {
          renameSync(tempPath, videoFilepath);
          paths.push(videoFilepath);
          console.log(videoFilepath);
        } catch {
          // Video may already be at tempPath in the out dir
          paths.push(tempPath);
          console.log(tempPath);
        }
      }
    } else {
      await context.close();
    }
  }

  await browser.close();

  const imgs = paths.filter(p => p.endsWith('.png'));
  const vids = paths.filter(p => p.endsWith('.webm'));
  console.log(`\n${imgs.length} screenshots${vids.length ? ` + ${vids.length} videos` : ''} captured.`);
}

capture().catch(e => {
  console.error(e.message);
  process.exit(1);
});
