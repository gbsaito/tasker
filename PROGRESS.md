# PROGRESS.md — tasker (OpenTUI rewrite)

## Done
- Added `uninstall.sh` (`curl -fsSL .../uninstall.sh | sh`): removes
  `~/.local/bin/tasker`, `~/.tasker-install/env.sh` and the sourced PATH line from
  the shell rc files, leaving task data untouched. Verified against a fake HOME
  (install twice -> no duplicate rc line; uninstall -> binary, env dir and rc line
  gone, rc content preserved).
- Hardened `install.sh`: checksum lookup now strips directory prefixes from
  `checksums.txt` entries and fails when the asset is missing from it; PATH env
  file is regenerated on reinstall and the rc line is only added once (2026-10-31).
- Added GitHub Releases installer script (`install.sh`) in abtop style: one-liner
  `curl -fsSL https://raw.githubusercontent.com/gbsaito/tasker/main/install.sh | sh`,
  version pin via `TASKER_VERSION=vX.Y.Z`, platform detect (linux/darwin x86_64/aarch64),
  download `tasker-v<ver>-<triple>.tar.gz` + `checksums.txt` sha256 verify, install to
  `~/.local/bin`, PATH via `~/.tasker-install/env.sh`. README + PLAN updated. Release
  workflow added (`.github/workflows/release.yml`) to build via `bun run build` and publish
  tarballs + checksums on `v*` tag (2026-10-31).
- Changed the default data path from `$XDG_DATA_HOME`/`~/.local/share` to
  `$XDG_CONFIG_HOME`/`~/.config`, matching the location the user asked for and
  where the real workspace already lives (2026-10-31). `defaultPath()` in
  `src/store.ts` now resolves `$XDG_CONFIG_HOME/tasker/tasker.json`, falling back
  to `~/.config/tasker/tasker.json`; the README data-location section was
  updated to match. Verified by opening the store: it reads the 28-task,
  3-project database (`Inbox`, `Arch Linux`, `Dorothea`) from
  `~/.config/tasker/tasker.json`. The stale `~/.local/share/tasker/` files were
  left in place as an untouched backup and are no longer read by the app.
- Fixed the `TypeError: dropLeft is not a function` crash when the quick-add
  suggestion dropdown opened (2026-10-29). A local `const dropLeft` inside
  `App` shadowed the module-level `dropLeft()` helper; the local was renamed to
  `dropLeftEdge`. The dropdown overlays now also paint an opaque
  `backgroundColor={theme.base}` and are 42 columns wide so the
  `↑/↓ pick · enter accept · esc dismiss` hint no longer bleeds into the modal
  text or wraps. `bun test` is 53 pass / 1 fail; the remaining failure
  (`suggestions > a lagging caret still opens the popup`) is a pre-existing
  mismatch between the substring filter and the test's expectation and is not
  related to this crash.
- Moved the top bar (tasker / path / task count / date) from the top of the layout
  to the empty bottom bar slot in tasker-opentui (2026-10-29).
- Merged the moved top bar and the hints footer into one bottom bar, toggled by
  the new `H` key between status content and hints (2026-10-29).
- Renamed PATH shim `~/.local/bin/otasker` → `~/.local/bin/tasker` so the command
  is just `tasker` (2026-10-29).
- Changed the default data path from `$XDG_DATA_HOME`/`~/.local/share` to
  `$XDG_CONFIG_HOME`/`~/.config`, matching the location the user asked for and
  where the real workspace already lives (2026-10-31). `defaultPath()` in
  `src/store.ts` now resolves `$XDG_CONFIG_HOME/tasker/tasker.json`, falling back
  to `~/.config/tasker/tasker.json`; the README data-location section was
  updated to match. Verified by opening the store: it reads the 28-task,
  3-project database (`Inbox`, `Arch Linux`, `Dorothea`) from
  `~/.config/tasker/tasker.json`. The stale `~/.local/share/tasker/` files were
  left in place as an untouched backup and are no longer read by the app.
- Exported data now goes to `~/Downloads/tasker-export-<timestamp>.json`
  (2026-10-31); `newestExport()` looks in `~/Downloads`. Export dir moved out of
  the data directory on purpose.
- Import is now a dedicated panel: `I` opens the path input + merge/replace
  choice modal, path typed with `~` expansion, enter runs the chosen mode,
  esc cancels (2026-10-31). Replaced the old `I`-via-delete-confirm flow.
  Panel covered by new `test/import-panel.test.tsx` (tab -> replace, enter ->
  replace, tasks from export file loaded).

## Current Task
- Edit autosuggestions now free-text: typing in Task/Project/Section/Labels
  fields auto-suggests entity matches, no sigil syntax required (Task title
  searches existing projects/sections/labels; Project → projects; Section → the
  task's sections; Labels → tags). Accept replaces the typed token with the
  pick and closes the dropdown. Verified headless (Task `#W`, Labels `@ur`) and
  real PTY (plain typing ` Wor` → `▸ Work`). Still awaiting user test.

## Fixes
- Edit task panel no longer auto-suggests in the Task field (the todo title is
  free text); autosuggestions now come only from the focused Project, Section or
  Labels field, using that field's own pool. The Task field used to fall through
  to a merged pool of all names (projects+sections+tags) and suggest on plain
  typing. `editCandidates` now returns `[]` for Task/Note fields and
  `refreshEditSuggestion` only allows fields [Project, Section, Labels].
  Edit-panel TUI tests updated accordingly (task field silent; project field
  dropdown via tab navigation). `bun test` back to 53 pass / 1 pre-existing fail.

## Next Moves
- User test: open task, move to Project/Section/Labels field (tab), type plain
  text, confirm autosuggestions appear, pick, accept; confirm Task field stays
  silent.

## Blocked / Open Questions
- The screenshot attached to the move request could not be read (this model does
  not support image input).
