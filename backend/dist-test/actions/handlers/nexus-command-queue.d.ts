declare class NexusCommandQueue {
    private _running;
    private _queue;
    enqueue<T>(fn: () => Promise<T>, label?: string): Promise<T>;
    get depth(): number;
    get busy(): boolean;
    private _tick;
}
export declare const nexusQueue: NexusCommandQueue;
export {};
//# sourceMappingURL=nexus-command-queue.d.ts.map