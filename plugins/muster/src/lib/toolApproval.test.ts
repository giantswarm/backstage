import {
  approvalKeyOf,
  connectorAdminOf,
  defaultPresetFor,
  draftFromStored,
  expandPreset,
  isUnreviewed,
  matchingPreset,
  sameDraft,
  storedRule,
  storedSetting,
} from './toolApproval';

const TOOLS = [
  { key: 'get_issue', readOnly: true },
  { key: 'merge_pull_request', readOnly: false },
];

describe('toolApproval', () => {
  it('expands each preset into explicit settings for the listed tools', () => {
    expect(expandPreset('recommended', TOOLS)).toEqual({
      rule: 'Ask',
      tools: { get_issue: 'Allow', merge_pull_request: 'Ask' },
    });
    expect(expandPreset('allow-all', TOOLS)).toEqual({
      rule: 'Allow',
      tools: { get_issue: 'Allow', merge_pull_request: 'Allow' },
    });
    expect(expandPreset('ask-all', TOOLS)).toEqual({
      rule: 'Ask',
      tools: { get_issue: 'Ask', merge_pull_request: 'Ask' },
    });
  });

  it('pre-selects Allow all on a trusted platform and Recommended on a governed one', () => {
    expect(defaultPresetFor('trusted')).toBe('allow-all');
    expect(defaultPresetFor('governed')).toBe('recommended');
  });

  it('reads stored values as muster does: unknown asks, an unset rule allows', () => {
    expect(storedSetting('Block')).toBe('Block');
    expect(storedSetting('block')).toBe('Ask');
    expect(storedSetting(undefined)).toBeUndefined();
    expect(storedRule(undefined)).toBe('Allow');
    expect(storedRule('Block')).toBe('Ask');
  });

  it('fills a tool without its own entry with the rule, and keeps unlisted entries', () => {
    const draft = draftFromStored(
      { rule: 'Ask', tools: { get_issue: 'Allow', delete_repo: 'Block' } },
      TOOLS,
    );
    expect(draft).toEqual({
      rule: 'Ask',
      tools: {
        get_issue: 'Allow',
        delete_repo: 'Block',
        merge_pull_request: 'Ask',
      },
    });
  });

  it('names the preset a draft equals, or none', () => {
    expect(matchingPreset(expandPreset('recommended', TOOLS), TOOLS)).toBe(
      'recommended',
    );
    expect(
      matchingPreset(
        {
          rule: 'Ask',
          tools: { get_issue: 'Block', merge_pull_request: 'Ask' },
        },
        TOOLS,
      ),
    ).toBeUndefined();
  });

  it('compares drafts by every entry and the rule', () => {
    const a = expandPreset('ask-all', TOOLS);
    expect(sameDraft(a, { ...a, tools: { ...a.tools } })).toBe(true);
    expect(sameDraft(a, { ...a, rule: 'Allow' })).toBe(false);
    expect(sameDraft(a, { ...a, tools: { ...a.tools, extra: 'Ask' } })).toBe(
      false,
    );
  });

  it('reads reviewed and admin state from what muster reports', () => {
    expect(isUnreviewed([])).toBeUndefined();
    expect(
      isUnreviewed([{ approval: { setting: 'allow', source: 'unreviewed' } }]),
    ).toBe(true);
    expect(
      isUnreviewed([{ approval: { setting: 'ask', source: 'connector' } }]),
    ).toBe(false);
    expect(connectorAdminOf([{}])).toBeUndefined();
    expect(
      connectorAdminOf([{ connectorAdmin: true }, { connectorAdmin: false }]),
    ).toBe(false);
    expect(connectorAdminOf([{ connectorAdmin: true }])).toBe(true);
  });

  it('keys a tool by its own name', () => {
    expect(approvalKeyOf('x_github_merge_pull_request', 'x_github')).toBe(
      'merge_pull_request',
    );
    expect(approvalKeyOf('core_config_save', 'x_github')).toBe(
      'core_config_save',
    );
  });
});
