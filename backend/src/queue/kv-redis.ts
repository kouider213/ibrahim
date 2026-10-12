import { supabase } from '../integrations/supabase.js';

// Remplaçant d'Upstash Redis (rate-limité → notifs, briefing, démarchage, verrous… tout tombait).
// Mêmes méthodes que ioredis pour le sous-ensemble utilisé par Dzaryx. La mémoire du process est la
// source de vérité (une seule instance Railway) ; chaque écriture est recopiée dans Supabase `app_kv`
// par lots (toutes les 2 s) pour survivre aux redémarrages. Lecture absente de la mémoire → Supabase.

type Entry =
  | { t: 's'; v: string; exp: number | null }
  | { t: 'l'; v: string[]; exp: number | null }
  | { t: 'S'; v: string[]; exp: number | null };

const LIST_PREFIX = '\u001eL';   // séparateur invisible (Postgres refuse \u0000)
const SET_PREFIX  = '\u001eS';
const FLUSH_MS    = 2_000;

function encode(e: Entry): string {
  return e.t === 's' ? e.v : (e.t === 'l' ? LIST_PREFIX : SET_PREFIX) + JSON.stringify(e.v);
}
function decode(raw: string, exp: number | null): Entry {
  if (raw.startsWith(LIST_PREFIX)) return { t: 'l', v: JSON.parse(raw.slice(2)) as string[], exp };
  if (raw.startsWith(SET_PREFIX))  return { t: 'S', v: JSON.parse(raw.slice(2)) as string[], exp };
  return { t: 's', v: raw, exp };
}

type PipeResult = Array<[Error | null, unknown]>;

export class KvRedis {
  private mem = new Map<string, Entry | null>();   // null = absent (déjà vérifié dans Supabase)
  private loading = new Map<string, Promise<void>>();
  private dirty = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private lastCleanup = 0;

  // ── interne ──
  private alive(key: string): Entry | null {
    const e = this.mem.get(key);
    if (!e) return null;
    if (e.exp !== null && e.exp <= Date.now()) { this.mem.set(key, null); return null; }
    return e;
  }

  private async load(key: string): Promise<Entry | null> {
    if (!this.mem.has(key)) {
      let p = this.loading.get(key);
      if (!p) {
        p = (async () => {
          try {
            const { data, error } = await supabase.from('app_kv').select('value, expires_at').eq('key', key).maybeSingle();
            if (error) throw new Error(error.message);
            const row = data as { value: string; expires_at: string | null } | null;
            // Une écriture a pu arriver pendant la lecture : elle gagne
            if (!this.mem.has(key)) this.mem.set(key, row ? decode(row.value, row.expires_at ? new Date(row.expires_at).getTime() : null) : null);
          } catch (err) {
            console.error(`[kv-redis] lecture ${key}:`, err instanceof Error ? err.message : err);
            if (!this.mem.has(key)) this.mem.set(key, null);
          } finally {
            this.loading.delete(key);
          }
        })();
        this.loading.set(key, p);
      }
      await p;
    }
    return this.alive(key);
  }

  private write(key: string, e: Entry | null): void {
    this.mem.set(key, e);
    this.dirty.add(key);
    if (!this.timer) this.timer = setTimeout(() => { void this.flush(); }, FLUSH_MS);
  }

  /** Recopie les clés modifiées dans Supabase (un upsert + un delete par lot). */
  async flush(): Promise<void> {
    this.timer = null;
    const keys = [...this.dirty];
    this.dirty.clear();
    if (!keys.length) return;
    const upserts: Array<{ key: string; value: string; expires_at: string | null; updated_at: string }> = [];
    const deletes: string[] = [];
    const now = new Date().toISOString();
    for (const k of keys) {
      const e = this.alive(k);
      if (e) upserts.push({ key: k, value: encode(e), expires_at: e.exp ? new Date(e.exp).toISOString() : null, updated_at: now });
      else deletes.push(k);
    }
    try {
      if (upserts.length) { const { error } = await supabase.from('app_kv').upsert(upserts); if (error) throw new Error(error.message); }
      if (deletes.length) { const { error } = await supabase.from('app_kv').delete().in('key', deletes); if (error) throw new Error(error.message); }
    } catch (err) {
      console.error('[kv-redis] sauvegarde Supabase:', err instanceof Error ? err.message : err);
      for (const k of keys) this.dirty.add(k);   // on retentera au prochain lot
      if (!this.timer) this.timer = setTimeout(() => { void this.flush(); }, FLUSH_MS * 5);
    }
    // Ménage des clés expirées, une fois par heure
    if (Date.now() - this.lastCleanup > 3600_000) {
      this.lastCleanup = Date.now();
      void supabase.from('app_kv').delete().lt('expires_at', now).then(() => {}, () => {});
    }
  }

  // ── chaînes ──
  async get(key: string): Promise<string | null> {
    const e = await this.load(key);
    return e?.t === 's' ? e.v : null;
  }

