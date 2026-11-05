import { render, screen } from '@testing-library/react';
import { ShellScopeProvider } from '../ShellScope';
import { Mono } from '../Mono';
import { FactList } from './FactList';

const facts = [
  { label: 'Node image', value: 'AL2023' },
  { label: 'Max pods per node', value: 110 },
  { label: 'Taints', value: <span data-testid="rich">none</span> },
];

describe('FactList', () => {
  it('pairs every label with its value', () => {
    render(<FactList facts={facts} />);

    expect(screen.getAllByRole('term').map(term => term.textContent)).toEqual([
      'Node image',
      'Max pods per node',
      'Taints',
    ]);
    expect(
      screen.getAllByRole('definition').map(value => value.textContent),
    ).toEqual(['AL2023', '110', 'none']);
    expect(screen.getByTestId('rich')).toBeInTheDocument();
  });

  it('renders the same pairs stacked', () => {
    const { container } = render(<FactList facts={facts} stacked />);

    const list = container.querySelector('dl');
    expect(
      Array.from(list?.children ?? []).map(child => [
        child.tagName,
        child.textContent,
      ]),
    ).toEqual([
      ['DT', 'Node image'],
      ['DD', 'AL2023'],
      ['DT', 'Max pods per node'],
      ['DD', '110'],
      ['DT', 'Taints'],
      ['DD', 'none'],
    ]);
  });

  it('keeps the side-by-side markup when not stacked', () => {
    const { container: sideBySide } = render(<FactList facts={facts} />);
    const { container: explicit } = render(
      <FactList facts={facts} stacked={false} />,
    );

    // Dynamic style sheets number their class names per instance.
    const normalize = (html: string) =>
      html.replace(/makeStyles-([A-Za-z]+)-\d+/g, 'makeStyles-$1');
    expect(normalize(explicit.innerHTML)).toBe(normalize(sideBySide.innerHTML));
  });

  // jsdom applies no media queries; the rule is what can be pinned here.
  function narrowMediaOf(container: HTMLElement): string | undefined {
    const listClass = container.querySelector('dl')!.classList[0];
    const css = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent ?? '')
      .join('\n');
    return new RegExp(
      `@media \\(max-width: ([\\d.]+)px\\) \\{\\s*\\.${listClass} \\{\\s*grid-template-columns: 1fr;`,
    ).exec(css)?.[1];
  }

  it('stacks each label over its value at the shell’s phone width inside the shell', () => {
    const { container } = render(<FactList facts={facts} />, {
      wrapper: ShellScopeProvider,
    });
    expect(narrowMediaOf(container)).toBe('599.95');
  });

  it('keeps the classic 520px stack point outside the shell', () => {
    const { container } = render(<FactList facts={facts} />);
    expect(narrowMediaOf(container)).toBe('520');
  });

  const variantOf = (text: string) =>
    screen.getByText(text).getAttribute('data-variant');

  it('sets labels and values in the shell’s body size inside the shell', () => {
    render(
      <FactList
        facts={[...facts, { label: 'Image', value: <Mono>ami-123</Mono> }]}
      />,
      { wrapper: ShellScopeProvider },
    );
    for (const text of ['Node image', 'AL2023', '110', 'ami-123']) {
      expect(variantOf(text)).toBe('body-medium');
    }
  });

  it('keeps small text outside the shell and in a stacked list', () => {
    const { unmount } = render(
      <FactList facts={[{ label: 'Image', value: <Mono>ami-123</Mono> }]} />,
    );
    expect(variantOf('Image')).toBe('body-small');
    expect(variantOf('ami-123')).toBe('body-small');
    unmount();

    render(<FactList facts={facts} stacked />, {
      wrapper: ShellScopeProvider,
    });
    expect(variantOf('AL2023')).toBe('body-small');
  });

  it('takes an explicit size over the default', () => {
    render(<FactList facts={facts} size="small" />, {
      wrapper: ShellScopeProvider,
    });
    expect(variantOf('AL2023')).toBe('body-small');
  });
});
