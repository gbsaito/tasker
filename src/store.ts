// JSON persistence and the CRUD helpers the UI needs. The on-disk shape is
// byte-compatible with the Go version of tasker (v1), so existing data files
// keep working.

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

import { addDaysIso, todayIso } from "./dates"
import {
  type DB,
  type Priority,
  type Project,
  type Section,
  type Tag,
  type Task,
  INBOX_BLUE,
  PALETTE,
  parsePriority,
} from "./model"

export function defaultPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(base, "tasker", "tasker.json")
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter((v) => v != null) as T[]) : []
}

function emptyDb(): DB {
  return { projects: [], sections: [], tags: [], tasks: [], seq: 1 }
}

function normaliseDb(raw: unknown): DB {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<DB>
  const db: DB = {
    projects: asArray<Project>(obj.projects),
    sections: asArray<Section>(obj.sections),
    tags: asArray<Tag>(obj.tags),
    tasks: asArray<Task>(obj.tasks),
    seq: Number.isFinite(obj.seq) ? Number(obj.seq) : 0,
  }
  for (const task of db.tasks) {
    task.labels = Array.isArray(task.labels) ? task.labels.filter(Boolean) : []
    task.priority = parsePriority(Number(task.priority) || 4)
    task.content = typeof task.content === "string" ? task.content : String(task.content ?? "")
    task.done = !!task.done
    task.order = Number.isFinite(task.order) ? Number(task.order) : 0
  }
  for (const project of db.projects) {
    project.order = Number.isFinite(project.order) ? Number(project.order) : 0
    project.color = project.color || PALETTE[0]!
  }
  for (const section of db.sections) {
    section.order = Number.isFinite(section.order) ? Number(section.order) : 0
  }
  for (const tag of db.tags) {
    tag.color = tag.color || PALETTE[0]!
  }
  return db
}

export class Store {
  readonly path: string
  private db: DB

  constructor(path: string, db: DB) {
    this.path = path
    this.db = db
  }

