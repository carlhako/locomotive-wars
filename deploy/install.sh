#!/usr/bin/env bash
# Locomotive Wars installer for a Debian (or Debian-based) server or LXC container.
#
# Creates the service user, installs Node.js from nodejs.org (the major version the release's
# .nvmrc names; Debian's own nodejs is too old), downloads the latest release from GitHub,
# installs its production dependencies, writes a config on first install, and installs and
# enables locomotive-wars.service so the game starts on boot.
#
# Re-running it upgrades in place: a newer release or Node.js patch is installed beside the
# running one and swapped in; if the new version does not come up, the previous one is restored.
# The config and the high score table are left alone. Nothing is restarted when nothing changed.
#
# Usage (as root; a fresh Debian LXC lacks curl, so `apt-get install -y curl` first):
#   curl -fsSL https://raw.githubusercontent.com/carlhako/locomotive-wars/main/deploy/install.sh | bash
#
# Options, as environment variables:
#   RELEASE_TAG=v0.3.0                  install that release instead of the latest (also downgrades)
#   LW_TARBALL=/path/to/locomotive-wars-X.Y.Z.tar.gz   install a local release package
#   LW_IMPORT_HIGHSCORES=<url or file>  merge another server's high scores into this one: either the
#                                       URL of its table (http://old-host:8080/api/highscores) or a
#                                       copy of its highscores.json. Safe to repeat.
#   LW_FORCE=1                          reinstall and restart even when already up to date
#
# Layout:
#   /opt/locomotive-wars/current -> releases/<version>     the game (root-owned, read-only to it)
#   /opt/locomotive-wars/node/current -> v<node version>   Node.js
#   /etc/locomotive-wars/config.json                       config (see the README for the keys)
#   /etc/locomotive-wars/env                               optional environment, e.g. PORT=8080
#   /var/lib/locomotive-wars/highscores.json               the high score table

set -euo pipefail

REPO="${LW_REPO:-carlhako/locomotive-wars}"
RELEASE_TAG="${RELEASE_TAG:-latest}"
SERVICE=locomotive-wars
SERVICE_USER=locomotive-wars
PREFIX=/opt/locomotive-wars
CONF_DIR=/etc/locomotive-wars
CONFIG="$CONF_DIR/config.json"
STATE_DIR=/var/lib/locomotive-wars
UNIT="/etc/systemd/system/$SERVICE.service"

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!! \033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mXX \033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root"
command -v apt-get >/dev/null || die "this installer needs a Debian-based system (apt-get not found)"
command -v systemctl >/dev/null || die "this installer needs systemd (systemctl not found)"
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "LW_REPO must look like owner/name"

case "$(uname -m)" in
  x86_64|amd64)  node_arch=x64 ;;
  aarch64|arm64) node_arch=arm64 ;;
  armv7l)        node_arch=armv7l ;;
  *) die "unsupported architecture $(uname -m)" ;;
esac

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

# --- packages ----------------------------------------------------------------
missing=()
for cmd in curl tar gzip sha256sum; do command -v "$cmd" >/dev/null || missing+=("$cmd"); done
[ -e /etc/ssl/certs/ca-certificates.crt ] || missing+=(ca-certificates)
if [ "${#missing[@]}" -gt 0 ]; then
  log "installing curl, ca-certificates, tar, gzip"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates tar gzip coreutils >/dev/null
fi

# --- service user --------------------------------------------------------------
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  log "creating service user '$SERVICE_USER'"
  useradd --system --user-group --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# --- which release -------------------------------------------------------------
version_of() { sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$1" 2>/dev/null | head -n1; }

installed_version=""
[ -f "$PREFIX/current/package.json" ] && installed_version="$(version_of "$PREFIX/current/package.json")"

if [ -n "${LW_TARBALL:-}" ]; then
  [ -f "$LW_TARBALL" ] || die "LW_TARBALL: no such file $LW_TARBALL"
  tarball="$LW_TARBALL"
  top="$(tar -tzf "$tarball" | sed -n '1s|/.*||p')"
  target_version="${top#locomotive-wars-}"
else
  if [ "$RELEASE_TAG" = "latest" ]; then
    # The latest-release page redirects to .../releases/tag/<tag>; no API call or JSON parser needed.
    tag="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")" \
      || die "could not reach GitHub to find the latest release"
    tag="${tag##*/}"
    [[ "$tag" =~ ^v[0-9] ]] || die "could not find the latest release of $REPO"
  else
    tag="v${RELEASE_TAG#v}"
  fi
  target_version="${tag#v}"
  tarball=""
fi
[[ "$target_version" =~ ^[0-9A-Za-z.+-]+$ ]] || die "unexpected release version '$target_version'"

