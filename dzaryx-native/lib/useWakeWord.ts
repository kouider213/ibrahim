// Wake word via native speech library not supported in Expo managed workflow.
// The persistent Android notification ("Dzaryx actif — Appuyez pour parler")
// serves as the tap-to-activate replacement. See app/_layout.tsx.
export function useWakeWord(_onDetected: () => void): void {}
