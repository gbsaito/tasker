// Root application component: state, key handling and layout. The layout is
// deliberately close to tasker v1 (navigation / list / details, with an
// opaque chrome row above and below), while the rendering itself is OpenTUI.

import { useEffect, useMemo, useRef, useState } from "react"
import type { InputRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"

import { Header, Footer } from "./components/chrome"
import { DetailPane } from "./components/detail"
import {
  ConfirmModal,
  EditTaskModal,
  HelpModal,
  ImportModal,
  ManageModal,
  QuickAddModal,
  SearchPrompt,
  SuggestionList,
  ThemeModal,
  helpLineCount,
  quickAddModalHeight,
} from "./components/modals"
import { Sidebar } from "./components/sidebar"
import { TaskList } from "./components/tasklist"
import { isoOf, todayIso, humanDate } from "./dates"
import { PALETTE, type Priority, type Project, type Section, type Tag, type Task, parsePriority, priorityName } from "./model"
import { parseDate, quickAdd } from "./parse"
import {
  MANAGE_PROJECTS,
  MANAGE_SECTIONS,
  MANAGE_TAGS,
  buildNav,
  buildRows,
  clampNavIndex,
  firstTaskIndex,
  lastTaskIndex,
  manageItems,
  manageTargetProject,
  moveNavIndex,
  navPath,
  nextTaskIndex,
  type ListRow,
  type ManageTab,
  type NavItem,
  type ViewSpec,
} from "./rows"
import { canonicalTagName, exportsDir, newestExport, type Store } from "./store"
import { loadSettings, saveSettings } from "./settings"
import { acceptSuggestion, moveSuggestion, refreshSuggestionAfterChange, sugFilter, wordBefore, type Suggestion } from "./suggest"
import { themeFor, themeWithAccent } from "./theme"
import { firstUrl, openUrl } from "./urls"
import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"

type Focus = "sidebar" | "list"
type Mode = "normal" | "add" | "edit" | "delete" | "import" | "help" | "search" | "manage" | "theme"

type PendingDelete =
  | { kind: "section"; section: Section; project: Project }
  | { kind: "project"; project: Project }
  | { kind: "tag"; tag: Tag }
  | { kind: "group"; group: string }
  | { kind: "purge" }

interface AddState {
  note: boolean
  content: string
  description: string
  field: number
  suggestion: Suggestion | null
}

interface EditState {
  taskId: string
  values: string[]
  field: number
  suggestion: Suggestion | null
}

interface ImportState {
  path: string
  mode: "merge" | "replace"
}

interface ManageState {
  tab: ManageTab
  index: number
  editing: boolean
  isNew: boolean
  isGroup: boolean
  orig: string
  proj: string
  name: string
  colorIndex: number
  confirmDelete: boolean
}

const EDIT_FIELD_COUNT = 8

const emptyAdd: AddState = {
  note: false,
  content: "",
  description: "",
  field: 0,
  suggestion: null,
}

const emptyImport: ImportState = { path: "", mode: "merge" }

const emptyManage: ManageState = {
  tab: MANAGE_PROJECTS,
  index: 0,
  editing: false,
  isNew: false,
  isGroup: false,
  orig: "",
  proj: "",
  name: "",
  colorIndex: 0,
  confirmDelete: false,
}

/** Normalise an OpenTUI key event to the compact names the handlers use. */
function keyName(event: KeyEvent): string {
  let name = event.name
  if (name === "return") name = "enter"
  if (name === "escape") name = "esc"
  if (event.ctrl && name.length === 1) return `ctrl+${name.toLowerCase()}`
  if (name === "tab") return event.shift ? "shift+tab" : "tab"
  if (event.shift && name.length === 1) return name.toUpperCase()
  return name
}

function clampRowCursor(rows: ListRow[], cursor: number): number {
  if (rows.length === 0) return -1
  let i = Math.min(Math.max(cursor, 0), rows.length - 1)
  if (rows[i]?.task) return i
  for (let j = i; j < rows.length; j++) if (rows[j]?.task) return j
  for (let j = i - 1; j >= 0; j--) if (rows[j]?.task) return j
  return -1
}

function lastNavIndex(nav: NavItem[]): number {
  for (let i = nav.length - 1; i >= 0; i--) if (!nav[i]?.heading) return i
  return 0
}

function viewOf(item: NavItem): ViewSpec {
  const kind = item.kind === "heading" ? "inbox" : item.kind
  return { kind, label: item.label, id: item.id }
}

function paletteIndex(hex: string): number {
  const index = PALETTE.findIndex((color) => color.toLowerCase() === hex.toLowerCase())
  return index < 0 ? 0 : index
}

function exportStamp(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0")
  return [
    now.getFullYear(),
    p(now.getMonth() + 1),
    p(now.getDate()),
    "-",
    p(now.getHours()),
    p(now.getMinutes()),
    p(now.getSeconds()),
  ].join("")
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

// ---- suggestion overlay geometry -----------------------------------------
//
// The dropdown overlays the modal instead of growing it: OpenTUI does not
// reliably repaint a nested box tree that grows by insertion, while a modal
// drawn at root level repaints fine every time. Terminal coordinates stay
// deterministic because the modal line counts are fixed.
//  edit modal  = 14 rows: border + pad + title + blank + 8 field rows + footer(2)
//  quick add   = 11 + preview wrap rows; the Task row always sits under
//                pad(1) + title(1) + blank(1), so either way the dropdown's
//                first candidate row lands 5 rows under the modal top border.

const EDIT_MODAL_ROWS = 14
const DROP_ROW = 5

function modalLeftEdge(width: number, modalWidth: number): number {
  return Math.max(0, Math.floor((width - modalWidth) / 2))
}

/** Left edge of the field column inside the modal (label width differs). */
function dropLeft(modalLeft: number, labelWidth: number): number {
  return modalLeft + 3 + labelWidth
}

function dropTop(height: number, modalRows: number): number {
  return Math.max(0, Math.floor((height - modalRows) / 2)) + DROP_ROW
}

/** Row where an edit-field suggestion dropdown should anchor. Each edit field
 *  is one label+value row; the Task row is the second row of the modal, each
 *  later field adds one row below it, and the dropdown starts one row under the
 *  focused field's value row. */
function editDropdownTop(height: number, field: number): number {
  const taskBase = Math.max(0, Math.floor((height - EDIT_MODAL_ROWS) / 2)) + 2
  return taskBase + 1 + field
}

export function App({ store }: { store: Store }) {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const baseTheme = themeFor(renderer.themeMode === "light" ? "light" : "dark")

  const [revision, setRevision] = useState(0)
  const bump = (): void => setRevision((value) => value + 1)

  const [savedAccent, setSavedAccent] = useState<string | null>(() => loadSettings(store.path).accent ?? null)
  const [accentPreview, setAccentPreview] = useState<string | null>(null)
  const [themeIndex, setThemeIndex] = useState(0)
  const accent = accentPreview ?? savedAccent ?? baseTheme.accent
  const theme = themeWithAccent(baseTheme, accent)

  const [focus, setFocus] = useState<Focus>("sidebar")
  const [mode, setMode] = useState<Mode>("normal")
  const [rawNavIndex, setRawNavIndex] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [showDone, setShowDone] = useState(false)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const [bottomBar, setBottomBar] = useState<"status" | "hints">("status")

  const [add, setAdd] = useState<AddState>(emptyAdd)
  const [edit, setEdit] = useState<EditState>({
    taskId: "",
    values: [],
    field: 0,
    suggestion: null,
  })
  const [manage, setManage] = useState<ManageState>(emptyManage)
  const [importing, setImporting] = useState<ImportState>(emptyImport)
  const [pending, setPending] = useState<PendingDelete | null>(null)
  const [helpOffset, setHelpOffset] = useState(0)

  const undo = useRef<string[]>([])
  const redo = useRef<string[]>([])
  const pendingCursor = useRef<number | null>(null)
  const pendingEditCursor = useRef<number | null>(null)
  const skipEditRefresh = useRef(false)

  const contentRef = useRef<InputRenderable | null>(null)
  const descriptionRef = useRef<InputRenderable | null>(null)
  const editInputRef = useRef<InputRenderable | null>(null)
  const manageNameRef = useRef<InputRenderable | null>(null)
  const searchRef = useRef<InputRenderable | null>(null)
  const importPathRef = useRef<InputRenderable | null>(null)
  const sidebarScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const listScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const manageScrollRef = useRef<ScrollBoxRenderable | null>(null)

  const today = todayIso()
  const nav = useMemo(() => buildNav(store, today), [store, today, revision])
  const navIndex = clampNavIndex(nav, rawNavIndex)
  const currentNav = nav[navIndex] ?? nav[0]!
  const view = viewOf(currentNav)
  const defaultProjectId = view.kind === "project" ? view.id : (store.inbox()?.id ?? "")

  const rows = useMemo(
    () => buildRows(store, view, { showDone, query, today }),
    [store, view.kind, view.id, showDone, query, today, revision],
  )
  const cursorIndex = clampRowCursor(rows, cursor)
  const selectedTask = cursorIndex >= 0 ? rows[cursorIndex]?.task : undefined

  const manageList = useMemo(
    () => (mode === "manage" ? manageItems(store, manage.tab) : []),
    [store, manage.tab, mode, revision],
  )
  const manageSelected = manageList[manage.index]

  const sidebarWidth = width >= 64 ? 26 : 0
  const detailWidth = width >= 100 ? 40 : 0
  const listWidth = Math.max(20, width - sidebarWidth - detailWidth)
  const modalWidth = Math.max(30, Math.min(78, width - 8))

  const counts = rows.filter((row) => row.task && !row.task.note).length
  const visibleTask = selectedTask

  const preview = quickAdd(add.content, new Date())
  const addProjectName = preview.project || store.projectById(defaultProjectId)?.name || "Inbox"
  const dropLeftEdge = modalLeftEdge(width, modalWidth) + 3
  const dropWidth = Math.min(42, width - dropLeftEdge - 3 - 2)

  // ---- history -----------------------------------------------------------

  function checkpoint(): void {
    undo.current.push(store.snapshot())
    if (undo.current.length > 200) undo.current.shift()
    redo.current = []
  }

  function persist(): void {
    try {
      store.save()
    } catch (error) {
      setStatus(`save failed: ${(error as Error).message}`)
    }
  }

  function afterMutation(message: string): void {
    setStatus(message)
    bump()
  }

  function undoAction(): void {
    const snapshot = undo.current.pop()
    if (!snapshot) {
      setStatus("Nothing to undo")
      return
    }
    redo.current.push(store.snapshot())
    try {
      store.restore(snapshot)
    } catch (error) {
      setStatus(`Undo failed: ${(error as Error).message}`)
      return
    }
    persist()
    afterMutation("Undone")
  }

  function redoAction(): void {
    const snapshot = redo.current.pop()
    if (!snapshot) {
      setStatus("Nothing to redo")
      return
    }
    undo.current.push(store.snapshot())
    try {
      store.restore(snapshot)
    } catch (error) {
      setStatus(`Redo failed: ${(error as Error).message}`)
      return
    }
    persist()
    afterMutation("Redone")
  }

  // ---- navigation --------------------------------------------------------

  function navigate(delta: number): void {
    setRawNavIndex(moveNavIndex(nav, navIndex, delta))
    setCursor(0)
  }

  function openSelectedLink(): void {
    if (!selectedTask) {
      setStatus("No task selected")
      return
    }
    const url = firstUrl(selectedTask.description) || firstUrl(selectedTask.content)
    if (!url) {
      setStatus("No link in this task")
      return
    }
    openUrl(url)
    setStatus(`Opening ${url}`)
  }

  function toggleDone(): void {
    if (!selectedTask || selectedTask.note) return
    const task = selectedTask
    checkpoint()
    store.toggleDone(task.id)
    persist()
    setStatus(task.done ? `Completed: ${task.content}` : `Reopened: ${task.content}`)
    bump()
  }

  function changePriority(next: Priority): void {
    if (!selectedTask) return
    checkpoint()
    selectedTask.priority = next
    store.updateTask(selectedTask)
    persist()
    afterMutation(`Priority ${priorityName(next)}`)
  }

  function cyclePriority(): void {
    if (!selectedTask) return
    const p = selectedTask.priority
    changePriority(p === 1 ? 2 : p === 2 ? 3 : p === 3 ? 4 : 1)
  }

  function dueToday(): void {
    if (!selectedTask) return
    checkpoint()
    selectedTask.due = today
    store.updateTask(selectedTask)
    persist()
    afterMutation(`Scheduled for today: ${selectedTask.content}`)
  }

  // ---- sidebar -----------------------------------------------------------

  function editNav(): void {
    switch (currentNav.kind) {
      case "project": {
        const project = store.projectById(currentNav.id)
        if (!project || project.inbox) {
          setStatus("The Inbox cannot be edited here")
          return
        }
        openManageEditProject(project)
        return
      }
      case "label": {
        const tag = store.tagByName(currentNav.id)
        if (tag) openManageEditTag(tag)
        return
      }
      case "labelGroup":
        openManageEditGroup(currentNav.id)
        return
      default:
        setStatus("Only projects and tags can be edited here")
    }
  }

  function deleteNav(): void {
    switch (currentNav.kind) {
      case "project": {
        const project = store.projectById(currentNav.id)
        if (!project || project.inbox) {
          setStatus("The Inbox cannot be deleted")
          return
        }
        setPending({ kind: "project", project })
        setMode("delete")
        return
      }
      case "label": {
        const tag = store.tagByName(currentNav.id)
        if (tag) {
          setPending({ kind: "tag", tag })
          setMode("delete")
        }
        return
      }
      case "labelGroup":
        setPending({ kind: "group", group: currentNav.id })
        setMode("delete")
        return
      default:
        setStatus("Only projects and tags can be deleted here")
    }
  }

  // ---- quick add ---------------------------------------------------------

  function openAdd(note = false): void {
    setAdd({ ...emptyAdd, note })
    setMode("add")
  }

  function refreshAddSuggestion(value: string): void {
    const input = contentRef.current
    const reported = input ? input.cursorOffset : value.length
    setAdd((current) => ({
      ...current,
      content: value,
      suggestion: refreshSuggestionAfterChange(
        current.content,
        value,
        reported,
        store,
        defaultProjectId,
      ),
    }))
  }

  function acceptAddSuggestion(): void {
    if (!add.suggestion) return
    const item = add.suggestion.items[add.suggestion.idx]
    if (item === undefined) return
    const next = acceptSuggestion(add.content, add.suggestion.start, add.suggestion.end, item)
    pendingCursor.current = next.cursor
    setAdd((current) => ({ ...current, content: next.value, suggestion: null }))
  }

  // ---- edit panel suggestion helpers --------------------------------------

  /** Candidate names for the focused edit field. Only Project/Section/Labels
   *  fields hold entity pools (projects, the task's sections, tags); Task
   *  titles and Notes have none and never open a popup. */
  function editCandidates(index: number, contextProjectId: string): string[] {
    if (index === 2) return store.projects().map((p) => p.name)
    if (index === 3) return store.sections(contextProjectId).map((s) => s.name)
    if (index === 4) return store.tags().map((t) => t.name)
    return []
  }

  /** Refresh the dropdown for whatever edit field the user is typing in.
   *  Free-text matching: the token before the caret (sigil prefixes stripped)
   *  is matched, case-insensitively, against the focused field's entity pool —
   *  project against projects, section against the task's sections, labels
   *  against tags. No sigil syntax required; a bare token lists the pool. The
   *  Task field (the todo title) never suggests — it is free text. */
  function refreshEditSuggestion(
    index: number,
    values: string[],
    value: string,
    caret: number,
  ): Suggestion | null {
    const entityFields = [2, 3, 4] // project, section, labels — task titles never suggest
    if (!entityFields.includes(index)) return null
    const task = edit.taskId ? store.taskById(edit.taskId) : undefined
    const contextId = task?.project_id ?? defaultProjectId
    const previous = values[index] ?? ""
    const rawToken = value.slice(wordBefore(value, caret), caret)
    const token = rawToken.replace(/^[#/@]+/, "")
    const candidates = editCandidates(index, contextId)
    const items = token ? sugFilter(candidates, token) : candidates
    if (items.length === 0) return null
    const start = Math.max(0, wordBefore(value, caret))
    return { items, idx: 0, start, end: caret }
  }

  function changeEditField(index: number, value: string): void {
    // Every text-ish field can carry a sigil word; dates and priority never open a popup.
    const input = editInputRef.current
    const reported = input ? input.cursorOffset : value.length
    try {
      appendFileSync("/tmp/opencode/tasker-editlog.txt", `onChange idx=${index} cursor=${reported} value=${JSON.stringify(value)}\n`)
    } catch {}
    setEdit((current) => {
      const values = [...current.values]
      values[index] = value
      const suggestion = skipEditRefresh.current ? null : refreshEditSuggestion(index, current.values, value, reported)
      skipEditRefresh.current = false
      try {
        appendFileSync(
          "/tmp/opencode/tasker-editlog.txt",
          `suggestion=${suggestion ? suggestion.items.length + " -> [" + suggestion.items.join(",") + "]" : "null"} start=${suggestion?.start ?? -1} end=${suggestion?.end ?? -1}\n`,
        )
      } catch {}
      return {
        ...current,
        values,
        suggestion,
      }
    })
  }

  function acceptEditSuggestion(): void {
    if (!edit.suggestion) return
    const item = edit.suggestion.items[edit.suggestion.idx]
    if (item === undefined) return
    const index = edit.field
    const content = edit.values[index] ?? ""
    const start = Math.max(0, edit.suggestion.start)
    const end = Math.max(start, edit.suggestion.end)
    const nextValue = content.slice(0, start) + item + content.slice(end)
    pendingEditCursor.current = start + item.length
    skipEditRefresh.current = true
    setEdit((current) => {
      const values = [...current.values]
      values[index] = nextValue
      return { ...current, values, suggestion: null }
    })
  }

  function submitAdd(): void {
    const result = quickAdd(add.content, new Date())
    if (!result.content.trim() && result.labels.length === 0) {
      setStatus("Nothing to add")
      return
    }

    checkpoint()

    let projectId = defaultProjectId
    if (result.project) projectId = store.ensureProject(result.project).id

    const task: Task = {
      id: "",
      content: result.content || "(untitled)",
      description: add.description.trim() || undefined,
      project_id: projectId,
      section_id: result.section ? store.ensureSection(projectId, result.section).id : undefined,
      labels: result.labels,
      due: result.due,
      deadline: result.deadline,
      priority: result.priority,
      done: false,
      note: add.note,
      created_at: new Date().toISOString(),
      order: 0,
    }
    for (const label of result.labels) store.ensureTag(label)

    store.addTask(task)
    persist()
    setMode("normal")
    setAdd(emptyAdd)
    afterMutation(`Added: ${task.content}`)
  }

  // ---- task editor -------------------------------------------------------

  function openEditTask(task: Task): void {
    const project = store.projectById(task.project_id)
    const section = task.section_id ? store.sectionById(task.section_id) : undefined
    setEdit({
      taskId: task.id,
      field: 0,
      values: [
        task.content,
        task.description ?? "",
        project?.name ?? "",
        section?.name ?? "",
        (task.labels ?? []).join(", "),
        task.due ?? "",
        task.deadline ?? "",
        `P${task.priority}`,
      ],
      suggestion: null,
    })
    setMode("edit")
  }

  function saveEdit(): void {
    const original = store.taskById(edit.taskId)
    if (!original) {
      setMode("normal")
      return
    }
    const value = (index: number): string => (edit.values[index] ?? "").trim()

    const content = value(0) || "(untitled)"
    const projectName = value(2)
    const sectionName = value(3).replace(/^\/+/, "").trim()

    const labels: string[] = []
    for (const raw of value(4).split(",")) {
      const label = canonicalTagName(raw)
      if (!label) continue
      if (labels.some((existing) => sameName(existing, label))) continue
      labels.push(label)
    }

    let due: string | undefined
    if (value(5)) {
      const parsed = parseDate(value(5))
      if (!parsed) {
        setStatus(`Could not parse due date: ${value(5)}`)
        return
      }
      due = isoOf(parsed)
    }

    let deadline: string | undefined
    if (value(6)) {
      const parsed = parseDate(value(6))
      if (!parsed) {
        setStatus(`Could not parse deadline: ${value(6)}`)
        return
      }
      deadline = isoOf(parsed)
    }

    let priority = original.priority
    if (value(7)) {
      const numeric = Number(value(7).replace(/^p/i, ""))
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 4) {
        setStatus("Priority must be 1-4")
        return
      }
      priority = parsePriority(numeric)
    }

    checkpoint()

    let projectId = original.project_id
    if (projectName) projectId = store.ensureProject(projectName).id
    const sectionId = sectionName ? store.ensureSection(projectId, sectionName).id : undefined
    for (const label of labels) store.ensureTag(label)

    const updated: Task = {
      ...original,
      content,
      description: value(1) || undefined,
      project_id: projectId,
      section_id: sectionId,
      labels,
      due,
      deadline,
      priority,
    }

    store.updateTask(updated)
    persist()
    setMode("normal")
    afterMutation(`Saved: ${updated.content}`)
  }

  // ---- projects, sections and tags manager ------------------------------

  function findManageIndex(tab: ManageTab, name: string): number {
    return manageItems(store, tab).findIndex((item) => sameName(item.name, name))
  }

  function openManage(): void {
    setManage({ ...emptyManage })
    setMode("manage")
  }

  function openManageNew(tab: ManageTab): void {
    const proj =
      tab === MANAGE_SECTIONS && view.kind === "project" ? view.label : ""
    setManage({
      ...emptyManage,
      tab,
      proj,
      editing: true,
      isNew: true,
      name: "",
    })
    setMode("manage")
  }

  function openManageEditProject(project: Project): void {
    setManage({
      ...emptyManage,
      tab: MANAGE_PROJECTS,
      index: Math.max(0, findManageIndex(MANAGE_PROJECTS, project.name)),
      editing: true,
      orig: project.name,
      name: project.name,
      colorIndex: paletteIndex(project.color),
    })
    setMode("manage")
  }

  function openManageEditTag(tag: Tag): void {
    setManage({
      ...emptyManage,
      tab: MANAGE_TAGS,
      index: Math.max(0, findManageIndex(MANAGE_TAGS, tag.name)),
      editing: true,
      orig: tag.name,
      name: tag.name,
      colorIndex: paletteIndex(tag.color),
    })
    setMode("manage")
  }

  function openManageEditGroup(group: string): void {
    setManage({
      ...emptyManage,
      tab: MANAGE_TAGS,
      index: Math.max(0, findManageIndex(MANAGE_TAGS, group)),
      editing: true,
      isGroup: true,
      orig: group,
      name: group,
    })
    setMode("manage")
  }

  function beginManageEdit(): void {
    const item = manageSelected
    if (!item) return
    if (manage.tab === MANAGE_SECTIONS) {
      if (item.group) {
        setManage({ ...manage, proj: item.name, editing: true, isNew: true, name: "" })
      } else {
        setManage({ ...manage, proj: item.proj, editing: true, isNew: false, orig: item.full, name: item.full })
      }
      return
    }
    if (item.group) {
      setManage({ ...manage, editing: true, isGroup: true, orig: item.name, name: item.name })
      return
    }
    const target = item.full || item.name
    setManage({
      ...manage,
      editing: true,
      isNew: false,
      isGroup: false,
      orig: target,
      name: target,
      colorIndex: paletteIndex(item.color || PALETTE[0]!),
    })
  }

  function beginManageNew(): void {
    if (manage.tab === MANAGE_SECTIONS) {
      let proj = ""
      if (manageSelected?.proj) proj = manageSelected.proj
      else if (manageSelected?.group) proj = manageSelected.name
      else if (view.kind === "project") proj = view.label
      if (!proj) {
        setStatus("Open a project in the sidebar to add a section")
        return
      }
      setManage({ ...manage, proj, editing: true, isNew: true, orig: "", name: "" })
      return
    }
    setManage({ ...manage, editing: true, isNew: true, isGroup: false, orig: "", name: "" })
  }

  function saveManage(): void {
    const name = manage.name.trim()
    if (!name) {
      setStatus("A name is required")
      return
    }
    const targetProject =
      manage.tab === MANAGE_SECTIONS
        ? manageTargetProject(store, manage.proj, view)
        : undefined
    if (manage.tab === MANAGE_SECTIONS && !targetProject) {
      setStatus("Open a project in the sidebar to file sections there")
      return
    }
    if (manage.tab === MANAGE_PROJECTS && manage.isNew && store.projectByName(name)) {
      setStatus(`A project named "${name}" already exists`)
      return
    }

    const color = PALETTE[manage.colorIndex % PALETTE.length]!
    checkpoint()

    if (manage.tab === MANAGE_PROJECTS) {
      if (manage.isNew) {
        store.addProject(name, color)
      } else {
        const project = store.projectByName(manage.orig)
        if (project) {
          project.name = name
          project.color = color
          store.updateProject(project)
        }
      }
      setStatus(`Saved project: ${name}`)
    } else if (manage.tab === MANAGE_SECTIONS) {
      const project = targetProject!
      if (manage.isNew) {
        store.ensureSection(project.id, name)
        setStatus(`Added section ${project.name} / ${name}`)
      } else {
        const section = store.sectionByName(project.id, manage.orig)
        if (section) {
          store.renameSection(section.id, name)
          setStatus(`Renamed section ${project.name} / ${name}`)
        }
      }
    } else if (manage.isGroup) {
      const group = name.includes(":") ? name.slice(0, name.indexOf(":")).trim() : name
      store.renameTagGroup(manage.orig, group)
      store.recolorTagGroup(group, color)
      setStatus(`Saved tag group: ${group}`)
    } else if (manage.isNew) {
      store.addTag(name, color)
      setStatus(`Saved tag: @${name}`)
    } else {
      store.updateTag(manage.orig, name, color)
      setStatus(`Saved tag: @${name}`)
    }

    persist()
    setManage((current) => ({
      ...current,
      editing: false,
      isNew: false,
      isGroup: false,
      name: "",
    }))
    bump()
  }

  function deleteManage(): void {
    const item = manageSelected
    if (!item) return
    checkpoint()

    if (manage.tab === MANAGE_PROJECTS) {
      const project = store.projectByName(item.name)
      if (project) store.deleteProject(project.id)
      setStatus(`Project deleted: ${item.name}`)
    } else if (manage.tab === MANAGE_SECTIONS) {
      const project = store.projectByName(item.proj)
      if (project) {
        const section = store.sectionByName(project.id, item.name)
        if (section) {
          store.deleteSection(section.id)
          setStatus(`Section deleted: ${item.proj} / ${item.name} (tasks kept in project)`)
        }
      }
    } else if (item.group) {
      const removed = store.deleteTagGroup(item.name)
      setStatus(`Deleted tag group "${item.name}" (${removed} tag(s))`)
    } else {
      store.deleteTag(item.full)
      setStatus(`Tag deleted: @${item.full}`)
    }

    persist()
    setManage((current) => ({
      ...current,
      index: Math.max(0, current.index - 1),
      confirmDelete: false,
    }))
    bump()
  }

  // ---- delete / import / export -----------------------------------------

  function cancelDelete(): void {
    setPending(null)
    setMode("normal")
  }

  /** Single-item delete: immediate, because every mutation is undoable. */
  function deleteTaskNow(task: Task): void {
    checkpoint()
    store.deleteTask(task.id)
    persist()
    afterMutation(`Task deleted: ${task.content} · u to undo`)
  }

  function confirmDelete(): void {
    const target = pending
    setPending(null)
    setMode("normal")
    if (!target) return

    checkpoint()
    if (target.kind === "purge") {
      const removed = store.purgeCompleted()
      persist()
      afterMutation(`Deleted ${removed} completed task(s)`)
    } else if (target.kind === "section") {
      const removed = store.deleteSectionWithTasks(target.section.id)
      persist()
      afterMutation(`Section deleted: ${target.project.name} / ${target.section.name} (${removed} task(s))`)
    } else if (target.kind === "project") {
      const removed = store.deleteProject(target.project.id)
      persist()
      afterMutation(removed ? `Project deleted: ${target.project.name}` : "Cannot delete this project")
    } else if (target.kind === "group") {
      const removed = store.deleteTagGroup(target.group)
      persist()
      afterMutation(`Deleted tag group "${target.group}" (${removed} tag(s))`)
    } else {
      store.deleteTag(target.tag.name)
      persist()
      afterMutation(`Tag deleted: @${target.tag.name}`)
    }
  }

  function exportNow(): void {
    const name = `tasker-export-${exportStamp(new Date())}.json`
    const dir = exportsDir()
    const path = join(dir, name)
    try {
      mkdirSync(dir, { recursive: true })
      store.exportTo(path)
      setStatus(`Exported ${path}`)
    } catch (error) {
      setStatus(`Export failed: ${(error as Error).message}`)
    }
  }

  /** Expand a leading ~ so a typed home path points at the real file. */
  function expandHome(value: string): string {
    if (value === "~") return homedir()
    if (value.startsWith("~/")) return join(homedir(), value.slice(2))
    return value
  }

  function openImport(): void {
    setImporting({ path: newestExport() ?? "", mode: "merge" })
    setMode("import")
  }

  function confirmImport(): void {
    const raw = importing.path.trim()
    if (!raw) {
      setStatus("Enter the path to a tasker JSON file")
      return
    }
    const path = expandHome(raw)
    checkpoint()
    try {
      if (importing.mode === "replace") {
        store.replaceFile(path)
        persist()
        afterMutation(`Replaced workspace with ${basename(path)}`)
      } else {
        const count = store.importFile(path)
        persist()
        afterMutation(`Imported ${count} task(s) from ${basename(path)}`)
      }
      setImporting(emptyImport)
      setMode("normal")
    } catch (error) {
      setStatus(`Import failed: ${(error as Error).message}`)
    }
  }

  function openPurge(): void {
    if (store.completedCount() === 0) {
      setStatus("No completed tasks")
      return
    }
    setPending({ kind: "purge" })
    setMode("delete")
  }

  // ---- theme -------------------------------------------------------------

  function openTheme(): void {
    const found = PALETTE.findIndex((color) => color.toLowerCase() === accent.toLowerCase())
    const index = found < 0 ? 0 : found
    setThemeIndex(index)
    setAccentPreview(PALETTE[index]!)
    setMode("theme")
  }

  function moveTheme(delta: number): void {
    const next = (themeIndex + delta + PALETTE.length) % PALETTE.length
    setThemeIndex(next)
    setAccentPreview(PALETTE[next]!)
  }

  function applyTheme(): void {
    const chosen = accentPreview
    if (chosen) {
      setSavedAccent(chosen)
      saveSettings(store.path, { ...loadSettings(store.path), accent: chosen })
      setStatus(`Accent set to ${chosen}`)
    }
    setAccentPreview(null)
    setMode("normal")
  }

  function cancelTheme(): void {
    setAccentPreview(null)
    setMode("normal")
  }

  // ---- keyboard ----------------------------------------------------------

  function normalKey(key: string): boolean {
    switch (key) {
      case "ctrl+c":
      case "q":
        persist()
        renderer.destroy()
        process.exit(0)
        return true
      case "?":
        setHelpOffset(0)
        setMode("help")
        return true
      case "H":
        setBottomBar((value) => (value === "status" ? "hints" : "status"))
        return true
      case "a":
        openAdd(false)
        return true
      case "n":
        openAdd(true)
        return true
      case "/":
        setMode("search")
        return true
      case "c":
        setShowDone((value) => !value)
        return true
      case "u":
        undoAction()
        return true
      case "ctrl+r":
      case "ctrl+y":
        redoAction()
        return true
      case "o":
        openSelectedLink()
        return true
      case "X":
        openPurge()
        return true
      case "m":
        openManage()
        return true
      case "C":
        openTheme()
        return true
      case "E":
        exportNow()
        return true
      case "I":
        openImport()
        return true
      case "N":
        openManageNew(MANAGE_PROJECTS)
        return true
      case "T":
        openManageNew(MANAGE_TAGS)
        return true
      case "s":
        openManageNew(MANAGE_SECTIONS)
        return true
      case "tab":
      case "shift+tab":
        setFocus((value) => (value === "sidebar" ? "list" : "sidebar"))
        return true
    }

    if (focus === "sidebar") {
      switch (key) {
        case "j":
        case "down":
          navigate(1)
          return true
        case "k":
        case "up":
          navigate(-1)
          return true
        case "l":
        case "right":
        case "enter":
          setFocus("list")
          return true
        case "g":
          setRawNavIndex(0)
          setCursor(0)
          return true
        case "G":
          setRawNavIndex(lastNavIndex(nav))
          setCursor(0)
          return true
        case "e":
          editNav()
          return true
        case "d":
          deleteNav()
          return true
      }
      return false
    }

    switch (key) {
      case "j":
      case "down":
        setCursor(nextTaskIndex(rows, cursorIndex, 1))
        return true
      case "k":
      case "up":
        setCursor(nextTaskIndex(rows, cursorIndex, -1))
        return true
      case "g":
        setCursor(firstTaskIndex(rows))
        return true
      case "G":
        setCursor(lastTaskIndex(rows))
        return true
      case "h":
      case "left":
        setFocus("sidebar")
        return true
      case "space":
      case "x":
      case "enter":
        toggleDone()
        return true
      case "e":
        if (selectedTask) openEditTask(selectedTask)
        return true
      case "d":
        if (selectedTask) deleteTaskNow(selectedTask)
        return true
      case "D": {
        const section = selectedTask?.section_id ? store.sectionById(selectedTask.section_id) : undefined
        const project = section ? store.projectById(section.project_id) : undefined
        if (!section || !project) {
          setStatus("This task is not in a section")
          return true
        }
        setPending({ kind: "section", section, project })
        setMode("delete")
        return true
      }
      case "p":
        cyclePriority()
        return true
      case "1":
      case "2":
      case "3":
      case "4":
        changePriority(parsePriority(Number(key)))
        return true
      case "t":
        dueToday()
        return true
      case "o":
        openSelectedLink()
        return true
      case "a":
        openAdd(false)
        return true
      case "n":
        openAdd(true)
        return true
    }
    return false
  }

  function addKey(key: string): boolean {
    if (add.suggestion && add.field === 0) {
      if (key === "esc") {
        setAdd((current) => ({ ...current, suggestion: null }))
        return true
      }
      if (key === "up" || key === "ctrl+p") {
        setAdd((current) => ({
          ...current,
          suggestion: current.suggestion
            ? { ...current.suggestion, idx: moveSuggestion(current.suggestion, -1) }
            : null,
        }))
        return true
      }
      if (key === "down" || key === "ctrl+n") {
        setAdd((current) => ({
          ...current,
          suggestion: current.suggestion
            ? { ...current.suggestion, idx: moveSuggestion(current.suggestion, 1) }
            : null,
        }))
        return true
      }
      if (key === "enter" || key === "tab") {
        acceptAddSuggestion()
        return true
      }
    }

    switch (key) {
      case "esc":
        setMode("normal")
        setAdd(emptyAdd)
        return true
      case "tab":
      case "shift+tab":
        setAdd((current) => ({ ...current, field: 1 - current.field, suggestion: null }))
        return true
      case "enter":
      case "ctrl+s":
        submitAdd()
        return true
    }
    return false
  }

  function editKey(key: string): boolean {
    try {
      appendFileSync("/tmp/opencode/tasker-log.txt", `editKey ${JSON.stringify(key)} sug=${edit.suggestion ? edit.suggestion.items.length : "null"} field=${edit.field}\n`)
    } catch {}
    if (edit.suggestion) {
      if (key === "esc") {
        setEdit((current) => ({ ...current, suggestion: null }))
        return true
      }
      if (key === "up" || key === "ctrl+p") {
        setEdit((current) => ({
          ...current,
          suggestion: current.suggestion
            ? { ...current.suggestion, idx: moveSuggestion(current.suggestion, -1) }
            : null,
        }))
        return true
      }
      if (key === "down" || key === "ctrl+n") {
        setEdit((current) => ({
          ...current,
          suggestion: current.suggestion
            ? { ...current.suggestion, idx: moveSuggestion(current.suggestion, 1) }
            : null,
        }))
        return true
      }
      if (key === "enter" || key === "tab") {
        acceptEditSuggestion()
        return true
      }
    }

    switch (key) {
      case "esc":
        setMode("normal")
        return true
      case "tab":
      case "down":
        setEdit((current) => ({
          ...current,
          field: (current.field + 1) % EDIT_FIELD_COUNT,
          suggestion: null,
        }))
        return true
      case "shift+tab":
      case "up":
        setEdit((current) => ({
          ...current,
          field: (current.field - 1 + EDIT_FIELD_COUNT) % EDIT_FIELD_COUNT,
          suggestion: null,
        }))
        return true
      case "enter":
      case "ctrl+s":
        saveEdit()
        return true
    }
    return false
  }

  function manageKey(key: string): boolean {
    if (manage.editing) {
      switch (key) {
        case "esc":
          setManage((current) => ({ ...current, editing: false, name: "" }))
          return true
        case "enter":
        case "ctrl+s":
          saveManage()
          return true
        case "tab":
          setManage((current) => ({
            ...current,
            colorIndex: (current.colorIndex + 1) % PALETTE.length,
          }))
          return true
        case "shift+tab":
          setManage((current) => ({
            ...current,
            colorIndex: (current.colorIndex - 1 + PALETTE.length) % PALETTE.length,
          }))
          return true
      }
      return false
    }

    if (key !== "d" && key !== "y" && manage.confirmDelete) {
      setManage((current) => ({ ...current, confirmDelete: false }))
    }

    switch (key) {
      case "esc":
      case "q":
        setMode("normal")
        return true
      case "tab":
        setManage((current) => ({
          ...current,
          tab: ((current.tab + 1) % 3) as ManageTab,
          index: 0,
          confirmDelete: false,
        }))
        return true
      case "j":
      case "down":
        setManage((current) => ({
          ...current,
          index: Math.min(current.index + 1, Math.max(0, manageList.length - 1)),
        }))
        return true
      case "k":
      case "up":
        setManage((current) => ({ ...current, index: Math.max(0, current.index - 1) }))
        return true
      case "g":
        setManage((current) => ({ ...current, index: 0 }))
        return true
      case "G":
        setManage((current) => ({ ...current, index: Math.max(0, manageList.length - 1) }))
        return true
      case "a":
        beginManageNew()
        return true
      case "e":
      case "enter":
        beginManageEdit()
        return true
      case "d":
      case "y":
        if (manage.confirmDelete) deleteManage()
        else setManage((current) => ({ ...current, confirmDelete: true }))
        return true
    }
    return false
  }

  function deleteKey(key: string): boolean {
    if (key === "y" || key === "enter") confirmDelete()
    else if (key === "n" || key === "esc" || key === "q") cancelDelete()
    return true
  }

  function helpKey(key: string): boolean {
    const maxOffset = Math.max(0, helpLineCount(modalWidth) - Math.max(6, height - 8))
    switch (key) {
      case "esc":
      case "q":
      case "?":
      case "enter":
        setMode("normal")
        return true
      case "j":
      case "down":
        setHelpOffset((value) => Math.min(value + 1, maxOffset))
        return true
      case "k":
      case "up":
        setHelpOffset((value) => Math.max(0, Math.min(value, maxOffset) - 1))
        return true
    }
    return false
  }

  function themeKey(key: string): boolean {
    switch (key) {
      case "h":
      case "left":
      case "k":
      case "up":
        moveTheme(-1)
        return true
      case "l":
      case "right":
      case "j":
      case "down":
        moveTheme(1)
        return true
      case "enter":
        applyTheme()
        return true
      case "esc":
      case "q":
        cancelTheme()
        return true
    }
    return false
  }

  function importKey(key: string): boolean {
    switch (key) {
      case "esc":
        setImporting(emptyImport)
        setMode("normal")
        return true
      case "tab":
      case "left":
      case "right":
        setImporting((current) => ({
          ...current,
          mode: current.mode === "merge" ? "replace" : "merge",
        }))
        return true
      case "enter":
      case "ctrl+s":
        confirmImport()
        return true
    }
    return false
  }

  function searchKey(key: string): boolean {
    switch (key) {
      case "esc":
        setQuery("")
        setMode("normal")
        return true
      case "enter":
        setMode("normal")
        return true
    }
    return false
  }

  useKeyboard((event) => {
    const key = keyName(event)
    let handled = false
    switch (mode) {
      case "normal":
        handled = normalKey(key)
        break
      case "add":
        handled = addKey(key)
        break
      case "edit":
        handled = editKey(key)
        break
      case "delete":
        handled = deleteKey(key)
        break
      case "import":
        handled = importKey(key)
        break
      case "help":
        handled = helpKey(key)
        break
      case "search":
        handled = searchKey(key)
        break
      case "manage":
        handled = manageKey(key)
        break
      case "theme":
        handled = themeKey(key)
        break
    }
    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  })

  // ---- focus, cursor and scroll -----------------------------------------

  useEffect(() => {
    if (mode === "add") (add.field === 0 ? contentRef : descriptionRef).current?.focus()
    else if (mode === "edit") editInputRef.current?.focus()
    else if (mode === "manage" && manage.editing) manageNameRef.current?.focus()
    else if (mode === "search") searchRef.current?.focus()
    else if (mode === "import") importPathRef.current?.focus()
  }, [mode, add.field, edit.field, manage.editing])

  useEffect(() => {
    if (pendingCursor.current === null) return
    const input = contentRef.current
    if (!input) return
    input.cursorOffset = pendingCursor.current
    pendingCursor.current = null
  }, [add.content])

  useEffect(() => {
    if (pendingEditCursor.current === null) return
    const input = editInputRef.current
    if (!input) return
    input.cursorOffset = pendingEditCursor.current
    pendingEditCursor.current = null
  }, [edit.values[0]])

  useEffect(() => {
    if (focus === "sidebar") sidebarScrollRef.current?.scrollChildIntoView(`nav-${navIndex}`)
  }, [navIndex, focus, nav.length])

  useEffect(() => {
    if (selectedTask) listScrollRef.current?.scrollChildIntoView(`row-${selectedTask.id}`)
  }, [selectedTask?.id, cursorIndex, focus, rows.length])

  useEffect(() => {
    if (!visibleTask) return
    detailScrollRef.current?.scrollTo(0)
  }, [visibleTask?.id])

  useEffect(() => {
    if (mode !== "manage" || manage.editing) return
    manageScrollRef.current?.scrollChildIntoView(`manage-${manage.index}`)
  }, [mode, manage.index, manage.tab, manage.editing, manageList.length])

  // ---- render ------------------------------------------------------------

  const hints = [    { keys: "a", label: "add" },
    { keys: "enter", label: "done" },
    { keys: "e", label: "edit" },
    { keys: "d", label: "delete" },
    { keys: "D", label: "del section" },
    { keys: "o", label: "link" },
    { keys: "u", label: "undo" },
    { keys: "m", label: "manage" },
    { keys: "C", label: "theme" },
    { keys: "E", label: "export" },
    { keys: "I", label: "import" },
    { keys: "?", label: "help" },
    { keys: "q", label: "quit" },
  ]

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={theme.base}
      position="relative"
    >
      <box flexGrow={1} flexDirection="row" minHeight={1}>
        {sidebarWidth > 0 ? (
          <Sidebar
            nav={nav}
            navIndex={navIndex}
            focused={focus === "sidebar"}
            theme={theme}
            scrollRef={sidebarScrollRef}
            onSelect={(index) => {
              setRawNavIndex(index)
              setFocus("sidebar")
            }}
          />
        ) : null}

        <TaskList
          rows={rows}
          cursor={cursorIndex}
          focused={focus === "list"}
          theme={theme}
          store={store}
          today={today}
          title={navPath(currentNav)}
          width={listWidth}
          scrollRef={listScrollRef}
          onSelect={(index) => {
            setCursor(index)
            setFocus("list")
          }}
        />

        {detailWidth > 0 ? (
          <DetailPane
            task={selectedTask}
            store={store}
            theme={theme}
            today={today}
            width={detailWidth}
            scrollRef={detailScrollRef}
          />
        ) : null}
      </box>

      {bottomBar === "status" ? (
        <Header theme={theme} path={navPath(currentNav)} today={today} counts={counts} />
      ) : (
        <Footer theme={theme} width={width} hints={hints} />
      )}

      {mode === "add" ? (
        <QuickAddModal
          theme={theme}
          width={modalWidth}
          note={add.note}
          content={add.content}
          description={add.description}
          field={add.field}
          preview={preview}
          store={store}
          today={today}
          defaultProjectId={defaultProjectId}
          contentRef={contentRef}
          descriptionRef={descriptionRef}
          onContent={refreshAddSuggestion}
          onDescription={(value) => setAdd((current) => ({ ...current, description: value }))}
        />
      ) : null}

      {mode === "edit" ? (
        <EditTaskModal
          theme={theme}
          width={modalWidth}
          values={edit.values}
          field={edit.field}
          inputRef={editInputRef}
          onChange={changeEditField}
        />
      ) : null}

      {/*
        Dropdown overlays. They live at the root, absolutely positioned over the
        modal, because OpenTUI does not repaint a nested box tree that grows by
        insertion; a root-level overlay like this repaints reliably (the same
        mechanism the modals themselves use).
      */}
      {mode === "edit" && edit.suggestion ? (
        <box
          key="edit-suggestions"
          position="absolute"
          left={dropLeft(modalLeftEdge(width, modalWidth), 12)}
          top={editDropdownTop(height, edit.field)}
          width={dropWidth}
          height={7}
          flexDirection="column"
          backgroundColor={theme.base}
          zIndex={102}
        >
          <SuggestionList theme={theme} suggestion={edit.suggestion} indent={0} />
        </box>
      ) : null}

      {mode === "add" && add.field === 0 && add.suggestion ? (
        <box
          key="add-suggestions"
          position="absolute"
          left={dropLeft(modalLeftEdge(width, modalWidth), 9)}
          top={dropTop(height, quickAddModalHeight(preview, today, modalWidth, addProjectName))}
          width={dropWidth}
          height={7}
          flexDirection="column"
          backgroundColor={theme.base}
          zIndex={102}
        >
          <SuggestionList theme={theme} suggestion={add.suggestion} indent={0} />
        </box>
      ) : null}

      {mode === "manage" ? (
        <ManageModal
          theme={theme}
          width={modalWidth}
          height={height}
          tab={manage.tab}
          items={manageList}
          index={manage.index}
          editing={manage.editing}
          isNew={manage.isNew}
          isGroup={manage.isGroup}
          name={manage.name}
          colorIndex={manage.colorIndex}
          confirmDelete={manage.confirmDelete}
          nameRef={manageNameRef}
          scrollRef={manageScrollRef}
          onName={(value) => setManage((current) => ({ ...current, name: value }))}
          onSelect={(index) => setManage((current) => ({ ...current, index }))}
        />
      ) : null}

      {mode === "delete" && pending ? (
        <ConfirmModal
          theme={theme}
          width={modalWidth}
          title={deleteTitle(pending)}
          lines={deleteLines(pending, store)}
          danger
        />
      ) : null}

      {mode === "import" ? (
        <ImportModal
          theme={theme}
          width={modalWidth}
          path={importing.path}
          mode={importing.mode}
          pathRef={importPathRef}
          onPath={(value) => setImporting((current) => ({ ...current, path: value }))}
        />
      ) : null}

      {mode === "theme" ? (
        <ThemeModal theme={theme} width={modalWidth} accent={accent} index={themeIndex} />
      ) : null}

      {mode === "help" ? (
        <HelpModal theme={theme} width={modalWidth} height={height} offset={helpOffset} />
      ) : null}
    </box>
  )
}

function deleteTitle(pending: PendingDelete): string {
  switch (pending.kind) {
    case "purge":
      return "Delete all completed tasks?"
    case "project":
      return "Delete project?"
    case "section":
      return "Delete section?"
    case "tag":
      return "Delete tag?"
    case "group":
      return "Delete tag group?"
  }
}

function deleteLines(pending: PendingDelete, store: Store): string[] {
  switch (pending.kind) {
    case "purge":
      return [`${store.completedCount()} completed task(s) will be removed.`]
    case "project":
      return [pending.project.name, "Its sections and tasks will be removed."]
    case "section": {
      const count = store.tasksInSection(pending.section.id).length
      return [
        `${pending.project.name} / ${pending.section.name}`,
        `${count} task(s) inside it will be removed too.`,
      ]
    }
    case "tag":
      return [`@${pending.tag.name}`, "It will be removed from all tasks."]
    case "group":
      return [`${pending.group}:*`, "Every tag in it will be removed from all tasks."]
  }
}
