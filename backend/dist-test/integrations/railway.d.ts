export declare function getLatestDeploymentStatus(): Promise<{
    id: string;
    status: string;
} | null>;
export declare function waitForDeploy(timeoutMs?: number): Promise<string>;
export declare function getRailwayLogs(limit?: number): Promise<string>;
//# sourceMappingURL=railway.d.ts.map