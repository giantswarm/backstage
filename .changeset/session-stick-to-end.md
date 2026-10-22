---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A session page no longer pulls the reader back down while a turn streams. The
page follows the reply only while the reader is at the end; scrolling up (wheel,
touch, keyboard, scrollbar) leaves the end at once, and the page then stays
where they are until they scroll back to the end or press End. Opening _Show
more_ or a tool activity row never scrolls the page.
