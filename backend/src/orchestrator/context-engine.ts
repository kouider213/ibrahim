import { redis } from '../queue/queue.js';
import { supabase } from '../integrations/supabase.js';

export type SourceChannel = 'telegram' | 'mobile_voice' | 'mobile_text' | 'backend_internal';

export interface ChannelInfo {
  channel:   SourceChannel;
  sessionId: string;
  timezone:  string | null;
  lastSeenMs: number | null;
}

export interface CrossChannelMessage {
  channel:   SourceChannel;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: string;
}

export interface FleetSnapshot {
  activeRentals:  number;
  pendingBookings: number;
  totalOpen:       number;
}

export interface OrchestratorContext {
  channel:       ChannelInfo;
  crossChannel:  CrossChannelMessage[];
  fleet:         FleetSnapshot;
  builtAtMs:     number;
}

export function detectChannel(sessionId: string): SourceChannel {
  if (sessionId.startsWith('telegram_')) return 'telegram';
  if (sessionId.startsWith('voice_'))    return 'mobile_voice';
  if (sessionId.startsWith('mobile_'))   return 'mobile_text';
  return 'backend_internal';
}

async function getChannelInfo(sessionId: string): Promise<ChannelInfo> {
  const channel = detectChannel(sessionId);
  const [tzRaw, lastSeenRaw] = await Promise.all([
    redis.get(`user:tz:${sessionId}`).catch(() => null),
    redis.get(`session:lastseen:${sessionId}`).catch(() => null),
  ]);

  // Update last seen timestamp
  await redis.set(`session:lastseen:${sessionId}`, String(Date.now()), 'EX', 7 * 86_400).catch(() => {});

  return {
    channel,
    sessionId,
    timezone:   tzRaw,
    lastSeenMs: lastSeenRaw ? parseInt(lastSeenRaw, 10) : null,
  };
}

async function getCrossChannelMessages(
  sessionId:    string,
  windowHours = 2,
  limit = 4,
): Promise<CrossChannelMessage[]> {
  // Map session → complementary channel pattern
  let likePattern: string | null = null;
  if (sessionId === 'voice_kouider') {
    likePattern = 'telegram_%';
  } else if (sessionId.startsWith('telegram_')) {
    likePattern = 'voice_kouider';
  } else if (sessionId.startsWith('mobile_')) {
    likePattern = 'telegram_%';
  }

  if (!likePattern) return [];

  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('role, content, session_id, created_at')
      .like('session_id', likePattern)
      .in('role', ['user', 'assistant'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return ((data ?? []) as Array<{
      role:        string;
      content:     string;
      session_id:  string;
      created_at:  string;
    }>)
      .reverse()
      .map(row => ({
        channel:   detectChannel(row.session_id),
        role:      row.role as 'user' | 'assistant',
        content:   String(row.content).slice(0, 300),
        timestamp: row.created_at,
      }));
  } catch {
    return [];
  }
}

async function getFleetSnapshot(): Promise<FleetSnapshot> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('bookings')
      .select('status, start_date, end_date')
      .in('status', ['CONFIRMED', 'ACTIVE', 'PENDING']);

    if (error) throw error;

    const bookings = (data ?? []) as Array<{
      status:     string;
      start_date: string;
      end_date:   string;
    }>;

    const activeRentals = bookings.filter(
      b => (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
           b.start_date <= today && b.end_date >= today,
    ).length;

    const pendingBookings = bookings.filter(b => b.status === 'PENDING').length;

    return {
      activeRentals,
      pendingBookings,
      totalOpen: activeRentals + pendingBookings,
    };
  } catch {
    return { activeRentals: 0, pendingBookings: 0, totalOpen: 0 };
  }
}

export async function buildOrchestratorContext(sessionId: string): Promise<OrchestratorContext> {
  const [channel, crossChannel, fleet] = await Promise.all([
    getChannelInfo(sessionId),
    getCrossChannelMessages(sessionId),
    getFleetSnapshot(),
  ]);

  return {
    channel,
    crossChannel,
    fleet,
    builtAtMs: Date.now(),
  };
}

export function formatChannelForLog(info: ChannelInfo): string {
  return `channel=${info.channel} session=${info.sessionId.slice(0, 20)} tz=${info.timezone ?? 'unknown'}`;
}
