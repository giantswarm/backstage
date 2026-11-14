import { MCPServer } from './k8s';
import {
  connectorAuthName,
  familyAccess,
  instanceAccess,
} from './connectorAccess';

const server = (
  name: string,
  namespace = 'agent-platform',
  suspended = false,
) =>
  new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name, namespace },
      spec: {
        type: 'streamable-http',
        url: 'https://example.test/mcp',
        suspended,
        auth: { type: 'oauth', authorizationServer: { grantScope: 'subject' } },
      },
      status: { state: 'Connected' },
    } as never,
    'gazelle',
  );

describe('personal connector access', () => {
  it('uses the personal connection independently of global health', () => {
    const member = server('a');
    member.jsonData.status!.state = 'Failed';
    expect(
      instanceAccess(member, {
        servers: [{ name: 'a', status: 'connected', kind: 'sso' }],
      }).reach,
    ).toBe('connected');
  });
  const members = [server('a'), server('b')];
  it('does not confuse healthy CRs with personal grants', () => {
    const data = {
      servers: members.map(member => ({
        name: member.getName(),
        status: 'auth_required' as const,
        kind: 'grant' as const,
        auth_tool: 'core_auth_login',
      })),
    };
    expect(familyAccess(members, data)).toMatchObject({
      reach: 'sign-in',
      status: { label: 'Sign in needed' },
    });
  });
  it('keeps partially available families distinct from fully connected ones', () => {
    expect(
      familyAccess(members, {
        servers: [
          { name: 'a', status: 'connected' },
          { name: 'b', status: 'reauth_required' },
        ],
      }),
    ).toMatchObject({
      reach: 'partial',
      status: { label: 'Partly connected' },
    });
    expect(
      familyAccess(members, {
        servers: members.map(member => ({
          name: member.getName(),
          status: 'connected',
        })),
      }),
    ).toMatchObject({ reach: 'connected' });
  });
  it('reports unreadable and missing personal status without claiming a connection', () => {
    expect(
      familyAccess(members, { servers: [], unavailable: true }).status.label,
    ).toBe('Status unavailable');
    expect(familyAccess(members, { servers: [] }).status.label).toBe(
      'Status unavailable',
    );
    expect(familyAccess(members).status.label).toBe('Checking access');
  });
  it('uses qualified registration names without matching another namespace', () => {
    const tenant = server('a', 'tenant');
    expect(connectorAuthName(tenant)).toBe('tenant/a');
    expect(
      instanceAccess(tenant, {
        servers: [
          { name: 'a', status: 'connected' },
          { name: 'tenant/a', status: 'auth_required' },
        ],
      }).reach,
    ).toBe('sign-in');
  });
  it('distinguishes SSO failures and deactivation from a missing grant', () => {
    expect(
      familyAccess(members, {
        servers: members.map(member => ({
          name: member.getName(),
          status: 'auth_required',
          kind: 'sso',
        })),
      }),
    ).toMatchObject({
      reach: 'not-connected',
      status: { label: 'Cannot connect' },
    });
    expect(instanceAccess(server('a', 'agent-platform', true)).reach).toBe(
      'deactivated',
    );
    expect(
      instanceAccess(server('a'), {
        servers: [{ name: 'a', status: 'failed' }],
      }).reach,
    ).toBe('not-connected');
  });
});
