import { supabase } from '../integrations/supabase.js';

export interface PendingVideo {
  id:         string;
  video_url:  string;
  caption:    string;
  hashtags:   string[];
  car_name:   string;
  car_id?:    string;
  script:     string;
  created_at: string;
  status:     'pending' | 'approved' | 'rejected';
}

const store = new Map<string, PendingVideo>();
let latestId: string | null = null;

export async function savePendingVideo(
  video: Omit<PendingVideo, 'id' | 'created_at' | 'status'>,
): Promise<string> {
  const id: string = `vid_${Date.now()}`;
  const pending: PendingVideo = {
    ...video,
    id,
    created_at: new Date().toISOString(),
    status: 'pending',
  };
  store.set(id, pending);
  latestId = id;

  await supabase.from('tasks').insert({
    title:        `Marketing Video: ${video.car_name}`,
    action_type:  'marketing_video_approval',
    payload:      pending,
    status:       'pending',
    completed_at: null,
  }).catch(() => {});

  return id;
}

export function getLatestPendingVideo(): PendingVideo | null {
  if (!latestId) return null;
  const v = store.get(latestId);
  return v?.status === 'pending' ? v : null;
}

export function getPendingVideoById(id: string): PendingVideo | null {
  return store.get(id) ?? null;
}

export function approveVideo(id: string): PendingVideo | null {
  const v = store.get(id);
  if (!v) return null;
  v.status = 'approved';
  if (latestId === id) latestId = null;
  supabase.from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('payload->>id', id)
    .catch(() => {});
  return v;
}

export function rejectVideo(id: string): void {
  const v = store.get(id);
  if (!v) return;
  v.status = 'rejected';
  if (latestId === id) latestId = null;
  supabase.from('tasks')
    .update({ status: 'cancelled' })
    .eq('payload->>id', id)
    .catch(() => {});
}
