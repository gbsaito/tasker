import type { RefObject } from "react"
import { type ScrollBoxRenderable } from "@opentui/core"
import { humanDate } from "../dates"
import { type Task, priorityColor } from "../model"
import type { Store } from "../store"
import type { Theme } from "../theme"
import { GLYPHS } from "../theme"
import { tokenizeText } from "../urls"
import { PaneTitle } from "./ui"

function Kv({
  label,
  theme,
  children,
}: {
  label: string
  theme: Theme
  children: React.ReactNode
}) {
  return (
    <box width="100%" flexDirection="row">
      <text width={10} fg={theme.faint}>
        {label}
      </text>
      <box flexGrow={1} flexShrink={1}>
        {children}
      </box>
    </box>
  )
}

function NoteText({
  text,
  theme,
  width,
}: {
  text: string
  theme: Theme
  width: number
}) {
  const lines = text.split("\n")
  return (
    <>
      {lines.map((line, index) => {
        if (!line) return <box key={`blank-${index}`} height={1} />
        const tokens = tokenizeText(line)
        return (
          <text key={`line-${index}`} wrapMode="word" fg={theme.text}>
            {tokens.map((token, tokenIndex) => {
              if (!token.url) {
                return <span key={`text-${tokenIndex}`}>{token.text}</span>
              }
              const label =
                Bun.stringWidth(token.url) > width - 1
                  ? `${token.url.slice(0, Math.max(1, width - 2))}…`
                  : token.url
              return (
                <a key={`link-${tokenIndex}`} href={token.url}>
                  <u>
                    <span fg={theme.link}>{label}</span>
                  </u>
                </a>
              )
            })}
          </text>
        )
      })}
    </>
  )
}

export function DetailPane({
  task,
  store,
  theme,
  today,
  width,
  scrollRef,
}: {
  task?: Task
  store: Store
  theme: Theme
  today: string
  width: number
  scrollRef: RefObject<ScrollBoxRenderable | null>
}) {
  const inner = width - 4
  return (
    <box
      width={width}
      height="100%"
      flexDirection="column"
      backgroundColor={theme.surface}
      border={["left"]}
      borderColor={theme.border}
      paddingLeft={1}
      paddingRight={1}
    >
      <PaneTitle
        title="Details"
        theme={theme}
        trailing={task ? (task.done ? "done" : task.note ? "note" : "read-only") : ""}
      />
      {!task ? (
        <box flexGrow={1} paddingTop={2} paddingLeft={1} flexDirection="column">
          <text fg={theme.subtle}>No task selected</text>
          <box height={1} />
          <text fg={theme.faint}>Move with j / k.</text>
        </box>
      ) : (
        <scrollbox
          ref={scrollRef}
          flexGrow={1}
          width="100%"
          scrollY
          scrollX={false}
          verticalScrollbarOptions={{
            showArrows: false,
            trackOptions: { backgroundColor: theme.surface, foregroundColor: theme.border },
          }}
          horizontalScrollbarOptions={{ visible: false }}
        >
          <box width="100%" flexDirection="column" paddingRight={1}>
            <text wrapMode="word" fg={theme.text}>
              <b>{task.content || "(untitled)"}</b>
            </text>
            <box height={1} />

            <Kv label="Project" theme={theme}>
              <text wrapMode="word">
                {(() => {
                  const project = store.projectById(task.project_id)
                  if (!project) return <span fg={theme.faint}>—</span>
                  const section = task.section_id ? store.sectionById(task.section_id) : undefined
                  return (
                    <>
                      <span fg={project.color}>{GLYPHS.project}</span>
                      <span fg={theme.text}> {project.name}</span>
                      {section ? <span fg={theme.faint}>{` / ${section.name}`}</span> : null}
                    </>
                  )
                })()}
              </text>
            </Kv>

            {task.due ? (
              <Kv label="Due" theme={theme}>
                <text
                  fg={
                    task.done
                      ? theme.faint
                      : !task.note && task.due < today
                        ? theme.overdue
                        : theme.due
                  }
                >
                  {humanDate(task.due, today)}
                </text>
              </Kv>
            ) : null}

            {task.deadline ? (
              <Kv label="Deadline" theme={theme}>
                <text fg={theme.deadline}>{humanDate(task.deadline, today)}</text>
              </Kv>
            ) : null}

            <Kv label="Priority" theme={theme}>
              <text fg={priorityColor(task.priority)}>
                {task.priority === 4 ? "P4 · none" : `P${task.priority}`}
              </text>
            </Kv>

            {(task.labels ?? []).length > 0 ? (
              <Kv label="Labels" theme={theme}>
                <text wrapMode="word">
                  {(task.labels ?? []).map((name, index) => {
                    const tag = store.tagByName(name)
                    return (
                      <span key={`${name}-${index}`}>
                        {index > 0 ? " " : null}
                        <span fg={tag?.color ?? theme.faint}>{`@${name}`}</span>
                      </span>
                    )
                  })}
                </text>
              </Kv>
            ) : null}

            {task.note ? (
              <Kv label="Kind" theme={theme}>
                <text fg={theme.faint}>note</text>
              </Kv>
            ) : null}
            {task.done ? (
              <Kv label="Status" theme={theme}>
                <text fg={theme.faint}>completed</text>
              </Kv>
            ) : null}

            <box height={1} />
            <text fg={theme.border}>{"─".repeat(Math.max(4, inner))}</text>
            <box height={1} />
            {task.description?.trim() ? (
              <NoteText text={task.description} theme={theme} width={inner} />
            ) : (
              <text fg={theme.faint}>No note</text>
            )}
          </box>
        </scrollbox>
      )}
    </box>
  )
}
