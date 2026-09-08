import { UsageDayEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { AgentRow } from '../AgentsDataProvider';
import {
  fillMissingDays,
  hasAnyUsage,
  toByAgentRows,
  toByModelRows,
} from './helpers';

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

describe('toByModelRows', () => {
  const sre = {
    agentId: 'kagent__NS__sre_agent',
    sessions: 2,
    turns: 5,
    inputTokens: 100,
    outputTokens: 10,
  };
  const reviewer = {
    agentId: 'kagent__NS__reviewer',
    sessions: 1,
    turns: 3,
    inputTokens: 50,
    outputTokens: 5,
  };

  it('aggregates two agents that share a model into one row', () => {
    const rows = toByModelRows(
      [sre, reviewer],
      'gazelle',
      [
        agent({ technicalName: 'sre-agent', model: 'GPT-4o' }),
        agent({
          id: 'gazelle/kagent/reviewer',
          technicalName: 'reviewer',
          name: 'Reviewer',
          model: 'GPT-4o',
        }),
      ],
      'Unknown model',
    );

    expect(rows).toEqual([
      {
        id: 'GPT-4o',
        model: 'GPT-4o',
        agents: 2,
        sessions: 3,
        turns: 8,
        inputTokens: 150,
        outputTokens: 15,
      },
    ]);
  });

  it('keeps different models apart, biggest spend first', () => {
    const rows = toByModelRows(
      [sre, reviewer],
      'gazelle',
      [
        agent({ technicalName: 'sre-agent', model: 'Claude' }),
        agent({
          id: 'gazelle/kagent/reviewer',
          technicalName: 'reviewer',
          name: 'Reviewer',
          model: 'GPT-4o',
        }),
      ],
      'Unknown model',
    );

    expect(rows.map(r => [r.model, r.inputTokens])).toEqual([
      ['Claude', 100],
      ['GPT-4o', 50],
    ]);
  });

  it('groups an agent with no resolvable model under the caller’s label', () => {
    // Both cases land here: the CR is not in view (deleted, or another
    // installation), and an agent that genuinely references no model. Its spend
    // still belongs in the totals above, so it must not be dropped.
    const rows = toByModelRows(
      [sre, reviewer],
      'gazelle',
      [agent({ technicalName: 'sre-agent', model: undefined })],
      'Unknown model',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: 'Unknown model',
      agents: 2,
      inputTokens: 150,
    });
  });

  it('groups a null agent under the same label', () => {
    const rows = toByModelRows(
      [{ ...sre, agentId: null }],
      'gazelle',
      [],
      'Unknown model',
    );

    expect(rows[0]).toMatchObject({ model: 'Unknown model', agents: 1 });
  });

  it('does not resolve a model from another installation', () => {
    const rows = toByModelRows(
      [sre],
      'gazelle',
      [
        agent({
          installation: 'golem',
          technicalName: 'sre-agent',
          model: 'GPT-4o',
        }),
      ],
      'Unknown model',
    );

    expect(rows[0].model).toBe('Unknown model');
  });

  it('returns nothing for no agents', () => {
    expect(toByModelRows([], 'gazelle', [], 'Unknown model')).toEqual([]);
  });
});
