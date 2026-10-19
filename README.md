# Locomotive Wars

A multiplayer top-down train combat game. Players share one server world, ram each other's trains
to grow their own, and compete in timed rounds for an all-time high score table.

## Requirements

Node 22 (see [`.nvmrc`](.nvmrc)) and npm 10 or newer.

## Run a server

From a [release](https://github.com/carlhako/locomotive-wars/releases) package (already built):

```bash
tar xzf locomotive-wars-0.3.1.tar.gz && cd locomotive-wars-0.3.1
npm ci --omit=dev
npm start -w @lw/server
```

From source:

```bash
npm ci
npm run build
npm start -w @lw/server
```

The server serves the game and its WebSocket on one port (default 8080), so players browse to
`http://<host>:8080`. Put a TLS reverse proxy in front of it for `https`.

## Deploy to a Debian server or LXC container

[`deploy/install.sh`](deploy/install.sh) sets the game up as a service that starts on boot. It
creates a `locomotive-wars` user, installs Node.js and the latest release under
`/opt/locomotive-wars`, writes a config, and installs and enables the `locomotive-wars` systemd
service. Running it again upgrades to the latest release.

You need a Debian-based system with systemd (Debian 12 or newer, or a Proxmox LXC built from a
Debian template) on amd64, arm64 or armv7, a root shell, and outbound access to `github.com`,
`nodejs.org` and `registry.npmjs.org`. Everything else, Node.js included, is installed by the
script.

### Install

As root, install curl if the system lacks it (a fresh Debian LXC does), then run the script:

```bash
apt-get update && apt-get install -y curl
```

```bash
curl -fsSL https://raw.githubusercontent.com/carlhako/locomotive-wars/main/deploy/install.sh | bash
```

When it finishes it prints the address to play at, `http://<server-ip>:8080/` by default.

### Upgrade

Run the same command again. It checks for a newer game release and a newer Node.js patch release,
and if there is neither it does nothing and leaves the server running. Otherwise it installs the
new version next to the running one, restarts the service on it, and checks the server answers. If
the new version does not start, the previous one is put back and started again, and the script
stops with an error (see the logs below for why). Your config and high scores are never touched by
an upgrade. Players are disconnected while the service restarts.

### Change the settings

The config is `/etc/locomotive-wars/config.json`. It is written from
[`config.example.json`](config.example.json) on the first install and left alone after that, and it
takes the keys listed under [Configure](#configure). Edit it, then restart the service:

```bash
systemctl restart locomotive-wars
```

To change only the port, you can instead put `PORT=80` (or any port) in `/etc/locomotive-wars/env`
and restart. Ports below 1024 work even though the server does not run as root.

### Move the high scores from another server

Give the installer the old server's table, either its URL (the old server must be running and
reachable from the new one) or a copy of its `highscores.json` file:

```bash
curl -fsSL https://raw.githubusercontent.com/carlhako/locomotive-wars/main/deploy/install.sh | LW_IMPORT_HIGHSCORES=http://old-host:8080/api/highscores bash
```

```bash
curl -fsSL https://raw.githubusercontent.com/carlhako/locomotive-wars/main/deploy/install.sh | LW_IMPORT_HIGHSCORES=/root/highscores.json bash
```

The imported entries are merged into the new server's table, and entries it already has (same
name, score and time) are skipped, so the import is safe to repeat. The table as it was is kept
next to it as `highscores.json.bak-<timestamp>`. A source that is not a high score table is refused
before anything is stopped. The table keeps `highscores.size` entries, so lower scores beyond that
are dropped when the server starts.

### Switch over a server you started by hand

If you run a release by hand (extracted the package and ran `npm start`), the installer can take it
over on the same machine and bring its high scores along:

1. Find the folder you extracted the release into. Its high scores are in `data/highscores.json`
   there, unless its `config.json` sets `highscores.file` to somewhere else. If you changed any
   settings in that `config.json`, note them down.
2. Stop the old server (Ctrl-C in its terminal, or `pkill -f packages/server/dist/main.js`). The
   installer refuses to go on while something else is using the port. Scores are saved at the end
   of each round, so stop it between rounds to keep the one in progress.
