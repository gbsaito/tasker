import type { RefObject } from "react"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { humanDate } from "../dates"
import type { QuickAddResult } from "../parse"
import { PALETTE, type Priority } from "../model"
import { type ManageItem, ManageTab, MANAGE_SECTIONS, MANAGE_TAGS } from "../rows"
import type { Store } from "../store"
import type { Suggestion } from "../suggest"
import type { Theme } from "../theme"
import { FieldLabel, Hint, ModalFrame, modalInnerWidth } from "./ui"

const SUG_VISIBLE = 6

/** Dropdown of autocomplete candidates under a focused input field. Rendered
 *  by the app as a root-level overlay: OpenTUI does not reliably repaint a
 *  nested box tree that grows by insertion while a plain pane update does. */
export function SuggestionList({
  theme,
  suggestion,
  indent,
}: {
  theme: Theme
  suggestion: Suggestion | null
  indent: number
}) {
  const visible = (() => {
    if (!suggestion) return []
    const start = Math.max(0, Math.min(suggestion.idx - SUG_VISIBLE + 1, suggestion.items.length - SUG_VISIBLE))
    return suggestion.items.slice(start, start + SUG_VISIBLE).map((item, offset) => ({
      item,
      index: start + offset,
    }))
  })()
  if (!suggestion || visible.length === 0) return null
  return (
    <box width="100%" flexDirection="column" paddingLeft={indent} paddingTop={0}>
      {visible.map(({ item, index }) => {
        const active = index === suggestion.idx
        return (
          <box
            key={`${item}-${index}`}
            width="100%"
            height={1}
            backgroundColor={active ? theme.selBg : theme.base}
            paddingLeft={1}
          >
            <text fg={active ? theme.accent : theme.subtle}>
              {active ? "▸ " : "  "}
              {item}
            </text>
          </box>
        )
      })}
      <text fg={theme.faint} backgroundColor={theme.base}>{"  ↑/↓ pick · enter accept · esc dismiss"}</text>
    </box>
  )
}

function InputStyle(theme: Theme) {
  return {
    // Only the focused field gets a visible bar, so stacked fields never read
    // as one merged block. flexShrink/minWidth keep long values inside the
    // modal instead of spilling past its border.
    flexShrink: 1,
    minWidth: 0,
    backgroundColor: theme.surface,
    focusedBackgroundColor: theme.base,
    textColor: theme.text,
    focusedTextColor: theme.text,
    placeholderColor: theme.faint,
    cursorColor: theme.accent,
  }
}

export function QuickAddModal({
  theme,
  width,
  note,
  content,
  description,
  field,
  preview,
  store,
  today,
  defaultProjectId,
  contentRef,
  descriptionRef,
  onContent,
  onDescription,
}: {
  theme: Theme
  width: number
  note: boolean
  content: string
  description: string
  field: number
  preview: QuickAddResult
  store: Store
  today: string
  defaultProjectId: string
  contentRef: RefObject<InputRenderable | null>
  descriptionRef: RefObject<InputRenderable | null>
  onContent: (value: string) => void
  onDescription: (value: string) => void
}) {
  const inner = modalInnerWidth(width)
  const project = preview.project
    ? store.projectByName(preview.project)
    : (store.projectById(defaultProjectId) ?? store.projectById(store.inbox()?.id ?? ""))
  const projectName = preview.project || project?.name || "Inbox"
  const projectColor = preview.project ? (project?.color ?? "#4073ff") : (project?.color ?? theme.faint)

  return (
    <ModalFrame
      title={note ? "Add note" : "Add task"}
      theme={theme}
      width={width}
      footer="tab field · ↑↓ pick · enter add · esc cancel"
    >
      <box width="100%" height={1} flexDirection="row">
        <FieldLabel label="Task" active={field === 0} theme={theme} width={9} />
        <input
          ref={contentRef}
          flexGrow={1}
          value={content}
          onInput={onContent}
          focused={field === 0}
          placeholder="Pay rent tomorrow #Home @bills !p1"
          {...InputStyle(theme)}
        />
      </box>

      <box width="100%" height={1} flexDirection="row">
        <FieldLabel label="Note" active={field === 1} theme={theme} width={9} />
        <input
          ref={descriptionRef}
          flexGrow={1}
          value={description}
          onInput={onDescription}
          focused={field === 1}
          placeholder="optional note — URLs become clickable"
          {...InputStyle(theme)}
        />
      </box>

      <box height={1} />
      <text fg={theme.border} wrapMode="none">
        {"─".repeat(inner)}
      </text>
      <box height={1} />
      <text wrapMode="word" fg={theme.faint}>
        <span>project: </span>
        <span fg={projectColor}>{`#${projectName}`}</span>
        {preview.section ? (
          <span>
            <span>{"  section: "}</span>
            <span fg={theme.text}>{`/${preview.section}`}</span>
          </span>
        ) : null}
        {preview.due ? (
          <span>
            <span>{"  due: "}</span>
            <span fg={theme.due}>{humanDate(preview.due, today)}</span>
          </span>
        ) : null}
        {preview.deadline ? (
          <span>
            <span>{"  deadline: "}</span>
            <span fg={theme.deadline}>{humanDate(preview.deadline, today)}</span>
          </span>
        ) : null}
        {preview.hasPriority ? (
          <span>
            <span>{"  priority: "}</span>
            <span fg={theme.accent}>{`P${preview.priority}`}</span>
          </span>
        ) : null}
        {(preview.labels ?? []).map((label, index) => {
          const tag = store.tagByName(label)
          return (
            <span key={`${label}-${index}`}>
              <span>{"  "}</span>
              <span fg={tag?.color ?? theme.faint}>{`@${label}`}</span>
            </span>
          )
        })}
      </text>
    </ModalFrame>
  )
}

