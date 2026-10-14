---
'@giantswarm/backstage-plugin-ui-react': minor
---

The full-screen wizard frame became an in-content one. `FullScreenWizardFrame`
covered the whole viewport, hiding the shell's rail; its replacement,
`WizardFrame`, renders in the page's content area instead — the header row
with Close, the title and the step strip on top, the step's content in a
centered column (`width`: narrow 640, medium 760 or wide 960), and a sticky
footer with Cancel, Back and the step's registered actions. Steps keep
publishing their primary buttons through `useProvidePageHeaderActions`, and
the frame still claims the page header. The Escape-to-leave shortcut is gone
with the overlay: an in-content page should not discard a form on Escape.

The connector wizard's form language is now shared for every create flow:
`WizardStepHeading` (the step's h2 with a muted intro), `SelectableCard` /
`SelectableCardGrid` / `StaticCard` (the option cards the muster and
agent-platform plugins each carried a copy of, merged — radio and checkbox
flavours, optional `disabled`, hover action and extra class name), and
`TextAreaField` (the bui-TextField-styled textarea with optional character
counter and inline error).
