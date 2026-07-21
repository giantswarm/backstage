import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { EpicRef } from '../../apis';
import { useEpicBoardItem } from '../EpicChip/useEpicBoardItem';
import { EpicAssignees } from './EpicAssignees';

jest.mock('../EpicChip/useEpicBoardItem');
const mockUseEpicBoardItem = useEpicBoardItem as jest.Mock;

const epic: EpicRef = {
  owner: 'giantswarm',
  repo: 'giantswarm',
  number: 37164,
  url: 'https://github.com/giantswarm/giantswarm/issues/37164',
};

beforeEach(() => {
  mockUseEpicBoardItem.mockReset();
});

describe('EpicAssignees', () => {
  it('renders nothing when the epic has no assignees', async () => {
    mockUseEpicBoardItem.mockReturnValue({ data: { assignees: [] } });

    const { container } = await renderInTestApp(<EpicAssignees epic={epic} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the roadmap plugin is unavailable', async () => {
    mockUseEpicBoardItem.mockReturnValue({ data: undefined });

    const { container } = await renderInTestApp(<EpicAssignees epic={epic} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the assignees as a comma-separated @login line', async () => {
    mockUseEpicBoardItem.mockReturnValue({
      data: { assignees: ['alice', 'bob'] },
    });

    await renderInTestApp(<EpicAssignees epic={epic} />);

    expect(screen.getByText('@alice, @bob')).toBeInTheDocument();
  });
});
