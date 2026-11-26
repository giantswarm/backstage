import type { ApprovalView } from '@giantswarm/backstage-plugin-muster';
import { expiresIn, otherAgent, whyItAsks } from './InlineApproval';

const view = (agent?: ApprovalView['agent']) => ({ agent }) as ApprovalView;

describe('InlineApproval helpers', () => {
  it('names the asking agent only when it is not the conversation’s', () => {
    const session = { namespace: 'team-a', name: 'review' };
    expect(
      otherAgent(view({ namespace: 'team-a', name: 'review' }), session),
    ).toBeUndefined();
    expect(otherAgent(view({ name: 'review' }), session)).toBeUndefined();
    expect(otherAgent(view(), session)).toBeUndefined();
    expect(
      otherAgent(view({ namespace: 'team-a', name: 'review' }), undefined),
    ).toBeUndefined();
    expect(
      otherAgent(view({ namespace: 'team-b', name: 'review' }), session),
    ).toBe('team-b/review');
    expect(
      otherAgent(view({ namespace: 'team-a', name: 'sub' }), session),
    ).toBe('team-a/sub');
  });

  it('says when the request expires', () => {
    const now = Date.parse('2026-11-26T10:00:00Z');
    expect(expiresIn('2026-11-26T10:04:59Z', now)).toBe('in 4 min');
    expect(expiresIn('2026-11-26T10:00:30Z', now)).toBe(
      'in less than a minute',
    );
    expect(expiresIn('2026-11-26T09:59:00Z', now)).toBe('now');
    expect(expiresIn('garbage', now)).toBe('now');
  });

  it('says why it asks in plain words', () => {
    expect(whyItAsks('governance')).toContain('governance');
    expect(whyItAsks('builtin')).toContain('built-in');
    expect(whyItAsks('agent')).toBe("this agent's setting");
    expect(whyItAsks('new-source')).toBe('new-source setting');
  });
});
