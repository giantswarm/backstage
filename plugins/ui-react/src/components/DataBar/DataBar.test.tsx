import { render, screen } from '@testing-library/react';
import { DataBar } from './DataBar';

/** The fill is the only element carrying a percentage width. */
function fillWidth(container: HTMLElement): string | undefined {
  const fill = container.querySelector<HTMLElement>('[aria-hidden] > div');
  return fill?.style.width;
}

describe('DataBar', () => {
  it('renders the formatted value as text, always', () => {
    render(
      <DataBar label="7.5M" value={7_500_000} max={7_500_000} color="#f00" />,
    );

    // Magnitude and identity both rest on the text; the bar is an aid.
    expect(screen.getByText('7.5M')).toBeInTheDocument();
  });

  it('scales the fill to the column maximum', () => {
    const { container } = render(
      <DataBar label="300k" value={300_000} max={1_000_000} color="#f00" />,
    );

    expect(fillWidth(container)).toBe('30%');
  });

  it('fills completely at the maximum', () => {
    const { container } = render(
      <DataBar label="1M" value={1_000_000} max={1_000_000} color="#f00" />,
    );

    expect(fillWidth(container)).toBe('100%');
  });

  it('draws no fill for zero, so zero and tiny look different', () => {
    const { container } = render(
      <DataBar label="0" value={0} max={1_000_000} color="#f00" />,
    );

    expect(fillWidth(container)).toBe('0%');
  });

  it('draws no fill for an unknown value', () => {
    const { container } = render(
      <DataBar label="—" value={undefined} max={1_000_000} color="#f00" />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(fillWidth(container)).toBe('0%');
  });

  it('draws no fill when the whole column is empty', () => {
    // A non-positive max must not divide, and must not render every row full.
    const { container } = render(
      <DataBar label="0" value={0} max={0} color="#f00" />,
    );

    expect(fillWidth(container)).toBe('0%');
  });

  it('clamps a value above the maximum instead of overflowing', () => {
    const { container } = render(
      <DataBar label="2M" value={2_000_000} max={1_000_000} color="#f00" />,
    );

    expect(fillWidth(container)).toBe('100%');
  });

  it('ignores a non-finite value rather than rendering NaN%', () => {
    const { container } = render(
      <DataBar label="—" value={Number.NaN} max={1_000_000} color="#f00" />,
    );

    expect(fillWidth(container)).toBe('0%');
  });

  it('hides the bar from assistive tech', () => {
    const { container } = render(
      <DataBar label="1M" value={1_000_000} max={1_000_000} color="#f00" />,
    );

    // The number is the accessible value; a second announcement of the same
    // magnitude would be noise.
    expect(container.querySelector('[aria-hidden]')).toBeInTheDocument();
  });
});