const EDIT_FIELDS = ["Task", "Note", "Project", "Section", "Labels", "Due", "Deadline", "Priority"]
const EDIT_PLACEHOLDERS = [
  "task content",
  "note — paste a URL to see it turn blue",
  "project name",
  "section name (optional)",
  "comma separated, e.g. urgent, home",
  "today · tomorrow · 09/18 · 18 sep (empty to clear)",
  "deadline, same syntax (empty to clear)",
  "1-4 … or P1-P4",
]

export function ThemeModal({
  theme,
  width,
  accent,
  index,
}: {
  theme: Theme
  width: number
  accent: string
  index: number
}) {
  const inner = modalInnerWidth(width)
  const cols = Math.max(4, Math.floor(inner / 2))
  const rows: string[][] = []
  for (let i = 0; i < PALETTE.length; i += cols) rows.push(PALETTE.slice(i, i + cols))

  return (
    <ModalFrame
      title="Theme"
      theme={theme}
      width={width}
      footer="h/l or j/k pick · enter apply · esc cancel"
    >
      <text fg={theme.faint}>Accent colour</text>
      <box height={1} />
      {rows.map((row, r) => (
        <box key={r} height={1} flexDirection="row">
          {row.map((color, c) => {
            const active = r * cols + c === index
            return (
              <box
                key={color}
                width={2}
                height={1}
                backgroundColor={active ? theme.selBg : theme.surface}
              >
                <text fg={color}>{active ? <b>●</b> : "●"}</text>
              </box>
            )
          })}
        </box>
      ))}
      <box height={1} />
      <text>
        <span fg={theme.faint}>accent  </span>
        <span fg={accent}>{accent}</span>
      </text>
      <box height={1} />
      <text fg={theme.faint}>Preview</text>
      <box height={1} />
      <text>
        <span fg={theme.accent}>
          <b>tasker</b>
        </span>
        <span fg={theme.faint}>{"  /  "}</span>
        <span fg={theme.text}>Inbox</span>
      </text>
      <text>
        <span fg={theme.accent}>{"▸ "}</span>
        <span fg={theme.text}>Pay rent tomorrow</span>
      </text>
      <text>
        <span fg={theme.faint}>{"  #Inbox  "}</span>
        <span fg={theme.accent}>{"P1"}</span>
        <span fg={theme.faint}>{"  @bills"}</span>
      </text>
    </ModalFrame>
  )
}

