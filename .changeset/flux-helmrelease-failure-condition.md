---
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-flux-react': minor
---

Show the condition that explains the failure on the Flux HelmRelease details
card, instead of the rollback that hides it.

- helm-controller summarizes a release into `Ready` by mirroring one of
  `Released`, `TestSuccess` or `Remediated` into it verbatim — same reason, same
  message. So a failed upgrade showed its real error only until the failure was
  remediated: the rollback then overwrote `Ready` with "Helm rollback to previous
  release … succeeded", and the card switched from the error to information about
  the previous, working release. The new
  `HelmRelease.findFailureCauseCondition()` returns the failing `Released` (or
  `TestSuccess`) condition, which keeps the error until the next release attempt,
  and the card takes its Status, Message and failure time from there. Where
  several release conditions are failing, the most recent transition wins — an
  upgrade that succeeded with failing Helm tests leaves `Released` true and
  `TestSuccess` false, and a failed upgrade can leave a stale failing
  `TestSuccess` from an earlier cycle behind.
- The same substitution fixes a stalled release, observed live: helm-controller
  stops retrying, sets `Stalled`, and leaves `Ready` at `Unknown` with
  "reconciliation in progress" — so the card reported a release that failed two
  months ago as "Last reconciled". `Ready` is treated as uninformative when it is
  `Unknown` on a stalled release, which is safe because `Unknown` never reports a
  failure; a blocker always writes `False`.
- Substitution otherwise requires `Ready` to be a verbatim mirror of `Remediated`
  (or of a `True` `Stalled`), not an allow-list of remediation reasons. The mirror
  test keeps a newer, unrelated blocker visible: when the object fails again
  after the rollback for a reason that never reaches a release attempt
  (`ArtifactFailed`, `DependencyNotReady`, a missing `valuesFrom` Secret, a
  denied release), `Ready` carries that current blocker, no longer equals the
  remediation, and the older — now misleading — upgrade error is not shown. It
  also covers remediation flavours a reason list would miss: a failed _install_
  is remediated by an uninstall, and the rollback itself can fail (`Remediated`
  is then `False`, and still mirrored into `Ready`).
- Nothing is substituted while the release is ready or a reconciliation is in
  flight. A HelmRelease with `spec.test.ignoreFailures` stays ready with
  `TestSuccess` failing, and a fresh reconcile of a previously failed object can
  be progressing with a stale failing `Released` left over from the previous
  generation — in neither case is that failure the current state.
- The remediation is kept as a single line ("Rollback succeeded", "Uninstall
  succeeded", …) rather than dropped, since its full message only restates the
  chart version shown above it. The exception is a remediation that failed
  itself, where the message is the news and is shown in full. A new `Attempted`
  row names the revision the failed release tried, so the running `Chart Version`
  and the version the error talks about can be told apart, and the Status line
  notes when the retries are exhausted.
- The card's AI chat prompt and the resource tree's search over failure messages
  use the same condition, so neither asks about — nor matches on — the rollback
  message any more. The button also offers to troubleshoot whenever a release
  failure is known, rather than only when `Ready` is `False`, which is what a
  stalled release with an `Unknown` `Ready` condition needs.
