import sharp from 'sharp';
import { copyFileSync } from 'fs';

// Reuse the same robot SVG as the app icon but adapted for PWA dark bg
const svgRobot = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#0d1f35"/>
      <stop offset="55%" stop-color="#060e1a"/>
      <stop offset="100%" stop-color="#020810"/>
    </radialGradient>
    <radialGradient id="head" cx="35%" cy="28%" r="72%">
      <stop offset="0%" stop-color="#1a3a5c"/>
      <stop offset="40%" stop-color="#0c1e30"/>
      <stop offset="100%" stop-color="#030a14"/>
    </radialGradient>
    <filter id="glow4" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow12" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="12" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow24" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="24" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="460" r="430" fill="none" stroke="#00d4ff" stroke-width="1.5" stroke-opacity="0.12" stroke-dasharray="18 44"/>
  <circle cx="512" cy="460" r="390" fill="none" stroke="#00d4ff" stroke-width="1" stroke-opacity="0.08" stroke-dasharray="10 32"/>
  <circle cx="512" cy="430" r="270" fill="#00d4ff" fill-opacity="0.05" filter="url(#glow24)"/>
  <circle cx="512" cy="430" r="230" fill="url(#head)"/>
  <circle cx="512" cy="430" r="230" fill="none" stroke="#00d4ff" stroke-width="2.5" stroke-opacity="0.35"/>
  <circle cx="512" cy="430" r="226" fill="none" stroke="white" stroke-width="0.8" stroke-opacity="0.06"/>
  <ellipse cx="420" cy="340" rx="80" ry="46" fill="white" fill-opacity="0.07"/>
  <ellipse cx="405" cy="328" rx="38" ry="20" fill="white" fill-opacity="0.08"/>
  <ellipse cx="512" cy="442" rx="158" ry="170" fill="#000000" fill-opacity="0.96"/>
  <ellipse cx="512" cy="442" rx="158" ry="170" fill="none" stroke="#00d4ff" stroke-width="0.8" stroke-opacity="0.14"/>
  <circle cx="438" cy="408" r="60" fill="#000810"/>
  <circle cx="438" cy="408" r="52" fill="none" stroke="#00d4ff" stroke-width="2.5" stroke-opacity="0.5" filter="url(#glow4)"/>
  <circle cx="438" cy="408" r="38" fill="#00d4ff" fill-opacity="0.92" filter="url(#glow12)"/>
  <circle cx="438" cy="408" r="20" fill="white" fill-opacity="0.36"/>
  <ellipse cx="422" cy="392" rx="13" ry="8" fill="white" fill-opacity="0.3"/>
  <circle cx="586" cy="408" r="60" fill="#000810"/>
  <circle cx="586" cy="408" r="52" fill="none" stroke="#00d4ff" stroke-width="2.5" stroke-opacity="0.5" filter="url(#glow4)"/>
  <circle cx="586" cy="408" r="38" fill="#00d4ff" fill-opacity="0.92" filter="url(#glow12)"/>
  <circle cx="586" cy="408" r="20" fill="white" fill-opacity="0.36"/>
  <ellipse cx="570" cy="392" rx="13" ry="8" fill="white" fill-opacity="0.3"/>
  <path d="M 454 486 Q 512 524 570 486" stroke="#00d4ff" stroke-width="7" stroke-linecap="round" fill="none" filter="url(#glow4)" opacity="0.85"/>
  <rect x="480" y="658" width="64" height="28" rx="10" fill="#0a1828" stroke="#00d4ff" stroke-width="1" stroke-opacity="0.25"/>
  <rect x="334" y="684" width="356" height="180" rx="50" fill="#0a1828" stroke="#00d4ff" stroke-width="2" stroke-opacity="0.3"/>
  <ellipse cx="512" cy="773" rx="100" ry="26" fill="#00d4ff" fill-opacity="0.06"/>
  <text x="512" y="792" fill="#00d4ff" font-family="Arial Black, Arial, sans-serif" font-size="52" font-weight="900" text-anchor="middle" letter-spacing="12" filter="url(#glow4)" opacity="0.92">DZARYX</text>
  <line x1="355" y1="726" x2="669" y2="726" stroke="#00d4ff" stroke-width="0.8" stroke-opacity="0.18"/>
  <circle cx="280" cy="460" r="56" fill="#0a1828" stroke="#00d4ff" stroke-width="1.5" stroke-opacity="0.3"/>
  <circle cx="280" cy="460" r="36" fill="#020a14"/>
  <circle cx="280" cy="460" r="14" fill="#00d4ff" fill-opacity="0.7" filter="url(#glow4)"/>
  <circle cx="744" cy="460" r="56" fill="#0a1828" stroke="#00d4ff" stroke-width="1.5" stroke-opacity="0.3"/>
  <circle cx="744" cy="460" r="36" fill="#020a14"/>
  <circle cx="744" cy="460" r="14" fill="#00d4ff" fill-opacity="0.7" filter="url(#glow4)"/>
  <ellipse cx="512" cy="900" rx="240" ry="28" fill="#00d4ff" fill-opacity="0.08" filter="url(#glow12)"/>
</svg>`;

async function gen(svgStr, outputPath, size) {
  await sharp(Buffer.from(svgStr))
    .resize(size, size)
    .png({ quality: 100 })
    .toFile(outputPath);
  console.log(`✅ ${outputPath} (${size}x${size})`);
}

const OUT = '../simulator/public/icons/';
await gen(svgRobot(192), `${OUT}icon-192.png`, 192);
await gen(svgRobot(512), `${OUT}icon-512.png`, 512);
console.log('\n🎨 PWA icons updated!');
