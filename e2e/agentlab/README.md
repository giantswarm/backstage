# The Dev Portal in a browser, against agentlab

Playwright drives the portal the way a person does — the Dex sign-in popup,
the tabs, the wizard, a chat turn — against a running
[agentlab](https://github.com/giantswarm/agentlab). It is the browser-level
complement of `agentlab backstage-test`, which proves the same portal's routes
and tokens headlessly and renders no page. A change to a page ships with the
spec that proves it.

## Run

```bash
# once: a Playwright browser
yarn playwright install chromium

# the lab is up (`agentlab up`), or was just reconciled with your dev image
# (`platform.devImages.backstage` + `agentlab platform`)
yarn test:e2e:agentlab

yarn test:e2e:agentlab --grep-invert lifecycle   # the pages only, ~1 min
yarn test:e2e:agentlab -g 'MCP servers'          # one spec
yarn test:e2e:agentlab --headed                  # watch it
yarn playwright show-report e2e-test-report/agentlab
```

| Variable                 | Default                              | Meaning                                    |
| ------------------------ | ------------------------------------ | ------------------------------------------ |
| `AGENTLAB_BACKSTAGE_URL` | `https://backstage.127.0.0.1.nip.io` | the lab portal (another lab, another port) |
| `AGENTLAB_PASSWORD`      | `password`                           | the lab users' fixture password            |
| `AGENTLAB_INSTALLATION`  | `agent-platform`                     | the platform's Helm release name           |
| `AGENTLAB_E2E_WORKERS`   | `1`                                  | parallel workers, each with one sign-in    |

The lab's certificates are signed by the lab CA; the suite ignores TLS errors
so no `agentlab trust` is needed.

## The lab users are fixtures

`admin@lab.local`, `dev@lab.local` and `viewer@lab.local` with the password
`password` are the throwaway accounts of the lab's static-password Dex
connector, listed in clear text in its `agentlab.yaml`. The suite types that
password into the lab Dex's form because that is how the portal is signed in
to; there is nothing else to protect. Real people's accounts and any real
installation's sign-in are a different matter and out of this suite's reach.

## What it covers

| Spec                           | Proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sign-in.spec.ts`              | each lab user signs in through the Dex popup, Settings names them, Sign Out returns to the sign-in page; a wrong password is refused by Dex and the portal stays signed out; the second try in the same popup succeeds                                                                                                                                                                                                                                                                                                                                             |
| `navigation.spec.ts`           | the sidebar's links, the Agent Platform tabs and every second-level tab row (Models, Usage, MCP Servers), the Catalog / Clusters / Deployments headers, Settings' tabs, the not-found page                                                                                                                                                                                                                                                                                                                                                                         |
| `agents.spec.ts`               | the roster's columns, an agent's detail page, the New agent wizard's Details step (slug derivation, the ModelConfigs offered)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `models.spec.ts`               | Model configs lists the lab's `default-model-config` and offers Add model; Serving and GPU capacity render                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `model-backends.spec.ts`       | Add model backend registers the lab's Ollama through model-manager over muster (dry run → document → Deploy) and its Serving group appears with its source; Remove backend (typed confirm) removes it; a KServe registered without a pool is listed under Backends without models and removed from its row                                                                                                                                                                                                                                                         |
| `serving-state.spec.ts`        | the Serving page on a served model that is not Ready (#2400), with model-manager's two reads stubbed at the browser in the shapes 0.23.4 produces for a kserve backend whose LLMInferenceService's predictor pod waits for a GPU node: **Pending · Unschedulable** with the scheduler's text under the label and on hover. The lab has no KServe, so the answer is staged; nothing is written                                                                                                                                                                      |
| `mcp-servers.spec.ts`          | the three server groups, a row's disclosure, Connect to muster, the `lab-oauth-fixture` per-server Sign in through Dex (Sign out offered afterwards), the Tool explorer listing muster's core tools                                                                                                                                                                                                                                                                                                                                                                |
| `agent-lifecycle.spec.ts`      | create an agent in the wizard (Details → Skills → Tools → Review → Deploy agent), the Ready verdict on its page, a session started from there with an answered first message, Delete agent from the actions menu                                                                                                                                                                                                                                                                                                                                                   |
| `session-runtime-lost.spec.ts` | a session whose runtime kagent cannot bring back (#2388), with kagent's answers for that one session stubbed at the browser: the failed turn and the notice worded in the portal's words with the runtime's text as evidence, Send kept beside **Start a new session with &lt;agent&gt;**; after kagent's `RUNTIME_LOST` mark the header badge, Send yielding to the new session, the Sessions list's mark; the new session opened for real on the message that never got its answer; both sessions deleted through the portal. Needs an agent on the installation |
| `repositories.spec.ts`         | the Repositories page over giantswarm-repo-manager through muster (#2398): the default scope and the tiles, the switch to All repositories kept in the URL, a row expanded to its record with the set-up steps and Refresh, a viewer without a grant sent through muster's connect and back. Skipped unless `AGENTLAB_REPO_MANAGER=1` says the lab's muster serves the manager and its Backstage enables `page:repositories`                                                                                                                                       |

## How it signs in

Each worker opens one browser context, signs in as `admin@lab.local` once
and keeps that context for all of its tests (`fixtures.ts`). Playwright's
usual saved `storageState` does not fit this portal: its session rests on
Dex's refresh token, which Dex rotates on every silent re-login, so two live
contexts holding the same cookie sign each other out and a saved state goes
stale after one use. Tests that need another user open their own context
(`signInAs`).

## Lab conditions that are not portal bugs

- A Backstage pod roll (a dev-image swap) drops every session — the lab runs
  an in-memory sqlite. The suite signs in fresh, so it does not notice; a
  browser you keep open does.
- For up to five minutes after a roll the backend's cached reachability probe
  can call the installation unreachable: **Connect to muster** does nothing
  and the wizard offers no installation. The specs fail with that hint; wait
  it out or `kubectl -n agent-platform rollout restart deploy/backstage`.
- The lab logs plenty of console errors that are expected there (a host model
  server that is down, a `vm-manager` that is not running). The suite fails
  only on uncaught page errors.
- Skill discovery shares GitHub's unauthenticated 60 requests/hour with
  everything else on the machine.
