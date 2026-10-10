import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
import { ToolResultViewer } from './ToolResultViewer';

// The CodeMirror-backed editor does not render its document under jsdom; a
// read-only textarea exposes the same value.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  YamlEditorFormField: ({ value }: { value: string }) => (
    <textarea aria-label="Result" value={value} readOnly />
  ),
}));

const listResult = [
  { metadata: { name: 'alpha', namespace: 'default' }, status: 'Ready' },
  { metadata: { name: 'beta', namespace: 'kube-system' }, status: 'Pending' },
];

describe('ToolResultViewer', () => {
  it('defaults to the table view for a list-of-objects result', async () => {
    await renderInTestApp(<ToolResultViewer result={listResult} />);

    // Column headers derived from the flattened rows.
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('namespace')).toBeInTheDocument();
    // Cell values render.
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('switches to the Raw view', async () => {
    await renderInTestApp(<ToolResultViewer result={listResult} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Raw' }));
    // Raw view renders compact JSON, so a quoted key is present verbatim.
    expect(screen.getByText(/"status":"Ready"/)).toBeInTheDocument();
  });

  it('shows the pretty-printed result in the Parsed view', async () => {
    await renderInTestApp(<ToolResultViewer result={{ ok: true }} />);

    expect(screen.getByRole('textbox', { name: 'Result' })).toHaveValue(
      JSON.stringify({ ok: true }, null, 2),
    );
  });

  it('shows the duration and size meta', async () => {
    await renderInTestApp(
      <ToolResultViewer result={{ ok: true }} durationMs={42} />,
    );

    expect(screen.getByText('42 ms')).toBeInTheDocument();
    // Size of the compact JSON `{"ok":true}` is well under 1 KiB.
    expect(screen.getByText(/\bB$/)).toBeInTheDocument();
  });

  it('offers a re-run affordance when a handler is given', async () => {
    const onRerun = jest.fn();
    await renderInTestApp(
      <ToolResultViewer result={{ ok: true }} onRerun={onRerun} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /run again/i }));
    expect(onRerun).toHaveBeenCalled();
  });

  describe('table at scale', () => {
    const podList = (count: number) => ({
      kind: 'PodList',
      items: Array.from({ length: count }, (_, i) => ({
        metadata: { name: `pod-${i}`, namespace: 'default' },
        status: i % 2 === 0 ? 'Running' : 'Pending',
      })),
    });
    const renderedPods = () => screen.queryAllByText(/^pod-\d+$/);

    it('shows a three-row result whole, with no reveal control and no filter', async () => {
      await renderInTestApp(<ToolResultViewer result={podList(3)} />);

      expect(renderedPods()).toHaveLength(3);
      expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();
      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(screen.queryByText(/rows? shown/)).toBeNull();
    });

    it('renders the first 50 of 300 rows, reveals more a page at a time, and filters', async () => {
      await renderInTestApp(<ToolResultViewer result={podList(300)} />);

      expect(renderedPods()).toHaveLength(50);
      expect(screen.getByText('50 rows shown, 250 more')).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'Show 50 more rows' }),
      );
      expect(renderedPods()).toHaveLength(100);

      // The filter matches any cell's text, case-insensitively, and starts
      // the filtered list at its first page again.
      const filter = screen.getByRole('searchbox', { name: 'Filter rows' });
      await userEvent.type(filter, 'POD-29');
      // pod-29 and pod-290 … pod-299.
      expect(renderedPods()).toHaveLength(11);
      expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();

      await userEvent.clear(filter);
      await userEvent.type(filter, 'pending');
      expect(renderedPods()).toHaveLength(50);
      expect(screen.getByText('50 rows shown, 100 more')).toBeInTheDocument();

      await userEvent.clear(filter);
      await userEvent.type(filter, 'nothing-like-this');
      expect(renderedPods()).toHaveLength(0);
      expect(
        screen.getByText('No row matches “nothing-like-this”.'),
      ).toBeInTheDocument();
    });
  });
});
