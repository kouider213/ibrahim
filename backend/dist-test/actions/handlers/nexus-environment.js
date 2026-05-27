"use strict";
// Nexus environment — in-memory session state (project, terminal, Claude Code)
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_ALIASES = exports.PROJECT_REGISTRY = void 0;
exports.getEnvironment = getEnvironment;
exports.updateEnvironment = updateEnvironment;
exports.resetEnvironment = resetEnvironment;
exports.resolveProject = resolveProject;
const _state = {
    activeProject: null,
    activeWorkingDir: null,
    activeTerminalPid: null,
    activeClaudeCodePid: null,
    lastCommand: null,
    lastCommandStatus: null,
    lastCommandOutput: null,
    lastCommandElapsedMs: null,
    lastUpdatedAt: null,
};
function getEnvironment() {
    return { ..._state };
}
function updateEnvironment(patch) {
    Object.assign(_state, patch);
    _state.lastUpdatedAt = new Date().toISOString();
    return { ..._state };
}
function resetEnvironment() {
    _state.activeProject = null;
    _state.activeWorkingDir = null;
    _state.activeTerminalPid = null;
    _state.activeClaudeCodePid = null;
    _state.lastCommand = null;
    _state.lastCommandStatus = null;
    _state.lastCommandOutput = null;
    _state.lastCommandElapsedMs = null;
    _state.lastUpdatedAt = new Date().toISOString();
}
// ── Project registry (canonical project keys → PC paths) ─────────────────────
exports.PROJECT_REGISTRY = {
    'dzaryx': String.raw `C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim`,
    'ibrahim': String.raw `C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim`,
    'nexus': String.raw `C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus`,
    'backend': String.raw `C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\backend`,
    'bot-avion': String.raw `C:\Users\douba\OneDrive\Bureau\BOT AVION`,
    'cekolib': String.raw `C:\Users\douba\OneDrive\Bureau\cekolib`,
    'dzking': String.raw `C:\Users\douba\OneDrive\Bureau\dzking`,
    'fik': String.raw `C:\Users\douba\OneDrive\Bureau\fik`,
    'jarvis': String.raw `C:\Users\douba\OneDrive\Bureau\jarvis`,
    'loc': String.raw `C:\Users\douba\OneDrive\Bureau\loc`,
    'rental-system': String.raw `C:\Users\douba\OneDrive\Bureau\rental-system`,
};
exports.PROJECT_ALIASES = [
    ['dzaryx', 'dzaryx'],
    ['ibrahim', 'dzaryx'],
    ['projet', 'dzaryx'],
    ['nexus', 'nexus'],
    ['backend', 'backend'],
    ['bot avion', 'bot-avion'],
    ['bot-avion', 'bot-avion'],
    ['avion', 'bot-avion'],
    ['cekolib', 'cekolib'],
    ['dzking', 'dzking'],
    ['fik', 'fik'],
    ['jarvis', 'jarvis'],
    ['loc', 'loc'],
    ['rental', 'rental-system'],
    ['rental-system', 'rental-system'],
];
function resolveProject(token) {
    const lower = token.toLowerCase().trim();
    for (const [alias, key] of exports.PROJECT_ALIASES) {
        if (lower.includes(alias)) {
            const path = exports.PROJECT_REGISTRY[key];
            if (path)
                return { key, path };
        }
    }
    return undefined;
}
//# sourceMappingURL=nexus-environment.js.map