app_changed=0
if [ "$installed_version" != "$target_version" ] || [ -n "${LW_FORCE:-}" ]; then
  app_changed=1
fi

if [ "$app_changed" -eq 1 ]; then
  if [ -z "$tarball" ]; then
    url="https://github.com/$REPO/releases/download/$tag/locomotive-wars-$target_version.tar.gz"
    log "downloading Locomotive Wars $target_version"
    curl -fsSL "$url" -o "$work/release.tar.gz" || die "could not download $url"
    tarball="$work/release.tar.gz"
  fi
  tar -xzf "$tarball" -C "$work" --no-same-owner
  src="$work/locomotive-wars-$target_version"
  [ -f "$src/packages/server/dist/main.js" ] || die "release package has no built server"
  nvmrc="$src/.nvmrc"
else
  log "Locomotive Wars $installed_version is the latest release"
  nvmrc="$PREFIX/current/.nvmrc"
fi

# --- Node.js -------------------------------------------------------------------
node_major="$(sed -nE '1s/^v?([0-9]+).*/\1/p' "$nvmrc" 2>/dev/null || true)"
node_major="${node_major:-22}"
old_node="$(readlink "$PREFIX/node/current" 2>/dev/null || true)"
node_dir="$old_node"

if curl -fsSL "https://nodejs.org/dist/latest-v${node_major}.x/SHASUMS256.txt" -o "$work/SHASUMS256.txt"; then
  node_file="$(grep -oE "node-v[0-9.]+-linux-${node_arch}\.tar\.gz" "$work/SHASUMS256.txt" | head -n1)"
  [ -n "$node_file" ] || die "nodejs.org has no Node.js $node_major build for linux-$node_arch"
  node_version="$(echo "$node_file" | sed -E 's/^node-(v[0-9.]+)-.*/\1/')"
  node_dir="$node_version"
  if [ ! -x "$PREFIX/node/$node_version/bin/node" ]; then
    log "installing Node.js $node_version"
    curl -fsSL "https://nodejs.org/dist/$node_version/$node_file" -o "$work/$node_file" \
      || die "could not download Node.js $node_version"
    (cd "$work" && grep " $node_file\$" SHASUMS256.txt | sha256sum -c --quiet -) \
      || die "Node.js download failed its checksum"
    mkdir -p "$PREFIX/node"
    rm -rf "$PREFIX/node/$node_version.new"
    mkdir "$PREFIX/node/$node_version.new"
    tar -xzf "$work/$node_file" -C "$PREFIX/node/$node_version.new" --strip-components=1 --no-same-owner
    mv "$PREFIX/node/$node_version.new" "$PREFIX/node/$node_version"
  fi
elif [ -n "$old_node" ]; then
  warn "could not reach nodejs.org; keeping Node.js $old_node"
else
  die "could not reach nodejs.org to download Node.js $node_major"
fi
node_bin="$PREFIX/node/$node_dir/bin"
node_changed=0
[ "$node_dir" != "$old_node" ] && node_changed=1

# --- the game ------------------------------------------------------------------
old_app="$(readlink "$PREFIX/current" 2>/dev/null || true)"
new_app="$old_app"
if [ "$app_changed" -eq 1 ]; then
  new_app="releases/$target_version"
  dest="$PREFIX/$new_app"
  if [ "$new_app" = "$old_app" ]; then
    # Forced reinstall of the running version: build beside it and swap in after the stop.
    dest="$PREFIX/releases/$target_version.new"
  fi
  log "installing Locomotive Wars $target_version to $PREFIX/releases/$target_version"
  mkdir -p "$PREFIX/releases"
  rm -rf "$dest"
  cp -a "$src" "$dest"
  chown -R root:root "$dest"
  (cd "$dest" && PATH="$node_bin:$PATH" npm ci --omit=dev --ignore-scripts --no-audit --no-fund --no-update-notifier \
      --loglevel=error --cache "$work/npm-cache") \
    || { rm -rf "$dest"; die "could not install the game's dependencies"; }
fi

# --- config --------------------------------------------------------------------
install -d -m 0750 -o root -g "$SERVICE_USER" "$CONF_DIR"
if [ ! -f "$CONFIG" ]; then
  log "writing $CONFIG"
  "$node_bin/node" -e '
    const fs = require("fs");
    const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    c.highscores = { ...c.highscores, file: process.argv[2] };
    fs.writeFileSync(process.argv[3], JSON.stringify(c, null, 2) + "\n");
  ' "$PREFIX/$new_app/config.example.json" "$STATE_DIR/highscores.json" "$CONFIG"
  chown root:"$SERVICE_USER" "$CONFIG"
  chmod 0640 "$CONFIG"
fi
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$STATE_DIR"

