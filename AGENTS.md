# dsh-work

A DSH plugin: the work page (board columns and one chat per issue) over a board command line.

- `index.js`: the Host row, its config schema and wiring. `src/routes.js` holds the `/api/work/*` routes, each decided per request from `requestIdentity`: the person mapping, the words and the event streams come from `@soffits/dsh-plugin-sdk/host` (shared with the other plugins of this kind; fix them there, never copy them here), the access levels from `src/access.js`.
- `src/board.js`: the board command (execFile, never a shell; `--` before free text), cached until the board folder changes. `src/rooms.js`: entries become rooms, plus unread counts, recipients and visibility (pure). `src/sessions.js`: what DSH says about a session. `src/marks.js`: read marks. `src/changes.js`: what changed on the board and in the marks, sent through the kit's notices.
- `client.js`: the page, in DSH's Client module format (no build step), made of DSH primitives and `ctx.uiKit`. `test/fixtures/` holds the export lists `test/client-names.test.js` checks against.

Rules: the page never keeps a copy of the board, and nothing about a particular home or person goes in code, docs or tests. After UI changes, look at it at 390 and 1280 px, in light and dark, in two languages. `npm run check`, `npm test`. Conventional Commits, squash merges, semver from commit types.
- Releases: after bumping the version and `CHANGELOG.md` and merging, pushing the tag `vX.Y.Z` runs `.github/workflows/publish.yml`, which publishes to npm by trusted publishing (OIDC, with provenance, no stored token; the package's trusted publisher on npmjs.com names this repo and `publish.yml`, so renaming either breaks it) and creates the GitHub release. Don't publish by hand.
