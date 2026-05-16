import { detectMood } from '../orchestrator/mood-detector.js';

const tests = [
  { text: 'urgent putain vite!!', label: 'stressed/angry', expected: ['stressed', 'angry'] },
  { text: 'super merci beaucoup', label: 'happy', expected: ['happy'] },
  { text: 'ok', label: 'rushed', expected: ['rushed'] },
  { text: 'je suis epuise j ai pas dormi', label: 'tired', expected: ['tired'] },
  { text: 'j ai peur que ca marche pas', label: 'anxious', expected: ['anxious'] },
  { text: 'Bonjour peux-tu me donner le rapport financier', label: 'normal', expected: ['normal', 'focused'] },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const r = detectMood(t.text, 14);
  const ok = t.expected.includes(r.mood);
  const status = ok ? '✅' : '❌';
  console.log(`${status} [${t.label}] mood=${r.mood} intensity=${r.intensity} tone=${r.tone} signals=[${r.signals.slice(0,3).join(',')}]`);
  if (!ok) {
    console.log(`   expected one of: [${t.expected.join(',')}]`);
    failed++;
  } else {
    passed++;
  }
}

console.log(`\nRésultat: ${passed}/${tests.length} tests passés`);
if (failed > 0) process.exit(1);
