import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { ManifestDialog } from './ManifestDialog';

// CodeMirror does not render under jsdom; the dialog only passes the manifest
// through, so a read-only textarea is behaviorally equivalent here.
jest.mock('../YamlEditorFormField', () => ({
  YamlEditorFormField: ({ value }: { value: string }) => (
    <textarea aria-label="Manifest" value={value} readOnly />
  ),
}));

const errorApi = { post: jest.fn(), error$: jest.fn() };

const manifest = 'apiVersion: v1\nkind: ConfigMap\n';

function renderDialog(
  props: Partial<Parameters<typeof ManifestDialog>[0]> = {},
) {
  const onOpenChange = jest.fn();

  render(
    <TestApiProvider apis={[[errorApiRef, errorApi]]}>
      <ManifestDialog
        isOpen
        onOpenChange={onOpenChange}
        title="ConfigMap default/settings"
        manifest={manifest}
        description="Read-only."
        {...props}
      />
    </TestApiProvider>,
  );

  return { onOpenChange };
}

describe('ManifestDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the title, the description and the manifest', () => {
    renderDialog();

    expect(screen.getByText('ConfigMap default/settings')).toBeInTheDocument();
    expect(screen.getByText('Read-only.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Manifest' })).toHaveValue(
      manifest,
    );
  });

  it('renders nothing while closed', () => {
    renderDialog({ isOpen: false });

    expect(
      screen.queryByText('ConfigMap default/settings'),
    ).not.toBeInTheDocument();
  });

  it('copies and confirms when Copy manifest is pressed', () => {
    // react-use's useCopyToClipboard copies via document.execCommand under the
    // hood; stub it so jsdom doesn't fall back to window.prompt().
    document.execCommand = jest.fn(() => true);

    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Copy manifest' }));

    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(errorApi.post).not.toHaveBeenCalled();
  });

  it('asks to close on Close', async () => {
    const { onOpenChange } = renderDialog();

    // The header has its own close icon button; this is the one in the footer.
    const closeButton = screen
      .getAllByRole('button', { name: 'Close' })
      .find(button => button.textContent === 'Close');
    await userEvent.click(closeButton!);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
