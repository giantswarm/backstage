import { render, screen } from '@testing-library/react';
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
});
