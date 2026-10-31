import type { ReactNode } from "react"
import { monthName, parseIso, weekdayName } from "../dates"
import type { Theme } from "../theme"
import { KeyHint } from "./ui"

export function Header({
  theme,
  path,
  today,
  counts,
}: {
  theme: Theme
  path: string
  today: string
  counts: number
}) {
  const date = parseIso(today)
  const stamp = date ? `${weekdayName(date)} ${date.d} ${monthName(date.m)}` : ""
  return (
    <box width="100%" height={1} backgroundColor={theme.surface} paddingLeft={1} paddingRight={1} flexDirection="row">
      <text fg={theme.accent} flexShrink={0}>
        <b>tasker</b>
      </text>
      <text fg={theme.faint} flexShrink={0}>{"  /  "}</text>
      <text fg={theme.text} flexShrink={1} truncate>{path}</text>
      <box flexGrow={1} minWidth={0} />
      <box flexDirection="row" flexShrink={0} paddingLeft={1}>
        <text fg={theme.faint}>{`${counts} ${counts === 1 ? "task" : "tasks"}`}</text>
        <text fg={theme.border}>{"  ·  "}</text>
        <text fg={theme.faint}>{stamp}</text>
      </box>
    </box>
  )
}

export function StatusBar({
  theme,
  left,
  right,
  search,
}: {
  theme: Theme
  left?: ReactNode
  right?: ReactNode
  search?: ReactNode
}) {
  return (
    <box width="100%" height={1} backgroundColor={theme.base} paddingLeft={1} paddingRight={1} flexDirection="row">
      <box flexGrow={1} flexDirection="row">
        {search ?? left}
      </box>
      {right !== undefined ? <text fg={theme.faint}>{right}</text> : null}
    </box>
  )
}

export function Footer({
  theme,
  width,
  hints,
}: {
  theme: Theme
  width: number
  hints: Array<{ keys: string; label: string }>
}) {
  const picked: Array<{ keys: string; label: string }> = []
  let used = 0
  for (const hint of hints) {
    const size = hint.keys.length + hint.label.length + 3
    if (used + size > width - 2 && picked.length > 0) break
    picked.push(hint)
    used += size
  }
  return (
    <box width="100%" height={1} backgroundColor={theme.surface} paddingLeft={1} paddingRight={1} flexDirection="row">
      <text>
        {picked.map((hint, index) => (
          <span key={`${hint.keys}-${index}`}>
            {index > 0 ? <span fg={theme.border}>{"  ·  "}</span> : null}
            <KeyHint keys={hint.keys} label={hint.label} theme={theme} />
          </span>
        ))}
      </text>
    </box>
  )
}
