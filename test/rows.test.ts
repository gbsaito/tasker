// View-model tests: section blocks in project views, upcoming date headers,
// sidebar navigation and the manager's flattened lists.

import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Task } from "../src/model"
import {
  MANAGE_PROJECTS,
  MANAGE_SECTIONS,
  MANAGE_TAGS,
  buildNav,
  buildRows,
  clampNavIndex,
  manageItems,
  moveNavIndex,
  nextTaskIndex,
  type ListRow,
} from "../src/rows"
import { Store } from "../src/store"

function freshStore(): Store {
  return Store.open(join(mkdtempSync(join(tmpdir(), "tasker-rows-")), "tasker.json"))
}

function task(content: string, projectId: string, sectionId?: string): Task {
  return {
    id: "",
    content,
    project_id: projectId,
    section_id: sectionId,
    priority: 4,
    done: false,
    created_at: new Date().toISOString(),
    order: 0,
  }
}

describe("project rows", () => {
  test("sectionless tasks come first, then each section block", () => {
    const store = freshStore()
    const project = store.addProject("P", "")
    const beta = store.ensureSection(project.id, "Beta")
    const alpha = store.ensureSection(project.id, "Alpha")

    store.addTask(task("b1", project.id, beta.id))
    store.addTask(task("free1", project.id))
    store.addTask(task("a1", project.id, alpha.id))
    store.addTask(task("free2", project.id))

    const rows = buildRows(store, { kind: "project", label: "P", id: project.id }, { today: "2026-09-16" })
    const rendered = rows.map((row) => (row.task ? row.task.content : `#${row.header}`))
    expect(rendered).toEqual(["free1", "free2", "#Beta", "b1", "#Alpha", "a1"])
  })

  test("a sectionless-only project is a plain list", () => {
    const store = freshStore()
    const project = store.addProject("P", "")
    store.addTask(task("one", project.id))
    const rows = buildRows(store, { kind: "project", label: "P", id: project.id })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.header).toBeUndefined()
    expect(rows[0]!.task?.content).toBe("one")
  })
})

describe("upcoming rows", () => {
  test("are grouped under date headers", () => {
    const store = freshStore()
    const project = store.addProject("P", "")
    const today = "2026-09-16"
    const first = task("today", project.id)
    first.due = "2026-09-16"
    const second = task("tomorrow", project.id)
    second.due = "2026-09-17"
    store.addTask(first)
    store.addTask(second)

    const rows = buildRows(store, { kind: "today", label: "Today", id: "" }, { today })
    expect(rows.map((row) => (row.task ? row.task.content : `#${row.header}`))).toEqual(["today"])

    const upcoming = buildRows(store, { kind: "upcoming", label: "Upcoming", id: "" }, { today })
    expect(upcoming).toHaveLength(2)
    expect(upcoming[0]!.header).toBe("Tomorrow")
    expect(upcoming[1]!.task?.content).toBe("tomorrow")
  })
})

describe("navigation helpers", () => {
  test("skip headings and clamp safely", () => {
    const store = freshStore()
    store.addProject("Work", "")
    store.ensureTag("errands")
    const nav = buildNav(store, "2026-09-16")
    const heading = nav.findIndex((item) => item.heading)
    expect(heading).toBeGreaterThan(0)

    expect(moveNavIndex(nav, nav.length - 1, 1)).toBe(nav.length - 1)
    expect(moveNavIndex(nav, 0, -1)).toBe(0)
    expect(clampNavIndex(nav, heading)).toBeLessThan(heading)
  })

  test("cursor movement skips header rows", () => {
    const rows: ListRow[] = [
      { key: "header", header: "S" },
      { key: "a", task: task("a", "") },
      { key: "b", task: task("b", "") },
    ]
    expect(nextTaskIndex(rows, -1, 1)).toBe(1)
    expect(nextTaskIndex(rows, 2, 1)).toBe(2)
    expect(nextTaskIndex(rows, 1, -1)).toBe(1)
  })
})

describe("manager rows", () => {
  test("list projects, sections and namespaced tags", () => {
    const store = freshStore()
    const work = store.addProject("Work", "")
    store.ensureSection(work.id, "Backlog")
    store.ensureTag("school: math")
    store.ensureTag("errands")

    expect(manageItems(store, MANAGE_PROJECTS).map((item) => item.name)).toContain("Work")

    const sections = manageItems(store, MANAGE_SECTIONS)
    expect(sections[0]!.group).toBe(true)
    expect(sections[0]!.name).toBe("Work")
    expect(sections[1]!.nested).toBe(true)
    expect(sections[1]!.name).toBe("Backlog")

    const tags = manageItems(store, MANAGE_TAGS)
    const group = tags.find((item) => item.group && item.name === "school")
    expect(group?.name).toBe("school")
    expect(tags.some((item) => item.nested && item.full === "school: math")).toBe(true)
    expect(tags.some((item) => item.full === "errands")).toBe(true)
  })
})
