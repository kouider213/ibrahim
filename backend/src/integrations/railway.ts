import axios from 'axios';
import { env } from '../config/env.js';

const RAILWAY_GQL = 'https://backboard.railway.app/graphql/v2';

async function railwayQuery(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const token = env.RAILWAY_TOKEN;
  if (!token) throw new Error('RAILWAY_TOKEN non configuré dans Railway Variables');

  const { data } = await axios.post(
    RAILWAY_GQL,
    { query, variables },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    },
  );

  if (data.errors?.length) throw new Error((data.errors as Array<{message: string}>)[0]!.message);
  return data.data;
}

export async function getLatestDeploymentStatus(): Promise<{ id: string; status: string } | null> {
  const projectId = env.RAILWAY_PROJECT_ID;
  const serviceId = env.RAILWAY_SERVICE_ID;
  if (!env.RAILWAY_TOKEN || !projectId || !serviceId) return null;

  try {
    const data = await railwayQuery(`
      query($projectId: String!, $serviceId: String!) {
        deployments(input: { projectId: $projectId, serviceId: $serviceId }) {
          edges { node { id status createdAt } }
        }
      }
    `, { projectId, serviceId }) as {
      deployments: { edges: Array<{ node: { id: string; status: string; createdAt: string } }> };
    };
    const node = data.deployments.edges[0]?.node;
    return node ? { id: node.id, status: node.status } : null;
  } catch {
    return null;
  }
}

export async function waitForDeploy(timeoutMs = 180_000): Promise<string> {
  if (!env.RAILWAY_TOKEN) return '⚠️ RAILWAY_TOKEN non configuré.';

  const start = Date.now();
  const POLL_MS = 8_000;

  // Snapshot the deployment ID at start so we detect a NEW deployment
  const initialDep = await getLatestDeploymentStatus();
  let targetId = initialDep?.id ?? null;

  // Wait for a new deployment to appear (push may not have triggered yet)
  while (Date.now() - start < 30_000) {
    await new Promise(r => setTimeout(r, POLL_MS));
    const dep = await getLatestDeploymentStatus();
    if (dep && dep.id !== targetId) { targetId = dep.id; break; }
  }

  if (!targetId) return '⚠️ Aucun déploiement détecté après 30s. Vérifie que le push GitHub a bien déclenché Railway.';

  // Poll until terminal state
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, POLL_MS));
    const dep = await getLatestDeploymentStatus();
    if (!dep || dep.id !== targetId) continue;

    const terminal = ['SUCCESS', 'FAILED', 'CRASHED', 'REMOVED', 'CANCELLED'];
    if (terminal.includes(dep.status)) {
      if (dep.status === 'SUCCESS') {
        return `✅ Déploiement réussi (${dep.id.slice(0, 8)}) — Dzaryx est en ligne avec le nouveau code.`;
      }
      // Failed — get logs
      const logs = await getRailwayLogs(30);
      return `❌ Déploiement ÉCHOUÉ (${dep.status})\n\nLogs:\n${logs}`;
    }
  }

  return `⏱️ Timeout (${timeoutMs / 1000}s) — statut inconnu. Lance railway_get_logs manuellement.`;
}

export async function getRailwayLogs(limit = 50): Promise<string> {
  const projectId = env.RAILWAY_PROJECT_ID;
  const serviceId = env.RAILWAY_SERVICE_ID;

  if (!env.RAILWAY_TOKEN) {
    return '⚠️ RAILWAY_TOKEN non configuré. Ajouter dans Railway > Variables.';
  }
  if (!projectId || !serviceId) {
    return '⚠️ RAILWAY_PROJECT_ID et RAILWAY_SERVICE_ID doivent être configurés dans Railway Variables.';
  }

  try {
    // Get latest deployment for the service
    const depsData = await railwayQuery(`
      query($projectId: String!, $serviceId: String!) {
        deployments(input: { projectId: $projectId, serviceId: $serviceId }) {
          edges { node { id status createdAt } }
        }
      }
    `, { projectId, serviceId }) as {
      deployments: { edges: Array<{ node: { id: string; status: string; createdAt: string } }> };
    };

    const latest = depsData.deployments.edges[0]?.node;
    if (!latest) return 'Aucun déploiement trouvé pour ce service.';

    // Get logs for latest deployment
    const logsData = await railwayQuery(`
      query($deploymentId: String!, $limit: Int) {
        deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
          message
          severity
          timestamp
        }
      }
    `, { deploymentId: latest.id, limit }) as {
      deploymentLogs: Array<{ message: string; severity: string; timestamp: string }>;
    };

    const lines = logsData.deploymentLogs
      .map(l => `[${l.severity ?? 'INFO'}] ${l.message}`)
      .join('\n');

    return `📋 Déploiement ${latest.id.slice(0, 8)} — Status: ${latest.status} — ${new Date(latest.createdAt).toLocaleString('fr-DZ')}\n\n${lines || '(aucun log disponible)'}`;
  } catch (err) {
    return `Erreur Railway API: ${err instanceof Error ? err.message : String(err)}`;
  }
}