export function EditTaskModal({
  theme,
  width,
  values,
  field,
  inputRef,
  onChange,
}: {
  theme: Theme
  width: number
  values: string[]
  field: number
  inputRef: RefObject<InputRenderable | null>
  onChange: (index: number, value: string) => void
}) {
  return (
    <ModalFrame title="Edit task" theme={theme} width={width} footer="tab/↑↓ field · enter save · esc cancel">
      {EDIT_FIELDS.map((label, index) => {
        const active = index === field
        return (
          <box key={label} width="100%" flexDirection="column">
            <box width="100%" height={1} flexDirection="row">
              <FieldLabel label={label} active={active} theme={theme} width={12} />
              {active ? (
                <input
                  ref={inputRef}
                  flexGrow={1}
                  value={values[index] ?? ""}
                  onInput={(value) => onChange(index, value)}
                  focused
                  placeholder={EDIT_PLACEHOLDERS[index]}
                  {...InputStyle(theme)}
                />
              ) : (
                <text flexGrow={1} fg={values[index] ? theme.subtle : theme.faint} truncate>
                  {values[index] || EDIT_PLACEHOLDERS[index]}
                </text>
              )}
            </box>
          </box>
        )
      })}
    </ModalFrame>
  )
}

export function ImportModal({
  theme,
  width,
  path,
  mode,
  pathRef,
  onPath,
}: {
  theme: Theme
  width: number
  path: string
  mode: "merge" | "replace"
  pathRef: RefObject<InputRenderable | null>
  onPath: (value: string) => void
}) {
  const option = (value: "merge" | "replace", hint: string) => {
    const active = mode === value
    return (
      <box width="100%" height={1} flexDirection="row" paddingLeft={2}>
        <text fg={active ? theme.accent : theme.faint}>{active ? "● " : "○ "}</text>
        <text fg={active ? theme.text : theme.subtle}>{value}</text>
        <text fg={theme.faint}>{`  ${hint}`}</text>
      </box>
    )
  }

  return (
    <ModalFrame
      title="Import tasks"
      theme={theme}
      width={width}
      footer="path: tab to mode · ←→ choose · enter import · esc cancel"
    >
      <box width="100%" height={1} flexDirection="row">
        <FieldLabel label="Path" active theme={theme} width={9} />
        <input
          ref={pathRef}
          flexGrow={1}
          value={path}
          onInput={onPath}
          focused
          placeholder="~/Downloads/tasker-export-YYYYMMDD-HHMMSS.json"
          {...InputStyle(theme)}
        />
      </box>

      <box height={1} />
      <text fg={theme.faint}>Mode</text>
      {option("merge", "add by name, keep existing data")}
      {option("replace", "overwrite everything with the file")}
      <box height={1} />
      <text fg={theme.faint} wrapMode="word">
        Merge keeps your current workspace and adds the file's tasks. Replace
        loads the file as the whole workspace. u undoes either one.
      </text>
    </ModalFrame>
  )
}

function tabName(tab: ManageTab): string {
  return tab === MANAGE_SECTIONS ? "Sections" : tab === MANAGE_TAGS ? "Tags" : "Projects"
}

function editTitle(tab: ManageTab, isNew: boolean, isGroup: boolean): string {
  if (isGroup) return `${isNew ? "New" : "Edit"} tag group`
  if (tab === MANAGE_SECTIONS) return `${isNew ? "New" : "Edit"} section`
  if (tab === MANAGE_TAGS) return `${isNew ? "New" : "Edit"} tag`
  return `${isNew ? "New" : "Edit"} project`
}

function ColorPalette({
  theme,
  selected,
}: {
  theme: Theme
  selected: number
}) {
  return (
    <box flexDirection="row" height={1}>
      {PALETTE.map((color, index) => {
        const active = index === selected % PALETTE.length
        return (
          <box
            key={color}
            width={2}
            height={1}
            backgroundColor={active ? theme.selBg : theme.surface}
          >
            <text fg={color}>{active ? "●" : "●"}</text>
          </box>
        )
      })}
    </box>
  )
}

