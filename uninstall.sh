#!/bin/sh
# tasker-uninstall.sh - uninstall tasker (gbsaito/tasker)
#
# Remove tasker installed by install.sh:
#   curl -fsSL https://raw.githubusercontent.com/gbsaito/tasker/main/uninstall.sh | sh
#
# Removes the binary, the PATH helper and the shell rc line. Task data is left
# untouched at ${XDG_CONFIG_HOME:-~/.config}/tasker/tasker.json.

set -eu

APP_NAME="tasker"
INSTALL_DIR="${TASKER_INSTALL_DIR:-${HOME}/.local/bin}"
ENV_DIR="$HOME/.tasker-install"
ENV_FILE="$ENV_DIR/env.sh"
RC_LINE='. "$HOME/.tasker-install/env.sh"'
QUIET="${TASKER_UNINSTALL_QUIET:-0}"

say() { if [ "$QUIET" != "1" ]; then echo "$1"; fi; }
err() { echo "tasker-uninstaller: ERROR: $1" >&2; exit 1; }

usage() {
    cat <<EOF
tasker-uninstall.sh

Removes tasker installed by tasker-installer.sh:

    binary        ${INSTALL_DIR}/tasker
    PATH helper   ${ENV_FILE}
    shell line    ${RC_LINE}

Task data is left untouched:
    \${XDG_CONFIG_HOME:-~/.config}/tasker/tasker.json

If tasker was installed to a custom directory, set TASKER_INSTALL_DIR to the
same value used during installation.

USAGE:
    tasker-uninstall.sh [OPTIONS]

OPTIONS:
    -q, --quiet     Disable progress output
    -h, --help      Print help information
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -q|--quiet)
            QUIET=1
            ;;
        -*)
            err "unknown option $1"
            ;;
        *)
            err "unexpected argument $1"
            ;;
    esac
    shift
done

BIN="${INSTALL_DIR}/${APP_NAME}"

if [ -e "$BIN" ]; then
    rm -f "$BIN"
    say "removed $BIN"
else
    say "no binary found at $BIN"
fi

if [ -e "$ENV_FILE" ]; then
    rm -f "$ENV_FILE"
    say "removed $ENV_FILE"
fi
if [ -d "$ENV_DIR" ]; then
    rmdir "$ENV_DIR" 2>/dev/null || true
fi

for rc in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.zshrc" "$HOME/.zshenv"; do
    [ -f "$rc" ] || continue
    if grep -Fqx "$RC_LINE" "$rc"; then
        TMP_FILE="$(mktemp)"
        grep -vF "$RC_LINE" "$rc" > "$TMP_FILE" || true
        cat "$TMP_FILE" > "$rc"
        rm -f "$TMP_FILE"
        say "removed PATH line from $rc"
    fi
done

say "tasker uninstalled"
say "task data kept at ${XDG_CONFIG_HOME:-$HOME/.config}/tasker/tasker.json"
