import { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccordionGroup } from '@backstage/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';

import type { ReviewsClient } from '../../apis/ReviewsClient';
import type { ReviewSection as Section } from '../../hooks/useReviewSections';
import { rowOf, type PrState } from '../../lib/github';
import { countLabel, ReviewSection } from './ReviewSection';

const row = (number: number, title: string) =>
  rowOf({
    number,
    title,
    html_url: `https://github.com/giantswarm/dex-app/pull/${number}`,
    user: { login: 'alder-quill' },
    labels: [],
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-20T00:00:00Z',
    repository_url: 'https://api.github.com/repos/giantswarm/dex-app',
  });

const STATE: PrState = {
  ci: {
    state: 'failing',
    failing: ['ci/circleci: go-build'],
    running: 0,
    total: 3,
  },
  review: {
    state: 'changes_requested',
    approvals: 0,
    changesBy: ['juniper-rook'],
  },
  merge: { state: 'conflicts', raw: 'dirty' },
};

function section(overrides: Partial<Section> = {}): Section {
  return {
    key: 'waiting',
    kind: 'waiting',
    title: 'Waiting on me',
    query: 'is:open review-requested:@me',
    rows: [row(640, 'Map connectors by id')],
    total: 1,
    eagerState: true,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function renderSection(
  props: Partial<Parameters<typeof ReviewSection>[0]>,
  client = { prState: jest.fn(async () => STATE) },
  callTool: jest.Mock = jest.fn(),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, { callTool }]]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AccordionGroup
          allowsMultiple
          expandedKeys={
            new Set(
              props.isExpanded === false
                ? []
                : [props.section?.key ?? 'waiting'],
            )
          }
        >
          {children}
        </AccordionGroup>
      </QueryClientProvider>
    </TestApiProvider>
  );
  render(
    <ReviewSection
      section={section()}
      client={
        { installation: 'gazelle', ...client } as unknown as ReviewsClient
      }
      isExpanded
      statusOn={false}
      onStatusChange={jest.fn()}
      sort={{ column: 'created', direction: 'ascending' }}
      onSortChange={jest.fn()}
      {...props}
    />,
    { wrapper },
  );
  return client;
}

describe('ReviewSection', () => {
  it("counts the page against GitHub's total", () => {
    expect(countLabel(12, 12)).toBe('12');
    expect(countLabel(100, 143)).toBe('100 of 143');
  });

  it("shows each PR's CI, review and merge state, with why on hover", async () => {
    renderSection({});
    expect(
      (await screen.findByText('Failing')).closest('[title]'),
    ).toHaveAttribute('title', 'Failing: ci/circleci: go-build');
    expect(screen.getByText('Changes')).toBeInTheDocument();
    expect(screen.getByText('Conflicts')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Map connectors by id/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/dex-app/pull/640');
  });

  it('tags who a request names', async () => {
    renderSection({
      requestedOf: new Map([
        ['giantswarm/dex-app#640', ['you', 'team-shield']],
      ]),
    });
    expect(await screen.findByText('you, shield')).toBeInTheDocument();
  });

  it('reads no state for a section that waits to be asked', async () => {
    const client = renderSection({
      section: section({
        key: 'reviewed',
        kind: 'reviewed',
        eagerState: false,
      }),
    });
    expect(
      await screen.findByRole('switch', { name: 'Show status' }),
    ).not.toBeChecked();
    expect(screen.queryByText('CI')).toBeNull();
    expect(client.prState).not.toHaveBeenCalled();
  });

  it('reads the state once asked', async () => {
    const client = renderSection({
      section: section({
        key: 'reviewed',
        kind: 'reviewed',
        eagerState: false,
      }),
      statusOn: true,
    });
    expect(await screen.findByText('Failing')).toBeInTheDocument();
    expect(client.prState).toHaveBeenCalledTimes(1);
  });

  it('reads no state while collapsed', () => {
    const client = renderSection({ isExpanded: false });
    expect(client.prState).not.toHaveBeenCalled();
  });

  it('links the rest of a search past one page to GitHub', async () => {
    renderSection({ section: section({ total: 143 }) });
    expect(
      await screen.findByRole('link', { name: /142 more on GitHub/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/pulls?q=is%3Aopen%20review-requested%3A%40me',
    );
    expect(screen.getByText('1 of 143')).toBeInTheDocument();
  });

  it('says why an empty section is empty', () => {
    renderSection({
      section: section({ rows: [], total: 0 }),
      isExpanded: false,
    });
    expect(screen.getByText('Nothing waiting on you')).toBeInTheDocument();
  });

  it('opens the PR on GitHub when its row is clicked', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    renderSection({});
    await userEvent.click(await screen.findByText(/alder-quill/));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://github.com/giantswarm/dex-app/pull/640',
        '_blank',
        'noopener',
      ),
    );
    open.mockRestore();
  });

  it('posts one Slack message about the ticked PRs, to the team in view', async () => {
    const callTool = jest.fn(async (name: string) =>
      name === 'x_slack_search_channels'
        ? { channels: [{ id: 'C0SHIELD01', name: 'team-shield' }] }
        : {
            message_context: {
              channel_id: 'C0SHIELD01',
              message_ts: '1790324925.717189',
            },
          },
    );
    renderSection(
      {
        section: section({ key: 'mine', kind: 'mine' }),
        slackPost: { defaultChannel: '#team-shield' },
      },
      undefined,
      callTool,
    );
    const slackPost = await screen.findByRole('button', {
      name: 'Post to Slack',
    });
    expect(slackPost).toBeDisabled();

    // The header's checkbox ticks every row; the second is the row's.
    const [, rowCheckbox] = await screen.findAllByRole('checkbox');
    await userEvent.click(rowCheckbox);
    expect(slackPost).toBeEnabled();
    await userEvent.click(slackPost);

    expect(await screen.findByLabelText(/Channel/)).toHaveValue('#team-shield');
    expect(screen.getByLabelText(/Message/)).toHaveValue(
      [
        'Waiting for a review:',
        '- [Map connectors by id](https://github.com/giantswarm/dex-app/pull/640) · dex-app#640 · CI failing · changes requested · conflicts',
      ].join('\n'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('Posted to #team-shield'),
    ).toBeInTheDocument();
    expect(callTool).toHaveBeenLastCalledWith(
      'x_slack_send_message',
      expect.objectContaining({ channel_id: 'C0SHIELD01' }),
      'gazelle',
      { urlElicitation: true },
    );
  });
});