export function ManageModal({
  theme,
  width,
  height,
  tab,
  items,
  index,
  editing,
  isNew,
  isGroup,
  name,
  colorIndex,
  confirmDelete,
  nameRef,
  scrollRef,
  onName,
  onSelect,
}: {
  theme: Theme
  width: number
  height: number
  tab: ManageTab
  items: ManageItem[]
  index: number
  editing: boolean
  isNew: boolean
  isGroup: boolean
  name: string
  colorIndex: number
  confirmDelete: boolean
  nameRef: RefObject<InputRenderable | null>
  scrollRef: RefObject<ScrollBoxRenderable | null>
  onName: (value: string) => void
  onSelect: (index: number) => void
}) {
  const inner = modalInnerWidth(width)
  if (editing) {
    return (
      <ModalFrame
        title={editTitle(tab, isNew, isGroup)}
        theme={theme}
        width={width}
        footer={
          tab === MANAGE_SECTIONS
            ? "type to rename · enter save · esc cancel"
            : "type to rename · tab colour · enter save · esc cancel"
        }
      >
        <box width="100%" height={1} flexDirection="row">
          <text width={8} fg={theme.faint}>
            Name
          </text>
          <input
            ref={nameRef}
            flexGrow={1}
            value={name}
            onInput={onName}
            focused
            placeholder="name"
            {...InputStyle(theme)}
          />
        </box>
        {tab !== MANAGE_SECTIONS ? (
          <>
            <box height={1} />
            <text fg={theme.faint}>Colour</text>
            <box height={1} />
            <ColorPalette theme={theme} selected={colorIndex} />
          </>
        ) : null}
      </ModalFrame>
    )
  }

  const TabLabel = ({ active, name }: { active: boolean; name: string }) =>
    active ? (
      <b>
        <span fg={theme.accent}>{name}</span>
      </b>
    ) : (
      <span fg={theme.faint}>{name}</span>
    )

  return (
    <ModalFrame
      title="Manage"
      theme={theme}
      width={width}
      footer={
        confirmDelete
          ? "press d again to delete · any other key cancels"
          : "a add · e edit · d delete · tab switch · esc close"
      }
      accent={confirmDelete ? theme.overdue : undefined}
    >
      <text>
        <TabLabel active={tab === 0} name="Projects" />
        <span fg={theme.border}>{"   ·   "}</span>
        <TabLabel active={tab === 1} name="Sections" />
        <span fg={theme.border}>{"   ·   "}</span>
        <TabLabel active={tab === 2} name="Tags" />
      </text>
      <box height={1} />
      <scrollbox
        ref={scrollRef}
        width="100%"
        height={Math.max(4, height - 15)}
        scrollY
        scrollX={false}
        viewportCulling
        verticalScrollbarOptions={{
          showArrows: false,
          trackOptions: { backgroundColor: theme.surface, foregroundColor: theme.border },
        }}
        horizontalScrollbarOptions={{ visible: false }}
      >
        {items.length === 0 ? (
          <text fg={theme.faint}>{"  (none yet — press a to add)"}</text>
        ) : null}
        {items.map((item, i) => {
          const selected = i === index
          const glyph = item.group ? "▪" : tab === MANAGE_TAGS ? "@" : tab === MANAGE_SECTIONS && item.nested ? "·" : "●"
          const indent = item.nested ? 2 : 0
          return (
            <box
              key={item.key}
              id={`manage-${i}`}
              width="100%"
              height={1}
              flexDirection="row"
              backgroundColor={selected ? theme.selBg : theme.surface}
              onMouseDown={() => onSelect(i)}
            >
              <text width={1} fg={selected ? theme.accent : theme.surface}>
                {selected ? "▸" : " "}
              </text>
              {indent ? <text width={indent}> </text> : null}
              <text width={2} fg={item.color || theme.faint}>
                {glyph}
              </text>
              <text flexGrow={1} fg={selected ? theme.text : theme.subtle} truncate>
                {selected ? <b>{item.name}</b> : item.name}
              </text>
            </box>
          )
        })}
      </scrollbox>
      <box height={1} />
      <text fg={theme.faint}>
        {tab === MANAGE_SECTIONS
          ? "sections live under their project · a adds under the highlighted project"
          : tab === MANAGE_TAGS
            ? "namespaced tags nest under their group · edit a group to rename all"
            : "deleting a project also removes its sections and tasks"}
      </text>
      <box height={1} />
      <text fg={theme.border} wrapMode="none">
        {"─".repeat(inner)}
      </text>
    </ModalFrame>
  )
}

export function ConfirmModal({
  theme,
  width,
  title,
  lines,
  danger,
}: {
  theme: Theme
  width: number
  title: string
  lines: string[]
  danger?: boolean
}) {
  return (
    <ModalFrame
      title={title}
      theme={theme}
      width={width}
      accent={danger ? theme.overdue : undefined}
      footer="y / enter confirm · n cancel"
    >
      {lines.map((line, index) => (
        <text key={index} wrapMode="word" fg={index === 0 ? theme.text : theme.faint}>
          {line}
        </text>
      ))}
    </ModalFrame>
  )
}

