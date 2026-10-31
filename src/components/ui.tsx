import type { ReactNode } from "react"
import type { Theme } from "../theme"

export function PaneTitle({
  title,
  focused,
  trailing,
  theme,
}: {
  title: string
  focused?: boolean
  trailing?: ReactNode
  theme: Theme
}) {
  return (
    <box width="100%" height={1} flexDirection="row" paddingRight={1}>
      <text fg={focused ? theme.accent : theme.subtle}>
        <b>{title}</b>
      </text>
      <box flexGrow={1} />
      {trailing !== undefined && trailing !== null ? <text fg={theme.faint}>{trailing}</text> : null}
    </box>
  )
}

export function ModalFrame({
  title,
  theme,
  width,
  children,
  footer,
  accent,
}: {
  title: string
  theme: Theme
  width: number
  children: ReactNode
  footer?: ReactNode
  accent?: string
}) {
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      backgroundColor={theme.overlay}
      zIndex={100}
      alignItems="center"
      justifyContent="center"
    >
      <box
        width={width}
        flexDirection="column"
        backgroundColor={theme.surface}
        border
        borderStyle="rounded"
        borderColor={accent ?? theme.border}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        zIndex={101}
      >
        <text fg={accent ?? theme.accent}>
          <b>{title}</b>
        </text>
        <box height={1} />
        {children}
        {footer ? (
          <>
            <box height={1} />
            <text fg={theme.faint}>{footer}</text>
          </>
        ) : null}
      </box>
    </box>
  )
}

/** Usable columns inside a ModalFrame: border (2) + left/right padding (4). */
export function modalInnerWidth(width: number): number {
  return Math.max(4, width - 6)
}

export function FieldLabel({
  label,
  active,
  theme,
  width = 10,
}: {
  label: string
  active: boolean
  theme: Theme
  width?: number
}) {
  return (
    <text width={width} fg={active ? theme.text : theme.faint}>
      {active ? `▸ ${label}` : `  ${label}`}
    </text>
  )
}

export function Hint({ children, theme }: { children: ReactNode; theme: Theme }) {
  return <text fg={theme.faint}>{children}</text>
}

export function KeyHint({ keys, label, theme }: { keys: string; label: string; theme: Theme }) {
  return (
    <span>
      <span fg={theme.accentSoft}>{keys}</span>
      <span fg={theme.faint}> {label}</span>
    </span>
  )
}