  /** set(k, v[, 'EX', s | 'PX', ms][, 'NX' | 'XX']) → 'OK' ou null si NX/XX non respecté. */
  async set(key: string, value: string | number, ...args: Array<string | number>): Promise<'OK' | null> {
    const flags = args.map(a => String(a).toUpperCase());
    const cur = await this.load(key);
    if (flags.includes('NX') && cur) return null;
    if (flags.includes('XX') && !cur) return null;
    let exp: number | null = null;
    const ex = flags.indexOf('EX'); const px = flags.indexOf('PX');
    if (ex >= 0) exp = Date.now() + Number(args[ex + 1]) * 1000;
    else if (px >= 0) exp = Date.now() + Number(args[px + 1]);
    else if (flags.includes('KEEPTTL') && cur) exp = cur.exp;
    this.write(key, { t: 's', v: String(value), exp });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string | number): Promise<'OK'> {
    this.write(key, { t: 's', v: String(value), exp: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async del(...keys: Array<string | string[]>): Promise<number> {
    let n = 0;
    for (const k of keys.flat()) { if (await this.load(k)) n++; this.write(k, null); }
    return n;
  }

  async incrbyfloat(key: string, by: number | string): Promise<string> {
    const e = await this.load(key);
    const next = (e?.t === 's' ? Number(e.v) || 0 : 0) + Number(by);
    this.write(key, { t: 's', v: String(next), exp: e?.exp ?? null });
    return String(next);
  }
  async incrby(key: string, by: number): Promise<number> { return Math.round(Number(await this.incrbyfloat(key, by))); }
  async incr(key: string): Promise<number> { return this.incrby(key, 1); }

  async expire(key: string, seconds: number): Promise<number> {
    const e = await this.load(key);
    if (!e) return 0;
    this.write(key, { ...e, exp: Date.now() + seconds * 1000 } as Entry);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const e = await this.load(key);
    if (!e) return -2;
    return e.exp === null ? -1 : Math.ceil((e.exp - Date.now()) / 1000);
  }

  async exists(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (await this.load(k)) n++;
    return n;
  }

  // ── listes ──
  async lpush(key: string, ...values: Array<string | number>): Promise<number> {
    const e = await this.load(key);
    const list = e?.t === 'l' ? [...e.v] : [];
    for (const v of values) list.unshift(String(v));
    this.write(key, { t: 'l', v: list, exp: e?.exp ?? null });
    return list.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const e = await this.load(key);
    if (e?.t !== 'l') return [];
    const len = e.v.length;
    const s = start < 0 ? Math.max(len + start, 0) : start;
    const t = stop < 0 ? len + stop : Math.min(stop, len - 1);
    return t < s ? [] : e.v.slice(s, t + 1);
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    const e = await this.load(key);
    if (e?.t === 'l') {
      const kept = await this.lrange(key, start, stop);
      this.write(key, kept.length ? { t: 'l', v: kept, exp: e.exp } : null);
    }
    return 'OK';
  }

  async llen(key: string): Promise<number> {
    const e = await this.load(key);
    return e?.t === 'l' ? e.v.length : 0;
  }

  // ── ensembles ──
  async sadd(key: string, ...members: Array<string | number>): Promise<number> {
    const e = await this.load(key);
    const set = new Set(e?.t === 'S' ? e.v : []);
    const before = set.size;
    for (const m of members) set.add(String(m));
    this.write(key, { t: 'S', v: [...set], exp: e?.exp ?? null });
    return set.size - before;
  }

  async smembers(key: string): Promise<string[]> {
    const e = await this.load(key);
    return e?.t === 'S' ? [...e.v] : [];
  }

  // ── divers ──
  async ping(): Promise<'PONG'> {
    const { error } = await supabase.from('app_kv').select('key').limit(1);
    if (error) throw new Error(error.message);
    return 'PONG';
  }

  on(_event: string, _listener: (...args: unknown[]) => void): this { return this; }

  /** Pipeline façon ioredis : commandes en file, exec() → [[err, résultat], …]. */
  pipeline() {
    const ops: Array<() => Promise<unknown>> = [];
    const self = this;
    const p = {
      get(k: string) { ops.push(() => self.get(k)); return p; },
      set(k: string, v: string | number, ...a: Array<string | number>) { ops.push(() => self.set(k, v, ...a)); return p; },
      del(k: string) { ops.push(() => self.del(k)); return p; },
      incr(k: string) { ops.push(() => self.incr(k)); return p; },
      incrby(k: string, n: number) { ops.push(() => self.incrby(k, n)); return p; },
      incrbyfloat(k: string, n: number) { ops.push(() => self.incrbyfloat(k, n)); return p; },
      expire(k: string, s: number) { ops.push(() => self.expire(k, s)); return p; },
      async exec(): Promise<PipeResult> {
        const out: PipeResult = [];
        for (const op of ops) {
          try { out.push([null, await op()]); } catch (err) { out.push([err as Error, null]); }
        }
        return out;
      },
    };
    return p;
  }
}
