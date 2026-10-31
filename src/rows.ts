// Pure view-model builders: sidebar navigation, list rows, and the manager's
// flattened tab lists. Keeping these out of React makes them easy to test.

import { humanDate, todayIso } from "./dates"
import type { Store } from "./store"
import { splitTagName } from "./store"
import type { Project, Task } from "./model"

export type ViewKind = "inbox" | "today" | "upcoming" | "project" | "label" | "labelGroup"

export interface NavItem {
  key: string
  kind: ViewKind | "heading"
  label: string
  id: string
  color: string
  count: number
  heading: boolean
  group: string
}

export interface ListRow {
  key: string
  header?: string
  task?: Task
}

export interface ViewSpec {
  kind: ViewKind
  label: string
  id: string
}

function openCount(tasks: Task[]): number {
  return tasks.filter((t) => !t.done && !t.note).length
}

export function buildNav(store: Store, today: string = todayIso()): NavItem[] {
  const inbox = store.inbox()
  const items: NavItem[] = [
    {
      key: "view:inbox",
      kind: "inbox",
      label: "Inbox",
      id: inbox?.id ?? "",
      color: "#246fe0",
      count: openCount(inbox ? store.tasksInProject(inbox.id) : []),
      heading: false,
      group: "",
    },
    {
      key: "view:today",
      kind: "today",
      label: "Today",
      id: "",
      color: "#7ecc49",
      count: openCount(store.today(today)),
      heading: false,
      group: "",
    },
    {
      key: "view:upcoming",
      kind: "upcoming",
      label: "Upcoming",
      id: "",
      color: "#a970ff",
      count: openCount(store.upcoming(today, 7)),
      heading: false,
      group: "",
    },
  ]

  const projects = store.projects().filter((p) => !p.inbox)
  if (projects.length > 0) {
    items.push(heading("Projects"))
    for (const project of projects) {
      items.push({
        key: `project:${project.id}`,
        kind: "project",
        label: project.name,
        id: project.id,
        color: project.color,
        count: openCount(store.tasksInProject(project.id)),
        heading: false,
        group: "",
      })
    }
  }

  const tags = store.tags()
  if (tags.length > 0) {
    items.push(heading("Tags"))
    const groups = store.tagGroups()
    const byGroup = new Map<string, NavItem[]>()
    const general: NavItem[] = []

    for (const tag of tags) {
      const [group, leaf] = splitTagName(tag.name)
      if (!group) {
        general.push({
          key: `label:${tag.name.toLowerCase()}`,
          kind: "label",
          label: tag.name,
          id: tag.name,
          color: tag.color,
          count: openCount(store.tasksWithLabel(tag.name)),
          heading: false,
          group: "",
        })
        continue
      }
      const list = byGroup.get(group) ?? []
      list.push({
        key: `label:${tag.name.toLowerCase()}`,
        kind: "label",
        label: leaf,
        id: tag.name,
        color: tag.color,
        count: openCount(store.tasksWithLabel(tag.name)),
        heading: false,
        group,
      })
      byGroup.set(group, list)
    }

    for (const group of groups) {
      items.push({
        key: `group:${group.toLowerCase()}`,
        kind: "labelGroup",
        label: group,
        id: group,
        color: "#8a8a8a",
        count: openCount(store.tasksWithLabelGroup(group)),
        heading: false,
        group: "",
      })
      for (const item of byGroup.get(group) ?? []) items.push(item)
    }

    if (general.length > 0) {
      if (groups.length > 0) items.push(heading("General"))
      items.push(...general)
    }
  }

  return items
}

function heading(label: string): NavItem {
  return {
    key: `heading:${label}`,
    kind: "heading",
    label,
    id: "",
    color: "",
    count: 0,
    heading: true,
    group: "",
  }
}

export function viewItems(nav: NavItem[]): NavItem[] {
  return nav.filter((item) => !item.heading)
}

export function clampNavIndex(nav: NavItem[], index: number): number {
  if (nav.length === 0) return 0
  let i = Math.min(Math.max(index, 0), nav.length - 1)
  while (i > 0 && nav[i]?.heading) i--
  if (nav[i]?.heading) {
    i = nav.findIndex((item) => !item.heading)
    if (i < 0) i = 0
  }
  return i
}

export function moveNavIndex(nav: NavItem[], index: number, delta: number): number {
  let i = index
  for (;;) {
    i += delta
    if (i < 0 || i >= nav.length) return index
    if (!nav[i]?.heading) return i
  }
}

export function navPath(item: NavItem): string {
  switch (item.kind) {
    case "inbox":
      return "Inbox"
    case "today":
      return "Today"
    case "upcoming":
      return "Upcoming"
    case "project":
      return `Project: ${item.label}`
    case "label":
      return `Label: @${item.label}`
    case "labelGroup":
      return `Tags: @${item.label}`
    default:
      return item.label
  }
}

export function matches(task: Task, query: string): boolean {
  const q = query.toLowerCase()
  if (!q) return true
  if (task.content.toLowerCase().includes(q)) return true
  if ((task.description ?? "").toLowerCase().includes(q)) return true
  return (task.labels ?? []).some((l) => l.toLowerCase().includes(q))
}

