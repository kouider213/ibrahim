import axios from 'axios';
import { env } from '../config/env.js';

const GITHUB_API   = 'https://api.github.com';
const OWNER        = env.GITHUB_OWNER ?? 'kouider213';
const FIK_REPO     = 'autolux-location';
const IBRAHIM_REPO = env.GITHUB_DEFAULT_REPO ?? 'ibrahim';

function getHeaders() {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN ?? ''}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

// ── Read file from GitHub ─────────────────────────────────────

export async function getFileContent(
  path: string,
  repo = FIK_REPO,
): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await axios.get(
      `${GITHUB_API}/repos/${OWNER}/${repo}/contents/${path}`,
      { headers: getHeaders() },
    );
    const content = Buffer.from(data.content as string, 'base64').toString('utf-8');
    return { content, sha: data.sha as string };
  } catch {
    return null;
  }
}

// ── Update/create file on GitHub ─────────────────────────────

export async function updateFile(
  path: string,
  newContent: string,
  commitMessage: string,
  repo = FIK_REPO,
): Promise<{ commitSha: string } | null> {
  // Get current SHA (required for updates)
  const existing = await getFileContent(path, repo);

  try {
    const body: Record<string, string> = {
      message: commitMessage,
      content: Buffer.from(newContent).toString('base64'),
    };
    if (existing) body['sha'] = existing.sha;

    const { data } = await axios.put(
      `${GITHUB_API}/repos/${OWNER}/${repo}/contents/${path}`,
      body,
      { headers: getHeaders() },
    );
    return { commitSha: (data.commit as { sha: string }).sha };
  } catch (err) {
    console.error('[github] updateFile failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ── List files in a directory ─────────────────────────────────

export async function listDirectory(
  dirPath: string,
  repo = FIK_REPO,
): Promise<Array<{ name: string; type: 'file' | 'dir'; path: string }>> {
  try {
    const { data } = await axios.get(
      `${GITHUB_API}/repos/${OWNER}/${repo}/contents/${dirPath}`,
      { headers: getHeaders() },
    );
    return (data as Array<{ name: string; type: string; path: string }>)
      .map(f => ({ name: f.name, type: f.type as 'file' | 'dir', path: f.path }));
  } catch {
    return [];
  }
}

// ── Trigger Netlify deploy via Netlify API ────────────────────

export async function triggerNetlifyDeploy(siteId = 'fik-conciergerie-oran'): Promise<boolean> {
  const token = env.NETLIFY_TOKEN ?? '';
  try {
    await axios.post(
      `https://api.netlify.com/api/v1/sites/${siteId}/builds`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return true;
  } catch {
    return false;
  }
}

// ── Get recent commits ─────────────────────────────────────────

export async function getRecentCommits(
  repo = FIK_REPO,
  limit = 5,
): Promise<Array<{ sha: string; message: string; date: string; author: string }>> {
  try {
    const { data } = await axios.get(
      `${GITHUB_API}/repos/${OWNER}/${repo}/commits?per_page=${limit}`,
      { headers: getHeaders() },
    );
    return (data as Array<{
      sha: string;
      commit: { message: string; committer: { date: string }; author: { name: string } };
    }>).map(c => ({
      sha:     c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0] ?? '',
      date:    c.commit.committer.date,
      author:  c.commit.author.name,
    }));
  } catch {
    return [];
  }
}

// ── Create client site via Netlify ────────────────────────────

export interface ClientSiteConfig {
  clientName:   string;
  businessType: string;
  phone:        string;
  city:         string;
  colors?:      { primary: string; secondary: string };
}

export async function createClientSiteOnNetlify(config: ClientSiteConfig): Promise<{ siteUrl: string; adminUrl: string } | null> {
  const token = env.NETLIFY_TOKEN ?? '';
  const siteName = `client-${config.clientName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;

  try {
    const { data } = await axios.post(
      'https://api.netlify.com/api/v1/sites',
      {
        name:             siteName,
        custom_domain:    null,
        repo: {
          provider:   'github',
          repo:       `${OWNER}/${IBRAHIM_REPO}`,
          branch:     'main',
          base_dir:   'mobile',
          build_cmd:  'echo "static site"',
          dir:        'mobile/public',
        },
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );

    return {
      siteUrl:  (data as { url: string }).url,
      adminUrl: `https://app.netlify.com/sites/${siteName}`,
    };
  } catch (err) {
    console.error('[github] createClientSite failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function searchCode(repo: string, query: string): Promise<string> {
  try {
    const { data } = await axios.get(`${GITHUB_API}/search/code`, {
      headers: { ...getHeaders(), Accept: 'application/vnd.github.v3+json' },
      params: { q: `${query} repo:${OWNER}/${repo}`, per_page: 10 },
    });

    const items = (data as { items: Array<{ path: string; html_url: string }> }).items;
    if (!items.length) return `Aucun résultat pour "${query}" dans ${repo}`;

    return items.map(i => `📄 ${i.path}`).join('\n');
  } catch (err) {
    return `Erreur recherche code: ${err instanceof Error ? err.message : String(err)}`;
  }
}
