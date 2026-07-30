<p align="center">
  <img src="client/public/citadel_wing.svg" width="96" alt="The Citadel">
</p>

<h1 align="center">The Citadel</h1>

<p align="center">
  Playtesting management for <em>A Game of Thrones: The Card Game (2nd Edition)</em>.
</p>

---

The Citadel is the tool the [throneteki-playtesting](https://github.com/throneteki-playtesting) group uses to
design, review and ship custom card sets. It covers the whole lifecycle of a playtest card: drafting it in a
card editor, rendering it to a real card image, discussing it in Discord, collecting structured playtest
reviews, and finally opening a pull request against the [throneteki](https://github.com/throneteki-playtesting/throneteki)
card data so it can be played online.

## Features

### Projects & cards

- **Projects** group a set of cards under a version, with releases and slots tracking what goes into each
  expansion.
- **Card editor** — a TipTap-based rich-text editor for card ability text, with auto-formatting for triggered
  abilities (`Action:`, `Reaction:`, …), traits (`***Lord.***`) and challenge/faction icons (`[military]`).
  Type-aware: fields appear and disappear based on card type and faction.
- **Card rendering** — cards are rendered to PNG server-side via Puppeteer against the
  [`@agot/card-preview`](https://www.npmjs.com/package/@agot/card-preview) React component (source lives in
  [`@agotCardPreview/`](@agotCardPreview/)), then stored in S3.
- **Playtesting updates** — versioned snapshots of a project, published to players.

### Feedback

- **Reviews** — structured playtest review submissions, keyed by project + card + version.
- **Suggestions** — free-form card suggestions from the community.
- **Deck import** from [ThronesDB](https://thronesdb.com) via OAuth, so reviews can reference real decks.

### Integrations

- **Discord** — OAuth login, a bot that mirrors cards into forum threads and collects review threads, and
  slash commands for syncing.
- **GitHub** — a GitHub App that opens pull requests against the card data repository, plus webhook handling
  for pull request status.
- **Google Apps Script** — legacy Sheets-backed data source, retained for historical data.

### Administration

- Role- and permission-based access control, with a startup check that warns about roles holding permissions
  whose dependencies are missing.
- User management and **impersonation** for debugging another user's view.
- A live **activity log** streamed to the browser over SSE.
- **Swagger** API docs (work in progress) served by the API itself.

## Architecture

| Directory                                | What it is                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [`client/`](client/)                     | React 19 + Vite SPA. HeroUI + Tailwind 4, Redux Toolkit Query for data, React Router 7.                                          |
| [`server/`](server/)                     | Node + Express API. MongoDB for persistence, Redis for caching, Discord.js, Octokit, Puppeteer.                                  |
| [`common/`](common/)                     | Models, schemas and helpers shared by client and server. Consumed via the `common/*` TypeScript path alias — not an npm package. |
| [`@agotCardPreview/`](@agotCardPreview/) | Standalone React component library for rendering AGoT cards. Published to npm as `@agot/card-preview`.                           |
| [`migration/`](migration/)               | Standalone MongoDB migration scripts, run between releases.                                                                      |
| [`googleAppScript/`](googleAppScript/)   | Legacy Google Apps Script integration for the original playtesting spreadsheet.                                                  |

Client and server are **not** an npm workspace — each directory has its own `package.json` and
`node_modules`, and `common` is wired in through `tsconfig` path aliases rather than a package link.

## Getting started

### Prerequisites

- **Node 22** (matches the Dockerfiles)
- **MongoDB** and **Redis** reachable locally
- A **Discord application** — login is Discord OAuth only, so the app is not usable without one

### Setup

```bash
git clone https://github.com/throneteki-playtesting/the-citadel.git
cd the-citadel

# Each project installs independently; this installs all three
npm run install:all
```

Copy the example environment files and fill them in:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env.example` documents every variable. At minimum you need the datastore URLs, `JWT_SECRET` and the
Discord credentials; GitHub, ThronesDB, S3 and Sentry can be left blank if you are not exercising those
features. The server uses `dotenv-expand`, so `${VAR}` references inside the file are resolved.

### Running

In two terminals, from the repository root:

```bash
npm run dev:server    # API on :8080
npm run dev:client    # SPA on :5173
```

The Vite dev server proxies `/api`, `/auth` and `/thronesdb` to the API, so use `http://localhost:5173` in the
browser.

### Building

```bash
npm run build    # tsc -b && vite build -> client/dist
```

`vite build` requires `VITE_SENTRY_DSN` to be set — production builds fail fast without it. The server runs
straight from TypeScript via `tsx` and has no build step.

### Linting & formatting

Prettier owns formatting; ESLint owns code quality. See
[Code style](CONTRIBUTING.md#code-style) for the split.

```bash
npm run lint            # ESLint across server and client
npm run format          # Prettier, write
npm run format:check    # Prettier, verify only
```

### Docker

[`docker-compose.yml`](docker-compose.yml) builds and runs both containers. It expects MongoDB and Redis to
already exist on an external Docker network named `shared_net`, and reads its variables from the shell
environment rather than a file.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Stephen Patane.

This is an unofficial fan project. _A Game of Thrones: The Card Game_ is © Fantasy Flight Games. This project
is not affiliated with or endorsed by Fantasy Flight Games or George R. R. Martin.
