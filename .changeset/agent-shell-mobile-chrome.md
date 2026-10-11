---
'app': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agent shell on a phone (T22 wave 1B):

- **Bottom bar**: five labelled items — New session, Sessions, Search,
  Customize, Profile — each a 48px-tall target with its label under the icon
  and the current one marked along the top edge. Usage and the Platform Portal
  link move into the Profile menu, and Profile is marked current on the pages
  only its menu leads to.
- **Typing a message**: on a touch screen Enter starts a new line and the Send
  button sends; a keyboard keeps Enter to send and Shift+Enter for a new line.
  `isSendKey` answers for the input in use, and `sendKeyCaption` /
  `sendEnterKeyHint` word and label it for the box.
- **Form fields** are 16px at phone width, so iOS Safari no longer zooms into
  a field on focus.
- **The bar steps aside** while a text field has focus on a touch phone, so
  the soft keyboard does not leave it eating the conversation's height.
- **Toasts** sit above the bottom bar, and above the session's docked composer
  wherever the page publishes its height.
- **bui tables** that still show four or more columns at phone width scroll
  sideways inside themselves instead of clipping their values and action
  buttons, and their sort arrows show on touch screens.
- **Recent sessions** in the rail keep their pin button visible on touch
  screens, which have no hover to reveal it.
