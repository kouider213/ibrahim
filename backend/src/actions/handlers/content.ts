import { generateTikTokContent } from '../../integrations/claude-api.js';
import { supabase } from '../../integrations/supabase.js';
import type { ActionPayload, ActionResult } from '../executor.js';

export async function handleContent(payload: ActionPayload): Promise<ActionResult> {
  switch (payload.action) {
    case 'generate_tiktok':
      return generateTiktok(payload.params);
    case 'generate_post':
      return generatePost(payload.params);
    default:
      return { success: false, error: 'Unknown content action', message: 'Action contenu inconnue' };
  }
}

async function generateTiktok(params: Record<string, unknown>): Promise<ActionResult> {
  const { topic, vehicle_name } = params as { topic: string; vehicle_name?: string };
  if (!topic) return { success: false, error: 'missing_topic', message: 'Sujet requis' };

  const script = await generateTikTokContent(topic, vehicle_name);

  await supabase.from('tasks').insert({
    title:       `TikTok: ${topic}`,
    action_type: 'generate_tiktok',
    payload:     params,
    status:      'completed',
    result:      { script },
    completed_at: new Date().toISOString(),
  });

  return { success: true, data: { script }, message: `✅ Script TikTok généré pour "${topic}".` };
}

async function generatePost(params: Record<string, unknown>): Promise<ActionResult> {
  const { platform, topic } = params as { platform: string; topic: string };
  if (!topic) return { success: false, error: 'missing_topic', message: 'Sujet requis' };

  const { chat } = await import('../../integrations/claude-api.js');
  const res = await chat([{
    role: 'user',
    content: `Crée un post ${platform ?? 'Instagram'} pour Fik Conciergerie Oran.
Sujet: ${topic}
Style: luxe, professionnel, algérien moderne.
Inclus hashtags pertinents.`,
  }]);

  return { success: true, data: { post: res.text }, message: `✅ Post ${platform ?? 'Instagram'} généré.` };
}
