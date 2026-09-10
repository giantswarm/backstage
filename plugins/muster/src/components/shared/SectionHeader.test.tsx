import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
  it('renders the title, description, icon, and action', async () => {
    await renderInTestApp(
      <SectionHeader
        icon={<svg data-testid="section-icon" />}
        title="Tool explorer"
        description="Browse and run tools."
        action={<button type="button">Do thing</button>}
      />,
    );

    expect(screen.getByText('Tool explorer')).toBeInTheDocument();
    expect(screen.getByText('Browse and run tools.')).toBeInTheDocument();
    expect(screen.getByTestId('section-icon')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Do thing' }),
    ).toBeInTheDocument();
  });

  it('invents no heading by default, and takes one when asked', async () => {
    // The default is the whole reason the `as` prop is optional: muster's own
    // screens carry their title in the plugin header and have no heading tree,
    // so promoting these to headings there would invent one. A regression to a
    // heading default would silently add an `h2`/`h3` to the tool explorer, the
    // servers page, the workflow detail and the register flow — none of which
    // has a test that would notice.
    const { unmount } = await renderInTestApp(
      <SectionHeader icon={<svg />} title="Servers" />,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Servers')).toBeInTheDocument();
    unmount();

    // And on a screen that does have a tree (the MCP dashboard), the same
    // component files its section under its own heading.
    await renderInTestApp(
      <SectionHeader as="h3" icon={<svg />} title="Tool calls" />,
    );
    expect(
      screen.getByRole('heading', { level: 3, name: 'Tool calls' }),
    ).toBeInTheDocument();
  });

  it('omits the description and action when not provided', async () => {
    await renderInTestApp(<SectionHeader icon={<svg />} title="Servers" />);

    expect(screen.getByText('Servers')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
