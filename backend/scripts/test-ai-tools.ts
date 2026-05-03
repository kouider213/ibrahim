/**
 * Test script for AI generation tools — run with: npx tsx scripts/test-ai-tools.ts
 * Tests: isValidMp4Buffer logic, FFmpeg binary, Replicate connectivity, fal.ai connectivity
 */
import { execSync } from 'child_process';
import axios from 'axios';
import * as fs from 'fs';

// ── isValidMp4Buffer — inline replica of the real function ──────────────────
function isValidMp4Buffer(buf: Buffer): boolean {
  if (buf.length < 50_000) return false;
  return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
}

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else           { console.error(`  ❌ ${label}`); failed++; }
}

async function main() {
  // ── 1. isValidMp4Buffer unit tests ────────────────────────────────────────
  console.log('\n## 1. isValidMp4Buffer — tests unitaires');

  assert('rejects buffer < 50KB', !isValidMp4Buffer(Buffer.alloc(1000)));

  const fakeBig = Buffer.alloc(60_000);
  assert('rejects valid-size buffer without ftyp magic', !isValidMp4Buffer(fakeBig));

  const fakeValid = Buffer.alloc(60_000);
  fakeValid[4] = 0x66; fakeValid[5] = 0x74; fakeValid[6] = 0x79; fakeValid[7] = 0x70;
  assert('accepts buffer with ftyp magic bytes at offset 4', isValidMp4Buffer(fakeValid));

  assert('rejects exactly 50000 bytes', !isValidMp4Buffer(Buffer.alloc(50_000)));

  const borderValid = Buffer.alloc(50_001);
  borderValid[4] = 0x66; borderValid[5] = 0x74; borderValid[6] = 0x79; borderValid[7] = 0x70;
  assert('accepts 50001 bytes with ftyp magic', isValidMp4Buffer(borderValid));

  // ── 2. FFmpeg binary ───────────────────────────────────────────────────────
  console.log('\n## 2. FFmpeg binary');
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegPath: string | null = require('ffmpeg-static');
    assert('ffmpeg-static package importable', Boolean(ffmpegPath));
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      const out = execSync(`"${ffmpegPath}" -version 2>&1`).toString().slice(0, 80);
      assert('ffmpeg binary executes', out.includes('ffmpeg version'));
    } else {
      assert('ffmpeg binary file exists on disk', false);
    }
  } catch (e: any) {
    if ((e.message as string).includes('Cannot find module')) {
      console.log('  ⏭  SKIP — ffmpeg-static non installé en local (présent sur Railway)');
    } else {
      assert(`ffmpeg-static: ${e.message}`, false);
    }
  }

  // ── 3. Replicate connectivity ──────────────────────────────────────────────
  console.log('\n## 3. Replicate API (REPLICATE_API_TOKEN)');
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) {
    console.log('  ⏭  SKIP — REPLICATE_API_TOKEN absent (normal en local)');
  } else {
    try {
      const resp = await axios.get('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro', {
        headers: { Authorization: `Bearer ${replicateToken}` },
        timeout: 10_000,
      });
      assert(`Replicate auth OK (status ${resp.status})`, resp.status === 200);
      assert('model flux-1.1-pro accessible', Boolean(resp.data?.name));
    } catch (e: any) {
      assert(`Replicate connectivity: ${e.message}`, false);
    }
  }

  // ── 4. fal.ai connectivity ─────────────────────────────────────────────────
  console.log('\n## 4. fal.ai API (FAL_KEY)');
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.log('  ⏭  SKIP — FAL_KEY absent (normal en local)');
  } else {
    try {
      const resp = await axios.head('https://queue.fal.run/fal-ai/kling-video/v1.6/standard/text-to-video', {
        headers: { Authorization: `Key ${falKey}` },
        timeout: 10_000,
        validateStatus: (s) => s < 500,
      });
      assert(`fal.ai reachable (status ${resp.status})`, resp.status < 500);
    } catch (e: any) {
      assert(`fal.ai connectivity: ${e.message}`, false);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n─────────────────────────────────────`);
  console.log(`Total: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