type HelpLine =
  | { kind: "heading"; text: string }
  | { kind: "row"; key: string; desc: string }
  | { kind: "blank" }
  | { kind: "note"; text: string }

type HelpDisplayLine =
  | { kind: "heading"; text: string }
  | { kind: "row"; key: string; desc: string }
  | { kind: "blank" }
  | { kind: "note"; text: string }

function wrapHelpText(text: string, width: number): string[] {
  if (width <= 0) return [text]
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (Bun.stringWidth(candidate) <= width) {
      current = candidate
      continue
    }
    if (current) {
      lines.push(current)
      current = ""
    }
    let rest = word
    while (Bun.stringWidth(rest) > width) {
      let chunk = ""
      for (const char of rest) {
        if (chunk && Bun.stringWidth(chunk + char) > width) break
        chunk += char
      }
      if (!chunk) break
      lines.push(chunk)
      rest = rest.slice(chunk.length)
    }
    current = rest
  }
  if (current || lines.length === 0) lines.push(current)
  return lines
}

function helpLayout(width: number): { lines: HelpDisplayLine[]; keyWidth: number } {
  const inner = Math.max(12, width - 6)
  const raw = helpLines()
  const longestKey = raw.reduce(
    (widest, line) => (line.kind === "row" ? Math.max(widest, Bun.stringWidth(line.key)) : widest),
    0,
  )
  const keyWidth = Math.min(longestKey + 2, Math.max(10, inner - 8))
  const descWidth = Math.max(8, inner - keyWidth)
  const lines: HelpDisplayLine[] = []

  for (const line of raw) {
    if (line.kind === "blank") {
      lines.push({ kind: "blank" })
    } else if (line.kind === "heading") {
      lines.push({ kind: "heading", text: line.text })
    } else if (line.kind === "note") {
      for (const part of wrapHelpText(line.text, inner)) lines.push({ kind: "note", text: part })
    } else {
      const parts = wrapHelpText(line.desc, descWidth)
      lines.push({ kind: "row", key: line.key, desc: parts[0] ?? "" })
      for (let i = 1; i < parts.length; i++) lines.push({ kind: "row", key: "", desc: parts[i]! })
    }
  }

  return { lines, keyWidth }
}

function helpLines(): HelpLine[] {
  const nav: HelpLine[] = [
    { kind: "heading", text: "Navigation" },
    { kind: "row", key: "j / k", desc: "move selection (sidebar or task list)" },
    { kind: "row", key: "h / l", desc: "switch between panes" },
    { kind: "row", key: "tab", desc: "toggle sidebar / task list" },
    { kind: "row", key: "a", desc: "quick add a task" },
    { kind: "row", key: "n", desc: "quick add a note (drawn with -)" },
    { kind: "row", key: "enter / x / space", desc: "toggle complete" },
    { kind: "row", key: "e", desc: "edit task, or project/tag/group in the sidebar" },
    { kind: "row", key: "d", desc: "delete task (undoable), or project/tag/group in the sidebar" },
    { kind: "row", key: "D", desc: "delete the whole section the selected task is in" },
    { kind: "row", key: "p or 1-4", desc: "cycle / set priority" },
    { kind: "row", key: "t", desc: "set due date to today" },
    { kind: "row", key: "o", desc: "open the task's first link" },
    { kind: "row", key: "u / ctrl+r", desc: "undo / redo an edit or delete" },
    { kind: "row", key: "X", desc: "delete all completed tasks" },
    { kind: "row", key: "m", desc: "manage projects, sections and tags" },
    { kind: "row", key: "C", desc: "change the accent colour (saved next to the data file)" },
    { kind: "row", key: "N / T / s", desc: "new project / new tag / new section" },
    { kind: "row", key: "E / I", desc: "E export all data to ~/Downloads · I import from chosen path" },
    { kind: "row", key: "/", desc: "filter the current view" },
    { kind: "row", key: "c", desc: "show / hide completed" },
    { kind: "row", key: "?", desc: "this help" },
    { kind: "row", key: "q", desc: "quit" },
    { kind: "blank" },
    { kind: "heading", text: "Quick-add syntax" },
    { kind: "row", key: "#Project", desc: "file under a project (created if new)" },
    { kind: "row", key: "@label", desc: "add a coloured label" },
    { kind: "row", key: "@group: label", desc: "namespaced label (groups the sidebar)" },
    { kind: "row", key: "/Section", desc: "file under a project section" },
    { kind: "row", key: "!p1 … !p4", desc: "set priority" },
    { kind: "row", key: "today / tod", desc: "due today" },
    { kind: "row", key: "tom / tmr / tomorrow", desc: "due tomorrow" },
    { kind: "row", key: "next week", desc: "due in one week" },
    { kind: "row", key: "mon … sun / next mon", desc: "next weekday" },
    { kind: "row", key: "in 3 days", desc: "relative offset" },
    { kind: "row", key: "09/18", desc: "month/day" },
    { kind: "row", key: "18 sep / sep 18", desc: "day and month" },
    { kind: "row", key: "2027-01-02", desc: "ISO date" },
    { kind: "row", key: "deadline: friday", desc: "separate deadline field" },
    { kind: "blank" },
    { kind: "note", text: "URLs in a note are blue and clickable in OSC-8 terminals." },
  ]
  return nav
}

