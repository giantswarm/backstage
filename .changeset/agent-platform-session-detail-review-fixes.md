---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Fix six defects found reviewing the session detail page.

- **A click on a session title navigated twice.** The Sessions table has both an
  anchor in the title cell and a whole-row click, and react-aria's row press fires
  for a press anywhere in the row — the anchor included. So one click navigated
  twice: two identical history entries, meaning Back needed two presses to return
  to the list, and with cmd held the session opened in a new tab _and_ took the
  current tab with it, which is the opposite of why the anchor is there. The title
  anchor now swallows the press (`pointerdown`/`pointerup`, which is what
  `usePress` listens to) so exactly one of the two affordances acts on any click.
- **A wholly unreadable session claimed to be empty.** The timeline's "N messages
  could not be read" warning sat below an early return for an item-less timeline —
  so the one case it exists for, every history entry failing to parse, reported
  "This session has no messages yet." and never warned at all. The warning now
  renders in that branch too, with wording that does not deny the messages existed.
- **A blank text part could still lose an `ask_user` reply.** The reply is recovered
  from `ask_user_answers` only when the decision message carries no text part, but
  the check counted a `{ text: "" }` part as words while the renderer drops text
  that trims to nothing — losing the answer both ways. The check now agrees with
  what actually renders.
- **A `call_tool` shape change would have dropped a call's arguments.**
  `unwrapProxiedCall` promised to degrade to showing muster's proxy rather than
  losing a call, but keyed only on the inner `name`: had muster renamed or nested
  the inner arguments, every proxied row would have named the real tool with its
  arguments silently `undefined`, rendering as an entry with nothing to expand.
  Unwrapping now also requires that the payload carries no key beyond `name` and
  `arguments`. An argument-less proxied call (`{ name }` alone) still unwraps.
- **Turns were keyed on `taskIndex`.** `groupIntoTurns` deliberately emits two turns
  with the same index if a task index ever repeats non-contiguously, which made the
  React key ambiguous — one turn's entries could reconcile under the other's
  timestamp. Keyed on position now.
- **A known 404 sat behind a spinner.** "Not found" is decided by the session read
  alone, but the loading flag waited for the tasks read too, so a missing session
  stayed on a spinner for the whole retry ladder — or the fetch timeout on an
  unreachable installation — with the answer already in hand.
