// UI preferences live in a small sidecar next to the task document. Keeping
// them out of the document means undo/import/export never touch them, and the
// JSON shape stays compatible with tasker v1.

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export interface Settings {
  accent?: string
}

const HEX = /^#[0-9a-f]{6}$/i

export function settingsPath(dataPath: string): string {
  return join(dirname(dataPath), "tasker-settings.json")
}

export function loadSettings(dataPath: string): Settings {
  if (dataPath === ":memory:") return {}
  try {
    const path = settingsPath(dataPath)
    if (!existsSync(path)) return {}
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
    if (!raw || typeof raw !== "object") return {}
    const accent = (raw as Settings).accent
    return typeof accent === "string" && HEX.test(accent) ? { accent } : {}
  } catch {
    return {}
  }
}

export function saveSettings(dataPath: string, settings: Settings): void {
  if (dataPath === ":memory:") return
  try {
    writeFileSync(settingsPath(dataPath), `${JSON.stringify(settings, null, 2)}\n`, "utf8")
  } catch {
    // A read-only data directory should not break the UI.
  }
}
