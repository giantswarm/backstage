import type { AgentRow } from '../components/AgentsDataProvider';
import {
  LINKED_AGENT_SHOWN_MAX_LENGTH,
  resolveLinkedAgent,
  shownLinkedAgentRef,
  LINKED_PROMPT_MAX_LENGTH,
  isNewSessionLink,
  linkedPromptOf,
  newSessionHref,
  splitPromptFragment,
} from './newSessionLink';

const agent = (installation: string, namespace: string, name: string) =>
  ({
    id: `${installation}/${namespace}/${name}`,
    installation,
    namespace,
    technicalName: name,
  }) as AgentRow;

describe('newSessionHref', () => {
  it('names the agent by its encoded id', () => {
    expect(newSessionHref('/', agent('golem', 'kagent', 'default-agent'))).toBe(
      '/?agent=golem%2Fkagent%2Fdefault-agent',
    );
    expect(newSessionHref('/')).toBe('/');
  });
});

describe('linkedPromptOf', () => {
  it('trims the prompt and cuts it to the bound', () => {
    expect(linkedPromptOf('  Watch the backups \n')).toBe('Watch the backups');
    expect(
      linkedPromptOf('x'.repeat(LINKED_PROMPT_MAX_LENGTH + 10)),
    ).toHaveLength(LINKED_PROMPT_MAX_LENGTH);
  });

  it('never splits a character at the bound', () => {
    const cut = linkedPromptOf(
      `${'x'.repeat(LINKED_PROMPT_MAX_LENGTH - 1)}\u{1F600}tail`,
    )!;
    expect(cut.endsWith('\u{1F600}')).toBe(true);
    expect(Array.from(cut)).toHaveLength(LINKED_PROMPT_MAX_LENGTH);
  });

  it('reads no prompt from a missing or blank value', () => {
    expect(linkedPromptOf(null)).toBeUndefined();
    expect(linkedPromptOf('   ')).toBeUndefined();
  });
});

describe('splitPromptFragment', () => {
  it('takes the prompt out, keeping the other parts as written', () => {
    expect(splitPromptFragment('#composer&prompt=Watch%20backups+now')).toEqual(
      { prompt: 'Watch backups now', rest: '#composer' },
    );
    expect(splitPromptFragment('#prompt=Hi')).toEqual({
      prompt: 'Hi',
      rest: '',
    });
    expect(splitPromptFragment('#details')).toEqual({
      prompt: null,
      rest: '#details',
    });
  });
});

describe('isNewSessionLink', () => {
  const at = (href: string) => new URL(href, 'https://portal.example');
  it('is the home with an agent or a prompt', () => {
    expect(isNewSessionLink(at('/?agent=a%2Fb'), '/')).toBe(true);
    expect(isNewSessionLink(at('/#prompt=Hi'), '/')).toBe(true);
    expect(isNewSessionLink(at('/'), '/')).toBe(false);
    expect(isNewSessionLink(at('/sessions?agent=a'), '/')).toBe(false);
    expect(isNewSessionLink(at('/?agent=a'), undefined)).toBe(false);
  });
});

describe('resolveLinkedAgent', () => {
  const home = agent('golem', 'agents', 'helper');
  const other = agent('gazelle', 'agents', 'helper');
  const solo = agent('gazelle', 'kagent', 'sre-agent');
  const installations = ['golem', 'gazelle'];
  const offered = () => true;

  it('finds the agent by id', () => {
    expect(
      resolveLinkedAgent([home, other], other.id, offered, installations),
    ).toEqual({ status: 'found', agent: other });
  });

  it('finds the first agent of that namespace and name', () => {
    expect(
      resolveLinkedAgent(
        [home, other],
        'agents/helper',
        offered,
        installations,
      ),
    ).toEqual({ status: 'found', agent: home });
  });

  it('prefers an agent that can start, and says when none can', () => {
    expect(
      resolveLinkedAgent(
        [home, other],
        'agents/helper',
        a => a !== home,
        installations,
      ),
    ).toEqual({ status: 'found', agent: other });
    expect(
      resolveLinkedAgent([home], home.id, () => false, installations),
    ).toEqual({ status: 'unavailable', agent: home });
  });

  it('finds the one agent of that namespace and name under an installation the portal does not know', () => {
    // agent-manager may report an installation name the portal does not use.
    expect(
      resolveLinkedAgent(
        [home, solo],
        'agent-platform/kagent/sre-agent',
        offered,
        installations,
      ),
    ).toEqual({ status: 'found', agent: solo });
  });

  it('picks no installation when several have that namespace and name', () => {
    expect(
      resolveLinkedAgent(
        [home, other],
        'agent-platform/agents/helper',
        offered,
        installations,
      ),
    ).toEqual({ status: 'ambiguous' });
  });

  it('never swaps a known installation for another', () => {
    expect(
      resolveLinkedAgent(
        [other],
        'golem/agents/helper',
        offered,
        installations,
      ),
    ).toEqual({ status: 'missing', installation: 'golem' });
  });

  it('finds nothing for an unknown agent or a reference of another shape', () => {
    expect(
      resolveLinkedAgent([home], 'agents/nobody', offered, installations),
    ).toEqual({ status: 'missing' });
    expect(
      resolveLinkedAgent([home], 'helper', offered, installations),
    ).toEqual({ status: 'missing' });
    expect(
      resolveLinkedAgent(
        [home],
        'x/golem/agents/helper',
        offered,
        installations,
      ),
    ).toEqual({ status: 'missing' });
  });
});

describe('shownLinkedAgentRef', () => {
  it('repeats an agent reference', () => {
    expect(shownLinkedAgentRef('gazelle/kagent/sre-agent')).toBe(
      'gazelle/kagent/sre-agent',
    );
    expect(shownLinkedAgentRef('kagent/sre-agent')).toBe('kagent/sre-agent');
  });

  it('repeats nothing that does not read as one', () => {
    expect(
      shownLinkedAgentRef('Your access expired, visit example.com'),
    ).toBeUndefined();
    expect(shownLinkedAgentRef('sre-agent')).toBeUndefined();
    expect(shownLinkedAgentRef('a/b/c/d')).toBeUndefined();
  });

  it('cuts a long reference', () => {
    const shown = shownLinkedAgentRef(`kagent/${'a'.repeat(200)}`)!;
    expect(Array.from(shown)).toHaveLength(LINKED_AGENT_SHOWN_MAX_LENGTH);
    expect(shown.endsWith('…')).toBe(true);
  });
});
