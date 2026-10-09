import { render, screen } from '@testing-library/react';
import { AgentReachLine, describeReach } from './AgentReachLine';

describe('describeReach', () => {
  it('names the declared servers, workflows and tools', () => {
    expect(
      describeReach({
        state: 'declared',
        carrier: 'sre-agent',
        selectors: ['server:jira', 'server:slack', 'workflow:triage'],
      }),
    ).toBe('Can use jira, slack and triage');
  });

  it('names a labelled preset by its label', () => {
    expect(
      describeReach({
        state: 'declared',
        carrier: 'sre-agent',
        selectors: ['preset:read-only'],
      }),
    ).toBe('Can use Read-only tools');
  });

  it('says when the agent has no connectors', () => {
    expect(describeReach({ state: 'no-gateway' })).toBe('Has no connectors');
    expect(
      describeReach({
        state: 'declared',
        carrier: 'sre-agent',
        selectors: ['preset:none'],
      }),
    ).toBe('Has no connectors');
  });

  it('says when the agent reaches everything its invoker can', () => {
    expect(describeReach({ state: 'implicit-full', carrier: 'muster' })).toBe(
      'Can use every connector you can',
    );
  });

  it('says nothing when the toolset is not known', () => {
    expect(describeReach(undefined)).toBeUndefined();
    expect(
      describeReach({ state: 'unresolved', carrier: 'sre-agent' }),
    ).toBeUndefined();
  });
});

describe('AgentReachLine', () => {
  it('renders the sentence', () => {
    render(
      <AgentReachLine
        toolset={{
          state: 'declared',
          carrier: 'sre-agent',
          selectors: ['server:github'],
        }}
      />,
    );

    expect(screen.getByText('Can use github')).toBeInTheDocument();
  });

  it('renders nothing for an unknown toolset', () => {
    const { container } = render(<AgentReachLine />);

    expect(container).toBeEmptyDOMElement();
  });
});
