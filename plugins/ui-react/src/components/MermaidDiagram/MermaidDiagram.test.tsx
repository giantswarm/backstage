import { render, screen } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@material-ui/core/styles';
import { GSMarkdownContent } from '../GSMarkdownContent';
import { MermaidDiagram } from './MermaidDiagram';

const mermaid = {
  initialize: jest.fn(),
  parse: jest.fn(async (source: string) => {
    if (source.startsWith('graph oops')) {
      throw new Error('Parse error on line 1:\ngraph oops\n-----^');
    }
    return { diagramType: 'flowchart-v2' };
  }),
  render: jest.fn(async (id: string, source: string) => ({
    svg: `<svg id="${id}" aria-roledescription="flowchart-v2"><text>${source}</text></svg>`,
  })),
};
jest.mock('mermaid', () => ({ __esModule: true, default: mermaid }));

describe('MermaidDiagram', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders a diagram as SVG in the light theme', async () => {
    render(<MermaidDiagram source="graph TD; A-->B" />);

    const diagram = await screen.findByTestId('mermaid-diagram');
    expect(diagram.querySelector('svg')).toHaveTextContent('graph TD; A-->B');
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'default', securityLevel: 'strict' }),
    );
  });

  it('uses Mermaid’s dark theme in a dark theme', async () => {
    render(
      <ThemeProvider theme={createTheme({ palette: { type: 'dark' } })}>
        <MermaidDiagram source="graph TD; A-->B" />
      </ThemeProvider>,
    );

    await screen.findByTestId('mermaid-diagram');
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    );
  });

  it('shows the source and why when the diagram cannot be rendered', async () => {
    render(<MermaidDiagram source={'graph oops\n  A --'} />);

    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('could not be rendered');
    expect(note).toHaveTextContent('Parse error on line 1');
    expect(screen.getByText(/graph oops/, { selector: 'code' })).toBeVisible();
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it('renders the mermaid blocks of markdown, the rest as markdown', async () => {
    const { container } = render(
      <GSMarkdownContent
        content={[
          '# Architecture',
          '',
          '```mermaid',
          'graph TD; A-->B',
          '```',
          '',
          'Between the diagrams.',
          '',
          '```mermaid',
          'graph oops',
          '```',
          '',
          '```yaml',
          'kind: Pod',
          '```',
        ].join('\n')}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Architecture' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Between the diagrams.')).toBeInTheDocument();
    expect(await screen.findAllByTestId('mermaid-diagram')).toHaveLength(1);
    expect(await screen.findByRole('note')).toBeInTheDocument();
    // Another language stays a code block.
    expect(container.querySelector('code.language-yaml')).toHaveTextContent(
      'kind: Pod',
    );
  });
});
