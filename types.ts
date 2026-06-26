// Shared types across content script and options page.
// type-only imports are safe (no side effects); see AGENTS.md prohibition #6.

export type DisplayMode = "bilingual" | "replace"

export const DEFAULT_MODE: DisplayMode = "bilingual"