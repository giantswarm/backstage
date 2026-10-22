---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

The new-agent form no longer loses what was entered when the person leaves
it: it keeps a draft in the browser tab, per person, and fills it in again
after a reload, a sign-in redirect, the browser's Back or a link followed in
the same tab, saying "Your draft is back" with **Start over** to begin empty.
Creating the agent, opening its pull request, Start over and Discard changes
drop the draft. Links inside the form, including the Environment card's
sign-in links, open in a new tab and say so. The Environment card says what an
environment it could not check means for the agent being created, and **Check
again** reads it anew after signing in to muster there.

ui-react adds `useSessionDraft`, which keeps a form's draft in the tab's
`sessionStorage` per person, `DraftRestoredAlert`, `NewTabLink`, and
`WizardFrame`'s `onDiscard`.
