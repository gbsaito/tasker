// URL extraction and note-text tokenising.

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g

export interface TextToken {
  text: string
  url?: string
  tail?: string
}

/** Split a URL match from trailing sentence punctuation. */
export function trimUrlPunctuation(value: string): { url: string; tail: string } {
  let i = value.length
  while (i > 0 && ".,;:!?)".includes(value[i - 1]!)) i--
  return { url: value.slice(0, i), tail: value.slice(i) }
}

export function firstUrl(text: string | undefined): string {
  if (!text) return ""
  const match = text.match(/https?:\/\/[^\s<>"]+/)
  if (!match) return ""
  return trimUrlPunctuation(match[0]).url
}

/**
 * Turn free text into tokens preserving newlines, so the detail pane can draw
 * links differently from prose.
 */
export function tokenizeText(text: string): TextToken[] {
  const tokens: TextToken[] = []
  const re = new RegExp(URL_PATTERN.source, "g")
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) tokens.push({ text: text.slice(last, match.index) })
    const { url, tail } = trimUrlPunctuation(match[0])
    tokens.push({ text: url, url })
    if (tail) tokens.push({ text: tail })
    last = match.index + match[0].length
  }
  if (last < text.length) tokens.push({ text: text.slice(last) })
  return tokens
}

export function openUrl(url: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["rundll32", "url.dll,FileProtocolHandler", url]
        : ["xdg-open", url]
  try {
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore" }).unref()
  } catch {
    // The caller surfaces a status message when the platform has no handler.
  }
}
