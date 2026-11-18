import { render, screen } from '@testing-library/react';
import { NodePoolNodes } from './NodePoolNodes';

describe('NodePoolNodes', () => {
  it('says older data is temporarily unavailable when Mimir said so', () => {
    render(
      <NodePoolNodes
        nodes={[]}
        isLoading={false}
        provider="aws"
        error={Object.assign(new Error('Mimir could not answer'), {
          reason: 'older_data_unavailable',
        })}
      />,
    );

    expect(
      screen.getByText('Older data is temporarily unavailable'),
    ).toBeInTheDocument();
  });

  it('says the node metrics could not be loaded otherwise', () => {
    render(
      <NodePoolNodes
        nodes={[]}
        isLoading={false}
        provider="aws"
        error={new Error('Mimir could not be reached')}
      />,
    );

    expect(
      screen.getByText('Node metrics could not be loaded.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Mimir could not be reached')).toBeInTheDocument();
  });
});
