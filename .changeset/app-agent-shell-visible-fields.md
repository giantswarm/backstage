---
'app': patch
---

Make form fields easy to spot in the agent shell. bui draws its fields as
borderless fills that vanish on the shell's white surfaces; every field inside
the shell (text, number, password, multi-line, search, select, combobox and
date fields, plus the hand-rolled multi-line and secret fields of the creation
flows) now gets a visible gray-blue edge, a white fill, a 10px radius, and an
accent edge with a soft halo while focused, per the prototype's input style.
Invalid fields keep their danger edge. The chat composer keeps its own framed
look.
