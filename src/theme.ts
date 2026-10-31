// Two complete palettes rather than runtime colour arithmetic, so every pane
// stays opaque and legible on both dark and light terminals.

export interface Theme {
  mode: "dark" | "light"
  base: string
  surface: string
  raised: string
  border: string
  text: string
  subtle: string
  faint: string
  accent: string
  accentSoft: string
  selBg: string
  selDim: string
  link: string
  due: string
  overdue: string
  deadline: string
  overlay: string
}

const dark: Theme = {
  mode: "dark",
  base: "#0f1012",
  surface: "#17181b",
  raised: "#202226",
  border: "#2c2e33",
  text: "#e9e9e9",
  subtle: "#a3a3a3",
  faint: "#6f7278",
  accent: "#e25445",
  accentSoft: "#ff8a7d",
  selBg: "#33363c",
  selDim: "#24262a",
  link: "#6ea8fe",
  due: "#7ecc49",
  overdue: "#ff6b5e",
  deadline: "#e0b13a",
  overlay: "#00000099",
}

const light: Theme = {
  mode: "light",
  base: "#ffffff",
  surface: "#f3f3f1",
  raised: "#e9e9e6",
  border: "#d7d7d2",
  text: "#1f1f1f",
  subtle: "#61615c",
  faint: "#97978f",
  accent: "#b03a2e",
  accentSoft: "#8f2f25",
  selBg: "#d8d8d2",
  selDim: "#e8e8e3",
  link: "#1a56b8",
  due: "#1f7a1f",
  overdue: "#b03a2e",
  deadline: "#8a6d00",
  overlay: "#00000044",
}

export function themeFor(mode: "dark" | "light"): Theme {
  return mode === "light" ? light : dark
}

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16)
}

function mix(a: string, b: string, amount: number): string {
  const parts = [1, 3, 5].map((offset) => {
    const value = Math.round(channel(a, offset) * (1 - amount) + channel(b, offset) * amount)
    return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")
  })
  return `#${parts.join("")}`
}

/** Re-colour a theme around a new accent, deriving the softer tint from it. */
export function themeWithAccent(base: Theme, accent: string): Theme {
  if (accent.toLowerCase() === base.accent.toLowerCase()) return base
  return { ...base, accent, accentSoft: mix(accent, base.text, 0.35) }
}

export const GLYPHS = {
  /** The three top-level views share one shape; colour carries the meaning. */
  nav: "◆",
  project: "●",
  label: "@",
  group: "▪",
  note: "-",
  done: "✓",
  todo: "○",
  due: "⚑",
  deadline: "⚐",
} as const
