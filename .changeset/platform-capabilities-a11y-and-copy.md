---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

Capabilities tab: the comparison's outcome and the review's result are announced, the focus never
falls to the body, every row of the record has a label of its own, and the disabled button says
why. A card's change from "Comparing…" to its verdict was silent, and so was the dialog's review;
after Review the button pressed left the DOM and the focus fell to the body; two rows of the record
could both read "Domain"; the disabled button had no tie to the reason under it; the header's words
and the button were read from different fields; three lines of `unreachable from the manager: Get
"https://…": context deadline exceeded` took a third of the card; the dialog's note cited a button
that did not exist yet; and the tab never said what a platform capability is. Now each card has a
status region that announces the outcome in the header's words as the comparison lands ("agent-platform
compared: Installed · 2 checks differ") or that it did not run; the dialog announces the review's
result, a refusal, the action started and a failure, and as a step changes the focus moves to what
replaced the button pressed -- the result's heading "Compared with your choices", the action's line,
Review after Back. One resolved status drives the header's words and the button; whatever disables
the button -- the manager's reason, the phase in flight, the comparison running -- is its accessible
description (`aria-describedby`). A row's label another row shares is qualified with its group
("Portal domain", "Grafana domain"). Endpoints the manager could not reach are one line, "2 endpoints
did not answer", with the requests' errors behind the disclosure. The note reads "Nothing is written
before you open the pull requests", and one line at the top of the tab says what a platform capability
is and links the docs.
