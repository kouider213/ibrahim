export type CommandType = 'SCREENSHOT_DESKTOP' | 'LIST_DESKTOP_FILES' | 'OPEN_FOLDER' | 'OPEN_URL' | 'OPEN_CHROME' | 'OPEN_VSCODE' | 'FOCUS_APP' | 'SYSTEM_INFO' | 'TERMINAL_COMMAND_SAFE' | 'TERMINAL_RUN' | 'PROJECT_OPEN' | 'PROJECT_STATUS' | 'CLAUDE_CODE_START';
export interface NexusCommandRecord {
    id: string;
    type: CommandType;
    payload: Record<string, unknown>;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    success: boolean | null;
    result: unknown;
    error: string | null;
    retries: number;
}
export interface NexusCapabilities {
    online: boolean;
    screenshots: boolean;
    file_browser: boolean;
    app_launch: boolean;
    chrome: boolean;
    vscode: boolean;
    focus_app: boolean;
    terminal_safe: boolean;
    terminal_run: boolean;
    project_open: boolean;
    claude_code: boolean;
    system_info: boolean;
    telegram_photo: boolean;
    commands: CommandType[];
    projects: string[];
}
export declare function getCommandHistory(): NexusCommandRecord[];
export declare function getCommandById(id: string): NexusCommandRecord | undefined;
export declare function executeNexusCommand(type: CommandType, payload?: Record<string, unknown>): Promise<NexusCommandRecord>;
export declare function getNexusCapabilities(): NexusCapabilities;
//# sourceMappingURL=nexus-command-registry.d.ts.map