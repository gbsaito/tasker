// Throwaway probe: can the mock deliver a lone ESC?
import { testRender } from "@opentui/react/test-utils"

const setup = await testRender(<box />, { width: 20, height: 5, kittyKeyboard: true })
setup.renderer.keyInput?.on("keypress", (ev: { name: string }) => {
  console.log("KEY:", ev.name)
})
await setup.mockInput.pressKeys(["x"], 0)
await new Promise((r) => setTimeout(r, 50))
console.log("--- after 50ms")
setup.mockInput.pressEscape()
await new Promise((r) => setTimeout(r, 50))
console.log("--- after pressEscape")
setup.mockInput.pressKey("escape")
await new Promise((r) => setTimeout(r, 50))
console.log("--- after pressKey")
setup.mockInput.pressKeys(["\x1b[B"], 2)
await new Promise((r) => setTimeout(r, 60))
console.log("--- after arrows")
await setup.dispose()