export function tasksForView(store: Store, view: ViewSpec, today: string): Task[] {
  switch (view.kind) {
    case "inbox":
      return store.tasksInProject(store.inbox()?.id ?? "")
    case "today":
      return store.today(today)
    case "upcoming":
      return store.upcoming(today, 7)
    case "project":
      return store.tasksInProject(view.id)
    case "label":
      return store.tasksWithLabel(view.id)
    case "labelGroup":
      return store.tasksWithLabelGroup(view.id)
  }
}

export function buildRows(
  store: Store,
  view: ViewSpec,
  options: { showDone?: boolean; query?: string; today?: string } = {},
): ListRow[] {
  const { showDone = false, query = "", today = todayIso() } = options
  const tasks = tasksForView(store, view, today).filter(
    (task) => (showDone || !task.done) && matches(task, query),
  )

  const rows: ListRow[] = []
  if (view.kind === "project") {
    const grouped = new Map<string, Task[]>()
    for (const task of tasks) {
      const key = task.section_id ?? ""
      const list = grouped.get(key) ?? []
      list.push(task)
      grouped.set(key, list)
    }
    for (const task of grouped.get("") ?? []) rows.push(taskRow(task))
    for (const section of store.sections(view.id)) {
      const list = grouped.get(section.id) ?? []
      if (list.length === 0) continue
      rows.push({ key: `header:${section.id}`, header: section.name })
      for (const task of list) rows.push(taskRow(task))
    }
    return rows
  }

  if (view.kind === "upcoming") {
    let last = ""
    for (const task of tasks) {
      const key = task.due ?? ""
      if (key !== last) {
        rows.push({
          key: `header:${key || "none"}`,
          header: task.due ? humanDate(task.due, today) : "No date",
        })
        last = key
      }
      rows.push(taskRow(task))
    }
    return rows
  }

  for (const task of tasks) rows.push(taskRow(task))
  return rows
}

function taskRow(task: Task): ListRow {
  return { key: `task:${task.id}`, task }
}

export function nextTaskIndex(rows: ListRow[], cursor: number, delta: number): number {
  let i = cursor
  if (i < 0) i = 0
  for (;;) {
    i += delta
    if (i < 0 || i >= rows.length) return cursor
    if (rows[i]?.task) return i
  }
}

export function firstTaskIndex(rows: ListRow[]): number {
  return rows.findIndex((row) => !!row.task)
}

export function lastTaskIndex(rows: ListRow[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]?.task) return i
  }
  return -1
}

// ---- manager -------------------------------------------------------------

export type ManageTab = 0 | 1 | 2
export const MANAGE_PROJECTS: ManageTab = 0
export const MANAGE_SECTIONS: ManageTab = 1
export const MANAGE_TAGS: ManageTab = 2

export interface ManageItem {
  key: string
  name: string
  full: string
  color: string
  group: boolean
  nested: boolean
  proj: string
}

export function manageItems(store: Store, tab: ManageTab): ManageItem[] {
  const out: ManageItem[] = []
  if (tab === MANAGE_PROJECTS) {
    for (const project of store.projects()) {
      if (project.inbox) continue
      out.push({
        key: `project:${project.id}`,
        name: project.name,
        full: project.name,
        color: project.color,
        group: false,
        nested: false,
        proj: project.name,
      })
    }
    return out
  }

  if (tab === MANAGE_SECTIONS) {
    for (const project of store.projects()) {
      if (project.inbox) continue
      out.push({
        key: `project:${project.id}`,
        name: project.name,
        full: project.name,
        color: project.color,
        group: true,
        nested: false,
        proj: project.name,
      })
      for (const section of store.sections(project.id)) {
        out.push({
          key: `section:${section.id}`,
          name: section.name,
          full: section.name,
          color: "",
          group: false,
          nested: true,
          proj: project.name,
        })
      }
    }
    return out
  }

  const byGroup = new Map<string, ManageItem[]>()
  const general: ManageItem[] = []
  for (const tag of store.tags()) {
    const [group, leaf] = splitTagName(tag.name)
    if (!group) {
      general.push({
        key: `tag:${tag.name.toLowerCase()}`,
        name: tag.name,
        full: tag.name,
        color: tag.color,
        group: false,
        nested: false,
        proj: "",
      })
      continue
    }
    const list = byGroup.get(group) ?? []
    list.push({
      key: `tag:${tag.name.toLowerCase()}`,
      name: leaf,
      full: tag.name,
      color: tag.color,
      group: false,
      nested: true,
      proj: "",
    })
    byGroup.set(group, list)
  }

  for (const group of store.tagGroups()) {
    out.push({
      key: `group:${group.toLowerCase()}`,
      name: group,
      full: group,
      color: "",
      group: true,
      nested: false,
      proj: "",
    })
    out.push(...(byGroup.get(group) ?? []))
  }
  out.push(...general)
  return out
}

export function manageTargetProject(
  store: Store,
  manageProjectName: string,
  currentView: ViewSpec,
): Project | undefined {
  const name = manageProjectName.trim()
  if (name) {
    const found = store.projectByName(name)
    if (found) return found
  }
  if (currentView.kind === "project") return store.projectById(currentView.id)
  return undefined
}
