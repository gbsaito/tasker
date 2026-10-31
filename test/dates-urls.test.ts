// Civil dates and note-link tokenising.

import { describe, expect, test } from "bun:test"

import {
  addDaysIso,
  addMonths,
  civilOf,
  daysFrom,
  humanDate,
  isValidIso,
  parseIso,
  shortDate,
  todayIso,
  weekdayName,
} from "../src/dates"
import { firstUrl, tokenizeText, trimUrlPunctuation } from "../src/urls"

describe("civil dates", () => {
  test("ISO round-trip and validation", () => {
   expect(parseIso("2026-09-16")).toEqual({ y: 2026, m: 9, d: 16 })
    expect(parseIso("2026-13-01")).toBeNull()
    expect(isValidIso("2026-02-29")).toBe(false)
    expect(isValidIso("2028-02-29")).toBe(true)
  })

  test("arithmetic crosses months and leap days", () => {
    expect(addDaysIso("2026-09-16", 15)).toBe("2026-10-01")
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29")
    expect(addMonths(civilOf(2026, 1, 31), 1)).toEqual({ y: 2026, m: 3, d: 3 })
  })

  test("human labels", () => {
    const today = "2026-09-16"
    expect(humanDate("2026-09-16", today)).toBe("Today")
    expect(shortDate("2026-09-17", today)).toBe("Tomorrow")
    expect(shortDate("2026-09-15", today)).toBe("Yesterday")
    expect(shortDate("2026-09-18", today)).toBe("Sep 18")
    expect(shortDate("2027-01-02", today)).toBe("Jan 2 27")
    expect(weekdayName(civilOf(2026, 9, 16))).toBe("Wed")
    expect(daysFrom(civilOf(2026, 9, 18), civilOf(2026, 9, 16))).toBe(2)
    expect(todayIso(new Date(2026, 8, 16, 23, 59))).toBe("2026-09-16")
  })
})

describe("URLs", () => {
  test("punctuation is split off", () => {
    expect(trimUrlPunctuation("https://example.com/x).")).toEqual({
      url: "https://example.com/x",
      tail: ").",
    })
    expect(firstUrl("Docs: https://example.com/a?b=1, more")).toBe("https://example.com/a?b=1")
    expect(firstUrl("no link here")).toBe("")
  })

  test("tokenising marks links but keeps prose", () => {
    const tokens = tokenizeText("See https://example.com/x and continue")
    expect(tokens[0]).toEqual({ text: "See " })
    expect(tokens[1]?.url).toBe("https://example.com/x")
    expect(tokens[2]?.text).toContain(" and continue")
  })
})
