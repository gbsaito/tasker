// A small PID lock beside the data file. The Go version used flock; without a
// native flock binding in Bun we create an exclusive file and treat a lock
// whose PID is no longer alive as stale. The lock is removed on exit.

import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync, closeSync } from "node:fs"
import { dirname } from "node:path"

let heldPath: string | null = null

function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

export function lockDataFile(path: string): void {
  const lockPath = `${path}.lock`
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 })

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, "wx", 0o644)
      writeSync(fd, String(process.pid))
      closeSync(fd)
      heldPath = lockPath
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EEXIST") throw error
      let stale = false
      try {
        stale = !pidAlive(Number(readFileSync(lockPath, "utf8").trim()))
      } catch {
        stale = true
      }
      if (!stale) {
        throw new Error(`another tasker instance is already using ${path}`)
      }
      try {
        unlinkSync(lockPath)
      } catch {
        // someone else cleaned it up first
      }
    }
  }
  throw new Error(`could not lock ${path}`)
}

export function unlockDataFile(): void {
  if (!heldPath) return
  try {
    if (existsSync(heldPath)) unlinkSync(heldPath)
  } catch {
    // best effort
  }
  heldPath = null
}
