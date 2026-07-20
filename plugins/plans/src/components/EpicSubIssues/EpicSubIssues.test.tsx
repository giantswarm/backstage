import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { EpicRef } from '../../apis';
import { useRoadmapFetch } from '../../hooks/useRoadmapFetch';
import { EpicSubIssues } from './EpicSubIssues';

jest.mock('../../hooks/useRoadmapFetch');
const mockUseRoadmapFetch = useRoadmapFetch as jest.Mock;

const epic: EpicRef = {
  owner: 'giantswarm',
  repo: 'giantswarm',
  number: 37164,
  url: 'https://github.com/giantswarm/giantswarm/issues/37164',
};

beforeEach(() => {
  mockUseRoadmapFetch.mockReset();
});

describe('EpicSubIssues', () => {
  it('renders nothing when the epic has no sub-issues', async () => {
    mockUseRoadmapFetch.mockReturnValue({ data: { subIssues: [] } });

    const { container } = await renderInTestApp(<EpicSubIssues epic={epic} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the query has no data (loading / unavailable)', async () => {
    mockUseRoadmapFetch.mockReturnValue({ data: undefined });

    const { container } = await renderInTestApp(<EpicSubIssues epic={epic} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the closed/total progress and each sub-issue with its assignees', async () => {
    mockUseRoadmapFetch.mockReturnValue({
      data: {
        subIssues: [
          {
            id: 1,
            number: 10,
            title: 'First issue',
            state: 'closed',
            htmlUrl: 'https://github.com/giantswarm/giantswarm/issues/10',
            assignees: ['alice'],
          },
          {
            id: 2,
            number: 11,
            title: 'Second issue',
            state: 'open',
            htmlUrl: 'https://github.com/giantswarm/other/issues/11',
            assignees: [],
            repo: 'giantswarm/other',
          },
        ],
      },
    });

    await renderInTestApp(<EpicSubIssues epic={epic} />);

    // One of two sub-issues is closed.
    expect(screen.getByText('1/2 done')).toBeInTheDocument();

    expect(screen.getByText('First issue')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    // Falls back to the epic's own repo when the sub-issue omits one.
    expect(screen.getByText('giantswarm/giantswarm#10')).toBeInTheDocument();

    expect(screen.getByText('Second issue')).toBeInTheDocument();
    // A sub-issue with no assignees shows the italic fallback.
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    // Cross-repo sub-issues keep their own repo slug.
    expect(screen.getByText('giantswarm/other#11')).toBeInTheDocument();
  });
});
