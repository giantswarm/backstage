import { render, screen } from '@testing-library/react';
import { EffectBadge } from './EffectBadge';

describe('EffectBadge', () => {
  it('says a reading tool reads', () => {
    render(<EffectBadge effect="reads" />);
    expect(screen.getByText('Reads')).toBeInTheDocument();
  });

  it('says a writing tool changes things, set apart from reads', () => {
    render(
      <>
        <EffectBadge effect="reads" />
        <EffectBadge effect="changes" />
      </>,
    );
    const reads = screen.getByText('Reads').closest('.bui-Badge');
    const changes = screen.getByText('Changes things').closest('.bui-Badge');
    expect(changes).not.toBeNull();
    expect(changes?.className).not.toBe(reads?.className);
  });
});