# --- systemd unit --------------------------------------------------------------
cat > "$work/unit" <<EOF
[Unit]
Description=Locomotive Wars game server
Documentation=https://github.com/$REPO
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$STATE_DIR
Environment=NODE_ENV=production
Environment=LW_CONFIG=$CONFIG
# Optional overrides, e.g. PORT=80.
EnvironmentFile=-$CONF_DIR/env
ExecStart=$PREFIX/node/current/bin/node $PREFIX/current/packages/server/dist/main.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=30

# Lets the server listen on a port below 1024 (such as 80) without running as root.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

# The server writes only its high score table.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
StateDirectory=$SERVICE
ReadWritePaths=$STATE_DIR

[Install]
WantedBy=multi-user.target
EOF
unit_changed=0
cmp -s "$work/unit" "$UNIT" || unit_changed=1

# --- high score import ---------------------------------------------------------
# The table file the server reads: config.highscores.file, relative to the working directory.
highscore_file() {
  "$node_bin/node" -e '
    const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    console.log(require("path").resolve(process.argv[2], c.highscores?.file ?? "data/highscores.json"));
  ' "$CONFIG" "$STATE_DIR"
}

import_src=""
if [ -n "${LW_IMPORT_HIGHSCORES:-}" ]; then
  import_src="$work/import.json"
  if [[ "$LW_IMPORT_HIGHSCORES" =~ ^https?:// ]]; then
    log "fetching high scores from $LW_IMPORT_HIGHSCORES"
    curl -fsSL --max-time 30 "$LW_IMPORT_HIGHSCORES" -o "$import_src" \
      || die "could not fetch $LW_IMPORT_HIGHSCORES"
  else
    [ -f "$LW_IMPORT_HIGHSCORES" ] || die "LW_IMPORT_HIGHSCORES: no such file $LW_IMPORT_HIGHSCORES"
    cp "$LW_IMPORT_HIGHSCORES" "$import_src"
  fi
  "$node_bin/node" -e 'if (!Array.isArray(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))?.entries)) process.exit(1)' \
    "$import_src" 2>/dev/null || die "$LW_IMPORT_HIGHSCORES is not a high score table"
fi

# Merges the downloaded table into this server's file. Accepts a highscores.json (version 1) or a
# GET /api/highscores response; the latter has no entry ids or round ids, so they are made up.
# Entries already present (same name, score and time) are skipped, so an import can be repeated.
merge_highscores() {
  local file
  file="$(highscore_file)"
  "$node_bin/node" -e '
    const fs = require("fs");
    const [src, dest] = process.argv.slice(1);
    const input = JSON.parse(fs.readFileSync(src, "utf8"));
    if (!Array.isArray(input?.entries)) throw new Error("not a high score table: no entries");
    const valid = (e) =>
      typeof e?.name === "string" && Number.isInteger(e.score) && e.score >= 0 &&
      typeof e.achievedAt === "string" && !Number.isNaN(Date.parse(e.achievedAt));
    const incoming = input.entries.filter(valid).map((e, i) => ({
      id: typeof e.id === "string" && e.id ? e.id : `import-r0-${i}`,
      name: e.name, score: e.score, achievedAt: e.achievedAt,
      roundId: Number.isInteger(e.roundId) && e.roundId >= 0 ? e.roundId : 0,
    }));
    let current = [];
    if (fs.existsSync(dest)) {
      const saved = JSON.parse(fs.readFileSync(dest, "utf8"));
      if (saved?.version !== 1 || !Array.isArray(saved.entries)) throw new Error(`${dest} is not a version 1 table`);
      current = saved.entries;
      fs.copyFileSync(dest, `${dest}.bak-${Date.now()}`);
    }
    const key = (e) => `${e.name}\u0000${e.score}\u0000${e.achievedAt}`;
    const seen = new Set(current.map(key));
    const ids = new Set(current.map((e) => e.id));
    let added = 0;
    for (const e of incoming) {
      if (seen.has(key(e))) continue;
      if (ids.has(e.id)) e.id = `import${Date.now().toString(36)}-r${e.roundId}-${added}`;
      seen.add(key(e)); ids.add(e.id); current.push(e); added++;
    }
    current.sort((a, b) => b.score - a.score || Date.parse(a.achievedAt) - Date.parse(b.achievedAt));
    fs.mkdirSync(require("path").dirname(dest), { recursive: true });
    fs.writeFileSync(`${dest}.tmp`, JSON.stringify({ version: 1, entries: current }, null, 2) + "\n");
    fs.renameSync(`${dest}.tmp`, dest);
    console.log(`imported ${added} of ${incoming.length} high scores into ${dest} (${current.length} in the table)`);
  ' "$import_src" "$file"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$(dirname "$file")"
}

# --- swap and start ------------------------------------------------------------
port() {
  local p
  p="$(sed -n 's/^PORT=//p' "$CONF_DIR/env" 2>/dev/null | tail -n1 | tr -d "\"' ")"
  [ -n "$p" ] || p="$("$node_bin/node" -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).port ?? 8080)' "$CONFIG")"
  echo "$p"
}

running=0
systemctl is-active --quiet "$SERVICE" && running=1

# Something else on the port (such as a Locomotive Wars started by hand) would keep the service
# from listening, and could answer the health check in its place.
if [ "$running" -eq 0 ] && (exec 3<>"/dev/tcp/127.0.0.1/$(port)") 2>/dev/null; then
  die "port $(port) is already in use by another program; stop it (an older server started by hand?) and run this again"
fi

if [ "$app_changed$node_changed$unit_changed" = "000" ] && [ -z "$import_src" ] && [ "$running" -eq 1 ]; then
  systemctl enable --quiet "$SERVICE"
  log "nothing to do; Locomotive Wars $installed_version is running"
  exit 0
fi

# The server keeps its table in memory and rewrites the file after each round, so it is stopped
# before the swap and before any import.
if [ "$running" -eq 1 ]; then
  log "stopping $SERVICE"
  systemctl stop "$SERVICE"
fi
[ -f "$UNIT" ] && cp -a "$UNIT" "$work/unit.old"

if [ "$app_changed" -eq 1 ] && [ "$new_app" = "$old_app" ]; then
  rm -rf "$PREFIX/$old_app.old"
  mv "$PREFIX/$old_app" "$PREFIX/$old_app.old"
  mv "$PREFIX/$old_app.new" "$PREFIX/$old_app"
fi
ln -sfn "$new_app" "$PREFIX/current.new" && mv -T "$PREFIX/current.new" "$PREFIX/current"
ln -sfn "$node_dir" "$PREFIX/node/current.new" && mv -T "$PREFIX/node/current.new" "$PREFIX/node/current"
install -m 0644 "$work/unit" "$UNIT"
systemctl daemon-reload
systemctl enable --quiet "$SERVICE"

if [ -n "$import_src" ]; then
  merge_highscores || warn "high score import failed; the table was left as it was"
fi

# The new server must answer /healthz (with this version, once the server reports one).
wait_healthy() {
  local url body i
  url="http://127.0.0.1:$(port)/healthz"
  for i in $(seq 1 30); do
    if body="$(curl -fsS --max-time 2 "$url" 2>/dev/null)" && [[ "$body" == *'"status":"ok"'* ]] \
      && [ "$(systemctl show -p SubState --value "$SERVICE")" = "running" ]; then
      if [[ "$body" != *'"version":'* ]] || [[ "$body" == *"\"version\":\"$target_version\""* ]]; then
        return 0
      fi
    fi
    [ "$(systemctl show -p ActiveState --value "$SERVICE")" = "failed" ] && return 1
    sleep 1
  done
  return 1
}

log "starting Locomotive Wars $target_version"
systemctl start "$SERVICE"
if ! wait_healthy; then
  if [ -n "$old_app" ] && [ -n "$old_node" ]; then
    warn "Locomotive Wars $target_version did not start; restoring the previous version"
    systemctl stop "$SERVICE" 2>/dev/null || true
    if [ -d "$PREFIX/$old_app.old" ]; then
      rm -rf "$PREFIX/$old_app"; mv "$PREFIX/$old_app.old" "$PREFIX/$old_app"
    elif [ "$new_app" != "$old_app" ]; then
      rm -rf "${PREFIX:?}/$new_app"
    fi
    ln -sfn "$old_app" "$PREFIX/current"
    ln -sfn "$old_node" "$PREFIX/node/current"
    [ -f "$work/unit.old" ] && install -m 0644 "$work/unit.old" "$UNIT"
    systemctl daemon-reload
    systemctl start "$SERVICE"
    die "upgrade failed; the previous version is running again (journalctl -u $SERVICE)"
  fi
  die "Locomotive Wars $target_version did not start (journalctl -u $SERVICE)"
fi

# --- tidy up: keep the running release and Node.js, and the ones before them ----------
rm -rf "$PREFIX/releases/"*.old "$PREFIX/releases/"*.new
for dir in "$PREFIX"/releases/*; do
  name="releases/$(basename "$dir")"
  [ "$name" = "$new_app" ] || [ "$name" = "$old_app" ] || rm -rf "$dir"
done
for dir in "$PREFIX"/node/v*; do
  [ -e "$dir" ] || continue
  name="$(basename "$dir")"
  [ "$name" = "$node_dir" ] || [ "$name" = "$old_node" ] || rm -rf "$dir"
done

log "done. Locomotive Wars $target_version is running on Node.js $node_dir"
log "play at http://$(hostname -I 2>/dev/null | awk '{print $1}'):$(port)/"
