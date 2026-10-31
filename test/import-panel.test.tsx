// Import panel: `I` opens the path+mode modal; tab swaps merge/replace; enter
// runs the chosen mode against a real export file.

import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { App } from "../src/app"
import { Store, seed } from "../src/store"

async function mount(): Promise<Awaited<ReturnType<typeof testRender>>> {
  return testRender(<App store={Store.fromDb(seed())} />, {
    width: 120,
    height: 44,
    useMouse: false,
    kittyKeyboard: true,
  })
}

async function stage(setup: Awaited<ReturnType<typeof testRender>>, keys: string): Promise<void> {
  for (const key of [...keys]) {
    act(() => {
      void setup.mockInput.pressKeys([key], 0)
    })
    await setup.flush()
    if (key === "\u001b") await new Promise((resolve) => setTimeout(resolve, 30))
    await setup.flush()
  }
}

describe("import panel", () => {
  test("tab swaps merge -> replace and enter replaces the workspace from a chosen path", async () => {
    const source = Store.fromDb(seed())
    const dir = mkdtempSync(join(tmpdir(), "tasker-tui-"))
    const exportPath = join(dir, "tasker-export-20261031-120000.json")
    source.exportTo(exportPath)
    const sourceTasks = source.raw().tasks.length

    const store = Store.fromDb({ projects: [], sections: [], tags: [], tasks: [], seq: 1 })
    const setup = await testRender(<App store={store} />, {
      width: 120,
      height: 44,
      useMouse: false,
      kittyKeyboard: true,
    })

    await stage(setup, "I")
    expect(setup.captureCharFrame()).toContain("Import tasks")

    await stage(setup, "\t") // merge -> replace
    let frame = setup.captureCharFrame()
    expect(frame).toContain("replace")

    await stage(setup, exportPath) // type the chosen path into the input
    frame = setup.captureCharFrame()
    expect(frame).toContain("tasker-export-")

    await stage(setup, "\r") // enter -> run replace
    await setup.waitFor(() => !setup.captureCharFrame().includes("Import tasks"))

    expect(store.raw().tasks).toHaveLength(sourceTasks)
    expect(store.raw().tasks.length).toBeGreaterThan(0)
    await setup.dispose()
  })
})