3. Run the installer, pointing it at the old table:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/carlhako/locomotive-wars/main/deploy/install.sh | LW_IMPORT_HIGHSCORES=/root/locomotive-wars-0.2.0/data/highscores.json bash
   ```

4. Copy any settings you noted into `/etc/locomotive-wars/config.json` (leave its
   `highscores.file` as it is) and run `systemctl restart locomotive-wars`.
5. Remove whatever started the old server on boot, if anything (a crontab `@reboot` line,
   `rc.local`, a script). Once you are happy, delete the old folder.

### Options

Set these in front of `bash` in the commands above, for example `... | RELEASE_TAG=v0.2.0 bash`.

| Variable               | Effect                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `RELEASE_TAG`          | Install this release (`v0.2.0`) instead of the latest; this can also go back to an older one |
| `LW_TARBALL`           | Install from a release package already on the server instead of downloading one              |
| `LW_IMPORT_HIGHSCORES` | Merge another server's high scores, from a URL or a file (see above)                         |
| `LW_FORCE`             | Set to `1` to reinstall and restart even when already up to date                             |

### Day to day

```bash
systemctl status locomotive-wars
```

```bash
journalctl -u locomotive-wars -f
```

`systemctl stop`, `start` and `restart locomotive-wars` work as usual. To change the service
itself, add a drop-in with `systemctl edit locomotive-wars` rather than editing the unit file,
which the script rewrites on every run.

### Where things are

| Path                                          | What                                                |
| --------------------------------------------- | --------------------------------------------------- |
| `/opt/locomotive-wars/current`                | The running release (links to `releases/<version>`) |
| `/opt/locomotive-wars/node/current`           | Node.js (links to `node/v<version>`)                |
| `/etc/locomotive-wars/config.json`            | Config                                              |
| `/etc/locomotive-wars/env`                    | Optional environment, such as `PORT=80`             |
| `/var/lib/locomotive-wars/highscores.json`    | High score table                                    |
| `/etc/systemd/system/locomotive-wars.service` | The service unit                                    |

The previous release and Node.js are kept beside the current ones, and older ones are removed.

### Uninstall

```bash
systemctl disable --now locomotive-wars
rm -rf /opt/locomotive-wars /etc/locomotive-wars /etc/systemd/system/locomotive-wars.service
systemctl daemon-reload
userdel locomotive-wars
```

This keeps the high scores in `/var/lib/locomotive-wars`; delete that too to remove them.

## Configure

Copy [`config.example.json`](config.example.json) to `config.json` in the project root (or point
`LW_CONFIG` at another file) and restart the server. Missing keys take their defaults, `PORT`
overrides `port`, and a bad value stops the server with a list of errors.
A server installed with the [deploy script](#deploy-to-a-debian-server-or-lxc-container) reads
`/etc/locomotive-wars/config.json` instead.

<!-- config-keys:start -->

| Key               | Default                | Allowed                     | Meaning                                                                         |
| ----------------- | ---------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `port`            | `8080`                 | 0 to 65535                  | TCP port to listen on                                                           |
| `maxPlayers`      | `16`                   | 1 to 100                    | Most human players connected at once; more are refused as full                  |
| `roundLengthSec`  | `600`                  | 30 to 7200                  | Length of a round                                                               |
| `intermissionSec` | `20`                   | 5 to 300                    | Pause between rounds, showing the standings                                     |
| `idleKickSec`     | `60`                   | `0` (off), or 20 to 3600    | Kick a player who stops steering this long (warned 10 s before)                 |
| `bots.fillTo`     | `12`                   | 0 to 100                    | Bots fill the world up to this many trains in all, humans included              |
| `bots.min`        | `0`                    | 0 to `bots.max`             | Fewest bots, however many humans are connected                                  |
| `bots.max`        | `10`                   | 0 to 100                    | Most bots                                                                       |
| `bots.skill`      | `0.7`                  | 0 to 1                      | How well bots avoid other trains' bodies; 0 is the original bots, 1 never slips |
| `highscores.size` | `10`                   | 1 to 100                    | Entries kept in the all-time high score table                                   |
| `highscores.file` | `data/highscores.json` | any path                    | Where the table is stored; a relative path is read from the config directory    |
| `maxCarriages`    | `150`                  | 10 to 500                   | Longest a train can grow, locomotive included                                   |
| `tickRate`        | `30`                   | 10 to 60                    | Simulation steps per second                                                     |
| `snapshotRate`    | `15`                   | 1 to `tickRate`, divides it | Snapshots sent per client per second                                            |
| `viewRadius`      | `1600`                 | 500 to 5000                 | How far from its train a client sees, in world units                            |

<!-- config-keys:end -->

The number of bots is `clamp(bots.fillTo - humans, bots.min, bots.max)`; set `bots.fillTo` and
`bots.min` to `0` for no bots. Like every setting, `bots.skill` takes effect when the server
restarts.

High scores live in `highscores.file` and are served at `GET /api/highscores`. To edit or reset
them, stop the server, edit or delete the file, and start it again. A damaged file is renamed to
`highscores.json.corrupt-<timestamp>` and the table starts empty.

## Development

```bash
npm install
npm run dev
```

This starts the server and the Vite client together; open http://localhost:5173. Add `?offline`
to the URL to try the client without a server. Checks: `npm test`, `npm run lint`,
`npm run typecheck`.

The code is split into `packages/shared` (the simulation, used by both sides), `packages/server`
(Node) and `packages/client` (browser, built with Vite).

## License

[MIT](LICENSE)
