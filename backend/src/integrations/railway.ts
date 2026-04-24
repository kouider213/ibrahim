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
