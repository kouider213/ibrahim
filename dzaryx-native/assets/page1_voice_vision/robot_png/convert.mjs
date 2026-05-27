import { Resvg } from 'C:/Users/douba/AppData/Local/Temp/node_modules/@resvg/resvg-js/index.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const SVG_DIR = join(__dir, '..', 'robot');
const OUT_DIR = __dir;

const SIZE = 2048;
const ROBOT_W = 290;
const ROBOT_H = 355;
const SCALE = Math.min((SIZE * 0.88) / ROBOT_W, (SIZE * 0.88) / ROBOT_H);
const SCALED_W = Math.round(ROBOT_W * SCALE);
const SCALED_H = Math.round(ROBOT_H * SCALE);
const OFFSET_X = Math.round((SIZE - SCALED_W) / 2);
const OFFSET_Y = Math.round((SIZE - SCALED_H) / 2);

const STATES = ['idle', 'listening', 'thinking', 'speaking', 'vision'];

for (const state of STATES) {
  const svgPath = join(SVG_DIR, `robot_${state}.svg`);
  const innerSvg = readFileSync(svgPath, 'utf8');

  // Wrap in 2048x2048 transparent container, centering the robot
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}">
  <svg x="${OFFSET_X}" y="${OFFSET_Y}" width="${SCALED_W}" height="${SCALED_H}" viewBox="0 0 290 355">
${innerSvg.replace(/<\?xml[^>]*\?>\s*/i, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}
  </svg>
</svg>`;

  const resvg = new Resvg(wrapped, {
    background: undefined, // transparent
    fitTo: { mode: 'width', value: SIZE },
    font: { loadSystemFonts: false },
  });

  const png = resvg.render();
  const pngData = png.asPng();
  const outPath = join(OUT_DIR, `robot_${state}.png`);
  writeFileSync(outPath, pngData);

  const bytes = pngData.length;
  const kb = Math.round(bytes / 1024);
  console.log(`✓ robot_${state}.png — ${SIZE}x${SIZE} — ${kb} KB — alpha: YES`);
}

console.log('\nAll 5 PNGs generated with transparent background.');