export function helpLineCount(width = 78): number {
  return helpLayout(width).lines.length
}

/** Quick-add preview flattened to one line, exactly as the modal renders it,
 *  so callers can measure how many rows it will wrap into. */
export function previewRowText(preview: QuickAddResult, today: string, projectName: string): string {
  let text = `project: #${projectName}`
  if (preview.section) text += `  section: /${preview.section}`
  if (preview.due) text += `  due: ${humanDate(preview.due, today)}`
  if (preview.deadline) text += `  deadline: ${humanDate(preview.deadline, today)}`
  if (preview.hasPriority) text += `  priority: P${preview.priority}`
  for (const label of preview.labels ?? []) text += `  @${label}`
  return text
}

/** Total rows the quick-add modal needs (border included). The dropdown is
 *  rendered separately at root level, so it never adds rows here. */
export function quickAddModalHeight(
  preview: QuickAddResult,
  today: string,
  width: number,
  projectName: string,
): number {
  const text = previewRowText(preview, today, projectName)
  const inner = modalInnerWidth(width)
  const previewRows = Math.max(1, Math.ceil(Bun.stringWidth(text) / Math.max(4, inner)))
  return 11 + previewRows
}

export function HelpModal({
  theme,
  width,
  height,
  offset,
}: {
  theme: Theme
  width: number
  height: number
  offset: number
}) {
  const { lines, keyWidth } = helpLayout(width)
  const visible = Math.max(6, height - 8)
  const maxOffset = Math.max(0, lines.length - visible)
  const start = Math.max(0, Math.min(offset, maxOffset))
  const slice = lines.slice(start, start + visible)
  return (
    <ModalFrame
      title="tasker — help"
      theme={theme}
      width={width}
      footer={`j / k scroll · esc close · ${start + 1}-${Math.min(lines.length, start + visible)} of ${lines.length}`}
    >
      {slice.map((line, index) => {
        if (line.kind === "heading") {
          return (
            <text key={index} wrapMode="none" truncate fg={theme.subtle}>
              <b>{line.text.toUpperCase()}</b>
            </text>
          )
        }
        if (line.kind === "blank") return <box key={index} height={1} />
        if (line.kind === "note") {
          return (
            <text key={index} wrapMode="none" truncate fg={theme.faint}>
              {line.text}
            </text>
          )
        }
        return (
          <text key={index} wrapMode="none" truncate>
            <span fg={theme.accentSoft}>{line.key.padEnd(keyWidth)}</span>
            <span fg={theme.text}>{line.desc}</span>
          </text>
        )
      })}
    </ModalFrame>
  )
}

export function SearchPrompt({
  theme,
  inputRef,
  value,
  onInput,
}: {
  theme: Theme
  inputRef: RefObject<InputRenderable | null>
  value: string
  onInput: (value: string) => void
}) {
  return (
    <>
      <text fg={theme.accent}>{"/ "}</text>
      <input
        ref={inputRef}
        flexGrow={1}
        value={value}
        onInput={onInput}
        focused
        placeholder="filter tasks…"
        {...InputStyle(theme)}
      />
    </>
  )
}


