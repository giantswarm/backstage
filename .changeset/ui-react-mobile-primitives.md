---
'@giantswarm/backstage-plugin-ui-react': minor
---

Mobile primitives for the agent shell at 375px (T22 wave 1A):

- **Breakpoints, one set**: `PHONE_MAX_WIDTH` (599.95px, the width at which
  the shell swaps its rail for the bottom bar), `TWO_COLUMN_MIN_WIDTH` (768px)
  and touch input, as `matchMedia` queries (`PHONE_QUERY`, …) and JSS media
  keys (`PHONE_MEDIA`, …). `usePhoneLayout()` and `useTouchInput()` answer
  live. `mockPhoneLayout()` / `mockDesktopLayout()` install a `matchMedia` for
  jsdom tests, so a component's phone branch is tested and MUI's
  `useMediaQuery` agrees.
- **`StackedRowList`**: the phone layout of a list a person opens or acts on —
  title (a link whose hit area is the row), status and actions on line 1,
  secondary facts joined by " · " on line 2. Actions are always reachable.
- **`usePhoneColumns(columns, keepIds)`**: hides a bui table's other columns
  at phone width, keeping the name and the decisive numbers, instead of
  squeezing every column to a sliver.
- **`InfoHint`** opens its explanation in a popover on a press (tap, click,
  Enter), so it can be read on a touch screen; hover and keyboard focus still
  show the tooltip on a desktop. Its hit area is 24px, 44px on a phone.
- **`ShellPage`** switches to phone gutters at 599.95px instead of 600px, and
  at phone width puts its aside first, folded under "Details" (`asideLabel`).
- **`SelectableCard`** shows its own control (a skill's _Show more_) where
  nothing hovers, under the card's content; long names wrap inside the card.
- **`GSMarkdownContent`** (and `CollapsibleMarkdown`) breaks long URLs and
  tokens and scrolls a wide GFM table inside itself instead of widening the
  page.
- **`ShowMore`**, **`Breadcrumbs`** and **`CatalogFilterBar`** wrap instead of
  overflowing at phone width; **`FactList`** stacks at the phone width rather
  than 520px.
