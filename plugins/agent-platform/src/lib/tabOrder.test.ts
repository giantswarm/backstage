import { AGENT_PLATFORM_TAB_ORDER, orderTabs } from './tabOrder';

const id = (tab: string) => tab;

describe('orderTabs', () => {
  it('orders the tabs as the row shows them, whatever order they attached in', () => {
    expect(
      orderTabs(
        [
          'sub-page:agent-platform/usage',
          'sub-page:muster/workflows',
          'sub-page:agent-platform/sessions',
          'sub-page:muster/mcp-servers',
          'sub-page:agent-platform/models',
          'sub-page:agent-platform/agents',
        ],
        id,
      ),
    ).toEqual([...AGENT_PLATFORM_TAB_ORDER]);
  });

  it('puts an unknown tab before Usage, keeping unknown tabs in attach order', () => {
    expect(
      orderTabs(
        [
          'sub-page:agent-platform/usage',
          'sub-page:other/b',
          'sub-page:agent-platform/sessions',
          'sub-page:other/a',
        ],
        id,
      ),
    ).toEqual([
      'sub-page:agent-platform/sessions',
      'sub-page:other/b',
      'sub-page:other/a',
      'sub-page:agent-platform/usage',
    ]);
  });
});
