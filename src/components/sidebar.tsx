import type { RefObject } from "react"
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core"
import type { NavItem } from "../rows"
import type { Theme } from "../theme"
import { GLYPHS } from "../theme"
import { PaneTitle } from "./ui"

function glyphFor(item: NavItem): string {
  switch (item.kind) {
    case "inbox":
    case "today":
    case "upcoming":
      return GLYPHS.nav
    case "project":
      return GLYPHS.project
    case "label":
      return GLYPHS.label
    case "labelGroup":
      return GLYPHS.group
    default:
      return " "
  }
}

export function Sidebar({
  nav,
  navIndex,
  focused,
  theme,
  onSelect,
  scrollRef,
  onMouseScroll,
}: {
  nav: NavItem[]
  navIndex: number
  focused: boolean
  theme: Theme
  onSelect: (index: number) => void
  scrollRef: RefObject<ScrollBoxRenderable | null>
  onMouseScroll?: (event: MouseEvent) => void
}) {
  return (
    <box
      width={26}
      height="100%"
      flexDirection="column"
      backgroundColor={theme.surface}
      border={["right"]}
      borderColor={theme.border}
      paddingLeft={1}
      paddingRight={1}
      onMouseScroll={onMouseScroll}
    >
      <PaneTitle title="Navigation" focused={focused} theme={theme} trailing={focused ? "active" : ""} />
      <scrollbox
        ref={scrollRef}
        flexGrow={1}
        width="100%"
        scrollY
        scrollX={false}
        viewportCulling
        verticalScrollbarOptions={{
          showArrows: false,
          trackOptions: { backgroundColor: theme.surface, foregroundColor: theme.border },
        }}
        horizontalScrollbarOptions={{ visible: false }}
      >
        {nav.map((item, index) => {
          if (item.heading) {
            return (
              <box
                key={item.key}
                width="100%"
                height={1}
                marginTop={index === 0 ? 0 : 1}
                paddingLeft={1}
                backgroundColor={theme.surface}
              >
                <text fg={theme.faint}>
                  <b>{item.label.toUpperCase()}</b>
                </text>
              </box>
            )
          }
          const selected = index === navIndex
          const indent = item.group ? 2 : 0
          return (
            <box
              key={item.key}
              id={`nav-${index}`}
              width="100%"
              height={1}
              flexDirection="row"
              backgroundColor={selected ? (focused ? theme.selBg : theme.selDim) : theme.surface}
              onMouseDown={() => onSelect(index)}
            >
              {selected ? (
                // Same 1-cell left border as the selected task row, so both
                // panels mark the cursor with an identical bar.
                <box
                  position="absolute"
                  top={0}
                  left={0}
                  width={1}
                  height="100%"
                  border={["left"]}
                  borderColor={theme.accent}
                  zIndex={1}
                />
              ) : null}
              <text width={1}> </text>
              {indent > 0 ? <text width={indent}> </text> : null}
              <text width={2} fg={item.color || theme.faint}>
                {glyphFor(item)}
              </text>
              <text flexGrow={1} fg={selected ? theme.text : theme.subtle} truncate>
                {selected ? <b>{item.label}</b> : item.label}
              </text>
              {item.count > 0 ? (
                <text fg={selected ? theme.text : theme.faint} paddingRight={1}>
                  {item.count}
                </text>
              ) : null}
            </box>
          )
        })}
      </scrollbox>
    </box>
  )
}