  static open(path: string): Store {
    let db: DB
    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
      db = normaliseDb(raw)
    } else {
      db = seed()
      const store = new Store(path, db)
      store.save()
      return store
    }
    const store = new Store(path, db)
    store.repair()
    return store
  }

  /** In-memory store used by tests and throwaway sessions. */
  static fromDb(db: DB, path = ":memory:"): Store {
    const store = new Store(path, db)
    store.repair()
    return store
  }

  raw(): DB {
    return this.db
  }

  save(): void {
    if (this.path === ":memory:") return
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o755 })
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(this.db, null, 2), { encoding: "utf8", mode: 0o644 })
    renameSync(tmp, this.path)
    try {
      chmodSync(this.path, 0o644)
    } catch {
      // best effort on exotic filesystems
    }
  }

  snapshot(): string {
    return JSON.stringify(this.db)
  }

  restore(snapshot: string): void {
    if (!snapshot) throw new Error("empty snapshot")
    this.db = normaliseDb(JSON.parse(snapshot))
    this.repair()
  }

  private repair(): void {
    if (!this.db.seq) this.db.seq = 1
    if (!this.inbox()) {
      this.db.projects.unshift({
        id: this.nextId("p"),
        name: "Inbox",
        color: INBOX_BLUE,
        order: 0,
        inbox: true,
      })
    }
  }

  // ---- queries -----------------------------------------------------------

  projects(): Project[] {
    return [...this.db.projects].sort((a, b) => {
      if (!!a.inbox !== !!b.inbox) return a.inbox ? -1 : 1
      return a.order - b.order
    })
  }

  tags(): Tag[] {
    return [...this.db.tags].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }

  tasks(): Task[] {
    return [...this.db.tasks]
  }

  inbox(): Project | undefined {
    return this.db.projects.find((p) => p.inbox)
  }

  projectById(id: string): Project | undefined {
    return this.db.projects.find((p) => p.id === id)
  }

  projectByName(name: string): Project | undefined {
    const needle = name.toLowerCase()
    return this.db.projects.find((p) => p.name.toLowerCase() === needle)
  }

  sections(projectId: string): Section[] {
    return this.db.sections
      .filter((s) => s.project_id === projectId)
      .sort((a, b) => a.order - b.order)
  }

  sectionById(id: string): Section | undefined {
    return this.db.sections.find((s) => s.id === id)
  }

  sectionByName(projectId: string, name: string): Section | undefined {
    const needle = name.toLowerCase()
    return this.db.sections.find((s) => s.project_id === projectId && s.name.toLowerCase() === needle)
  }

  tagByName(name: string): Tag | undefined {
    const needle = canonicalTagName(name).toLowerCase()
    return this.db.tags.find((t) => t.name.toLowerCase() === needle)
  }

  taskById(id: string): Task | undefined {
    return this.db.tasks.find((t) => t.id === id)
  }

  tasksInProject(projectId: string): Task[] {
    return sortTasks(this.db.tasks.filter((t) => t.project_id === projectId))
  }

  tasksInSection(sectionId: string): Task[] {
    return sortTasks(this.db.tasks.filter((t) => t.section_id === sectionId))
  }

  tasksWithLabel(name: string): Task[] {
    const needle = name.toLowerCase()
    return sortTasks(
      this.db.tasks.filter((t) => (t.labels ?? []).some((l) => l.toLowerCase() === needle)),
    )
  }

  today(today: string): Task[] {
    return sortTasks(
      this.db.tasks.filter((t) => !t.done && !t.note && !!t.due && t.due! <= today),
    )
  }

  upcoming(today: string, days: number): Task[] {
    const limit = addDaysIso(today, days)
    return sortTasks(
      this.db.tasks.filter(
        (t) => !t.done && !t.note && !!t.due && t.due! > today && t.due! <= limit,
      ),
    )
  }

  // ---- mutations ---------------------------------------------------------

  nextId(prefix: string): string {
    this.db.seq++
    return `${prefix}${this.db.seq}`
  }

  ensureProject(name: string): Project {
    const existing = this.projectByName(name)
    if (existing) return existing
    const project: Project = {
      id: this.nextId("p"),
      name,
      color: "#8a8a8a",
      order: this.db.projects.length,
    }
    this.db.projects.push(project)
    return project
  }

  ensureSection(projectId: string, name: string): Section {
    const existing = this.sectionByName(projectId, name)
    if (existing) return existing
    const section: Section = {
      id: this.nextId("s"),
      name,
      project_id: projectId,
      order: this.sections(projectId).length,
    }
    this.db.sections.push(section)
    return section
  }

  ensureTag(name: string): Tag {
    const canonical = canonicalTagName(name)
    const existing = this.tagByName(canonical)
    if (existing) return existing
    const tag: Tag = {
      name: canonical,
      color: PALETTE[this.db.tags.length % PALETTE.length]!,
    }
    this.db.tags.push(tag)
    return tag
  }

  addTask(task: Task): void {
    if (!task.id) task.id = this.nextId("t")
    if (!task.created_at) task.created_at = new Date().toISOString()
    task.order = this.db.tasks.length
    this.db.tasks.push(task)
  }

  updateTask(task: Task): void {
    const idx = this.db.tasks.findIndex((t) => t.id === task.id)
    if (idx >= 0) this.db.tasks[idx] = task
    else this.db.tasks.push(task)
  }

  deleteTask(id: string): void {
    this.db.tasks = this.db.tasks.filter((t) => t.id !== id)
  }

  toggleDone(id: string): void {
    const task = this.taskById(id)
    if (!task) return
    task.done = !task.done
    task.completed_at = task.done ? new Date().toISOString() : undefined
  }

  addProject(name: string, color: string): Project {
    const clean = name.trim() || "New project"
    const project: Project = {
      id: this.nextId("p"),
      name: clean,
      color: color || PALETTE[this.db.projects.length % PALETTE.length]!,
      order: this.db.projects.length,
    }
    this.db.projects.push(project)
    return project
  }

  updateProject(project: Project): void {
    const idx = this.db.projects.findIndex((p) => p.id === project.id)
    if (idx < 0) return
    const current = this.db.projects[idx]!
    if (current.inbox) {
      project.inbox = true
      project.name = current.name
    }
    this.db.projects[idx] = project
  }

  deleteProject(id: string): boolean {
    const project = this.projectById(id)
    if (!project || project.inbox) return false
    this.db.tasks = this.db.tasks.filter((t) => t.project_id !== id)
    this.db.sections = this.db.sections.filter((s) => s.project_id !== id)
    this.db.projects = this.db.projects.filter((p) => p.id !== id)
    return true
  }

  renameSection(id: string, name: string): boolean {
    const section = this.sectionById(id)
    if (!section) return false
    section.name = name
    return true
  }

  deleteSection(id: string): boolean {
    const had = this.db.sections.some((s) => s.id === id)
    this.db.sections = this.db.sections.filter((s) => s.id !== id)
    if (had) {
      for (const task of this.db.tasks) {
        if (task.section_id === id) task.section_id = undefined
      }
    }
    return had
  }

  /** Remove a section together with every task filed under it. Returns the task count. */
  deleteSectionWithTasks(id: string): number {
    const before = this.db.tasks.length
    this.db.tasks = this.db.tasks.filter((t) => t.section_id !== id)
    this.db.sections = this.db.sections.filter((s) => s.id !== id)
    return before - this.db.tasks.length
  }

  addTag(name: string, color: string): Tag {
    const canonical = canonicalTagName(name) || "new-tag"
    const existing = this.tagByName(canonical)
    if (existing) return existing
    const tag: Tag = {
      name: canonical,
      color: color || PALETTE[this.db.tags.length % PALETTE.length]!,
    }
    this.db.tags.push(tag)
    return tag
  }

  updateTag(original: string, name: string, color: string): void {
    const canonical = canonicalTagName(name) || original
    for (const tag of this.db.tags) {
      if (tag.name.toLowerCase() === original.toLowerCase()) {
        tag.name = canonical
        if (color) tag.color = color
      }
    }
    if (original.toLowerCase() === canonical.toLowerCase()) return
    for (const task of this.db.tasks) {
      task.labels = (task.labels ?? []).map((l) =>
        l.toLowerCase() === original.toLowerCase() ? canonical : l,
      )
    }
  }

  deleteTag(name: string): boolean {
    const needle = name.toLowerCase()
    const had = this.db.tags.some((t) => t.name.toLowerCase() === needle)
    this.db.tags = this.db.tags.filter((t) => t.name.toLowerCase() !== needle)
    if (had) {
      for (const task of this.db.tasks) {
        task.labels = (task.labels ?? []).filter((l) => l.toLowerCase() !== needle)
      }
    }
    return had
  }

  // ---- tag namespaces ----------------------------------------------------

  tagGroups(): string[] {
    const seen = new Set<string>()
    for (const tag of this.db.tags) {
      const [group] = splitTagName(tag.name)
      if (group) seen.add(group)
    }
    return [...seen].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  }

  tagsInGroup(group: string): Tag[] {
    return this.db.tags.filter((t) => splitTagName(t.name)[0] === group)
  }

  tasksWithLabelGroup(group: string): Task[] {
    return this.db.tasks.filter((t) =>
      (t.labels ?? []).some((l) => splitTagName(l)[0] === group),
    )
  }

  renameTagGroup(oldGroup: string, name: string): void {
    let next = name
    const [g, label] = splitTagName(next)
    if (label && g) next = g
    next = next.trim() || oldGroup
    const rename = new Map<string, string>()
    for (const tag of this.db.tags) {
      const [group, leaf] = splitTagName(tag.name)
      if (group === oldGroup) {
        const renamed = `${next}: ${leaf}`
        rename.set(tag.name.toLowerCase(), renamed)
        tag.name = renamed
      }
    }
    if (rename.size === 0) return
    for (const task of this.db.tasks) {
      task.labels = (task.labels ?? []).map((l) => rename.get(l.toLowerCase()) ?? l)
    }
  }

  recolorTagGroup(group: string, color: string): void {
    if (!color) return
    for (const tag of this.db.tags) {
      if (splitTagName(tag.name)[0] === group) tag.color = color
    }
  }

  deleteTagGroup(group: string): number {
    const remove = new Set<string>()
    this.db.tags = this.db.tags.filter((tag) => {
      if (splitTagName(tag.name)[0] === group) {
        remove.add(tag.name.toLowerCase())
        return false
      }
      return true
    })
    if (remove.size === 0) return 0
    for (const task of this.db.tasks) {
      task.labels = (task.labels ?? []).filter((l) => !remove.has(l.toLowerCase()))
    }
    return remove.size
  }

  purgeCompleted(): number {
    const before = this.db.tasks.length
    this.db.tasks = this.db.tasks.filter((t) => !t.done)
    return before - this.db.tasks.length
  }

  completedCount(): number {
    return this.db.tasks.filter((t) => t.done).length
  }

  // ---- transfer ----------------------------------------------------------

  exportTo(path: string): void {
    writeFileSync(path, this.snapshot(), { encoding: "utf8", mode: 0o644 })
  }

  replaceFile(path: string): void {
    this.restore(readFileSync(path, "utf8"))
  }

  importFile(path: string): number {
    const incoming = normaliseDb(JSON.parse(readFileSync(path, "utf8")) as unknown)
    const projectMap = new Map<string, string>()

    for (const project of incoming.projects) {
      if (!project.name) continue
      if (project.inbox) {
        const inbox = this.inbox()
        if (inbox) projectMap.set(project.id, inbox.id)
        continue
      }
      const current = this.projectByName(project.name)
      projectMap.set(project.id, current ? current.id : this.addProject(project.name, project.color).id)
    }

    const sectionMap = new Map<string, string>()
    for (const section of incoming.sections) {
      if (!section.name) continue
      const projectId = projectMap.get(section.project_id)
      if (!projectId) continue // its project did not arrive; tasks drop back sectionless
      const current = this.sectionByName(projectId, section.name)
      sectionMap.set(
        section.id,
        current ? current.id : this.ensureSection(projectId, section.name).id,
      )
    }

    let count = 0
    for (const task of incoming.tasks) {
      const projectId = projectMap.get(task.project_id) ?? this.inbox()?.id ?? ""
      const next: Task = {
        ...task,
        id: this.nextId("t"),
        project_id: projectId,
        section_id: sectionMap.get(task.section_id ?? ""),
        labels: [],
      }
      for (const raw of task.labels ?? []) {
        const label = canonicalTagName(raw)
        if (!label) continue
        this.ensureTag(label)
        if (!next.labels!.some((l) => l.toLowerCase() === label.toLowerCase())) {
          next.labels!.push(label)
        }
      }
      this.addTask(next)
      count++
    }
    return count
  }
}

