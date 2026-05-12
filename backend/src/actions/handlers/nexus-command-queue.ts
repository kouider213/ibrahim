// Serial execution queue — only 1 terminal/Claude Code command runs at a time.
// Callers await enqueue() and get back the result when their turn comes.

type QueueItem<T> = {
  fn:      () => Promise<T>;
  label:   string;
  resolve: (v: T) => void;
  reject:  (e: Error) => void;
};

class NexusCommandQueue {
  private _running  = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _queue:   QueueItem<any>[] = [];

  enqueue<T>(fn: () => Promise<T>, label = 'cmd'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this._queue.push({ fn, label, resolve, reject });
      console.log(`[NEXUS_CMDQ] enqueued label="${label}" depth=${this._queue.length}`);
      if (!this._running) this._tick();
    });
  }

  get depth(): number  { return this._queue.length; }
  get busy():  boolean { return this._running; }

  private async _tick(): Promise<void> {
    if (this._running || this._queue.length === 0) return;
    this._running = true;
    const item = this._queue.shift()!;
    const t0   = Date.now();
    console.log(`[NEXUS_CMDQ] start label="${item.label}" remaining=${this._queue.length}`);
    try {
      item.resolve(await item.fn());
    } catch (e) {
      item.reject(e instanceof Error ? e : new Error(String(e)));
    } finally {
      console.log(`[NEXUS_CMDQ] done  label="${item.label}" ms=${Date.now() - t0}`);
      this._running = false;
      if (this._queue.length > 0) setImmediate(() => this._tick());
    }
  }
}

export const nexusQueue = new NexusCommandQueue();
