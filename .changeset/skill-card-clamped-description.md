---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Cut a skill card's description down to three lines, with _Show more_ for the rest.

Skill descriptions vary from a few words to a paragraph, and the card grid sizes
every card in a row to the tallest one — so a single long description left the
Select skills step (and the Edit agent skill picker) with rows of mostly empty
cards and far more scrolling than there were skills. Descriptions now clamp to
three lines, and the full text is a click away on the cards whose text is
actually cut off.

That click is a small _Show more_ button in the card's bottom-right corner, faded
in while the pointer is on the card or it has keyboard focus. It is positioned
out of the card's flow, so a card that has one is exactly as tall as a card that
does not and the grid keeps its rhythm either way.

It sits outside the card's selection button: `SelectableCard` takes an optional
`hoverAction` for a control of its own. A nested `<button>` would be invalid
markup, and `role="checkbox"` makes its children presentational, so a control
inside the card would have been hidden from assistive tech and pressing it would
have selected the skill.

New `useIsTruncated` hook in `ui-react`: whether an element's own styling — a
line clamp or an ellipsis — is cutting its content off, re-measured as the
element resizes, so the same text can show a toggle in a narrow card and none in
a wide one.
