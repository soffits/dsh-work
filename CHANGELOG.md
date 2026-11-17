# Changelog

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
