import type { ReactElement } from 'react';
import { render as renderRaw, screen } from '@testing-library/react';
import { errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { CommitSha } from './CommitSha';
import { type MockedLayout, mockViewport } from '../../testUtils';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function render(ui: ReactElement) {
  return renderRaw(
    <TestApiProvider apis={[[errorApiRef, { post: jest.fn() }]]}>
      {ui}
    </TestApiProvider>,
  );
}

describe('CommitSha', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  it('shows seven characters with the full SHA as its title', () => {
    layout = mockViewport({ width: 1280, touch: false });
    render(<CommitSha value={`main@sha1:${SHA}`} />);

    expect(screen.getByText('main@sha1:0123456')).toHaveAttribute(
      'title',
      `main@sha1:${SHA}`,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers to copy the full SHA on a touch screen', () => {
    layout = mockViewport({ width: 375, touch: true });
    render(<CommitSha value={SHA} />);

    expect(screen.getByText('0123456')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy 0123456 in full' }),
    ).toBeInTheDocument();
  });

  it('renders a value without a SHA as it is, with nothing to copy', () => {
    layout = mockViewport({ width: 375, touch: true });
    render(<CommitSha value="1.2.3" />);

    expect(screen.getByText('1.2.3')).not.toHaveAttribute('title');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
