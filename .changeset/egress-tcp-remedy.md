---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Session egress refusals: a refused raw TCP connection now gets one remedy on
every runtime, whoever the person is: "No egress setting can allow it. If
{host} offers HTTPS, have {agent} use that instead.", with no link. It no
longer suggests asking the platform team or editing the agent, neither of
which can allow raw TCP. The wording matches klaus-gateway's Slack notice.
HTTP and HTTPS refusals keep their remedies.
