---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-analytics-react': patch
'app': patch
---

An Agent Platform organization's credentials are entered on the Dev Portal's credential form, never in a tool call.

- agent-platform-backend: `GET`, `POST` and `DELETE`
  `/organizations/credential-operations/:operation?installation=` carry
  agent-manager's credential operations (giantswarm/agent-manager#312) as the
  person, with the installation token in `backstage-agent-manager-authorization`,
  to `https://agentgateway.<baseDomain>/agent-manager` (the agent-platform
  chart's `agentManager.route`) or
  `agentPlatform.agentManager.installations.<name>.apiBaseUrl`. The POST body
  is validated and never logged or echoed; `If-Match` is required on POST and
  DELETE (428 without it); every answer is `Cache-Control: no-store`; refusals are the
  backend's error body with agent-manager's `code`. A save that runs past
  120 s, loses its connection or is refused by a gateway answers code
  `outcome_unknown`.
- agent-platform: `/organizations/<installation>/<parent>/<name>/credentials/<operation>`,
  the link agent-manager's `credentials.uiURL` names
  (`…/credentials/{operation}`), shows what the value is for (the
  organization agent-manager prepared it for, refusing a link that names
  another, the object that asked, the other objects that read it, where it
  is sent, and the pull request's repository in commit mode) before it takes
  a value, saves it once with the confirmation's version, and never shows it
  back. A changed request is read again; a save interrupted on
  agent-manager's side is finished from the page; a commit without the
  GitHub grant offers the connection. The Models tab's Add model and Replace
  key, and the Connectors tab's Replace credential, ask agent-manager as the
  person and open the form for the request it prepares (its
  `credentialOperation`).
- analytics-react: `AgentPlatform.organizationCredentialSaved`.
- app: the form's page view, without the request's id.
