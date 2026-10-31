// Domain types mirroring the Todoist vocabulary tasker has always used:
// projects contain sections, tasks belong to a project (and optionally a
// section), carry coloured labels ("tags" in the UI), a due date, a separate
// deadline, and a P1..P4 priority.
//
// Dates are civil "YYYY-MM-DD" strings on the wire and in memory. Keeping the
// JSON shape identical to tasker v1 means an existing tasker.json opens
// unchanged.

export type Priority = 1 | 2 | 3 | 4

export interface Task {
  id: string
  content: string
  description?: string
  project_id: string
  section_id?: string
  labels?: string[]
  due?: string
  deadline?: string
  priority: Priority
  done: boolean
  note?: boolean
  completed_at?: string
  created_at: string
  order: number
}

export interface Project {
  id: string
  name: string
  color: string
  order: number
  inbox?: boolean
}

export interface Section {
  id: string
  name: string
  project_id: string
  order: number
}

export interface Tag {
  name: string
  color: string
}

export interface DB {
  projects: Project[]
  sections: Section[]
  tags: Tag[]
  tasks: Task[]
  seq: number
}

export const P1: Priority = 1
export const P2: Priority = 2
export const P3: Priority = 3
export const P4: Priority = 4

export function parsePriority(n: number): Priority {
  if (n <= 1) return P1
  if (n === 2) return P2
  if (n === 3) return P3
  return P4
}

export function priorityName(p: Priority): string {
  return `P${p}`
}

export function priorityColor(p: Priority): string {
  switch (p) {
    case P1:
      return "#dc4c3e"
    case P2:
      return "#eb8909"
    case P3:
      return "#246fe0"
    default:
      return "#808080"
  }
}

export function isOverdue(task: Task, today: string): boolean {
  return !task.done && !task.note && !!task.due && task.due < today
}

// Palette mirrors Todoist's label colours.
export const PALETTE = [
  "#dc4c3e",
  "#eb8909",
  "#ff9a14",
  "#febf14",
  "#ebd40e",
  "#b8d920",
  "#7ecc49",
  "#38c1a5",
  "#14aaf5",
  "#4073ff",
  "#a970ff",
  "#e05194",
  "#ff8d85",
  "#b8860b",
  "#808080",
  "#a8a8a8",
  "#c9a07a",
] as const

export const INBOX_BLUE = "#246fe0"
