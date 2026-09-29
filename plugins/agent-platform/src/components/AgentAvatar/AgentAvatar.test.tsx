import { render } from '@testing-library/react';
import { AgentAvatar } from './AgentAvatar';

describe('AgentAvatar', () => {
  it('rounds the corners by a percentage of the width', () => {
    const { getByRole } = render(<AgentAvatar name="Go developer" src="" />);
    expect(getComputedStyle(getByRole('img')).borderRadius).toBe('20%');
  });

  it("keeps the caller's class name", () => {
    const { getByRole } = render(
      <AgentAvatar name="Go developer" src="" className="extra" />,
    );
    expect(getByRole('img')).toHaveClass('extra');
  });
});
