import { musterPlugin } from './plugin';

/** Where an extension attaches; not on the public type, read for the test. */
function attachToOf(extension: object): unknown {
  return (extension as { attachTo?: unknown }).attachTo;
}

describe("muster's Customize tabs", () => {
  // The Customize page belongs to the app; the tabs reach it by its id, the
  // way agent-platform's do. The old `/agent-platform/mcp-servers…` address
  // redirects through the app's mapping of old addresses.
  it.each([
    'sub-page:muster/mcp-servers',
    'sub-page:muster/workflows',
  ] as const)('%s attaches to the Customize page', id => {
    expect(attachToOf(musterPlugin.getExtension(id))).toEqual({
      id: 'page:app/agent-shell-customize',
      input: 'pages',
    });
  });

  it("contributes its usage section to the Usage page's sections", () => {
    expect(
      attachToOf(
        musterPlugin.getExtension(
          'agent-platform-usage-section:muster/mcp-usage',
        ),
      ),
    ).toEqual({ id: 'page:agent-platform/usage', input: 'sections' });
  });
});
