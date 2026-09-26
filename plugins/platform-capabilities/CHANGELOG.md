# @giantswarm/backstage-plugin-platform-capabilities

## 0.1.0

### Minor Changes

- 6909d96: The Installations page's capability columns are there from the first
  paint and as narrow as one icon. The column set is the manager's
  definitions (`get_info`, no repository read); each cell is a skeleton until
  the listing arrives, so the table no longer renders without the columns and
  jumps when they appear. The columns ask the manager for the summary listing
  (`summary: true`: the states and the last actions alone, a third of the
  manager's reads of the fleet); the Capabilities tab keeps the full listing of
  its installation. Each column is 120px wide with its header on one line
  instead of an equal share of the table, which had squeezed the Name column
  until installation names wrapped mid-word. The dev harness mirrors the
  page's base columns and a slow listing.
- 221d872: The Capabilities tab shows one annotated diff per file.

  - The comparison asks the manager for the files' content and shows every
    file that differs as one group headed by its path (`<repository>:<path>`,
    once), opening to the unified diff of the file on record against the file
    the definition renders, with each difference annotated on its line: the
    reason sentence of a planned change, `differs by input: <input>`, or the
    drift mark, in the mark's colour. Unchanged stretches fold behind an
    expander. A group is open when a difference is to apply and closed while
    every change in it is planned.
  - A file whose content the answer does not carry, and a difference the
    diff cannot place, keep the one-line list, without the file name in the
    line.
  - The features with differences stay as the summary lines; a dimension's
    own facts (a reason, a probe's requests, an object) keep their lines.
  - The types follow the manager: `current` on a plan's file, `line` and
    `currentLine` on a difference.

- 7edb60f: The Installations table's capability columns (`agent-platform`,
  `customer-portal`) show one icon per installation instead of the state as
  text: a green check where the capability is installed and the manager's
  last action verified it as defined, an orange sync-problem where the last
  verify found it off its definition, a blue sync where it is installed or
  under way but the manager has not reconciled it yet (an action in flight, or
  an installation enabled by hand that no action has run through), an empty
  circle where it is not installed (not enabled, or not opted in), a red error
  where the last action or verify failed, and a question mark where the
  installation is not readable as the person. The manager's state in its own
  words is the icon's tooltip and accessible name; the column header's tooltip
  is the legend. The Capabilities tab and the Consistency views keep the
  states as text.

### Patch Changes

- aed0b9c: Capabilities tab: the comparison's outcome and the review's result are announced, the focus never
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
- 1ed9e31: Capabilities tab: an action has its own states, inputs and place. The history's entries read _enable agent-platform by <actor> · Refused · 3 days ago_, with the action's own words and tones for the states an installation never has -- _Refused_, _Withdrawn_, _Reverted_ -- through the same status label the card uses, so no known state reads _Unknown_; each record lists what was asked for as a definition list, and links every repository and file the manager's message names. Every card ends with its last action -- verb, capability, state and when -- or _No action yet_. The history sits under its own header with a rule above it, no longer an h3 beside the cards.
- 7c5e287: The Capabilities tab's button names its outcome, and a disabled one is quiet. Once the
  comparison has landed, **Enable** and **Apply changes** carry the files a commit would change
  (_Apply changes · 2 files_), and the dialog's last step names the pull requests it opens
  (_Open 1 pull request_), so the card and the dialog say the same thing. A button the manager
  refuses, or that waits on a running action or comparison, is the secondary variant with its
  reason as the accessible description: the primary fill is the one button that can be
  pressed. A capability whose comparison did not run keeps the mark the Installations page
  shows it under, its tooltip reading _not installed: Not installed, not compared: <the
  manager's reason>_ instead of _unknown: Unknown_.
- d63665c: The Installations page's capability columns are there on the table's
  first render and the rows keep their height. The plugin knows the
  platform's capabilities by name (`agent-platform`, `customer-portal`) and
  renders their columns before anything has been asked of the manager; the
  manager's definitions and then the listing confirm the set, in name order
  whatever the source, so no column appears late or moves. Each cell's
  skeleton is laid out in the icon's own box, so a row is as tall before the
  icons arrive as after. Before, the columns waited for `get_info` (a second
  or two through the backend and muster) and the table laid out three times:
  its base columns, then the capability columns, then taller rows with the
  icons. The dev harness has a latency for `get_info` too.
- 582faca: **Enable** and **Apply changes** open a form seeded from the card's comparison, the person's
  choices only. The dialog took `installation.*` from the record and every other field from the
  schema's default, so Apply changes on a portal titled _Backstage_ opened with _Dev Portal_ in the
  Title field and would have renamed the portal on commit. Now the form holds what the comparison
  read back for every choice (`inputs.values`); a schema default is the empty field's placeholder,
  marked _(default)_, and never a submitted value; the registry's facts, generated and supplied
  values are not asked. Labels are the schema's titles, else the keys in words, qualified with the
  group where two share one (the five switches named `enabled` read Github, Grafana, Flux, Sentry,
  Tunnel); groups are `h3`/`h4` headings; a required choice without a value is marked on its field
  and named next to Review, each name leading to the field.

  `SectionHeader` takes an optional description: without one, the heading stands alone.

- f73f82e: The Capabilities tab no longer knows an installation opt-in. giantswarm-platform-manager
  stops reading `management-clusters/<name>/platform-manager.yaml`: a capability's fileset on
  record reads _enabled_ whoever put it there, and the manager's word for a refused commit is
  the one line under the button. Gone from the card: the owners' line that named the file and
  disabled **Enable** and **Apply changes** until an installation's owners had landed it, and
  the states `not opted in` and `enabled, not opted in`. **Enable** works where nothing is on
  record and **Apply changes** where the capability was installed by hand, the person's pull
  requests being the review.
- 33a02dc: The Installations table shows a capability the installation's owners enabled
  themselves, without the manager's opt-in, as installed but not reconciled
  (the blue sync mark) instead of not installed: the manager's state
  `enabled, not opted in` says the fileset is on record and the manager may
  not write to it; only `not enabled` and `not opted in`, where nothing is on
  record, keep the empty circle. The Capabilities tab reads "Installed" for it
  with its comparison, names the owners' file as before and keeps the button
  disabled. The dev harness has a row for the state.
- a69dadf: The **Enable** button on an installation's Capabilities tab works where nothing
  of the capability is on record, whether or not the installation's owners have
  landed the opt-in file. The card disabled it for every installation without
  `management-clusters/<name>/platform-manager.yaml` with `optIn: true`, naming
  the file the owners add first, so no capability could be enabled anywhere the
  declaration was not on record yet. The opt-in protects what is on record: the
  owners' line and the disabled button now belong to a capability the owners
  installed themselves without the opt-in (_Installed_, **Apply changes**
  disabled), and a fresh enable is the person's to review as pull requests.
  The manager's own reason for a refusal shows as before; a manager that still
  answers the state `not opted in` for nothing on record is read as not installed.
- ce9e155: Capabilities tab: the card is built from the portal's components. The state is a `StatusLabel` with the glyph the Installations page's cell shows for the same capability and the legend's gloss on its tooltip; the card is a bui `Card` with two labelled regions, _On record_ -- a definition list of the choices with what each is about under its value, the choices the record lacks marked in place -- and _Compared with the definition_; every file group and skipped-check note is an accordion, closed until opened; the diff's tints and every colour come from bui's tokens, so the card themes with the app. ui-react: `StatusLabel` lays out inline on request, `SectionHeader` takes an `id` for a region it names, `SyncMarkLabel` shows a mark with its words.
- 104f638: Capabilities tab: a choice not on record that the form has no field for — a list of objects such as the portal's friendly labels, friendly annotations or Flux repository patterns — is named by its key (_Friendly labels_) like every other choice, instead of by its dotted field.
- 1f00656: A card whose comparison is running shows a loading indicator, and Refresh runs the comparison
  again. The tab opened on one skeleton standing in for the cards and the history, then
  "Comparing with the definition…" was a small secondary line among lines of the same size, so a
  card mid-comparison looked like one that was done; the comparison runs for up to half a minute
  with no elapsed time and, cached until the page was left, no way to a fresh one but a reload.
  Meanwhile the choices rendered from the schema's defaults ("Title: Dev Portal"), then flipped to
  the record ("Backstage") as the comparison landed, with rows inserted above rows already read.
  Now the tab's load and a comparison in flight show the house `LoadingIndicator`, the label
  counting the seconds once ten have passed; the card holds the record back while the comparison
  runs -- the header's phase and the indicator, nothing else -- so the record appears once,
  complete, and the choices come from the comparison's inputs alone, never a schema default; a
  Refresh button on every card (icon and text, "Refresh comparison") re-runs the comparison in
  place, the caching otherwise unchanged.
- 7e92eb9: **Enable** and **Apply changes** stay clickable where the manager's only reason to refuse a
  commit is the choices not on record. The card disabled the button under the line
  "Choose chart.line; portal.domain; … before a commit", so a fresh customer-portal enable — whose
  domain, chart line and plugins are always the person's to type — could not open the dialog that
  asks for them. The line stays as the list of what the dialog asks; the manager's other refusals
  (the record's dex-app, a frozen value, a definition that refuses the record) still disable the
  button as before.
- 5c843a9: A refusal is an Alert with the manager's reason. Where the definition refused the comparison, the
  card led with "The comparison did not run: …" as a bare line styled like the choices under it,
  while the same sentence for a failed request rendered an Alert two lines later, the two flanking
  the record. The card now leads with one Alert carrying the reason alone — the header already says
  _not compared_ — `info` where the reason is an input the dialog supplies (the choices not on
  record, a value the sentence names that a person gives) and the button stays, `warning` where
  something is fixed first (a fact of the record, a file on record) and the button waits;
  _Comparing…_ and a failed request sit in the same place, above the record. The dialog's review
  shows the refusal — the definition's reason over the commit's copy of it — as the same Alert over
  the form kept editable, marks the fields the reason names, leads to them from the Alert and offers
  Review again, where it replaced the form with a warning whose only ways on were Cancel and Back.
- a8bb5a6: The Installations table's capability icons are the portal's shared
  `SyncMarkIcon`, coloured from the bui intent tokens so they follow the
  theme; the marks, glyphs and words are unchanged.
- 5b036fc: Capabilities tab: the choices not on record are named. The card lists every choice of the person the manager finds without a value (`inputs.unset` of the comparison) on one line by its label — qualified with its group where two choices of the definition share one, as _Grafana domain_ next to _Portal domain_ — instead of counting them, so a platform engineer sees which choices a portal's record lacks and whether the record could ever answer them. Needs a giantswarm-platform-manager that answers `inputs.unset`; the chosen values are listed as before.
- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [e62dd24]
- Updated dependencies [2494c9a]
- Updated dependencies [c5b9c46]
- Updated dependencies [d6bec76]
- Updated dependencies [c4f3eca]
- Updated dependencies [fedd5d8]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [9602074]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [5c82125]
- Updated dependencies [4f6d765]
- Updated dependencies [94a61cb]
- Updated dependencies [6b3ac77]
- Updated dependencies [b8afa37]
- Updated dependencies [398c4b1]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [14e878c]
- Updated dependencies [14e878c]
- Updated dependencies [1893681]
- Updated dependencies [e807fa6]
- Updated dependencies [b097034]
- Updated dependencies [6e0bd9d]
- Updated dependencies [b9433d4]
- Updated dependencies [322e58c]
- Updated dependencies [b990251]
- Updated dependencies [9e57736]
- Updated dependencies [a8bb5a6]
- Updated dependencies [1ec7387]
- Updated dependencies [d63665c]
- Updated dependencies [6ce4a71]
- Updated dependencies [600a4c3]
- Updated dependencies [e6ced92]
  - @giantswarm/backstage-plugin-ui-react@0.9.0
