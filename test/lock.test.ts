// The PID lock must work before the data directory exists, refuse a second
// live instance, and reclaim a lock left behind by a dead process.

import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { lockDataFile, unlockDataFile } from "../src/lock"

describe("data lock", () => {
  test("creates the parent directory and rejects a live second instance", () => {
    const path = join(mkdtempSync(join(tmpdir(), "tasker-lock-")), "nested", "tasker.json")
    try {
      lockDataFile(path)
      expect(existsSync(`${path}.lock`)).toBe(true)
      expect(() => lockDataFile(path)).toThrow(/already using/)
    } finally {
      unlockDataFile()
    }
    expect(existsSync(`${path}.lock`)).toBe(false)
  })

  test("reclaims a stale lock", () => {
    const path = join(mkdtempSync(join(tmpdir(), "tasker-lock-")), "tasker.json")
    writeFileSync(`${path}.lock`, "999999999")
    try {
      lockDataFile(path)
      expect(existsSync(`${path}.lock`)).toBe(true)
    } finally {
      unlockDataFile()
    }
  })
})
