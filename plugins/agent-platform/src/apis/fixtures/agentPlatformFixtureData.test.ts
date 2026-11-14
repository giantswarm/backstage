import {
  encodeKagentAgentId,
  normalizeSessionList,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  AGENT_STATES,
  createFixtureDataSet,
  inInstallation,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import {
  Agent,
  deriveAgentReadiness,
  type AgentReadiness,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { isPendingErase } from '../../components/OrganizationPage/OrganizationStatusAlert';
import { awaitsDefaultModel } from '../../lib/agentManager';
import {
  mayCreateAgentsIn,
  organizationNamespacesOf,
} from '../../lib/organizations';
import {
  agentManagerAgentOf,
  agentObjectOf,
  kagentSessionsOf,
  listedOrganizationOf,
  sessionRecordOf,
} from './agentPlatformFixtureData';

const now = Date.parse('2026-11-14T12:00:00Z');
const at = new Date(now).toISOString();
const data = createFixtureDataSet({ now });
const rendered = data.agents.filter(agent => agent.release === 'ready');

/** Every readiness the portal derives; a missing key fails the build. */
const READINESS: Record<AgentReadiness, true> = {
  ready: true,
  notReady: true,
  failed: true,
  pending: true,
};

describe('agent-platform fixture data', () => {
  it('has an agent in every readiness the portal derives', () => {
    expect(new Set(AGENT_STATES)).toEqual(new Set(Object.keys(READINESS)));
  });

  it('maps agents onto Agent objects whose conditions read as their state', () => {
    for (const agent of rendered) {
      const json = agentObjectOf(agent, at)!;
      expect(deriveAgentReadiness(json)).toBe(agent.state);
      const object = new Agent(json, agent.installation);
      expect(object.getName()).toBe(agent.name);
      expect(object.getNamespace()).toBe(agent.namespace);
      expect(object.getDisplayName()).toBe(agent.displayName);
      expect(object.getDescription()).toBe(agent.description);
      expect(object.getHarnessName()).toBe('kagent');
      expect(object.getReadiness()).toBe(agent.state);
      expect(object.isBootPending()).toBe(agent.state === 'notReady');
      expect(object.getFailure()?.field).toBe(
        agent.state === 'failed' ? 'model' : undefined,
      );
    }
  });

  it('renders no Agent object for the agent whose release failed', () => {
    const failed = data.agents.filter(agent => agent.release === 'failed');
    expect(failed).toHaveLength(1);
    expect(agentObjectOf(failed[0], at)).toBeUndefined();
    expect(agentManagerAgentOf(failed[0])).toMatchObject({
      exists: false,
      ready: null,
      status: { exists: false },
      helmRelease: { ready: false, reason: 'InstallFailed' },
    });
  });

  it('maps agents onto what get_agent reads back, the release ready apart from the agent', () => {
    for (const agent of rendered) {
      const answer = agentManagerAgentOf(agent);
      expect(answer).toMatchObject({
        name: agent.name,
        namespace: agent.namespace,
        displayName: agent.displayName,
        description: agent.description,
      });
      expect(answer.ready).toBe(
        { ready: true, notReady: false, failed: false, pending: null }[
          agent.state
        ],
      );
      expect(answer.helmRelease?.ready).toBe(true);
      expect(awaitsDefaultModel(answer)).toBe(false);
    }
  });

  it('maps organizations onto what list_organizations lists', () => {
    const listing = {
      organizations: data.organizations.map(listedOrganizationOf),
    };
    expect(organizationNamespacesOf(listing)).toEqual(
      data.organizations
        .filter(organization => organization.namespace)
        .map(organization => ({
          namespace: organization.namespace,
          organization: organization.name,
          parent: organization.parent,
          displayName: organization.displayName,
        })),
    );
    for (const [index, listed] of listing.organizations.entries()) {
      const { state, role } = data.organizations[index];
      expect(listed.deleting === true).toBe(state === 'deleting');
      expect(listed.orphaned?.status === 'True').toBe(
        state === 'orphaned' || state === 'pendingErase',
      );
      expect(isPendingErase(listed)).toBe(state === 'pendingErase');
      expect(listed.namespace === undefined).toBe(state === 'pending');
      expect(mayCreateAgentsIn(listed)).toBe(
        role === 'admin' || role === 'editor',
      );
      expect(listed.permissions.member).toBe(role !== 'none');
      expect(listed.organization !== undefined).toBe(role === 'admin');
    }
  });

  it('lets the person read but not create agents in some organization', () => {
    const listed = data.organizations.map(listedOrganizationOf);
    expect(
      listed.filter(o => o.permissions.member && !mayCreateAgentsIn(o)),
    ).not.toEqual([]);
    expect(
      listed.filter(o => o.namespace === undefined).map(o => o.permissions),
    ).toEqual(
      expect.arrayContaining([
        { manage: false, member: false, createAgents: false },
      ]),
    );
  });

  it('gives a missing or deleted organization the revision Flux last applied', () => {
    for (const organization of data.organizations) {
      const { organization: details } = listedOrganizationOf({
        ...organization,
        role: 'admin',
      });
      expect(details?.lastAppliedRevision !== undefined).toBe(
        organization.state === 'orphaned' ||
          organization.state === 'pendingErase',
      );
    }
  });

  it('maps sessions onto what listSessions returns, through the real parser', () => {
    const installation = 'meadow';
    const sessions = inInstallation(data.sessions, installation);
    expect(sessions.length).toBeLessThan(data.sessions.length);
    const parsed = normalizeSessionList(
      { sessions: sessions.map(sessionRecordOf) },
      installation,
    );
    expect(parsed.drift).toBeUndefined();
    // Given every installation's sessions, it keeps the installation's own.
    expect(kagentSessionsOf(data.sessions, installation)).toEqual(
      parsed.sessions,
    );
    expect(parsed.sessions).toHaveLength(sessions.length);
    for (const [index, session] of parsed.sessions.entries()) {
      const fixture = sessions[index];
      expect(session).toMatchObject({
        id: `${installation}/${fixture.id}`,
        sessionId: fixture.id,
        installation,
        title: fixture.title,
        agent: fixture.agent,
        agentId: encodeKagentAgentId(
          fixture.agent.namespace,
          fixture.agent.name,
        ),
        state: fixture.state,
        createdAt: fixture.createdAt,
        updatedAt: fixture.updatedAt,
        contextId: fixture.id,
      });
      expect(session.failure !== undefined).toBe(fixture.state === 'failed');
    }
  });
});
