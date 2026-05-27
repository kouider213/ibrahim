"use strict";
/**
 * scene-assembler.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Multi-scene video assembly engine for Fik Conciergerie marketing videos.
 *
 * Car scenes  → Runway Gen-4 Turbo / Kling 1.6 (photorealistic AI video)
 * UI scenes   → FFmpeg synthetic  (phone, WhatsApp, TikTok, CTA)
 *               Instant generation, text always readable, zero AI cost.
 * Assembly    → FFmpeg concat + text overlays + voice + optional music
 * ──────────────────────────────────────────────────────────────────────────────
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSceneFont = ensureSceneFont;
exports.generateUISceneFile = generateUISceneFile;
exports.addOverlayToClip = addOverlayToClip;
exports.concatScenesWithVoice = concatScenesWithVoice;
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// @ts-ignore
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const create_marketing_video_js_1 = require("./create-marketing-video.js");
const W = 1080;
const H = 1920;
const FPS = 25;
const FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/montserrat/static/Montserrat-Bold.ttf';
const FONT_CACHE = path.join(os.tmpdir(), 'dzaryx-scene-font.ttf');
// ── Font helper ───────────────────────────────────────────────────────────────
async function ensureSceneFont() {
    try {
        await fs.access(FONT_CACHE);
        return FONT_CACHE;
    }
    catch {
        try {
            const { data } = await axios_1.default.get(FONT_URL, {
                responseType: 'arraybuffer', timeout: 15_000,
            });
            await fs.writeFile(FONT_CACHE, Buffer.from(data));
            return FONT_CACHE;
        }
        catch {
            return null;
        }
    }
}
// ── Text escape for FFmpeg drawtext ──────────────────────────────────────────
function esc(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/:/g, '\\:')
        .replace(/[[\]{}%!,]/g, '')
        .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a')
        .replace(/[ùûü]/g, 'u').replace(/[ôö]/g, 'o')
        .replace(/[îï]/g, 'i').replace(/ç/g, 'c')
        .replace(/[ÉÈÊ]/g, 'E').replace(/[ÀÂ]/g, 'A')
        .replace(/[ÙÛ]/g, 'U').replace(/Ô/g, 'O')
        .replace(/Î/g, 'I').replace(/Ç/g, 'C')
        .slice(0, 85);
}
function dt(text, fontPath, extra = '') {
    const fp = fontPath ? `fontfile='${fontPath}':` : '';
    return `drawtext=${fp}text='${esc(text)}':${extra}`;
}
// ── FFmpeg spawn helper ───────────────────────────────────────────────────────
function runFFmpeg(args) {
    const bin = ffmpeg_static_1.default;
    if (!bin)
        throw new Error('ffmpeg-static not found');
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)(bin, args, { stdio: 'pipe' });
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', code => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
        });
        proc.on('error', reject);
    });
}
const BASE_OUT_ARGS = [
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart',
];
// ── UI Scene: Phone Search ────────────────────────────────────────────────────
async function genPhoneSearch(spec, out, fp) {
    const title = esc(spec.ui_title ?? 'location voiture oran');
    const lines = (spec.ui_lines ?? [
        'location voiture oran',
        'location oran aeroport',
        'voiture oran sans caution',
        'location pas cher oran',
        'fik conciergerie oran',
    ]).slice(0, 5);
    const vf = [
        // Search bar
        `drawbox=x=60:y=90:w=960:h=110:color=0x2c2c2e:t=fill:r=55`,
        dt(title, fp, `fontsize=42:fontcolor=0x8e8e93:x=110:y=132`),
        // Magnifier icon placeholder
        `drawbox=x=80:y=120:w=28:h=28:color=0x8e8e93:t=fill:r=14`,
        // Results list
        ...lines.flatMap((l, i) => {
            const y = 260 + i * 105;
            return [
                dt(l, fp, `fontsize=44:fontcolor=white:x=90:y=${y}`),
                `drawbox=x=0:y=${y + 82}:w=${W}:h=1:color=0x2c2c2e:t=fill`,
            ];
        }),
    ];
    await runFFmpeg([
        '-y', '-f', 'lavfi', '-i', `color=c=0x1c1c1e:s=${W}x${H}:r=${FPS}`,
        '-t', String(spec.duration), '-vf', vf.join(','),
        ...BASE_OUT_ARGS, out,
    ]);
}
// ── UI Scene: WhatsApp ────────────────────────────────────────────────────────
async function genWhatsApp(spec, out, fp) {
    const all = spec.ui_lines ?? [
        'Bonjour avez-vous une voiture',
        'disponible ce weekend ?',
        '|||',
        'Oui bien sur ! Quelle date ?',
        'Reponse sous 5 min garantie',
    ];
    const sep = all.indexOf('|||');
    const client = sep > 0 ? all.slice(0, sep) : all.slice(0, 2);
    const agent = sep > 0 ? all.slice(sep + 1) : all.slice(2, 4);
    const cH = 40 + client.length * 65;
    const aH = 40 + agent.length * 65;
    const cY = 210;
    const aY = cY + cH + 50;
    const vf = [
        // Header
        `drawbox=x=0:y=0:w=${W}:h=170:color=0x075e54:t=fill`,
        `drawbox=x=60:y=50:w=110:h=110:color=0x128c7e:t=fill:r=55`,
        dt('Fik Conciergerie', fp, `fontsize=48:fontcolor=white:x=200:y=58`),
        dt('En ligne', fp, `fontsize=34:fontcolor=0x9de0d4:x=200:y=118`),
        // Background
        `drawbox=x=0:y=170:w=${W}:h=${H - 170}:color=0xece5dd:t=fill`,
        // Client bubble
        `drawbox=x=50:y=${cY}:w=720:h=${cH}:color=white:t=fill:r=25`,
        ...client.map((l, i) => dt(l, fp, `fontsize=36:fontcolor=0x303030:x=78:y=${cY + 20 + i * 65}`)),
        // Agent bubble
        `drawbox=x=${W - 770}:y=${aY}:w=720:h=${aH}:color=0xdcf8c6:t=fill:r=25`,
        ...agent.map((l, i) => dt(l, fp, `fontsize=36:fontcolor=0x303030:x=${W - 742}:y=${aY + 20 + i * 65}`)),
        // Read tick
        dt('Lu ✓✓', fp, `fontsize=28:fontcolor=0x53bdeb:x=${W - 200}:y=${aY + aH + 8}`),
    ];
    await runFFmpeg([
        '-y', '-f', 'lavfi', '-i', `color=c=0xece5dd:s=${W}x${H}:r=${FPS}`,
        '-t', String(spec.duration), '-vf', vf.join(','),
        ...BASE_OUT_ARGS, out,
    ]);
}
// ── UI Scene: TikTok feed ─────────────────────────────────────────────────────
async function genTikTok(spec, out, fp) {
    const query = esc(spec.ui_title ?? 'location voiture oran');
    const lines = (spec.ui_lines ?? [
        '@fikconcierge',
        'Location Voiture Oran',
        'Livraison Aeroport',
        'Reponse rapide WhatsApp',
    ]).map(esc);
    const vf = [
        // Top bar
        `drawbox=x=0:y=0:w=${W}:h=108:color=0x010101:t=fill`,
        dt(query, fp, `fontsize=46:fontcolor=white:x=80:y=42`),
        `drawbox=x=0:y=110:w=${W}:h=3:color=0x333333:t=fill`,
        // Video card
        `drawbox=x=0:y=113:w=${W}:h=${H - 113}:color=0x111111:t=fill`,
        // Right sidebar icons
        `drawbox=x=${W - 130}:y=400:w=100:h=100:color=0x222222:t=fill:r=50`,
        dt('Like', fp, `fontsize=28:fontcolor=0xaaaaaa:x=${W - 120}:y=515`),
        `drawbox=x=${W - 130}:y=560:w=100:h=100:color=0x222222:t=fill:r=50`,
        dt('Comm.', fp, `fontsize=28:fontcolor=0xaaaaaa:x=${W - 125}:y=675`),
        // Bottom info
        `drawbox=x=0:y=${H - 350}:w=${W}:h=350:color=0x000000@0.6:t=fill`,
        ...lines.map((l, i) => {
            const y = H - 320 + i * 90;
            const color = i === 0 ? 'white' : (i < 2 ? 'white' : '0xaaaaaa');
            const fsize = i === 0 ? 52 : (i < 2 ? 42 : 38);
            return dt(l, fp, `fontsize=${fsize}:fontcolor=${color}:x=60:y=${y}`);
        }),
    ];
    await runFFmpeg([
        '-y', '-f', 'lavfi', '-i', `color=c=0x010101:s=${W}x${H}:r=${FPS}`,
        '-t', String(spec.duration), '-vf', vf.join(','),
        ...BASE_OUT_ARGS, out,
    ]);
}
// ── UI Scene: Problem (red text) ──────────────────────────────────────────────
async function genProblem(spec, out, fp) {
    const lines = (spec.ui_lines ?? [
        'Personne ne repond.',
        'Prix trop eleves.',
        'Plus de disponibilite.',
        'Pas serieux.',
    ]).map(esc);
    const totalH = lines.length * 130;
    const startY = Math.floor((H - totalH) / 2);
    const vf = lines.map((l, i) => dt(l, fp, `fontsize=60:fontcolor=0xff4444:x=(w-tw)/2:y=${startY + i * 130}:shadowcolor=black@0.8:shadowx=4:shadowy=4`));
    await runFFmpeg([
        '-y', '-f', 'lavfi', '-i', `color=c=${spec.ui_color ?? '0x0d0d0d'}:s=${W}x${H}:r=${FPS}`,
        '-t', String(spec.duration), '-vf', vf.join(','),
        ...BASE_OUT_ARGS, out,
    ]);
}
// ── UI Scene: CTA ─────────────────────────────────────────────────────────────
async function genCTA(spec, out, fp) {
    const lines = (spec.ui_lines ?? [
        'FIK CONCIERGERIE',
        'Location Voiture Oran',
        'Livraison Aeroport',
        'WhatsApp +213 XX XX XX XX',
        'Reponse garantie',
    ]).map(esc);
    const yPos = [370, 500, 600, 820, 940];
    const fSizes = [80, 52, 48, 52, 40];
    const colors = ['0xFFD700', 'white', 'white', '0x25D366', '0x25D366'];
    const vf = [
        // Gold line top
        `drawbox=x=80:y=300:w=${W - 160}:h=4:color=0xFFD700:t=fill`,
        ...lines.map((l, i) => dt(l, fp, `fontsize=${fSizes[i] ?? 44}:fontcolor=${colors[i] ?? 'white'}:x=(w-tw)/2:y=${yPos[i] ?? (370 + i * 120)}:shadowcolor=black@0.7:shadowx=4:shadowy=4`)),
        // Gold line bottom
        `drawbox=x=80:y=1030:w=${W - 160}:h=4:color=0xFFD700:t=fill`,
    ];
    await runFFmpeg([
        '-y', '-f', 'lavfi', '-i', `color=c=0x0a0a0a:s=${W}x${H}:r=${FPS}`,
        '-t', String(spec.duration), '-vf', vf.join(','),
        ...BASE_OUT_ARGS, out,
    ]);
}
// ── Generate one UI scene to file ─────────────────────────────────────────────
async function generateUISceneFile(spec, outPath, fontPath) {
    switch (spec.type) {
        case 'ui_phone_search': return genPhoneSearch(spec, outPath, fontPath);
        case 'ui_whatsapp': return genWhatsApp(spec, outPath, fontPath);
        case 'ui_tiktok': return genTikTok(spec, outPath, fontPath);
        case 'ui_problem': return genProblem(spec, outPath, fontPath);
        case 'ui_cta': return genCTA(spec, outPath, fontPath);
        default:
            throw new Error(`Unknown UI scene type: ${spec.type}`);
    }
}
// ── Add text overlay caption to an existing car clip ─────────────────────────
async function addOverlayToClip(inputBuffer, overlayText, fontPath) {
    const bin = ffmpeg_static_1.default;
    if (!bin)
        return inputBuffer;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dzaryx-ov-'));
    const inPath = path.join(tmpDir, 'in.mp4');
    const outPath = path.join(tmpDir, 'out.mp4');
    try {
        await fs.writeFile(inPath, inputBuffer);
        const fp = fontPath ? `'${fontPath}'` : undefined;
        const t = esc(overlayText);
        const vf = [
            `drawbox=x=0:y=h-190:w=w:h=190:color=black@0.65:t=fill`,
            fp
                ? `drawtext=fontfile=${fp}:text='${t}':fontsize=54:fontcolor=white:x=(w-tw)/2:y=h-140:shadowcolor=black@0.9:shadowx=3:shadowy=3`
                : `drawtext=text='${t}':fontsize=54:fontcolor=white:x=(w-tw)/2:y=h-140`,
        ].join(',');
        await runFFmpeg([
            '-y', '-i', inPath, '-vf', vf,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
            '-c:a', 'copy', '-movflags', '+faststart', outPath,
        ]);
        return await fs.readFile(outPath);
    }
    finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => { });
    }
}
// ── Concat scene buffers into one video with voice ────────────────────────────
async function concatScenesWithVoice(scenePaths, voiceBuffer, tmpDir) {
    if (scenePaths.length === 0)
        throw new Error('No scene files to concat');
    // Single scene — skip concat, just merge audio
    if (scenePaths.length === 1) {
        const buf = await fs.readFile(scenePaths[0]);
        return voiceBuffer ? (0, create_marketing_video_js_1.mergeVideoWithAudio)(buf, voiceBuffer) : buf;
    }
    const listPath = path.join(tmpDir, 'concat.txt');
    const concatPath = path.join(tmpDir, 'concat_raw.mp4');
    const finalPath = path.join(tmpDir, 'final.mp4');
    // Normalise each scene to same dimensions + fps before concat
    const normPaths = [];
    for (let i = 0; i < scenePaths.length; i++) {
        const normPath = path.join(tmpDir, `norm_${i}.mp4`);
        await runFFmpeg([
            '-y', '-i', scenePaths[i],
            '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
            '-r', String(FPS), '-c:v', 'libx264', '-preset', 'ultrafast',
            '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', normPath,
        ]);
        normPaths.push(normPath);
    }
    await fs.writeFile(listPath, normPaths.map(p => `file '${p}'`).join('\n'));
    await runFFmpeg([
        '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
        '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart',
        concatPath,
    ]);
    if (!voiceBuffer) {
        return fs.readFile(concatPath);
    }
    // Merge with voice
    const voicePath = path.join(tmpDir, 'voice.mp3');
    await fs.writeFile(voicePath, voiceBuffer);
    await runFFmpeg([
        '-y', '-i', concatPath, '-i', voicePath,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
        '-movflags', '+faststart', finalPath,
    ]);
    return fs.readFile(finalPath);
}
//# sourceMappingURL=scene-assembler.js.map