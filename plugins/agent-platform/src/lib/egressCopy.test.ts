import {
  listInSentence,
  PLATFORM_EGRESS_COPY,
  validationRefusalLeads,
} from './egressCopy';

const refusalOf = (origin: string, harness = 'claude') =>
  `egress origin "${origin}" is not one of Harness ${harness}'s origins (none): a coding agent reaches its Harness's origins only, which the platform sets`;

describe('listInSentence', () => {
  it('ends a list with "and"', () => {
    expect(listInSentence(['a'])).toBe('a');
    expect(listInSentence(['a', 'b'])).toBe('a and b');
    expect(listInSentence(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('PLATFORM_EGRESS_COPY.dropped', () => {
  it('keeps the origins and the EgressPolicies apart', () => {
    expect(
      PLATFORM_EGRESS_COPY.dropped(
        'Claude Code',
        ['https://a.example.com', 'https://b.example.com'],
        ['github'],
      ),
    ).toBe(
      'Claude Code agents reach only the addresses the platform allows, so the extra origins https://a.example.com and https://b.example.com, and the EgressPolicy github were removed.',
    );
  });
});

describe('validationRefusalLeads', () => {
  it('names the checked Harness by its title, another by its name', () => {
    expect(
      validationRefusalLeads(
        [
          refusalOf('https://a.example.com'),
          refusalOf('https://b.example.com', 'codex'),
        ],
        { name: 'claude', title: 'Claude Code' },
      ),
    ).toEqual([
      'Claude Code agents can only reach addresses the platform allows. Remove https://a.example.com, or ask your platform team to allow it.',
      'Agents on the Harness codex can only reach addresses the platform allows. Remove https://b.example.com, or ask your platform team to allow it.',
    ]);
  });

  it('leads anything else generically', () => {
    expect(validationRefusalLeads(['skills[0]: bad'])).toEqual([
      'The platform’s checks refused this configuration. Change what the technical details name, or ask your platform team for help.',
    ]);
  });
});
