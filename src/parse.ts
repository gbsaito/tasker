// Quick-add grammar: #project, @label (or @group: label), /section, !p1..!p4,
// plus natural-language dates. Dates are returned as civil ISO strings.

import type { Priority } from "./model"
import { P4, parsePriority } from "./model"
import {
  type CivilDate,
  addDays,
  addMonths,
  addYears,
  civilOf,
  dayOfWeek,
  isBefore,
  isoOf,
  todayCivil,
} from "./dates"

export interface QuickAddResult {
  content: string
  project: string
  section: string
  labels: string[]
  due?: string
  deadline?: string
  priority: Priority
  hasPriority: boolean
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
}

function fields(input: string): string[] {
  const trimmed = input.trim()
  return trimmed === "" ? [] : trimmed.split(/\s+/)
}

function stripTrailing(word: string): string {
  return word.replace(/[,.;:!?]+$/, "")
}

function cleanName(s: string): string {
  return s.replace(/^[,.;:!?"']+/, "").replace(/[,.;:!?"']+$/, "")
}

function atoiOK(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) ? n : null
}

function resolveYear(d: CivilDate, today: CivilDate): CivilDate {
  return isBefore(d, today) ? { ...d, y: d.y + 1 } : d
}

function weekdayOn(now: Date, target: number, allowToday: boolean): CivilDate {
  const today = todayCivil(now)
  let days = (target - dayOfWeek(today) + 7) % 7
  if (days === 0 && !allowToday) days = 7
  return addDays(today, days)
}

/** Parse a date phrase starting at words[i]. */
export function parseDatePhrase(
  words: string[],
  i: number,
  now: Date,
): { date: CivilDate; consumed: number } | null {
  const today = todayCivil(now)
  const at = (n: number): string => {
    const raw = words[i + n]
    return raw === undefined ? "" : stripTrailing(raw).toLowerCase()
  }
  const w0 = at(0)
  if (w0 === "") return null

  // "in N days|weeks|months"
  if (w0 === "in") {
    const n = atoiOK(at(1))
    if (n !== null) {
      const unit = at(2).replace(/s$/, "")
      if (unit === "day") return { date: addDays(today, n), consumed: 3 }
      if (unit === "week") return { date: addDays(today, 7 * n), consumed: 3 }
      if (unit === "month") return { date: addMonths(today, n), consumed: 3 }
    }
  }

  // "next week|month|year|<weekday>"
  if (w0 === "next") {
    switch (at(1)) {
      case "week":
        return { date: addDays(today, 7), consumed: 2 }
      case "month":
        return { date: addMonths(today, 1), consumed: 2 }
      case "year":
        return { date: addYears(today, 1), consumed: 2 }
    }
    const wd = WEEKDAYS[at(1)]
    if (wd !== undefined) return { date: weekdayOn(now, wd, false), consumed: 2 }
  }

  switch (w0) {
    case "today":
    case "tod":
      return { date: today, consumed: 1 }
    case "tomorrow":
    case "tom":
    case "tmr":
    case "tm":
    case "tomo":
      return { date: addDays(today, 1), consumed: 1 }
    case "yesterday":
    case "yday":
      return { date: addDays(today, -1), consumed: 1 }
  }

  const wd = WEEKDAYS[w0]
  if (wd !== undefined) return { date: weekdayOn(now, wd, true), consumed: 1 }

  // ISO date: YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w0)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { date: civilOf(y, m, d), consumed: 1 }
    }
  }

  // MM/DD or MM-DD (optionally MM/DD/YYYY)
  const slashed = slashDate(w0, today)
  if (slashed) return { date: slashed, consumed: 1 }

  // "18 sep" / "18 sep 2027"
  const dayNum = atoiOK(w0)
  if (dayNum !== null) {
    const month = MONTHS[at(1)]
    if (month !== undefined) {
      let year = today.y
      let consumed = 2
      const y = atoiOK(at(2))
      if (y !== null && y > 1000) {
        year = y
        consumed = 3
      }
      return { date: resolveYear(civilOf(year, month, dayNum), today), consumed }
    }
  }

  // "sep 18" / "sep 18 2027"
  const month = MONTHS[w0]
  if (month !== undefined) {
    const n = atoiOK(at(1))
    if (n !== null) {
      let year = today.y
      let consumed = 2
      const y = atoiOK(at(2))
      if (y !== null && y > 1000) {
        year = y
        consumed = 3
      }
      return { date: resolveYear(civilOf(year, month, n), today), consumed }
    }
  }

  return null
}

