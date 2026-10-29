import { render, waitFor } from '@testing-library/react';
import { Helmet } from 'react-helmet';
import { MemoryRouter } from 'react-router-dom';
import { PageHeaderActionsProvider } from '../PageHeaderActions';
import { ShellPage } from '../ShellPage';
import {
  ShellDocumentTitle,
  ShellDocumentTitleProvider,
  shellDocumentTitle,
  shellTitleParts,
  useShellDocumentTitleCount,
} from './ShellDocumentTitle';

const SUFFIX = 'Agent Platform';

describe('shellDocumentTitle', () => {
  it('puts the suffix last, most specific part first', () => {
    expect(shellDocumentTitle(['Lab Helper', 'Agents'], SUFFIX)).toBe(
      'Lab Helper · Agents · Agent Platform',
    );
  });

  it('drops empty parts, repeats and the suffix itself', () => {
    expect(
      shellDocumentTitle(
        ['Usage', undefined, '', 'Usage', 'Agent Platform'],
        SUFFIX,
      ),
    ).toBe('Usage · Agent Platform');
  });

  it('leads with a count above zero', () => {
    expect(shellDocumentTitle(['Sessions'], SUFFIX, 2)).toBe(
      '(2) Sessions · Agent Platform',
    );
    expect(shellDocumentTitle(['Sessions'], SUFFIX, 0)).toBe(
      'Sessions · Agent Platform',
    );
  });

  it('ends with the most general part when there is no suffix', () => {
    expect(shellDocumentTitle(['Lab Helper', 'Agents'])).toBe(
      'Lab Helper · Agents',
    );
  });
});

describe('shellTitleParts', () => {
  it('names the current breadcrumb and its section', () => {
    expect(
      shellTitleParts('jira', [
        { label: 'Customize', href: '/customize' },
        { label: 'Connectors', href: '/customize/connectors' },
        { label: 'jira' },
      ]),
    ).toEqual(['jira', 'Connectors']);
  });

  it('falls back to a text title without breadcrumbs', () => {
    expect(shellTitleParts('Sessions')).toEqual(['Sessions', '']);
  });

  it('names nothing when neither says what the page is', () => {
    expect(shellTitleParts(<span>Loading</span>)).toBeUndefined();
  });
});

describe('ShellDocumentTitle', () => {
  it('is not suffixed again by an outer page template', async () => {
    render(
      <ShellDocumentTitleProvider suffix={SUFFIX}>
        <Helmet title="Agents" titleTemplate="%s | Agent Platform" />
        <ShellDocumentTitle title={['Lab Helper', 'Agents']} />
      </ShellDocumentTitleProvider>,
    );
    await waitFor(() =>
      expect(document.title).toBe('Lab Helper · Agents · Agent Platform'),
    );
  });

  it('is prefixed with the count set below the provider while it is set', async () => {
    function Counter({ count }: { count: number }) {
      useShellDocumentTitleCount(count);
      return null;
    }
    const tree = (counter?: number) => (
      <ShellDocumentTitleProvider suffix={SUFFIX}>
        {counter !== undefined && <Counter count={counter} />}
        <ShellDocumentTitle title={['Sessions']} />
      </ShellDocumentTitleProvider>
    );
    const { rerender } = render(tree(3));
    await waitFor(() =>
      expect(document.title).toBe('(3) Sessions · Agent Platform'),
    );

    rerender(tree(0));
    await waitFor(() =>
      expect(document.title).toBe('Sessions · Agent Platform'),
    );

    rerender(tree(1));
    await waitFor(() =>
      expect(document.title).toBe('(1) Sessions · Agent Platform'),
    );

    // The counter goes (the person left the shell): so does the count.
    rerender(tree());
    await waitFor(() =>
      expect(document.title).toBe('Sessions · Agent Platform'),
    );
  });

  it('leaves an outer title alone when it has nothing to name', async () => {
    render(
      <>
        <Helmet title="Sessions" />
        <ShellDocumentTitle title={[undefined]} />
      </>,
    );
    await waitFor(() => expect(document.title).toBe('Sessions'));
  });
});

describe('ShellPage', () => {
  function renderPage(element: JSX.Element) {
    return render(
      <MemoryRouter>
        <ShellDocumentTitleProvider suffix={SUFFIX}>
          <PageHeaderActionsProvider>{element}</PageHeaderActionsProvider>
        </ShellDocumentTitleProvider>
      </MemoryRouter>,
    );
  }

  it('titles the document after its breadcrumbs', async () => {
    renderPage(
      <ShellPage
        title="Lab Helper"
        breadcrumbs={[
          { label: 'Customize', href: '/customize' },
          { label: 'Agents', href: '/customize/agents' },
          { label: 'Lab Helper' },
        ]}
      />,
    );
    await waitFor(() =>
      expect(document.title).toBe('Lab Helper · Agents · Agent Platform'),
    );
  });

  it('takes the title it is given when the h1 is not text', async () => {
    renderPage(
      <ShellPage
        title={<button>Rename</button>}
        documentTitle={['Weekly report', 'Sessions']}
      />,
    );
    await waitFor(() =>
      expect(document.title).toBe('Weekly report · Sessions · Agent Platform'),
    );
  });
});
