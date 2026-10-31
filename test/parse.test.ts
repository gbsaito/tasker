// Quick-add grammar: #project, @label (including namespaced labels), /section,
// priorities and natural-language dates. Mirrors tasker v1's parser tests.

import { describe, expect, test } from "bun:test"

import { parseDate, quickAdd } from "../src/parse"

/** A fixed Wednesday: 2026-09-16. */
const NOW = new Date(2026, 8, 16, 10, 0, 0)

function add(input: string) {
  return quickAdd(input, NOW)
}

describe("quickAdd", () => {
  test("combines project, label and due date", () => {
    const result = add("Buy milk tomorrow @shopping #Groceries")
    expect(result.content).toBe("Buy milk")
    expect(result.project).toBe("Groceries")
    expect(result.labels).toEqual(["shopping"])
    expect(result.due).toBe("2026-09-17")
    expect(result.priority).toBe(4)
  })

  test("recognises shortcuts and relative phrases", () => {
    expect(add("Call mum today").due).toBe("2026-09-16")
    expect(add("Standup tm").due).toBe("2026-09-17")
    expect(add("Plan sprint next week").due).toBe("2026-09-23")
    expect(add("Water plants in 3 days").due).toBe("2026-09-19")
  })

  test("recognises numeric and named dates", () => {
    expect(add("Ship 09/18").due).toBe("2026-09-18")
    expect(add("Ship 18 sep").due).toBe("2026-09-18")
    expect(add("Ship sep 18").due).toBe("2026-09-18")
    expect(add("Ship 18 sep 2027").due).toBe("2027-09-18")
    expect(add("ISO 2026-10-01").due).toBe("2026-10-01")
    expect(add("Rollover 01/05").due).toBe("2027-01-05")
  })

  test("weekdays resolve to the next occurrence", () => {
    expect(add("Retro monday").due).toBe("2026-09-21")
    expect(add("Retro next monday").due).toBe("2026-09-21")
    expect(add("Retro wed").due).toBe("2026-09-16")
  })

  test("separate deadline field", () => {
    const result = add("Submit report #Work /Backlog deadline: friday")
    expect(result.content).toBe("Submit report")
    expect(result.project).toBe("Work")
    expect(result.section).toBe("Backlog")
    expect(result.deadline).toBe("2026-09-18")
    expect(result.due).toBeUndefined()
  })

  test("labels are deduplicated case-insensitively", () => {
    const result = add("Multi @a @b @a #Home")
    expect(result.content).toBe("Multi")
    expect(result.project).toBe("Home")
    expect(result.labels).toEqual(["a", "b"])
  })

  test("namespaced labels accept both spellings", () => {
    expect(add("Study @school: math").labels).toEqual(["school: math"])
    expect(add("Fix bug @coding:fix").labels).toEqual(["coding: fix"])
    expect(add("Deep @school:mathematics").labels).toEqual(["school: mathematics"])
    expect(add("Read @school: math tomorrow").labels).toEqual(["school: math"])
    expect(add("Mix @school: math @coding: fix @plain").labels).toEqual([
      "school: math",
      "coding: fix",
      "plain",
    ])
  })

  test("priority tokens", () => {
    const result = add("Urgent thing !p1")
    expect(result.content).toBe("Urgent thing")
    expect(result.priority).toBe(1)
    expect(result.hasPriority).toBe(true)
  })
})

describe("parseDate", () => {
  test("accepts complete date phrases only", () => {
    expect(parseDate("today", NOW)?.m).toBe(9)
    expect(parseDate("tom", NOW)?.d).toBe(17)
    expect(parseDate("next friday", NOW)?.d).toBe(18)
    expect(parseDate("2027-01-02", NOW)?.y).toBe(2027)
    expect(parseDate("", NOW)).toBeNull()
    expect(parseDate("not a date", NOW)).toBeNull()
  })
})
