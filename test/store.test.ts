// Store lifecycle tests ported from tasker v1: notes are not tasks, sections
// survive renames, namespaces rewrite their tags, and export/import merges by
// name while replace swaps the whole document.

import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Store, canonicalTagName, splitTagName } from "../src/store"

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "tasker-test-"))
}

function freshStore(): Store {
  return Store.open(join(tempDir(), "tasker.json"))
}

describe("tag names", () => {
  test("splits namespaces", () => {
    expect(splitTagName("math")).toEqual(["", "math"])
    expect(splitTagName("school: math")).toEqual(["school", "math"])
    expect(splitTagName("coding:fix")).toEqual(["coding", "fix"])
    expect(splitTagName("@school: math")).toEqual(["school", "math"])
    expect(splitTagName("school:")).toEqual(["", "school:"])
    expect(splitTagName("")).toEqual(["", ""])
  })

  test("canonicalises spellings", () => {
    expect(canonicalTagName("@Coding:Fix")).toBe("Coding: Fix")
    expect(canonicalTagName("school:math")).toBe("school: math")
    expect(canonicalTagName("school: math ")).toBe("school: math")
    expect(canonicalTagName("plain")).toBe("plain")
    expect(canonicalTagName("@plain")).toBe("plain")
    expect(canonicalTagName("school:")).toBe("school")
  })
})

describe("notes", () => {
  test("are excluded from Today and Upcoming", () => {
    const store = freshStore()
    const project = store.addProject("N", "")
    const today = new Date().toISOString().slice(0, 10)
    store.addTask({
      id: "",
      content: "task",
      project_id: project.id,
      due: today,
      priority: 4,
      done: false,
      created_at: new Date().toISOString(),
      order: 0,
    })
    store.addTask({
      id: "",
      content: "note",
      project_id: project.id,
      due: today,
      priority: 4,
      done: false,
      note: true,
      created_at: new Date().toISOString(),
      order: 0,
    })

    const mine = store.today(today).filter((task) => task.project_id === project.id)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.note).toBeFalsy()
    expect(store.upcoming(today, 7).filter((task) => task.project_id === project.id)).toHaveLength(0)
  })
})

describe("sections", () => {
  test("EnsureSection is idempotent", () => {
    const store = freshStore()
    const project = store.addProject("Test", "")
    const first = store.ensureSection(project.id, "Backlog")
    const again = store.ensureSection(project.id, "Backlog")
    expect(again.id).toBe(first.id)
    expect(store.sections(project.id)).toHaveLength(1)
  })

  test("renaming keeps tasks attached", () => {
    const store = freshStore()
    const project = store.addProject("Test", "")
    const section = store.ensureSection(project.id, "Backlog")
    store.addTask({
      id: "",
      content: "a",
      project_id: project.id,
      section_id: section.id,
      priority: 4,
      done: false,
      created_at: new Date().toISOString(),
      order: 0,
    })

    expect(store.renameSection(section.id, "Planned")).toBe(true)
    expect(store.sectionByName(project.id, "Planned")?.id).toBe(section.id)
    expect(store.tasks().some((task) => task.section_id === section.id)).toBe(true)
  })

  test("deleting clears the section but keeps the task in its project", () => {
    const store = freshStore()
    const project = store.addProject("Test", "")
    const section = store.ensureSection(project.id, "Backlog")
    const task = {
      id: "",
      content: "a",
      project_id: project.id,
      section_id: section.id,
      priority: 4 as const,
      done: false,
      created_at: new Date().toISOString(),
      order: 0,
    }
    store.addTask(task)

    expect(store.deleteSection(section.id)).toBe(true)
    expect(store.sectionById(section.id)).toBeUndefined()
    const kept = store.tasksInProject(project.id)
    expect(kept).toHaveLength(1)
    expect(kept[0]!.section_id).toBeUndefined()
    expect(store.deleteSection("nope")).toBe(false)
  })

  test("deleteSectionWithTasks removes the section and its tasks", () => {
    const store = freshStore()
    const project = store.addProject("Test", "")
    const section = store.ensureSection(project.id, "Backlog")
    const add = (content: string, sectionId?: string) =>
      store.addTask({
        id: "",
        content,
        project_id: project.id,
        section_id: sectionId,
        priority: 4,
        done: false,
        created_at: new Date().toISOString(),
        order: 0,
      })
    add("inside 1", section.id)
    add("inside 2", section.id)
    add("outside")

    expect(store.tasksInSection(section.id)).toHaveLength(2)
    expect(store.deleteSectionWithTasks(section.id)).toBe(2)
    expect(store.sectionById(section.id)).toBeUndefined()
    expect(store.tasksInSection(section.id)).toHaveLength(0)
    expect(store.tasksInProject(project.id).map((task) => task.content)).toEqual(["outside"])
    expect(store.deleteSectionWithTasks(section.id)).toBe(0)
  })
})

