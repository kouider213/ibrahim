"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileContent = getFileContent;
exports.updateFile = updateFile;
exports.listDirectory = listDirectory;
exports.triggerNetlifyDeploy = triggerNetlifyDeploy;
exports.vercelGetDeployments = vercelGetDeployments;
exports.vercelGetDeploymentLogs = vercelGetDeploymentLogs;
exports.vercelCheckUrl = vercelCheckUrl;
exports.vercelRedeploy = vercelRedeploy;
exports.getRecentCommits = getRecentCommits;
exports.createClientSiteOnNetlify = createClientSiteOnNetlify;
exports.searchCode = searchCode;
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
const GITHUB_API = 'https://api.github.com';
const OWNER = env_js_1.env.GITHUB_OWNER ?? 'kouider213';
const FIK_REPO = 'autolux-location';
const IBRAHIM_REPO = env_js_1.env.GITHUB_DEFAULT_REPO ?? 'ibrahim';
function getHeaders() {
    return {
        Authorization: `Bearer ${env_js_1.env.GITHUB_TOKEN ?? ''}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
    };
}
// ── Read file from GitHub ─────────────────────────────────────
async function getFileContent(path, repo = FIK_REPO) {
    try {
        const { data } = await axios_1.default.get(`${GITHUB_API}/repos/${OWNER}/${repo}/contents/${path}`, { headers: getHeaders() });
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return { content, sha: data.sha };
    }
    catch {
        return null;
    }
}
// ── Update/create file on GitHub ─────────────────────────────
async function updateFile(path, newContent, commitMessage, repo = FIK_REPO) {
    // Get current SHA (required for updates)
    const existing = await getFileContent(path, repo);
    try {
        const body = {
            message: commitMessage,
            content: Buffer.from(newContent).toString('base64'),
        };
        if (existing)
            body['sha'] = existing.sha;
        const { data } = await axios_1.default.put(`${GITHUB_API}/repos/${OWNER}/${repo}/contents/${path}`, body, { headers: getHeaders() });
        return { commitSha: data.commit.sha };
    }
    catch (err) {
        console.error('[github] updateFile failed:', err instanceof Error ? err.message : String(err));
        return null;
    }
}
// ── List files in a directory ─────────────────────────────────
async function listDirectory(dirPath, repo = FIK_REPO) {
    try {
        const { data } = await axios_1.default.get(`${GITHUB_API}/repos/${OWNER}/${repo}/contents/${dirPath}`, { headers: getHeaders() });
        return data
            .map(f => ({ name: f.name, type: f.type, path: f.path }));
    }
    catch {
        return [];
    }
}
// ── Trigger Netlify deploy via Netlify API ────────────────────
async function triggerNetlifyDeploy(siteId = 'fik-conciergerie-oran') {
    const token = env_js_1.env.NETLIFY_TOKEN ?? '';
    try {
        await axios_1.default.post(`https://api.netlify.com/api/v1/sites/${siteId}/builds`, {}, { headers: { Authorization: `Bearer ${token}` } });
        return true;
    }
    catch {
        return false;
    }
}
// ── Vercel API — déploiements & vérifications ────────────────
async function vercelGetDeployments(projectName) {
    const token = env_js_1.env.VERCEL_TOKEN ?? '';
    if (!token)
        return [];
    try {
        const { data } = await axios_1.default.get(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectName)}&limit=5`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 });
        return data.deployments ?? [];
    }
    catch (err) {
        console.error('[vercel] getDeployments:', err instanceof Error ? err.message : err);
        return [];
    }
}
async function vercelGetDeploymentLogs(deploymentId) {
    const token = env_js_1.env.VERCEL_TOKEN ?? '';
    if (!token)
        return 'VERCEL_TOKEN non configuré';
    try {
        const { data } = await axios_1.default.get(`https://api.vercel.com/v2/deployments/${deploymentId}/events`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 });
        const events = data.slice(-30);
        return events.map((e) => `[${e.type}] ${e.payload?.text ?? e.payload?.info ?? JSON.stringify(e.payload).slice(0, 80)}`).join('\n') || 'Aucun log';
    }
    catch (err) {
        return `Erreur logs Vercel: ${err instanceof Error ? err.message : String(err)}`;
    }
}
async function vercelCheckUrl(url) {
    try {
        const resp = await axios_1.default.get(url, { timeout: 10_000, validateStatus: () => true });
        return { status: resp.status, ok: resp.status === 200 };
    }
    catch {
        return { status: 0, ok: false };
    }
}
async function vercelRedeploy(deploymentId) {
    const token = env_js_1.env.VERCEL_TOKEN ?? '';
    if (!token)
        return 'VERCEL_TOKEN non configuré dans Railway';
    try {
        const { data } = await axios_1.default.post(`https://api.vercel.com/v13/deployments?forceNew=1`, { deploymentId }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15_000 });
        const newId = data.id ?? '?';
        const newUrl = data.url ?? '?';
        return `✅ Redéploiement Vercel lancé — ID: ${newId} | URL: https://${newUrl}`;
    }
    catch (err) {
        return `❌ Erreur redéploiement Vercel: ${err.response?.data?.error?.message ?? err.message}`;
    }
}
// ── Get recent commits ─────────────────────────────────────────
async function getRecentCommits(repo = FIK_REPO, limit = 5) {
    try {
        const { data } = await axios_1.default.get(`${GITHUB_API}/repos/${OWNER}/${repo}/commits?per_page=${limit}`, { headers: getHeaders() });
        return data.map(c => ({
            sha: c.sha.slice(0, 7),
            message: c.commit.message.split('\n')[0] ?? '',
            date: c.commit.committer.date,
            author: c.commit.author.name,
        }));
    }
    catch {
        return [];
    }
}
async function createClientSiteOnNetlify(config) {
    const token = env_js_1.env.NETLIFY_TOKEN ?? '';
    const siteName = `client-${config.clientName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    try {
        const { data } = await axios_1.default.post('https://api.netlify.com/api/v1/sites', {
            name: siteName,
            custom_domain: null,
            repo: {
                provider: 'github',
                repo: `${OWNER}/${IBRAHIM_REPO}`,
                branch: 'main',
                base_dir: 'mobile',
                build_cmd: 'echo "static site"',
                dir: 'mobile/public',
            },
        }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
        return {
            siteUrl: data.url,
            adminUrl: `https://app.netlify.com/sites/${siteName}`,
        };
    }
    catch (err) {
        console.error('[github] createClientSite failed:', err instanceof Error ? err.message : String(err));
        return null;
    }
}
async function searchCode(repo, query) {
    try {
        const { data } = await axios_1.default.get(`${GITHUB_API}/search/code`, {
            headers: { ...getHeaders(), Accept: 'application/vnd.github.v3+json' },
            params: { q: `${query} repo:${OWNER}/${repo}`, per_page: 10 },
        });
        const items = data.items;
        if (!items.length)
            return `Aucun résultat pour "${query}" dans ${repo}`;
        return items.map(i => `📄 ${i.path}`).join('\n');
    }
    catch (err) {
        return `Erreur recherche code: ${err instanceof Error ? err.message : String(err)}`;
    }
}
//# sourceMappingURL=github.js.map