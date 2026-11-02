import { render, screen } from '@testing-library/react';
import { SweepProgress } from './SweepProgress';

describe('SweepProgress', () => {
  it('says where each team stands, naming the team when there are several', () => {
    render(
      <SweepProgress
        progress={{
          honeybadger: '34 of 79 PRs done',
          atlas: '2 of 3 PRs done',
        }}
        showTeam
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'atlas: 2 of 3 PRs donehoneybadger: 34 of 79 PRs done',
    );
  });

  it('renders nothing before the first report', () => {
    const { container } = render(<SweepProgress progress={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
