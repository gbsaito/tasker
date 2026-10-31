// Entry point: open the JSON store, take a PID lock beside it, and mount the
// React tree on an OpenTUI renderer. `--data <path>` (or `-data`) overrides the
// default XDG location, matching tasker v1.

import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

import { App } from "./app"
import { lockDataFile, unlockDataFile } from "./lock"
import { Store, defaultPath } from "./store"

function dataPathFromArgs(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "--data" || arg === "-data") {
      const value = argv[i + 1]
      if (value) return value
    }
    if (arg.startsWith("--data=")) return arg.slice("--data=".length)
    if (arg.startsWith("-data=")) return arg.slice("-data=".length)
  }
  return ""
}

async function main(): Promise<void> {
  const path = dataPathFromArgs(process.argv.slice(2)) || defaultPath()

  try {
    lockDataFile(path)
  } catch (error) {
    console.error(`tasker: ${(error as Error).message}`)
    process.exit(1)
  }

  let store: Store
  try {
    store = Store.open(path)
  } catch (error) {
    unlockDataFile()
    console.error(`tasker: ${(error as Error).message}`)
    process.exit(1)
  }

  process.on("exit", unlockDataFile)

  try {
    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useMouse: true,
      screenMode: "alternate-screen",
      clearOnShutdown: true,
      onDestroy: unlockDataFile,
    })
    renderer.setTerminalTitle("tasker")
    createRoot(renderer).render(<App store={store} />)
  } catch (error) {
    unlockDataFile()
    console.error(`tasker: ${(error as Error).message}`)
    process.exit(1)
  }
}

void main()
