// Civil (time-of-day-free) dates. tasker stores dates as "YYYY-MM-DD" so that
// a task due today means the same thing in every timezone-aware machine. All
// arithmetic happens in UTC to keep daylight-saving transitions out of it.

export interface CivilDate {
  y: number
  m: number // 1..12
  d: number // 1..31
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const pad = (n: number): string => String(n).padStart(2, "0")

export function isoOf(c: CivilDate): string {
  return `${String(c.y).padStart(4, "0")}-${pad(c.m)}-${pad(c.d)}`
}

export function civilOf(y: number, m: number, d: number): CivilDate {
  return { y, m, d }
}

export function parseIso(s: string | null | undefined): CivilDate | null {
  if (!s) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

export function civilOfLocalDate(date: Date): CivilDate {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}

export function todayCivil(now: Date = new Date()): CivilDate {
  return civilOfLocalDate(now)
}

export function todayIso(now: Date = new Date()): string {
  return isoOf(civilOfLocalDate(now))
}

function utc(c: CivilDate): Date {
  return new Date(Date.UTC(c.y, c.m - 1, c.d))
}

function fromUtc(date: Date): CivilDate {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

export function addDays(c: CivilDate, n: number): CivilDate {
  const d = utc(c)
  d.setUTCDate(d.getUTCDate() + n)
  return fromUtc(d)
}

export function addMonths(c: CivilDate, n: number): CivilDate {
  const d = utc(c)
  d.setUTCMonth(d.getUTCMonth() + n)
  return fromUtc(d)
}

export function addYears(c: CivilDate, n: number): CivilDate {
  const d = utc(c)
  d.setUTCFullYear(d.getUTCFullYear() + n)
  return fromUtc(d)
}

export function addDaysIso(iso: string, n: number): string {
  const c = parseIso(iso)
  return c ? isoOf(addDays(c, n)) : iso
}

export function dayOfWeek(c: CivilDate): number {
  return utc(c).getUTCDay() // 0 = Sunday
}

export function daysFrom(a: CivilDate, b: CivilDate): number {
  return Math.round((utc(a).getTime() - utc(b).getTime()) / 86_400_000)
}

export function compareDates(a: CivilDate, b: CivilDate): number {
  return utc(a).getTime() - utc(b).getTime()
}

export function isBefore(a: CivilDate, b: CivilDate): boolean {
  return compareDates(a, b) < 0
}

export function isAfter(a: CivilDate, b: CivilDate): boolean {
  return compareDates(a, b) > 0
}

export function sameDate(a: CivilDate, b: CivilDate): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d
}

export function weekdayName(c: CivilDate): string {
  return WEEKDAYS[dayOfWeek(c)] ?? ""
}

export function monthName(m: number): string {
  return MONTHS[m - 1] ?? ""
}

/** "Today", "Tomorrow", "Yesterday", else "Mon, Jan 2" (with a year when different). */
export function humanDate(iso: string, today: string): string {
  const c = parseIso(iso)
  const t = parseIso(today)
  if (!c || !t) return iso
  const delta = daysFrom(c, t)
  if (delta === 0) return "Today"
  if (delta === 1) return "Tomorrow"
  if (delta === -1) return "Yesterday"
  const base = `${weekdayName(c)}, ${monthName(c.m)} ${c.d}`
  return c.y !== t.y ? `${base} ${c.y}` : base
}

/** Compact date for dense rows: "Today", "Tomorrow", "Jan 2", "Jan 2 27". */
export function shortDate(iso: string, today: string): string {
  const c = parseIso(iso)
  const t = parseIso(today)
  if (!c || !t) return iso
  const delta = daysFrom(c, t)
  if (delta === 0) return "Today"
  if (delta === 1) return "Tomorrow"
  if (delta === -1) return "Yesterday"
  const base = `${monthName(c.m)} ${c.d}`
  return c.y !== t.y ? `${base} ${String(c.y).slice(2)}` : base
}

/** True when iso parses to a real calendar date. */
export function isValidIso(s: string): boolean {
  const c = parseIso(s)
  if (!c) return false
  const d = utc(c)
  return d.getUTCFullYear() === c.y && d.getUTCMonth() + 1 === c.m && d.getUTCDate() === c.d
}
