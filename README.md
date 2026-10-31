# tasker (OpenTUI rewrite)

A Todoist-style terminal task manager, rewritten from the original Go/Bubble Tea
implementation on top of [OpenTUI](https://github.com/anomalyco/opentui) and
React. It keeps the same JSON document shape, quick-add grammar and key
bindings as tasker v1, so an existing `tasker.json` opens unchanged.

Everything is local: one JSON file, no account and no network sync.

```
┌ tasker ──────────────────────────────────────────────────────────── Inbox ┐
│ ◆ Inbox        1   ○ Welcome to tasker — press ? for help                 │
│ ◆ Today        2                                                          │
│ ◆ Upcoming     2                                                          │
│                                                                           │
│ PROJECTS                                                                  │
│ ● Work         2                                                          │
│ ● Personal     1                                                          │
│                                                                           │
│ TAGS                                                                      │
│ ▪ coding       2                                                          │
│   @ docs       1                                                          │
│   @ fix                                                                   │
│ ▪ school       1                                                          │
│   @ math       1                                                          │
│                                                                           │
│ GENERAL                                                                   │
│ @ errands      1                                                          │
└───────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Views:** Inbox, Today (due today or overdue), Upcoming (next 7 days), plus
  one view per project, label and tag namespace.
- **Sidebar:** projects and labels grouped under headings; namespaced labels
  (`@group: label`) nest beneath a selectable namespace row.
- **Layout:** a navigation column, a word-wrapping task list and a read-only
  details pane. Side and centre panes use contrasting opaque colours, so the
  UI looks the same on any terminal background.
- **Projects & sections:** tasks belong to a project and optionally a section;
  project views group sectionless tasks first, then each section block.
- **Labels:** coloured Todoist-style labels. A label may be namespaced as
  `@group: label`; the namespace is derived from the label names.
- **Due dates vs. deadlines:** tracked separately. Deadlines never pull a task
  into Today.
- **Priorities:** P1–P4, with the familiar flag colours.
- **Notes:** free-form task descriptions. URLs render blue and as OSC 8
  hyperlinks; `o` opens the first link with the platform handler.
- **Undo / redo:** `u` and `ctrl+r` step through full document snapshots.
- **Manager:** `m` adds, renames, recolours and deletes projects, sections,
  labels and whole tag namespaces.
- **Quick add:** `#project`, `/section`, `@label`, `!p1`…`!p4` and natural
  language dates in one line, with a `#`, `/`, `@` autocomplete popup.
- **Persistence:** an atomic write to a single JSON document, guarded by a PID
  lock beside the file.

## Install

From GitHub Releases (prebuilt binary, one-liner):

```sh
curl -fsSL https://raw.githubusercontent.com/gbsaito/tasker/main/install.sh | sh
```

Pin a version:

```sh
TASKER_VERSION=v2.0.0 curl -fsSL https://raw.githubusercontent.com/gbsaito/tasker/v2.0.0/install.sh | sh
```

Options: `--version <v>`, `--no-modify-path`, `-v` / `-q` / `-h` (see
`install.sh --help`).

Manual install: download the archive for your platform from
<https://github.com/gbsaito/tasker/releases>, unpack it, and put the binary on
your PATH.

From source:

```sh
git clone https://github.com/gbsaito/tasker.git
cd tasker
bun install
bun run build                     # ./tasker
```

## Run

```sh
bun install
bun start                         # ~/.config/tasker/tasker.json
bun start -- --data ./my.json     # use a specific data file
```

Or build a standalone binary:

```sh
bun run build                     # ./tasker
```

`bun run dev` starts the same app in watch mode. `bun test` runs the unit tests
and `bun run typecheck` checks the TypeScript.

### Data location

`$XDG_CONFIG_HOME/tasker/tasker.json`, falling back to
`~/.config/tasker/tasker.json`. On first run the file is seeded with a
small demo workspace. If the data file already exists, it is read as-is; the
on-disk schema is byte-compatible with tasker v1.

## Key bindings

| Key | Action |
| :---- | :---- |
| `j` / `k` | move selection (sidebar or task list) |
| `h` / `l` | switch between the sidebar and the task list |
| `tab` / `shift+tab` | toggle sidebar ↔ task list |
| `a` | quick-add a task |
| `n` | quick-add a note |
| `enter` / `x` / `space` | toggle complete |
| `e` | edit the selected task — or a sidebar project/tag/namespace |
| `d` | delete the selected task (undoable) — or a sidebar project/tag/namespace (with confirmation) |
| `D` | delete the whole section the selected task belongs to (with confirmation) |
| `p` or `1`–`4` | cycle / set priority |
| `t` | set the due date to today |
| `o` | open the selected task's first `http(s)` link |
| `u` | undo |
| `ctrl+r` / `ctrl+y` | redo |
| `X` | delete all completed tasks (with confirmation) |
| `m` | manage projects, sections and labels |
| `C` | change the accent colour (saved in `tasker-settings.json`) |
| `E` / `I` | `E` exports all data to `~/Downloads/tasker-export-<timestamp>.json`; `I` opens the import panel to pick a file path and choose merge or replace |
| `N` / `T` / `s` | new project / new label / new section |
| `/` | filter the current view |
| `c` | show / hide completed tasks |
| `?` | help |
| `q` | quit |

The focused pane is indicated by an accent-coloured title and the full-strength
selection highlight; the other pane uses a dimmed highlight.

## Managing projects, sections and labels

Press `m`. The manager has three tabs, switched with `tab`:

| Key | Action |
| :---- | :---- |
| `j` / `k` | move within the list |
| `tab` | switch Projects / Sections / Tags |
| `a` | add a new entry |
| `e` / `enter` | edit the selected entry |
| `d` then `d`/`y` | delete the selected entry |
| `esc` | close |

In the editor, type the name, use `tab` / `shift+tab` to pick a colour, and
`enter` to save.

- Deleting a project removes its sections and tasks.
- Deleting a label removes it from every task.
- Deleting a section keeps its tasks in the project with the section cleared;
  pressing `D` on a task deletes the whole section and the tasks inside it.
- Renaming a tag namespace rewrites every label and task reference in one step.

## Quick-add syntax

| Syntax | Meaning |
| :---- | :---- |
| `#Project` | file under a project (created if new) |
| `/Section` | file under a project section |
| `@label` | add a coloured label |
| `@group: label` | namespaced label |
| `!p1` … `!p4` | set priority |
| `today`, `tod` | due today |
| `tom`, `tmr`, `tomorrow` | due tomorrow |
| `yesterday`, `yday` | due yesterday |
| `next week` / `next month` / `next year` | relative |
| `mon` … `sun`, `next mon` | the next such weekday |
| `in 3 days` / `in 2 weeks` | relative offset |
| `09/18`, `9-18`, `09/18/2027` | month/day |
| `18 sep`, `sep 18`, `18 sep 2027` | day and month |
| `2027-01-02` | ISO date |
| `due: friday` | explicit due date |
| `deadline: friday` | separate deadline field |

Examples:

```
Pay rent tomorrow #Home @bills !p1
Draft the spec deadline: friday #Work /Backlog
Renew passport in 3 weeks @errands
Fix the flaky test @coding: fix !p2
Revise chapter 4 @school: math tomorrow
```

Projects, sections and labels referenced in a quick-add line are created on the
fly when they do not exist.

## Project layout

| Path | Purpose |
| :---- | :---- |
| `src/index.tsx` | entry point: CLI args, data lock, renderer and React root |
| `src/app.tsx` | root component: state, key handling, layout and modal routing |
| `src/model.ts` | domain types: Task, Project, Section, Tag, Priority |
| `src/store.ts` | JSON persistence, CRUD, namespaces, transfer and the demo seed |
| `src/parse.ts` | quick-add grammar and natural-language dates |
| `src/dates.ts` | civil (time-of-day-free) date arithmetic |
| `src/rows.ts` | sidebar, list and manager view models |
| `src/suggest.ts` | quick-add autocomplete |
| `src/urls.ts` | URL extraction, tokenising and the platform opener |
| `src/lock.ts` | PID lock beside the data file |
| `src/theme.ts` | dark and light palettes plus glyphs |
| `src/components/` | OpenTUI React panes and modal components |
| `test/` | parser, store, rows, suggestion and date/URL tests |

## Design notes

- **Labels are Todoist labels.** A tag is modelled as a label with a hex
  colour; namespaces are derived from the label name by splitting on the first
  colon, so the document stays flat and old files keep working.
- **Due vs. deadline.** Only `due` affects Today and Upcoming.
- **Civil dates.** Dates are stored as `YYYY-MM-DD` and all arithmetic is done
  in UTC, so daylight-saving transitions cannot shift a task to another day.
- **Snapshots for history.** Undo/redo stores complete JSON snapshots rather
  than replaying operations, which keeps every mutation undoable with the same
  code path.
