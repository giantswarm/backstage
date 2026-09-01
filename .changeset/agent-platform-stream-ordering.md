---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Fix the live session timeline rendering a streaming turn out of order.

While a turn was in flight, its tool calls became timeline items immediately but
its text sat in two flat buffers the page appended after _every_ item. Three
things followed from that, all visible on a session running more than one tool:

- **Tool rows overtook the sentences that introduced them.** kagent's Python
  executor puts a message's text part and its `function_call` in the same
  `status-update`, text first, so every such pair rendered inverted — a busy turn
  showed a block of tool rows with all the prose collected underneath, then
  snapped into chronological order when the poll delivered the real history.
- **Consecutive agent messages rendered glued together**, the end of one running
  straight into the start of the next with no separator, because the buffer
  accumulated across message boundaries.
- **A sentence said before the agent went to work could disappear**, because the
  terminal event cleared the buffers wholesale on the assumption they held only
  that message's own chunks.

The two buffers are replaced by a single open text run that holds a position in
the item list. Anything else that arrives — a new message, reasoning giving way
to a reply, a tool call taking an item slot — closes it first, so "items, then
the open run" is chronological by construction and the page appends rather than
sorts.

Streamed items now also carry the `messageId` of the message they came from, and
`buildTimeline` stamps polled tool-call items with theirs. Both halves of the
existing recognise-and-drop dedupe therefore line up, which removes the frame
where the reconciled history and the still-mounted preview rendered the same turn
twice.
