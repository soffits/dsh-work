# Changelog

## 0.2.4

- An open work page's event stream now ends when the plugin is unloaded or updated, so the page reconnects to the new version; before, it stayed open and silent.
- The person mapping, the words and the event stream come from the shared `@soffits/dsh-host-kit` instead of copies kept here. A broken language file is now skipped with a warning instead of failing the words for every language.

## 0.2.3

Open event streams stop hearing notices when the plugin is unloaded or reloaded; before, they kept listening to the old copy.

## 0.2.2

The page's words are read on each request and not kept by the browser, so an update that adds words shows them at once instead of raw keys like `live.title` until a restart.

## 0.2.1

On a phone the Working now strip wraps its chips instead of stacking one per line, so many running sessions no longer push the columns off the screen.

## 0.2.0

The Board view starts with **Working now**: every session DSH has running, children included, with the issue it holds or "no issue" for a child that holds none. It follows DSH's session events, so it changes as soon as a session starts or stops, without polling. Only people who read every chat see it. Column counts stand out: Needs you turns amber when something waits.

A needs-owner issue shows the points answering it earns, when the board reports them (`points` in `list --json`), to people who read every chat.

## 0.1.8

Title, start time and last answer of a session now come from one DSH observation of it. The title read before listed every stored session for each worker, which was most of the time a chat took to open.

## 0.1.7

A chat whose sessions already finished opens fast: the last answer is read from DSH's own observation of the session instead of a full copy and replay of its log.

## 0.1.6

The message box shows focus with its own border only, without a second ring inside it.

## 0.1.5

The assistant is counted once among a message's recipients when its main session is also the one working on the issue.

## 0.1.4

On a phone the chat list keeps to the screen width (long titles end in an ellipsis), and a chat says it is loading while DSH reads its sessions.

## 0.1.3

Session titles and last answers are read from DSH each time instead of kept for a while, so a chat never shows an old one.

## 0.1.2

A closed issue says how it ended once, under the chat in up to three lines, instead of also filling the pinned facts on a phone; "nobody yet" shows only when no session is working on it.

## 0.1.1

The bundle layer is valid YAML again, so the work row loads; a test parses it.

## 0.1.0

First release. The Work page shows the board in columns, and each issue as a chat of its comments with DSH session milestones and chips that open the session. Messages are written as the signed-in person and delivered by rule: workers and the assistant by default, `@name`, `@all`. It has mention badges, a Mentions filter, jump to mention and jump to latest, per-person access, live updates over SSE, and words in en, fr and zh.
