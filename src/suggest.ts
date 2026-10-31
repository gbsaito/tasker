// Quick-add autocomplete. A '#', '/' or '@' that opens a word lists matching
// candidates while the caret stays inside that word.

import type { Store } from "./store"

export interface Suggestion {
  items: string[]
  idx: number
  start: number
  /** Caret the suggestion was built from (end of the sigil token). */
  end: number
}

export function sugFilter(candidates: string[], filter: string): string[] {
  if (!filter) return candidates
  const needle = filter.toLowerCase()
  return candidates.filter((c) => c.toLowerCase().includes(needle))
}

/**
 * Caret just after the inserted span between two drafts of the same field.
 * -1 when nothing was inserted (deletion, pure cursor move). OpenTUI reports
 * `cursorOffset` from inside its mutation, which can lag the text that the
 * `input` event already shows, so callers fall back to this.
 */
export function changeCaret(from: string, to: string): number {
  if (from === to) return -1
  let start = 0
  const min = Math.min(from.length, to.length)
  while (start < min && from[start] === to[start]) start++
  let tailFrom = from.length
  let tailTo = to.length
  while (tailFrom > start && tailTo > start && from[tailFrom - 1] === to[tailTo - 1]) {
    tailFrom--
    tailTo--
  }
  return tailTo >= tailFrom ? tailTo : -1
}

export function wordBefore(value: string, cursor: number): number {
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i]
    if (ch === " " || ch === "\t") return i + 1
  }
  return 0
}

export function sugCandidates(
  store: Store,
  sigil: string,
  head: string,
  defaultProjectId: string,
): string[] {
  if (sigil === "#") {
    return store.projects().map((p) => p.name)
  }
  if (sigil === "/") {
    let projectId = defaultProjectId
    for (const word of head.trim().split(/\s+/)) {
      if (!word.startsWith("#")) continue
      const name = word.slice(1).replace(/^[,.;:!?"']+/, "").replace(/[,.;:!?"']+$/, "")
      const project = store.projectByName(name)
      if (project) projectId = project.id
    }
    return store.sections(projectId).map((s) => s.name)
  }
  if (sigil === "@") {
    return store.tags().map((t) => t.name)
  }
  return []
}

export function refreshSuggestion(
  value: string,
  cursor: number,
  store: Store,
  defaultProjectId: string,
): Suggestion | null {
  if (cursor <= 0 || cursor > value.length) return null
  const start = wordBefore(value, cursor)
  const token = value.slice(start, cursor)
  if (token.length === 0) return null
  const sigil = token[0]!
  if (sigil !== "#" && sigil !== "/" && sigil !== "@") return null
  const items = sugFilter(
    sugCandidates(store, sigil, value.slice(0, start), defaultProjectId),
    token.slice(1),
  )
  if (items.length === 0) return null
  return { items, idx: 0, start, end: cursor }
}

/**
 * `refreshSuggestion` that tolerates an honest-but-late caret: try the
 * reported offset first, then the end of the span the input actually changed.
 * Streaming terminals can deliver the next keystroke before the renderable's
 * cursor property has caught up with the text it already emitted.
 */
export function refreshSuggestionAfterChange(
  previous: string,
  value: string,
  cursor: number,
  store: Store,
  defaultProjectId: string,
): Suggestion | null {
  if (cursor < 0 || cursor > value.length) cursor = value.length
  const primary = refreshSuggestion(value, cursor, store, defaultProjectId)
  if (primary) return primary
  const caret = changeCaret(previous, value)
  if (caret < 0) return null
  return refreshSuggestion(value, caret, store, defaultProjectId)
}

export function acceptSuggestion(
  value: string,
  start: number,
  end: number,
  item: string,
): { value: string; cursor: number } {
  const sigil = value[start] ?? ""
  const replacement = `${sigil}${item} `
  return {
    value: value.slice(0, start) + replacement + value.slice(Math.max(start, end)),
    cursor: start + replacement.length,
  }
}

export function moveSuggestion(sug: Suggestion, delta: number): number {
  const n = sug.items.length
  return n > 0 ? (sug.idx + delta + n) % n : 0
}
