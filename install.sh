#!/bin/sh
# tasker-installer.sh - install script for tasker (gbsaito/tasker)
#
# Install tasker with the one-liner:
#   curl -fsSL https://raw.githubusercontent.com/gbsaito/tasker/main/install.sh | sh
#
# Or pin a version:
#   TASKER_VERSION=v2.0.0 curl -fsSL https://raw.githubusercontent.com/gbsaito/tasker/v2.0.0/install.sh | sh
#
# The script detects the platform, downloads the release archive from GitHub
# Releases, verifies its sha256 checksum, and installs the binary.

set -eu

APP_NAME="tasker"
APP_REPO="gbsaito/tasker"

INSTALL_DIR="${TASKER_INSTALL_DIR:-${HOME}/.local/bin}"

VERSION=""
NO_MODIFY_PATH="${TASKER_NO_MODIFY_PATH:-0}"
QUIET="${TASKER_INSTALL_QUIET:-0}"
VERBOSE="${TASKER_INSTALL_VERBOSE:-0}"

DETECTED=""
RESOLVED_VERSION=""

say() { if [ "$QUIET" != "1" ]; then echo "$1"; fi; }
say_verbose() { if [ "$VERBOSE" = "1" ]; then echo "$1"; fi; }
err() { echo "tasker-installer: ERROR: $1" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || err "need '$1' (command not found)"; }

usage() {
    cat <<EOF
tasker-installer.sh

The installer for tasker

This script detects what platform you're on and fetches an appropriate archive
from https://github.com/${APP_REPO}/releases
then unpacks the binaries and installs them to

    $INSTALL_DIR

It will then add that dir to PATH by adding the appropriate line to your shell
profiles.

USAGE:
    tasker-installer.sh [OPTIONS]

OPTIONS:
    -v, --verbose         Enable verbose output
    -q, --quiet           Disable progress output
        --no-modify-path  Don't configure the PATH environment variable
    -h, --help            Print help information
        --version <v>     Release version to install (default: latest)
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
        -v|--verbose)
            VERBOSE=1
            ;;
        --no-modify-path)
            NO_MODIFY_PATH=1
            ;;
        --version)
            [ $# -ge 2 ] || err "--version requires a value"
            VERSION="$2"
            shift
            ;;
        --version=*)
            VERSION="${1#--version=}"
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

detect_platform() {
    _os="$(uname -s)"
    _arch="$(uname -m)"
    case "$_os" in
        Linux) _os="linux" ;;
        Darwin) _os="darwin" ;;
        *) err "unsupported OS: $_os" ;;
    esac
    case "$_arch" in
        x86_64|amd64) _arch="x86_64" ;;
        aarch64|arm64) _arch="aarch64" ;;
        *) err "unsupported architecture: $_arch" ;;
    esac
    DETECTED="${_arch}-${_os}"
}

resolve_version() {
    if [ -n "$VERSION" ]; then
        RESOLVED_VERSION="$VERSION"
        return
    fi
    need_cmd curl
    _tag="$(
        curl -fsSL "https://api.github.com/repos/${APP_REPO}/releases/latest" |
        grep -o '"tag_name": *"[^"]*"' | head -n 1 | cut -d '"' -f 4
    )"
    if [ -z "$_tag" ]; then
        err "could not resolve the latest release tag of ${APP_REPO}"
    fi
    RESOLVED_VERSION="$_tag"
}

install() {
    detect_platform
    resolve_version

    VER="${RESOLVED_VERSION#v}"
    case "$DETECTED" in
        x86_64-linux)   TRIPLE="x86_64-unknown-linux-gnu" ;;
        aarch64-linux)  TRIPLE="aarch64-unknown-linux-gnu" ;;
        x86_64-darwin)  TRIPLE="x86_64-apple-darwin" ;;
        aarch64-darwin) TRIPLE="aarch64-apple-darwin" ;;
        *) err "no release asset mapping for platform ${DETECTED}" ;;
    esac

    ASSET="tasker-v${VER}-${TRIPLE}.tar.gz"
    DOWNLOAD_URL="https://github.com/${APP_REPO}/releases/download/${RESOLVED_VERSION}/${ASSET}"
    CHECKSUMS_URL="https://github.com/${APP_REPO}/releases/download/${RESOLVED_VERSION}/checksums.txt"
    TASKER_BIN_NAME="tasker"

    TMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TMP_DIR"' EXIT
    ARCHIVE="$TMP_DIR/tasker.tar.gz"
    say "downloading tasker ${RESOLVED_VERSION} (${DETECTED})"
    say_verbose "  url: $DOWNLOAD_URL"
    curl --proto '=https' --tlsv1.2 -LsSf "$DOWNLOAD_URL" -o "$ARCHIVE"

    CALC=""
    if command -v sha256sum >/dev/null 2>&1; then
        CALC="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
        CALC="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
    fi
    if [ -n "$CALC" ]; then
        EXPECTED="$(curl -fsSL "$CHECKSUMS_URL" | awk -v f="$ASSET" '$2 == f { print $1 }' | head -n 1)"
        if [ -n "$EXPECTED" ] && [ "$EXPECTED" != "$CALC" ]; then
            err "checksum mismatch for ${ASSET}: want ${EXPECTED}, got ${CALC}"
        fi
    fi

    say "extracting"
    tar xf "$ARCHIVE" -C "$TMP_DIR"
    TASKER_BIN="$(find "$TMP_DIR" -type f -name "$TASKER_BIN_NAME" | head -n 1)"
    if [ -z "$TASKER_BIN" ]; then
        err "archive did not contain a '${TASKER_BIN_NAME}' binary"
    fi
    chmod +x "$TASKER_BIN"

    say "installing to $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    mv "$TASKER_BIN" "$INSTALL_DIR/$TASKER_BIN_NAME"
    chmod +x "$INSTALL_DIR/$TASKER_BIN_NAME"

    if [ "$NO_MODIFY_PATH" = "1" ]; then
        say "PATH configuration skipped (--no-modify-path)"
    else
        case ":$PATH:" in
            *":$INSTALL_DIR:"*)
                say "$INSTALL_DIR already on PATH"
                ;;
            *)
                ENV_DIR="$HOME/.tasker-install"
                ENV_FILE="$ENV_DIR/env.sh"
                mkdir -p "$ENV_DIR"
                if [ ! -f "$ENV_FILE" ]; then
                    cat > "$ENV_FILE" <<EOF
#!/bin/sh
# tasker PATH entry - generated by tasker-installer
case ":\${PATH}:" in
    *":$INSTALL_DIR":*) ;;
    *) export PATH="$INSTALL_DIR:\$PATH" ;;
esac
EOF
                    chmod +x "$ENV_FILE"
                fi
                RC_TARGET=""
                for rc in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.zshrc" "$HOME/.zshenv"; do
                    if [ -f "$rc" ]; then
                        RC_TARGET="$rc"
                        break
                    fi
                done
                if [ -n "$RC_TARGET" ]; then
                    printf '%s\n' '. "$HOME/.tasker-install/env.sh"' >> "$RC_TARGET"
                else
                    printf '%s\n' '. "$HOME/.tasker-install/env.sh"' > "$HOME/.profile"
                fi
                say "added tasker to PATH via $ENV_FILE"
                say "restart your shell or run: . $HOME/.tasker-install/env.sh"
                ;;
        esac
    fi
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    usage
    exit 0
fi

install

say "tasker ${RESOLVED_VERSION} installed to ${INSTALL_DIR}/$TASKER_BIN_NAME"
