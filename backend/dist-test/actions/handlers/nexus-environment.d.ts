export interface NexusEnvironment {
    activeProject: string | null;
    activeWorkingDir: string | null;
    activeTerminalPid: number | null;
    activeClaudeCodePid: number | null;
    lastCommand: string | null;
    lastCommandStatus: 'ok' | 'error' | 'timeout' | null;
    lastCommandOutput: string | null;
    lastCommandElapsedMs: number | null;
    lastUpdatedAt: string | null;
}
export declare function getEnvironment(): NexusEnvironment;
export declare function updateEnvironment(patch: Partial<NexusEnvironment>): NexusEnvironment;
export declare function resetEnvironment(): void;
export declare const PROJECT_REGISTRY: Record<string, string>;
export declare const PROJECT_ALIASES: [string, string][];
export declare function resolveProject(token: string): {
    key: string;
    path: string;
} | undefined;
//# sourceMappingURL=nexus-environment.d.ts.map