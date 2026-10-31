// Edit-panel autosuggestions must behave exactly like quick add: `#` opens a
// project dropdown, `↑/↓` pick, `Enter` accepts, `Esc` dismisses, second `Esc`
// closes the editor. Driven through the headless OpenTUI test renderer.

import { act } from "react"
import { testRender } from "@opentui/react/test-utils"

import { App } from "../src/app"
import { Store, seed } from "../src/store"

async function mount(): Promise<Awaited<ReturnType<typeof testRender>>> {
  return testRender(<App store={Store.fromDb(seed())} />, {
    width: 120,
    height: 44,
    useMouse: false,
    // Kitty encoding makes Escape/arrow sequences unambiguous for the stdin
    // parser (a lone 0x1B would otherwise wait out its disambiguation timeout).
    kittyKeyboard: true,
  })
}

/** Every key runs inside act so React state commits between keystrokes.
 *  Escape needs the stdin parser's 20ms sequence timeout, so settle after it. */
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

describe("edit panel autosuggestions", () => {
  test("task field never opens a dropdown", async () => {
    const setup = await mount()
    await stage(setup, "le") // focus list, open editor
    expect(setup.captureCharFrame()).toContain("Edit task")

    await stage(setup, "hello") // task titles are free text — no dropdown
    const frame = setup.captureCharFrame()
    expect(frame).toContain("hello")
    expect(frame).not.toContain("enter accept · esc dismiss")

    await stage(setup, " #W") // sigil words in the title never suggest either
    const frameAfter = setup.captureCharFrame()
    expect(frameAfter).not.toContain("enter accept · esc dismiss")
    await setup.dispose()
  })

  test("``#` after a space opens the project dropdown with matching names", async () => {
    const setup = await mount()
    await stage(setup, "le")
    await stage(setup, "\t\t") // Task -> Note -> Project
    await stage(setup, " ")
    await stage(setup, "#")
    const frame = setup.captureCharFrame()
    expect(frame).toContain("enter accept · esc dismiss")
    // seeded projects that must be offered
    expect(frame).toContain("Work")
    expect(frame).toContain("Personal")
    await setup.dispose()
  })

  test("``#W` filters the candidates to Work", async () => {
    const setup = await mount()
    await stage(setup, "le")
    await stage(setup, "\t\t") // Task -> Note -> Project
    await stage(setup, " #")
    await stage(setup, "W")
    const frame = setup.captureCharFrame()
    expect(frame).toContain("enter accept · esc dismiss")
    expect(frame).toContain("▸ Work") // only candidate, selected
    expect(frame).not.toContain("▸ Personal")
    await setup.dispose()
  })

  test("enter accepts the picked candidate into the field", async () => {
    const setup = await mount()
    await stage(setup, "le")
    await stage(setup, "\t\t") // Task -> Note -> Project
    await stage(setup, " #W") // "Work" matches; it is the only candidate
    await stage(setup, "\r") // accept
    const frame = setup.captureCharFrame()
    expect(frame).toContain("Work ")
    expect(frame).not.toContain("enter accept · esc dismiss")
    await setup.dispose()
  })

  test("esc dismisses the dropdown, second esc closes the editor", async () => {
    const setup = await mount()
    await stage(setup, "le")
    await stage(setup, "\t\t") // Task -> Note -> Project
    await stage(setup, " ")
    await stage(setup, "#")
    expect(setup.captureCharFrame()).toContain("enter accept · esc dismiss")

    await stage(setup, "\u001b")
    await setup.waitFor(() => !setup.captureCharFrame().includes("enter accept · esc dismiss"))
    expect(setup.captureCharFrame()).toContain("Edit task") // still editing

    act(() => {
      setup.mockInput.pressEscape()
    })
    await setup.flush()
    await setup.waitFor(() => !setup.captureCharFrame().includes("Edit task"))
    await setup.dispose()
  })
})
