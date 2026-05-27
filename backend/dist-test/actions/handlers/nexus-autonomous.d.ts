export interface AutonomousStep {
    name: string;
    status: 'ok' | 'error' | 'skip';
    output?: string;
    durationMs: number;
}
export interface AutonomousResult {
    jobId: string;
    project: string;
    steps: AutonomousStep[];
    success: boolean;
    summary: string;
    committed: boolean;
    errorsFixed: number;
    errorsRemaining: number;
    durationMs: number;
}
export declare function autonomousFixTypeScript(projectToken: string): Promise<AutonomousResult>;
export type AutonomousTask = 'fix_typescript';
export declare function runAutonomousTask(task: AutonomousTask, project: string): Promise<AutonomousResult>;
//# sourceMappingURL=nexus-autonomous.d.ts.map