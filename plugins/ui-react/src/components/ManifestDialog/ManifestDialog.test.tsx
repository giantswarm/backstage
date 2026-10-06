import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { ManifestDialog, type ManifestDialogProps } from './ManifestDialog';

// A textarea stands in for the CodeMirror editor, so a test can read the
// manifest as the textbox's value.
jest.mock('../YamlEditorFormField', () => ({
  YamlEditorFormField: ({
    value,
    label,
  }: {
    value: string;
    label?: string;
  }) => <textarea aria-label={label} value={value} readOnly />,
}));

const errorApi = { post: jest.fn(), error$: jest.fn() };

const manifest = 'apiVersion: v1\nkind: ConfigMap\n';

function Harness(props: Partial<ManifestDialogProps>) {
  return (
    <TestApiProvider apis={[[errorApiRef, errorApi]]}>
      <ManifestDialog
        isOpen
        onOpenChange={() => {}}
        title="ConfigMap default/settings"
        manifest={manifest}
        description="Read-only."
        {...props}
      />
    </TestApiProvider>
  );
}

// The header has its own close icon button; this is the one in the footer.
function getFooterCloseButton() {
  return screen
    .getAllByRole('button', { name: 'Close' })
    .find(button => button.textContent === 'Close')!;
}

describe('ManifestDialog', () => {
  const originalExecCommand = document.execCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    // react-use's useCopyToClipboard copies via document.execCommand under the
    // hood; stub it so jsdom doesn't fall back to window.prompt().
    document.execCommand = jest.fn(() => true);
  });

  afterEach(() => {
    document.execCommand = originalExecCommand;
  });

  it('shows the title, the description and the manifest', () => {
    render(<Harness />);

    expect(screen.getByText('ConfigMap default/settings')).toBeInTheDocument();
    expect(screen.getByText('Read-only.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Manifest' })).toHaveValue(
      manifest,
    );
  });

  it('names the editor by its label', () => {
    render(<Harness label="Current manifest" />);

    expect(
      screen.getByRole('textbox', { name: 'Current manifest' }),
    ).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    render(<Harness isOpen={false} />);

    expect(
      screen.queryByText('ConfigMap default/settings'),
    ).not.toBeInTheDocument();
  });

  it('copies and confirms when Copy manifest is pressed', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy manifest' }));

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(errorApi.post).not.toHaveBeenCalled();
  });

  it('no longer says Copied when reopened', () => {
    const { rerender } = render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy manifest' }));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    rerender(<Harness isOpen={false} />);
    rerender(<Harness isOpen />);

    expect(
      screen.getByRole('button', { name: 'Copy manifest' }),
    ).toBeInTheDocument();
  });

  it('asks to close on Close', async () => {
    const onOpenChange = jest.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    await userEvent.click(getFooterCloseButton());

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
