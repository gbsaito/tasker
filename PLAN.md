# PLAN.md — tasker (OpenTUI rewrite)

## Objective
Terminal task manager (Todoist-style) rewritten from Go/Bubble Tea to OpenTUI +
React. Same JSON document shape, quick-add grammar and key bindings as tasker v1.

## Design Overview
- Three-pane layout: sidebar / task list / read-only details pane.
- Opaque painted panes; dark and light palettes plus accent override.
- Top bar: `tasker / <path> · <N tasks> · <date>`; footer: key hints.

## Features
- Views: Inbox, Today, Upcoming, plus one per project, label and tag namespace.
- Manager for projects/sections/labels; quick-add grammar; undo/redo; notes/URLs.

## User Decisions
- OpenTUI rewrite adopted per user request (2026-10-29).

## Phases
- none tracked yet.
