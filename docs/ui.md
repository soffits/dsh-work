# What the page is made of

DSH's own pieces first: `Button`, `Pill` (list filters), `Tag` (status and labels), `StateDot` (session state), `SegmentedTabs` (Board / Chats), `SegmentedControl` (one column at a time on a phone) and the chevron and check icons. Every colour is a `--dsw-alias-*` token.

From [@soffits/dsh-ui-kit](https://github.com/soffits/dsh-ui-kit) 0.3: `ChatBubble`, `ChatDivider`, `DayLabel`, `MentionText`, `ConversationRow`, `Composer` (with its @ picker), `Tile`, `Icon`, `TimeAgo`, `RelativeDay`, `LiveStatus` and `useEventStream`.

Our own CSS, in `client.js`, covers only layout that DSH doesn't expose: the page frame, the columns and cards (borrowed from the card board's Work card), the two panes of the chat view (one at a time at 760 px and below), the pinned facts, the Working now strip, session chips, the jump buttons and the sidebar badge. Controls are 40 px tall on touch screens, chrome isn't selectable while titles and messages are, and the small motions stop under reduced motion.
