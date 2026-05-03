const sessionBuffers = new Map<string, string[]>();

export function addVideoToBuffer(sessionId: string, fileId: string): void {
  const existing = sessionBuffers.get(sessionId) ?? [];
  existing.push(fileId);
  sessionBuffers.set(sessionId, existing.slice(-10));
}

export function getVideoBuffer(sessionId: string): string[] {
  return sessionBuffers.get(sessionId) ?? [];
}

export function clearVideoBuffer(sessionId: string): void {
  sessionBuffers.delete(sessionId);
}
