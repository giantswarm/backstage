import { UsageDayEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { AgentRow } from '../AgentsDataProvider';
import { fillMissingDays, hasAnyUsage, toByAgentRows } from './helpers';

function agent(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'gazelle/kagent/sre-agent',
    installation: 'gazelle',
    namespace: 'kagent',
    name: 'SRE Agent',
    technicalName: 'sre-agent',
    description: '',
    ...overrides,
  } as AgentRow;
}

const hrefFor = (row: AgentRow) => `/agents/${row.installation}/${row.name}`;

describe('toByAgentRows', () => {
  const entry = {
    agentId: 'kagent__NS__sre_agent',
    sessions: 2,
    turns: 5,
    inputTokens: 100,
    outputTokens: 10,
  };

  it('resolves a matched agent to its display name and a link', () => {
    const [row] = toByAgentRows(
      [entry],
      'gazelle',
      [agent()],
      hrefFor,
      'Unattributed',
    );

    expect(row.agentName).toBe('SRE Agent');
    expect(row.href).toBe('/agents/gazelle/SRE Agent');
  });

  it('keeps an agent that matches no CR, shown decoded', () => {
    // It may have been deleted since, and its spend is still part of the total
    // above the table. Dropping it would make the two disagree.
    const [row] = toByAgentRows(
      [entry],
      'gazelle',
      [],
      hrefFor,
      'Unattributed',
    );

    // `decodeAgentIdLabel` keeps the namespace, which is more use than a bare
    // name when there is no CR to resolve against.
    expect(row.agentName).toBe('kagent/sre-agent');
    expect(row.href).toBeUndefined();
  });

  it('does not match an agent from another installation', () => {
    const [row] = toByAgentRows(
      [entry],
      'gazelle',
      [agent({ installation: 'golem' })],
      hrefFor,
      'Unattributed',
    );

    expect(row.agentName).toBe('kagent/sre-agent');
    expect(row.href).toBeUndefined();
  });

  it('labels a null agent with the caller’s wording', () => {
    // The wire leaves `null` unlabelled on purpose, so a copy change stays a
    // frontend change.
    const [row] = toByAgentRows(
      [{ ...entry, agentId: null }],
      'gazelle',
      [],
      hrefFor,
      'Unattributed',
    );

    expect(row.agentName).toBe('Unattributed');
    expect(row.href).toBeUndefined();
  });
});

describe('fillMissingDays', () => {
  const day = (d: string, inputTokens = 0): UsageDayEntry => ({
    day: d,
    inputTokens,
    outputTokens: 0,
    turns: inputTokens > 0 ? 1 : 0,
  });

  it('fills a gap with zeros and keeps the values it has', () => {
    // A bar chart handed a sparse series silently compresses the timeline —
    // N bars that do not mean N days.
    const filled = fillMissingDays(
      [day('2026-09-01', 100), day('2026-09-04', 400)],
      3,
    );

    expect(filled.map(entry => entry.day)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
    expect(filled.map(entry => entry.inputTokens)).toEqual([100, 0, 0, 400]);
  });

  it('leaves an empty series alone', () => {
    expect(fillMissingDays([], 30)).toEqual([]);
  });

  it('leaves an unparseable first day alone rather than inventing a range', () => {
    const sparse = [day('not-a-date', 5)];
    expect(fillMissingDays(sparse, 3)).toBe(sparse);
  });
});

describe('hasAnyUsage', () => {
  it('is false for no summary and for an empty window', () => {
    expect(hasAnyUsage(undefined)).toBe(false);
    expect(hasAnyUsage({ totals: { sessions: 0 } } as never)).toBe(false);
  });

  it('is true once a session had activity in the window', () => {
    expect(hasAnyUsage({ totals: { sessions: 1 } } as never)).toBe(true);
  });
});