/** Parse a whole string as a date (used by the edit form). */
export function parseDate(input: string, now: Date = new Date()): CivilDate | null {
  const words = fields(input)
  if (words.length === 0) return null
  const hit = parseDatePhrase(words, 0, now)
  return hit && hit.consumed === words.length ? hit.date : null
}

function slashDate(word: string, today: CivilDate): CivilDate | null {
  const sep = word.includes("/") ? "/" : word.includes("-") ? "-" : ""
  if (!sep) return null
  const parts = word.split(sep)
  if (parts.length < 2 || parts.length > 3) return null
  const a = atoiOK(parts[0]!)
  const b = atoiOK(parts[1]!)
  if (a === null || b === null) return null
  let month = a
  let day = b
  if (month > 12 && day <= 12) {
    month = b
    day = a
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  let year = today.y
  if (parts.length === 3) {
    const y = atoiOK(parts[2]!)
    if (y !== null) year = y < 100 ? y + 2000 : y
  }
  const date = civilOf(year, month, day)
  return parts.length === 2 ? resolveYear(date, today) : date
}

export function parsePriorityToken(raw: string): Priority | null {
  let s = raw.replace(/^!+/, "")
  s = s.toLowerCase().replace(/^p/, "")
  const n = atoiOK(s)
  if (n === null || n < 1 || n > 4) return null
  return parsePriority(n)
}

function isPlainWord(w: string): boolean {
  if (w === "") return false
  if (["#", "@", "/", "!"].includes(w[0]!)) return false
  const low = stripTrailing(w).toLowerCase()
  if (low === "due:" || low === "deadline:") return false
  if (colonPrefix(w) !== null) return false
  return true
}

function readLabel(words: string[], i: number): { name: string; used: number } {
  const body = words[i]!.replace(/^@+/, "")
  const colon = body.indexOf(":")
  if (colon > 0) {
    const group = cleanName(body.slice(0, colon))
    if (group !== "") {
      const label = cleanName(body.slice(colon + 1))
      // A trailing colon means the label is the next word: "@school: math".
      if (label === "" && i + 1 < words.length && isPlainWord(words[i + 1]!)) {
        return { name: `${group}: ${cleanName(words[i + 1]!)}`, used: 2 }
      }
      if (label !== "") return { name: `${group}: ${label}`, used: 1 }
      return { name: "", used: 1 }
    }
  }
  return { name: cleanName(body), used: 1 }
}

/** Recognise "due:" / "deadline:" glued to a date, e.g. "deadline:18sep". */
function colonPrefix(raw: string): "due" | "deadline" | null {
  const idx = raw.indexOf(":")
  if (idx <= 0) return null
  const prefix = raw.slice(0, idx).toLowerCase()
  return prefix === "due" || prefix === "deadline" ? prefix : null
}

/** Parse one quick-add line relative to now. */
export function quickAdd(input: string, now: Date = new Date()): QuickAddResult {
  const words = fields(input)
  const result: QuickAddResult = {
    content: "",
    project: "",
    section: "",
    labels: [],
    priority: P4,
    hasPriority: false,
  }
  const addLabel = (name: string): void => {
    if (name === "") return
    if (result.labels.some((l) => l.toLowerCase() === name.toLowerCase())) return
    result.labels.push(name)
  }

  const content: string[] = []
  let pending: "due" | "deadline" | "" = ""

  for (let i = 0; i < words.length; i++) {
    const raw = words[i]!
    const low = stripTrailing(raw).toLowerCase()

    if (low === "due:" || low === "deadline:") {
      pending = low.slice(0, -1) as "due" | "deadline"
      continue
    }

    const prefix = colonPrefix(raw)
    if (prefix !== null) {
      pending = prefix
      const rest = raw.slice(raw.indexOf(":") + 1)
      if (rest === "") continue
      words[i] = rest
      i--
      continue
    }

    if (raw.startsWith("@") && raw.length > 1) {
      const { name, used } = readLabel(words, i)
      addLabel(name)
      i += used - 1
      continue
    }
    if (raw.startsWith("#") && raw.length > 1) {
      const name = cleanName(raw.slice(1))
      if (name !== "") result.project = name
      continue
    }
    if (raw.startsWith("/") && raw.length > 1) {
      const name = cleanName(raw.slice(1))
      if (name !== "") result.section = name
      continue
    }
    if (raw.startsWith("!")) {
      const p = parsePriorityToken(raw)
      if (p !== null) {
        result.priority = p
        result.hasPriority = true
        continue
      }
    }

    const date = parseDatePhrase(words, i, now)
    if (date) {
      if (pending === "deadline") result.deadline = isoOf(date.date)
      else result.due = isoOf(date.date)
      pending = ""
      i += date.consumed - 1
      continue
    }

    content.push(raw)
  }

  result.content = content.join(" ")
  return result
}