describe("tag namespaces", () => {
  function namespaceStore(): Store {
    const store = Store.fromDb({
      projects: [],
      sections: [],
      tags: [
        { name: "school: math", color: "#111111" },
        { name: "school: geography", color: "#111111" },
        { name: "coding: fix", color: "#222222" },
        { name: "errands", color: "#333333" },
      ],
      tasks: [
        {
          id: "1",
          content: "one",
          project_id: "",
          labels: ["school: math", "errands"],
          priority: 4,
          done: false,
          created_at: "",
          order: 0,
        },
        {
          id: "2",
          content: "two",
          project_id: "",
          labels: ["coding: fix"],
          priority: 4,
          done: false,
          created_at: "",
          order: 1,
        },
      ],
      seq: 10,
    })
    return store
  }

  test("groups are derived and sorted", () => {
    expect(namespaceStore().tagGroups()).toEqual(["coding", "school"])
  })

  test("tasks can be listed by group", () => {
    const store = namespaceStore()
    expect(store.tasksWithLabelGroup("school")).toHaveLength(1)
    expect(store.tasksWithLabelGroup("coding")).toHaveLength(1)
    expect(store.tasksWithLabelGroup("missing")).toHaveLength(0)
  })

  test("renaming a group rewrites tags and tasks", () => {
    const store = namespaceStore()
    store.renameTagGroup("coding", "dev")
    expect(store.tagByName("dev: fix")).toBeDefined()
    expect(store.taskById("2")!.labels).toEqual(["dev: fix"])
  })

  test("deleting and recolouring a group", () => {
    const store = namespaceStore()
    expect(store.deleteTagGroup("school")).toBe(2)
    expect(store.tagByName("school: math")).toBeUndefined()
    expect(store.taskById("1")!.labels).toEqual(["errands"])

    store.recolorTagGroup("coding", "#abcabc")
    for (const tag of store.tagsInGroup("coding")) expect(tag.color).toBe("#abcabc")
  })
})

describe("export and import", () => {
  test("round-trips projects, sections and labels", () => {
    const source = freshStore()
    const project = source.addProject("Alpha", "")
    const section = source.ensureSection(project.id, "Zed")
    const due = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    source.addTask({
      id: "",
      content: "one",
      project_id: project.id,
      section_id: section.id,
      due,
      labels: ["Urgent", "@urgent", "misc"],
      priority: 4,
      done: false,
      created_at: new Date().toISOString(),
      order: 0,
    })
    source.addTask({
      id: "",
      content: "done",
      project_id: project.id,
      priority: 4,
      done: true,
      created_at: new Date().toISOString(),
      order: 0,
    })

    const path = join(tempDir(), "export.json")
    source.exportTo(path)

    const target = freshStore()
    const count = target.importFile(path)
    expect(count).toBeGreaterThanOrEqual(2)

    const merged = target.projectByName("Alpha")
    expect(merged).toBeDefined()
    expect(target.sections(merged!.id).map((entry) => entry.name)).toEqual(["Zed"])
    const alpha = target.tasksInProject(merged!.id)
    expect(alpha).toHaveLength(2)
    expect(alpha.find((task) => task.content === "one")?.section_id).toBeDefined()
    expect(target.tasksWithLabel("urgent").length).toBeGreaterThan(0)
  })

  test("unknown projects land in the Inbox", () => {
    const target = freshStore()
    const path = join(tempDir(), "hand.json")
    writeFileSync(
      path,
      JSON.stringify({
        projects: [null, null],
        sections: null,
        tasks: [
          { id: "t99", content: "lost", project_id: "p-gone", created_at: "2024-05-05T00:00:00Z" },
          { id: "t98", content: "present", project_id: "", created_at: "2024-05-05T00:00:00Z" },
          null,
        ],
      }),
    )
    expect(target.importFile(path)).toBe(2)
    const inbox = target.inbox()!
    const contents = target.tasksInProject(inbox.id).map((task) => task.content)
    expect(contents).toContain("lost")
    expect(contents).toContain("present")
  })

  test("replace swaps the whole document", () => {
    const source = freshStore()
    const project = source.addProject("Alpha", "")
    source.addTask({
      id: "",
      content: "one",
      project_id: project.id,
      priority: 4,
      done: false,
      created_at: new Date().toISOString(),
      order: 0,
    })
    const path = join(tempDir(), "export.json")
    source.exportTo(path)

    const target = freshStore()
    target.addTask({
      id: "",
      content: "local-only",
      project_id: target.inbox()!.id,
      priority: 4,
      done: false,
      created_at: new Date().toISOString(),
      order: 0,
    })
    target.replaceFile(path)

    const contents = target.tasks().map((task) => task.content)
    expect(contents).toContain("one")
    expect(contents).not.toContain("local-only")
    expect(contents).toContain("Welcome to tasker — press ? for help")
  })

  test("missing files error", () => {
    expect(() => freshStore().importFile(join(tempDir(), "nope.json"))).toThrow()
  })

  test("save writes readable JSON beside the data file", () => {
    const path = join(tempDir(), "tasker.json")
    const store = Store.open(path)
    store.addProject("Saved", "")
    store.save()
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { projects: Array<{ name: string }> }
    expect(parsed.projects.some((project) => project.name === "Saved")).toBe(true)
  })
})
