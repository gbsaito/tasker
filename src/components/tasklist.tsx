import type { RefObject } from "react"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { shortDate } from "../dates"
import { type Task, priorityColor } from "../model"
import type { ListRow } from "../rows"
import type { Store } from "../store"
import type { Theme } from "../theme"
import { GLYPHS } from "../theme"
import { PaneTitle } from "./ui"

interface MetaPart {
  text: string
  color: string
}

function metaFor(
  task: Task,
  store: Store,
  today: string,
  theme: Theme,
  budget: number,
): MetaPart[] {
  const parts: MetaPart[] = []

  if (task.due) {
    const due = shortDate(task.due, today)
    const color = task.done
      ? theme.faint
      : !task.note && task.due < today
        ? theme.overdue
        : theme.due
    parts.push({ text: due === "Today" ? "Today" : `${GLYPHS.due} ${due}`, color })
  }

  if (task.deadline) {
    parts.push({ text: `${GLYPHS.deadline} ${shortDate(task.deadline, today)}`, color: theme.deadline })
  }

  if (task.priority !== 4) {
    parts.push({ text: `P${task.priority}`, color: priorityColor(task.priority) })
  }

  const fixedWidth = parts.reduce((sum, part) => sum + Bun.stringWidth(part.text) + 1, 0)
  let remaining = budget - fixedWidth
  const labels: MetaPart[] = []
  for (const name of task.labels ?? []) {
    const tag = store.tagByName(name)
    const text = `@${name}`
    const width = Bun.stringWidth(text) + 1
    if (width > remaining) break
    labels.push({ text, color: tag?.color ?? theme.faint })
    remaining -= width
  }

  return [...labels, ...parts]
}

function MetaText({ parts, theme }: { parts: MetaPart[]; theme: Theme }) {
  return (
    <text wrapMode="none" flexShrink={0}>
      {parts.map((part, index) => (
        <span key={`${part.text}-${index}`}>
          {index > 0 ? " " : null}
          <span fg={part.color}>{part.text}</span>
        </span>
      ))}
    </text>
  )
}

function TaskRow({
  task,
  selected,
  dimmed,
  theme,
  store,
  today,
  width,
  onSelect,
}: {
  task: Task
  selected: boolean
  dimmed: boolean
  theme: Theme
  store: Store
  today: string
  width: number
  onSelect: () => void
}) {
  const done = !!task.done
  const note = !!task.note
  const checkColor = note || done
    ? theme.faint
    : task.priority === 1
      ? theme.overdue
      : priorityColor(task.priority)
  const check = note ? GLYPHS.note : done ? GLYPHS.done : GLYPHS.todo
  const budget = Math.max(10, Math.floor(width * 0.42))
  const parts = metaFor(task, store, today, theme, budget)
  const titleColor = done ? theme.faint : theme.text

  return (
    <box
      id={`row-${task.id}`}
      width="100%"
      flexDirection="row"
      alignItems="flex-start"
      backgroundColor={selected ? (dimmed ? theme.selDim : theme.selBg) : undefined}
      paddingRight={1}
      onMouseDown={onSelect}
    >
      <text width={1}> </text>
      {selected ? (
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
      <text width={2} fg={checkColor}>
        {check}
      </text>
      <box flexGrow={1} flexShrink={1} minWidth={0}>
        <text
          wrapMode="word"
          fg={titleColor}
          attributes={done ? TextAttributes.STRIKETHROUGH : undefined}
        >
          {selected ? <b>{task.content || "(untitled)"}</b> : task.content || "(untitled)"}
        </text>
      </box>
      {parts.length > 0 ? (
        <box flexShrink={0} marginLeft={1}>
          <MetaText parts={parts} theme={theme} />
        </box>
      ) : null}
    </box>
  )
}

export function TaskList({
  rows,
  cursor,
  focused,
  theme,
  store,
  today,
  title,
  width,
  onSelect,
  scrollRef,
}: {
  rows: ListRow[]
  cursor: number
  focused: boolean
  theme: Theme
  store: Store
  today: string
  title: string
  width: number
  onSelect: (index: number) => void
  scrollRef: RefObject<ScrollBoxRenderable | null>
}) {
  const taskCount = rows.filter((row) => !!row.task).length
  return (
    <box
      flexGrow={1}
      height="100%"
      flexDirection="column"
      backgroundColor={theme.base}
      paddingLeft={1}
      paddingRight={1}
    >
      <PaneTitle
        title={title}
        focused={focused}
        theme={theme}
        trailing={`${taskCount}${taskCount === 1 ? " task" : " tasks"}`}
      />
      {taskCount === 0 ? (
        <box flexGrow={1} paddingTop={2} paddingLeft={2} flexDirection="column">
          <text fg={theme.subtle}>No tasks here.</text>
          <box height={1} />
          <text fg={theme.faint}>Press a to add one.</text>
        </box>
      ) : (
        <scrollbox
          ref={scrollRef}
          flexGrow={1}
          width="100%"
          scrollY
          scrollX={false}
          viewportCulling
          verticalScrollbarOptions={{
            showArrows: false,
            trackOptions: { backgroundColor: theme.base, foregroundColor: theme.border },
          }}
          horizontalScrollbarOptions={{ visible: false }}
        >
          {rows.map((row, index) => {
            if (row.header) {
              return (
                <box
                  key={row.key}
                  width="100%"
                  height={1}
                  marginTop={index === 0 ? 0 : 1}
                  paddingLeft={1}
                  backgroundColor={theme.base}
                >
                  <text fg={theme.subtle}>
                    <b>{row.header}</b>
                  </text>
                </box>
              )
            }
            const task = row.task!
            return (
              <TaskRow
                key={row.key}
                task={task}
                selected={index === cursor}
                dimmed={!focused}
                theme={theme}
                store={store}
                today={today}
                width={width - 2}
                onSelect={() => onSelect(index)}
              />
            )
          })}
        </scrollbox>
      )}
    </box>
  )
}
