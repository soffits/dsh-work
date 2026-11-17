# dsh-work

A DSH plugin: the work page (board columns and one chat per issue) over a board command line.

- `index.js`: the Host row, its config schema and wiring. `src/routes.js` holds the `/api/work/*` routes, each decided per request from `requestIdentity` (`src/access.js`).
- `src/board.js`: the board command (execFile, never a shell; `--` before free text), cached until the board folder changes. `src/rooms.js`: entries become rooms, plus unread counts, recipients and visibility (pure). `src/sessions.js`: what DSH says about a session. `src/marks.js`: read marks. `src/changes.js`: change notices for the events stream.
- `client.js`: the page, in DSH's Client module format (no build step), made of DSH primitives and `ctx.uiKit`. `test/fixtures/` holds the export lists `test/client-names.test.js` checks against.

Rules: the page never keeps a copy of the board, and nothing about a particular home or person goes in code, docs or tests. After UI changes, look at it at 390 and 1280 px, in light and dark, in two languages. `npm run check`, `npm test`. Conventional Commits, squash merges, semver from commit types.