export function splitTagName(name: string): [string, string] {
  const clean = name.trim().replace(/^@+/, "")
  const idx = clean.indexOf(":")
  if (idx > 0) {
    const group = clean.slice(0, idx).trim()
    const leaf = clean.slice(idx + 1).trim()
    if (group && leaf) return [group, leaf]
  }
  return ["", clean]
}

export function canonicalTagName(name: string): string {
  const clean = name.trim().replace(/^@+/, "").trim()
  const idx = clean.indexOf(":")
  if (idx > 0) {
    const group = clean.slice(0, idx).trim()
    const leaf = clean.slice(idx + 1).trim()
    if (group && leaf) return `${group}: ${leaf}`
    if (group) return group
  }
  return clean
}

export function palette(): readonly string[] {
  return PALETTE
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (!!a.due !== !!b.due) return a.due ? -1 : 1
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.order - b.order
  })
}

/** The first-run document: an Inbox plus a small demo workspace. */
export function seed(): DB {
  const s = new Store(":memory:", emptyDb())
  const inbox: Project = { id: s.nextId("p"), name: "Inbox", color: INBOX_BLUE, order: 0, inbox: true }
  const work: Project = { id: s.nextId("p"), name: "Work", color: "#4073ff", order: 1 }
  const personal: Project = { id: s.nextId("p"), name: "Personal", color: "#7ecc49", order: 2 }
  s.raw().projects = [inbox, work, personal]

  const backlog: Section = { id: s.nextId("s"), name: "Backlog", project_id: work.id, order: 0 }
  const design: Section = { id: s.nextId("s"), name: "Design", project_id: work.id, order: 1 }
  s.raw().sections = [backlog, design]

  for (const name of [
    "coding: fix",
    "coding: docs",
    "coding: review",
    "school: math",
    "school: geography",
    "urgent",
    "errands",
  ]) {
    s.ensureTag(name)
  }

  const today = todayIso()
  const tomorrow = addDaysIso(today, 1)
  const nextWeek = addDaysIso(today, 7)

  const add = (task: Omit<Task, "id" | "created_at" | "order" | "done"> & { done?: boolean }): void => {
    s.addTask({
      ...task,
      id: s.nextId("t"),
      created_at: new Date().toISOString(),
      order: s.tasks().length,
      done: task.done ?? false,
    })
  }

  add({
    content: "Welcome to tasker — press ? for help",
    project_id: inbox.id,
    priority: 4,
    due: today,
    description:
      "Quick add syntax:\n" +
      "  #Project  @label  @group: label  !p1\n" +
      "  tomorrow · next week · 09/18 · 18 sep\n" +
      "Docs: https://todoist.com/help/articles/get-started-with-todoist",
  })
  add({
    content: "Ship the release notes",
    project_id: work.id,
    section_id: design.id,
    labels: ["coding: docs", "urgent"],
    priority: 1,
    due: today,
    deadline: nextWeek,
  })
  add({
    content: "Review quarterly roadmap",
    project_id: work.id,
    section_id: backlog.id,
    labels: ["coding: review"],
    priority: 2,
    due: tomorrow,
  })
  add({
    content: "Book dentist appointment",
    project_id: personal.id,
    labels: ["errands"],
    priority: 3,
    due: nextWeek,
    description: "Prefer a morning slot. See https://example.com/clinic",
  })
  add({
    content: "Revise for the exam",
    project_id: personal.id,
    labels: ["school: math", "school: geography"],
    priority: 4,
    due: nextWeek,
  })

  return s.raw()
}

/** Newest tasker-export-*.json in the export directory, newest first. */
export function newestExport(dir: string = exportsDir()): string | null {
  if (!existsSync(dir)) return null
  let best: string | null = null
  let bestMtime = 0
  for (const name of readdirSync(dir)) {
    if (!name.startsWith("tasker-export-") || !name.endsWith(".json")) continue
    const full = join(dir, name)
    try {
      const info = statSync(full)
      if (!info.isFile()) continue
      if (info.mtimeMs > bestMtime) {
        best = full
        bestMtime = info.mtimeMs
      }
    } catch {
      // raced with a delete; ignore
    }
  }
  return best
}

/** Directory exports are written to: ~/Downloads. */
export function exportsDir(): string {
  return join(homedir(), "Downloads")
}

export type { Priority }
