# bragger-dev

Local-first tracker of your developer activity (commits, PRs, reviews, docs, comments…) across
code repositories and collaboration tools, summarized into time-scoped reports.

- **Local and private:** runs on your Linux machine, one installation per OS user, data in SQLite.
- **Workspaces:** each with its own code repository and collaboration tool connections.
- **Reports by time frame:** last two weeks by default, or the current week, current or
  last month, quarter or year, or a custom range of up to one year.

## Requirements

- Linux, Node.js >= 22, Google Chrome or Chromium
- `unix_chkpwd` (ships with `pam_unix`, present on all mainstream distros)

## Usage

```sh
npm ci
npm run build
./bin/bragger.sh            # or: npm start
```

The launcher starts a local server bound to `127.0.0.1` on a random port and opens the UI in a
Chrome app window (dedicated profile). Closing that window stops the server. Running the launcher
again while it is running just opens another window.

## Development

```sh
npm run dev        # API on :4710 (tsx watch) + Vite on http://localhost:5173, data in ./.data
npm test           # vitest
npm run typecheck  # server + web
```

## Layout

```
bin/bragger.sh              launcher (start server, open Chrome --app window)
src/shared/                 code shared by server and UI
  api.ts                    HTTP API contract (DTOs)
  providers.ts              integration catalog + activity kinds
  timeframe.ts              report time frames (presets, custom range ≤ 1 year)
src/server/
  index.ts                  entry point: config → DB → app → listen → runtime file
  app.ts                    Fastify app: host guard, error handling, route wiring, static UI
  config.ts                 per-user paths (XDG), OS-session key
  auth/                     OS password check, session store (10-day TTL), auth routes
  crypto/secret-box.ts      AES-256-GCM encryption of tokens/API keys at rest
  db/                       SQLite (better-sqlite3) + append-only migrations
  workspaces/               workspace CRUD
  connections/              repository / collaboration connections per workspace
  integrations/             ActivityCollector interface + per-provider registry (stubs)
  reports/                  activity storage, report + sync endpoints
web/                        React + Vite UI (login, workspaces, report, settings)
```

## Design notes

**Per-user, local only.** All data lives in `${XDG_DATA_HOME:-~/.local/share}/bragger-dev`
(dir `0700`, files `0600`): `bragger.db`, `secret.key`, `chrome-profile/`, `logs/`. The server
only listens on loopback and rejects requests whose `Host` is not `127.0.0.1`/`localhost`
(DNS-rebinding protection).

**Login with the OS password.** Other local users can reach a loopback port, so the UI is locked
behind the password of the OS user who runs the app. It is verified with `unix_chkpwd`, the
setgid helper pam_unix uses for unprivileged programs (screen lockers): it can only check the
invoking user's own password, needs no root and no native PAM bindings. Failed attempts are
delayed by 1s.

**Session lifetime.** Sessions are an httpOnly, SameSite=strict cookie backed by a hashed token
in SQLite. A session is valid for 10 days **and** only within the OS login session that created
it: a random marker in `$XDG_RUNTIME_DIR/bragger-dev/` (a tmpfs that systemd-logind wipes at
logout and reboot) identifies the login session; when it changes, all app sessions are dropped.
Caveat: with `loginctl enable-linger` the runtime dir survives logout, so only the 10-day TTL
applies.

**Secrets.** Tokens/API keys are encrypted with AES-256-GCM using `secret.key` and are never
returned by the API.

**Integrations.** Supported today: **GitHub** (repositories) and **Notion** (collaboration).
Providers are data-driven: to add one (GitLab, Bitbucket, Confluence, Slack…), add an entry to
`PROVIDERS` in `src/shared/providers.ts` — the settings form and API validation pick it up — and
register its collector in `src/server/integrations/registry.ts` (the compiler requires one per
provider). Each provider implements `ActivityCollector` (`src/server/integrations/collector.ts`)
and yields normalized activities (`commit`, `pull_request_authored`, `pull_request_reviewed`,
`content_authored`, `content_edited`, `comment`, `message`). Activities are upserted by
`(connection, kind, externalId)`, so re-syncing is idempotent. All collectors are currently stubs
in `registry.ts`.

## Roadmap

### Done (bootstrap)

- [x] Launcher script, Chrome app window, loopback-only server
- [x] Login with the OS user's password, 10-day sessions bound to the OS login session
- [x] Workspaces (list, create, delete)
- [x] Connections per workspace with encrypted secrets
- [x] Report view with all time-frame presets and custom ranges (≤ 1 year)
- [x] Activity storage, report and sync endpoints, collector interface

### Next: first real data

- [ ] **GitHub collector**: commits, pull requests authored, pull requests reviewed (GitHub.com and GitHub Enterprise)
- [ ] **Notion collector**: pages authored, pages edited, comments
- [ ] "Test connection" endpoint and button, so a wrong token is caught when the connection is saved
- [ ] Edit a connection (label, scope, rotate the token); today a connection can only be added or removed
- [ ] Rename a workspace in the UI (the API already supports it)

### Brag document export

- [ ] Generate a brag document for the selected workspace and time frame, grouped by
      category, provider and repository/space, with links to every item
- [ ] Export as **Markdown** (`.md`)
- [ ] Export as **PDF**, rendered with the Chrome the app already requires (headless print-to-PDF)
- [ ] Let the user edit and highlight items before exporting

### Reports

- [ ] Richer grouping and filtering (per repository, space or channel; per activity kind)
- [ ] Remember the last selected time frame per workspace

### Future providers

| Provider   | Category      | Auth                              | Notes                                |
|------------|---------------|-----------------------------------|--------------------------------------|
| GitLab     | Repository    | Personal access token             | gitlab.com and self-hosted base URL  |
| Bitbucket  | Repository    | API token + Atlassian e-mail      | Bitbucket Cloud                      |
| Confluence | Collaboration | API token + Atlassian e-mail      | Per-site base URL                    |
| Slack      | Collaboration | User OAuth token (`xoxp-…`)       | Messages and threads in your channels|

### Desktop experience

- [ ] `.desktop` entry so the app can be started from the application menu
- [ ] Keep the server running while any window is open; today closing the first window stops it,
      even if a second window is still open
- [ ] Document or detect `loginctl enable-linger`, which keeps the runtime dir alive after logout,
      so sessions then only end after the 10-day limit

## License

[MIT](LICENSE)
