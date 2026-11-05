import { fireEvent, render, screen } from '@testing-library/react';
import { errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { FileView, type FileViewProps } from './FileView';

const errorApi = { post: jest.fn(), error$: jest.fn() };

function renderFileView(props: FileViewProps) {
  return render(
    <TestApiProvider apis={[[errorApiRef, errorApi]]}>
      <FileView {...props} />
    </TestApiProvider>,
  );
}

const DOCKERFILE = 'FROM alpine:3.20\nRUN apk add --no-cache git\n';
const MANIFEST =
  'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example\n';

describe('FileView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the file name and path above the content', () => {
    renderFileView({
      content: DOCKERFILE,
      filename: 'Dockerfile',
      path: 'toolchains/go',
    });

    expect(screen.getByText('Dockerfile')).toBeInTheDocument();
    expect(screen.getByText('toolchains/go')).toBeInTheDocument();
    const block = screen.getByText(/FROM alpine:3.20/);
    expect(block.tagName).toBe('PRE');
    expect(block).toHaveTextContent('RUN apk add --no-cache git');
  });

  it('renders YAML in a read-only editor', () => {
    const { container } = renderFileView({
      content: MANIFEST,
      filename: 'example.yaml',
      language: 'yaml',
    });

    expect(container.querySelector('pre')).toBeNull();
    const editor = container.querySelector('.cm-content');
    expect(editor).toHaveTextContent('kind: ConfigMap');
    expect(editor).toHaveAttribute('aria-readonly', 'true');
  });

  it('copies the whole content', () => {
    // react-use's useCopyToClipboard copies via document.execCommand under the
    // hood; stub it so jsdom doesn't fall back to window.prompt().
    document.execCommand = jest.fn(() => true);
    renderFileView({ content: DOCKERFILE, filename: 'Dockerfile' });

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(errorApi.post).not.toHaveBeenCalled();
  });
});
