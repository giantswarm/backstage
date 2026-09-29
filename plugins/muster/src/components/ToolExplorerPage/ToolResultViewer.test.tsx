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
    expect(screen.getByRole('textbox', { name: 'Result' })).toHaveValue(
      JSON.stringify(listResult),
    );
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
});
