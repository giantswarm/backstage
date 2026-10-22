---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A session page, and the Create agent assist panel, no longer pull the reader
back down while a turn streams. The conversation follows the reply only while
the reader is at the end; scrolling up (wheel, touch, keyboard, scrollbar)
leaves the end at once, and the position then stays where they are until they
scroll back to the end or press End. Opening _Show more_ or a tool activity
row never scrolls the page.
