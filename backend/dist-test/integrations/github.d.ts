export declare function getFileContent(path: string, repo?: string): Promise<{
    content: string;
    sha: string;
} | null>;
export declare function updateFile(path: string, newContent: string, commitMessage: string, repo?: string): Promise<{
    commitSha: string;
} | null>;
export declare function listDirectory(dirPath: string, repo?: string): Promise<Array<{
    name: string;
    type: 'file' | 'dir';
    path: string;
}>>;
export declare function triggerNetlifyDeploy(siteId?: string): Promise<boolean>;
export declare function vercelGetDeployments(projectName: string): Promise<any[]>;
export declare function vercelGetDeploymentLogs(deploymentId: string): Promise<string>;
export declare function vercelCheckUrl(url: string): Promise<{
    status: number;
    ok: boolean;
}>;
export declare function vercelRedeploy(deploymentId: string): Promise<string>;
export declare function getRecentCommits(repo?: string, limit?: number): Promise<Array<{
    sha: string;
    message: string;
    date: string;
    author: string;
}>>;
export interface ClientSiteConfig {
    clientName: string;
    businessType: string;
    phone: string;
    city: string;
    colors?: {
        primary: string;
        secondary: string;
    };
}
export declare function createClientSiteOnNetlify(config: ClientSiteConfig): Promise<{
    siteUrl: string;
    adminUrl: string;
} | null>;
export declare function searchCode(repo: string, query: string): Promise<string>;
//# sourceMappingURL=github.d.ts.map