import type { ScrollInfo } from "@opentui/core"

export type ScrollIntent = "up" | "down" | null

/**
 * Map a mouse scroll event onto a list navigation step. The OpenTUI parser
 * reports wheel events as `scroll` with a direction (`up`/`down`) and a delta;
 * only vertical scrolling drives list navigation, so horizontal scrolls and
 * events without direction info are ignored.
 */
export function scrollDelta(event: { scroll?: ScrollInfo } | null | undefined): number {
  const direction = event?.scroll?.direction
  if (direction === "down") return 1
  if (direction === "up") return -1
  return 0
}
