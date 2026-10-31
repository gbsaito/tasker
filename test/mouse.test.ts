import { describe, expect, test } from "bun:test"
import { scrollDelta } from "../src/mouse"

describe("scrollDelta", () => {
  test("wheel down moves the selection down", () => {
    expect(scrollDelta({ scroll: { direction: "down", delta: 1 } })).toBe(1)
  })

  test("wheel up moves the selection up", () => {
    expect(scrollDelta({ scroll: { direction: "up", delta: 1 } })).toBe(-1)
  })

  test("scrolls without a usable direction are ignored", () => {
    expect(scrollDelta(null)).toBe(0)
    expect(scrollDelta({})).toBe(0)
    expect(scrollDelta({ scroll: { direction: "left", delta: 1 } })).toBe(0)
    expect(scrollDelta({ scroll: { direction: "right", delta: 1 } })).toBe(0)
  })
})
