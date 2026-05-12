// Nexus environment — in-memory session state (project, terminal, Claude Code)

export interface NexusEnvironment {
  activeProject:         string | null;   // 'dzaryx' | 'nexus' | 'backend' | …
  activeWorkingDir:      string | null;   // absolute path on PC
  activeTerminalPid:     number | null;
  activeClaudeCodePid:   number | null;
  lastCommand:           string | null;
  lastCommandStatus:     'ok' | 'error' | 'timeout' | null;
  lastCommandOutput:     string | null;   // truncated preview (≤500 chars)
  lastCommandElapsedMs:  number | null;
  lastUpdatedAt:         string | null;   // ISO timestamp
}

const _state: NexusEnvironment = {
  activeProject:        null,
  activeWorkingDir:     null,
  activeTerminalPid:    null,
  activeClaudeCodePid:  null,
  lastCommand:          null,
  lastCommandStatus:    null,
  lastCommandOutput:    null,
  lastCommandElapsedMs: null,
  lastUpdatedAt:        null,
};

export function getEnvironment(): NexusEnvironment {
  return { ..._state };
}

export function updateEnvironment(patch: Partial<NexusEnvironment>): NexusEnvironment {
  Object.assign(_state, patch);
  _state.lastUpdatedAt = new Date().toISOString();
  return { ..._state };
}

export function resetEnvironment(): void {
  _state.activeProject        = null;
  _state.activeWorkingDir     = null;
  _state.activeTerminalPid    = null;
  _state.activeClaudeCodePid  = null;
  _state.lastCommand          = null;
  _state.lastCommandStatus    = null;
  _state.lastCommandOutput    = null;
  _state.lastCommandElapsedMs = null;
  _state.lastUpdatedAt        = new Date().toISOString();
}

// ── Project registry (canonical project keys → PC paths) ─────────────────────

export const PROJECT_REGISTRY: Record<string, string> = {
  'dzaryx':         String.raw`C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim`,
  'ibrahim':        String.raw`C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim`,
  'nexus':          String.raw`C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus`,
  'backend':        String.raw`C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\backend`,
  'bot-avion':      String.raw`C:\Users\douba\OneDrive\Bureau\BOT AVION`,
  'cekolib':        String.raw`C:\Users\douba\OneDrive\Bureau\cekolib`,
  'dzking':         String.raw`C:\Users\douba\OneDrive\Bureau\dzking`,
  'fik':            String.raw`C:\Users\douba\OneDrive\Bureau\fik`,
  'jarvis':         String.raw`C:\Users\douba\OneDrive\Bureau\jarvis`,
  'loc':            String.raw`C:\Users\douba\OneDrive\Bureau\loc`,
  'rental-system':  String.raw`C:\Users\douba\OneDrive\Bureau\rental-system`,
};

export const PROJECT_ALIASES: [string, string][] = [
  ['dzaryx',        'dzaryx'],
  ['ibrahim',       'dzaryx'],
  ['projet',        'dzaryx'],
  ['nexus',         'nexus'],
  ['backend',       'backend'],
  ['bot avion',     'bot-avion'],
  ['bot-avion',     'bot-avion'],
  ['avion',         'bot-avion'],
  ['cekolib',       'cekolib'],
  ['dzking',        'dzking'],
  ['fik',           'fik'],
  ['jarvis',        'jarvis'],
  ['loc',           'loc'],
  ['rental',        'rental-system'],
  ['rental-system', 'rental-system'],
];

export function resolveProject(token: string): { key: string; path: string } | undefined {
  const lower = token.toLowerCase().trim();
  for (const [alias, key] of PROJECT_ALIASES) {
    if (lower.includes(alias)) {
      const path = PROJECT_REGISTRY[key];
      if (path) return { key, path };
    }
  }
  return undefined;
}
