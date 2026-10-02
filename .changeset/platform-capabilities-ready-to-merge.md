---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

Installations and Capabilities: the platform manager's _ready to merge_ state (an action that needs no Team review because every target is a test installation) gets its own words and look. Action lines and the card's last action read _Ready to merge_ in green with a merge glyph, the card's header reads _Enabling · ready to merge_ (or _Applying_), and the Installations page names it in the cell's tooltip. The next step is the actor's: the card and the action's record say "No Team review needed: merge the pull requests once their checks are green.", and the card's disabled button points to that line. _Pending approval_ renders unchanged. Needs giantswarm-platform-manager 0.61.0 or later.
