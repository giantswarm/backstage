---
'@giantswarm/backstage-plugin-agent-platform': minor
'app': patch
---

Agent shell attention signals and list scale:

- The "is waiting for you" toast now shows however the shell is laid out:
  with the rail collapsed and in the phone's bottom bar too, where it used to
  appear only while the rail was expanded. `NeedsInputToasts` is exported and
  mounted once per shell beside the rail, so it never fires twice.
- More than three sessions starting to wait at once raise one "N sessions need
  your input" toast that opens Sessions on its Waiting chip, instead of a
  stack.
- The rail lists the latest 8 pinned sessions; the rest are a "N more pinned"
  link to Sessions on its Pinned chip.
- The ⌘K palette offers a filter chip only for kinds that have entries (none
  over a single kind), lists up to 50 rows while one kind's chip is on, and
  its "+N more" opens that kind's list searching for the same thing.
- The shell's Sessions list opens narrowed when a link asks for it
  (`?q=` searches, `?state=` picks a chip).
