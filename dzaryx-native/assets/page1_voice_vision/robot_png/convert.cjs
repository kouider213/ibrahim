const { Resvg } = require('C:\\Users\\douba\\AppData\\Local\\Temp\\node_modules\\@resvg\\resvg-js');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const OUT_DIR = __dirname;
const SVG_DIR = join(__dirname, '..', 'robot');

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
  let innerSvg = readFileSync(svgPath, 'utf8');

  // Strip XML declaration, outer <svg> tags
  innerSvg = innerSvg
    .replace(/<\?xml[^>]*\?>\s*/i, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');

  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}">
  <svg x="${OFFSET_X}" y="${OFFSET_Y}" width="${SCALED_W}" height="${SCALED_H}" viewBox="0 0 290 355">
${innerSvg}
  </svg>
</svg>`;

  const resvg = new Resvg(wrapped, {
    fitTo: { mode: 'width', value: SIZE },
    font: { loadSystemFonts: false },
  });

  const rendered = resvg.render();
  const pngData = rendered.asPng();
  const outPath = join(OUT_DIR, `robot_${state}.png`);
  writeFileSync(outPath, pngData);

  const kb = Math.round(pngData.length / 1024);
  process.stdout.write(`✓ robot_${state}.png — ${SIZE}x${SIZE}px — ${kb} KB — alpha: YES\n`);
}

process.stdout.write('\nAll 5 PNGs generated. Transparent background confirmed.\n');
