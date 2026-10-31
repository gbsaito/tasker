// Quick-add autocomplete: a sigil must open a word, filtering is a
// case-insensitive substring, sections follow an earlier #project token, and
// accepting splices the whole candidate over what was typed.

import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  acceptSuggestion,
  changeCaret,
  moveSuggestion,
  refreshSuggestion,
  refreshSuggestionAfterChange,
  sugFilter,
  wordBefore,
} from "../src/suggest"
import { Store } from "../src/store"

function fixture(): { store: Store; homeId: string } {
  const store = Store.open(join(mkdtempSync(join(tmpdir(), "tasker-sug-")), "tasker.json"))
  const home = store.addProject("Turf", "")
  const work = store.addProject("Rink", "")
  store.ensureSection(work.id, "Locker")
  store.ensureSection(home.id, "Kitchen")
  store.ensureTag("errand")
  store.ensureTag("urgent")
  return { store, homeId: home.id }
}

describe("suggestions", () => {
  test("case-insensitive substring filter", () => {
    expect(sugFilter(["Work", "Home"], "o")).toEqual(["Work", "Home"])
    expect(sugFilter(["Work"], "")).toEqual(["Work"])
  })

  test("word boundaries", () => {
    expect(wordBefore("#Rink /Lo", 9)).toBe(6)
    expect(wordBefore("one two", 3)).toBe(0)
  })

  test("project popup", () => {
    const { store, homeId } = fixture()
    const suggestion = refreshSuggestion("#Ri", 3, store, homeId)
    expect(suggestion?.items).toEqual(["Rink"])
    expect(suggestion?.idx).toBe(0)
  })

  test("bare sigil lists everything", () => {
    const { store, homeId } = fixture()
    const suggestion = refreshSuggestion("#", 1, store, homeId)
    expect(suggestion?.items).toContain("Turf")
    expect(suggestion?.items).toContain("Rink")
  })

  test("sections follow #project or fall back to the default project", () => {
    const { store, homeId } = fixture()
    expect(refreshSuggestion("#Rink /Lo", 9, store, homeId)?.items).toEqual(["Locker"])
    expect(refreshSuggestion("/Ki", 3, store, homeId)?.items).toEqual(["Kitchen"])
  })

  test("tag popup", () => {
    const { store, homeId } = fixture()
    expect(refreshSuggestion("@ur", 3, store, homeId)?.items).toEqual(["urgent"])
  })

  test("closes outside a sigil word", () => {
    const { store, homeId } = fixture()
    for (const value of ["", "#Work ", "see url.org/x", "check dev/tty", "a#b", "a "]) {
      expect(refreshSuggestion(value, value.length, store, homeId)).toBeNull()
    }
  })

  test("accept splices the token and parks the cursor", () => {
    const { store, homeId } = fixture()
    const suggestion = refreshSuggestion("#Wo", 3, store, homeId)!
    const next = acceptSuggestion("#Wo", suggestion.start, suggestion.end, suggestion.items[0]!)
    expect(next.value).toBe("#Work ")
    expect(next.cursor).toBe(6)
  })

  test("a lagging caret still opens the popup", () => {
    const { store, homeId } = fixture()
    // typed "#", the input's cursor lags one behind the text it emitted
    expect(refreshSuggestionAfterChange("Pay", "Pay #", 4, store, homeId)?.items.length).toBeGreaterThan(0)
    expect(refreshSuggestionAfterChange("Pay", "Pay #R", 5, store, homeId)?.items).toEqual(["Rink"])
    // but a deletion or a plain word does not conjure one
    expect(refreshSuggestionAfterChange("Pay rent", "Pay rent", 7, store, homeId)).toBeNull()
  })

  test("changeCaret finds the inserted span", () => {
    expect(changeCaret("Pay", "Pay #")).toBe(5)
    expect(changeCaret("Pay #", "Pay #R")).toBe(6)
    expect(changeCaret("Pay rent", "Pay ")).toBe(-1) // deletion
    expect(changeCaret("Pay", "Pay")).toBe(-1) // nothing inserted
  })

  test("movement wraps", () => {
    const suggestion = { items: ["a", "b"], idx: 0, start: 0, end: 0 }
    expect(moveSuggestion(suggestion, 1)).toBe(1)
    expect(moveSuggestion({ ...suggestion, idx: 1 }, 1)).toBe(0)
    expect(moveSuggestion(suggestion, -1)).toBe(1)
  })
})
