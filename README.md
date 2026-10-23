<div align="center">

# Notka

**A free, self-hosted notes app in the spirit of Google Keep.**

Notes, checklists, labels, reminders and sharing, on your own server, in your own database.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

</div>

![Notka notes grid](docs/images/notes-dark.jxl)

> Notka is an independent open-source project. It is **not** affiliated with, endorsed by, or
> connected to Google in any way. Only the look and feel are intentionally familiar.

## What it does

- **Text notes and checklists**, switchable after the fact, with nested list items you drag by hand.
- **Markdown as you type**: `#` headings, `-` and `1.` lists, `[ ]` checkboxes, `**bold**`,
  `*italic*`, `~~strike~~` and `` `code` ``.
- **Colours and backgrounds** per note, a dark theme, and background themes you can upload
  ([`docs/THEMES.md`](docs/THEMES.md)).
- **Labels, pins, reminders, archive and trash**, with trashed notes purged after 30 days.
- **Pictures** in notes, pasted, dropped or picked from the device.
- **Sharing** with other accounts as *view only* or *can edit*, with live updates. Two people typing
  into one note at once both keep every keystroke.
- **Version history** of every note, downloadable as Markdown, and **Markdown export and import**
  ([`docs/MARKDOWN.md`](docs/MARKDOWN.md)).
- **Works offline** as an installable web app, and receives text, links and pictures shared from
  other apps on a phone.
- **An Android app** for your own server, on the [Releases](https://github.com/Linuksiarz/notka/releases)
  page.
- **English (US and UK) and Polish.**

Where Notka differs from Google Keep on purpose (Markdown, colours shared with collaborators,
view-only sharing and more) is listed in [`docs/DIFFERENCES.md`](docs/DIFFERENCES.md).

## Screenshots

| Appearance picker | Editing a note |
| --- | --- |
| ![Appearance picker](docs/images/card-appearance.jxl) | ![Editing an existing note](docs/images/editing.jxl) |

| Polish interface | Phone |
| --- | --- |
| ![Polish interface](docs/images/polish.jxl) | ![Mobile](docs/images/mobile.jxl) ![Mobile editor](docs/images/mobile-editor.jxl) |

## Running it on your server

Notka is one container with one SQLite file and no other services. You need a Linux server with
[Docker](https://docs.docker.com/engine/install/) (Compose v2) and a domain pointing at it.

**1. Get the code and the configuration.**

```bash
git clone https://github.com/Linuksiarz/notka.git
cd notka
cp .env.example .env
```

**2. Fill in `.env`.** At least the administrator and the address of your instance:

```bash
NOTKA_ADMIN_USERNAME=admin
NOTKA_ADMIN_PASSWORD=a-long-password
NOTKA_PUBLIC_URL=https://notes.example.com
```

**3. Start it.**

```bash
docker compose up --build -d
```

The container listens on `127.0.0.1:8080` only. The first build takes a few minutes.

**4. Put HTTPS in front of it.** [`deploy/Caddyfile.example`](deploy/Caddyfile.example) is a complete
configuration for [Caddy](https://caddyserver.com), certificates included: replace the domain and run
it. Do not publish port 8080 to the internet. The session cookie is sent over HTTPS only.

**5. Sign in** at your domain with the administrator's username and password, then remove the
password from `.env`. It is read only on the first start, when the administrator is created.

Sign-up starts **closed**. To let others in, open it in *gear → Server settings*, let them
register, and close it again.

### Updating and backups

```bash
git pull
docker compose up --build -d
```

Everything Notka stores, pictures included, is in one SQLite file, `/data/notka.db` in the
`notka-data` volume. To back up, copy that file.

### Configuration

Every setting has a working default except the first administrator. Put them in `.env`;
[`.env.example`](.env.example) lists them all.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOTKA_ADMIN_USERNAME`, `NOTKA_ADMIN_PASSWORD` | | The administrator, created on the first start of an empty instance and ignored afterwards. |
| `NOTKA_ADMIN_EMAIL` | | The administrator's address, so notes can be shared with them. |
| `NOTKA_PUBLIC_URL` | | The address people reach the instance at. Password-reset links are built from it. |
| `NOTKA_SMTP_HOST`, `NOTKA_SMTP_FROM` | | Outgoing mail server and sender, for password resets. Without them nothing is sent. |
| `NOTKA_SMTP_SECURITY`, `NOTKA_SMTP_PORT` | `starttls` | `starttls` (587), `force_tls` (465) or `off` (25). |
| `NOTKA_SMTP_USERNAME`, `NOTKA_SMTP_PASSWORD` | | Login at the mail server, when it needs one. |
| `NOTKA_SMTP_FROM_NAME`, `NOTKA_SMTP_TIMEOUT` | `Notka`, `15` | Sender's name, and seconds before a silent mail server counts as failed. |
| `NOTKA_BIND`, `NOTKA_HTTP_PORT` | `127.0.0.1`, `8080` | Address and port the container is published on. |
| `NOTKA_MAX_NOTES_PER_USER` | `10000` | How many notes one account may own, trash included. |
| `NOTKA_MAX_IMAGE_STORAGE_MB` | `1024` | Picture storage per account, in MB. |
| `NOTKA_SESSION_TTL_DAYS` | `30` | How long a sign-in lasts, extended on each request. |
| `NOTKA_TRASH_RETENTION_DAYS` | `30` | How long a trashed note is kept before it is purged. |
| `NOTKA_MAX_NOTE_BYTES` | `65536` | Maximum size of one note. |
| `NOTKA_MEMORY_LIMIT` | `512m` | Memory ceiling of the container. |
| `NOTKA_COOKIE_SECURE`, `NOTKA_TRUST_PROXY_HEADERS` | `true` | Keep both on behind a reverse proxy on the same host. |
| `NOTKA_LOG_LEVEL` | `INFO` | Log level. |
| `DEMO` | `false` | Start as a demo with two sample accounts (see below). |

### Administration

The administrator's *gear → Server settings* has three parts:

- **Sign-up**: open or close registration for the instance.
- **Background themes**: upload themes (`.zip`, see [`docs/THEMES.md`](docs/THEMES.md)), remove
  them, and choose the default. Every account can pick its own in Settings.
- **Accounts**: every account with the room its notes take. An account can be deleted, or sent a
  password-reset e-mail (needs the `NOTKA_SMTP_*` settings).

### Without Docker

[`deploy/notka.service`](deploy/notka.service) runs the same setup as a systemd unit with Java 21.
The steps to build and install it are at the top of that file.

## Trying it out

In a clone of the repository, with nothing configured:

```bash
touch .env
DEMO=true docker compose up --build -d
```

Then open <http://localhost:8080> and sign in with one of the two sample accounts the sign-in screen
offers. The demo's passwords are public, so use it only to look around. The demo seeds an empty
database only: before using the same checkout for real, remove its data with `docker compose down -v`.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): running from source, tests, building and releasing, the architecture.
- [ROADMAP.md](ROADMAP.md): what is planned.
- [`docs/`](docs): the API, the data model, collaboration, themes and the Markdown format.

## License

Notka is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified
version of Notka as a service for others, the AGPL asks you to offer them its source code.
