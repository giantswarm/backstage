import type { AgentRow } from '../components/AgentsDataProvider';
import {
  findLinkedAgent,
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

describe('findLinkedAgent', () => {
  const home = agent('golem', 'agents', 'helper');
  const other = agent('gazelle', 'agents', 'helper');
  const offered = () => true;

  it('finds the agent by id', () => {
    expect(findLinkedAgent([home, other], other.id, offered)).toBe(other);
  });

  it('finds the first agent of that namespace and name', () => {
    expect(findLinkedAgent([home, other], 'agents/helper', offered)).toBe(home);
  });

  it('skips agents that are not offered', () => {
    expect(
      findLinkedAgent([home, other], 'agents/helper', a => a !== home),
    ).toBe(other);
    expect(findLinkedAgent([home], home.id, () => false)).toBeUndefined();
    expect(findLinkedAgent([home], null, offered)).toBeUndefined();
  });
});
