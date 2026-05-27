"use strict";
// Serial execution queue — only 1 terminal/Claude Code command runs at a time.
// Callers await enqueue() and get back the result when their turn comes.
Object.defineProperty(exports, "__esModule", { value: true });
exports.nexusQueue = void 0;
class NexusCommandQueue {
    _running = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _queue = [];
    enqueue(fn, label = 'cmd') {
        return new Promise((resolve, reject) => {
            this._queue.push({ fn, label, resolve, reject });
            console.log(`[NEXUS_CMDQ] enqueued label="${label}" depth=${this._queue.length}`);
            if (!this._running)
                this._tick();
        });
    }
    get depth() { return this._queue.length; }
    get busy() { return this._running; }
    async _tick() {
        if (this._running || this._queue.length === 0)
            return;
        this._running = true;
        const item = this._queue.shift();
        const t0 = Date.now();
        console.log(`[NEXUS_CMDQ] start label="${item.label}" remaining=${this._queue.length}`);
        try {
            item.resolve(await item.fn());
        }
        catch (e) {
            item.reject(e instanceof Error ? e : new Error(String(e)));
        }
        finally {
            console.log(`[NEXUS_CMDQ] done  label="${item.label}" ms=${Date.now() - t0}`);
            this._running = false;
            if (this._queue.length > 0)
                setImmediate(() => this._tick());
        }
    }
}
exports.nexusQueue = new NexusCommandQueue();
//# sourceMappingURL=nexus-command-queue.js.map