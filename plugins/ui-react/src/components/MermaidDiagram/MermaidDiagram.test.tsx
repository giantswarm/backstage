import { render, screen, waitFor } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@material-ui/core/styles';
import { MermaidDiagram } from './MermaidDiagram';

const mermaid = {
  initialize: jest.fn(),
  render: jest.fn(async (id: string, source: string) => {
    if (source.startsWith('graph oops')) {
      throw new Error('Parse error on line 1:\ngraph oops\n-----^');
    }
    return {
      svg: `<svg id="${id}" aria-roledescription="flowchart-v2"><text>${source}</text></svg>`,
    };
  }),
};
jest.mock('mermaid', () => ({ __esModule: true, default: mermaid }));

describe('MermaidDiagram', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders a diagram as SVG in the light theme', async () => {
    render(<MermaidDiagram source="graph TD; A-->B" />);

    const diagram = await screen.findByTestId('mermaid-diagram');
    expect(diagram.querySelector('svg')).toHaveTextContent('graph TD; A-->B');
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'default',
        securityLevel: 'strict',
        suppressErrorRendering: true,
      }),
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
  });

  it('renders again under a fresh id when the theme changes', async () => {
    const { rerender } = render(<MermaidDiagram source="graph TD; A-->B" />);
    await screen.findByTestId('mermaid-diagram');
    rerender(
      <ThemeProvider theme={createTheme({ palette: { type: 'dark' } })}>
        <MermaidDiagram source="graph TD; A-->B" />
      </ThemeProvider>,
    );

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    const [first, second] = mermaid.render.mock.calls.map(([id]) => id);
    expect(second).not.toBe(first);
  });

  describe('an image node', () => {
    const svg =
      '<svg><g><image href="https://attacker.example/pixel.png"></image><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://attacker.example/label.png"><span>Label</span></div></foreignObject></g></svg>';

    it('is dropped from a diagram of untrusted text', async () => {
      mermaid.render.mockResolvedValueOnce({ svg });
      render(<MermaidDiagram source="graph TD; A@{ img: x }" untrusted />);

      const diagram = await screen.findByTestId('mermaid-diagram');
      expect(diagram.querySelector('image, img')).toBeNull();
      expect(diagram).toHaveTextContent('Label');
    });

    it('is kept by default', async () => {
      mermaid.render.mockResolvedValueOnce({ svg });
      render(<MermaidDiagram source="graph TD; A@{ img: x }" />);

      const diagram = await screen.findByTestId('mermaid-diagram');
      expect(diagram.querySelector('image')).not.toBeNull();
    });
  });

  describe('remote CSS', () => {
    const svg =
      '<svg><style>@import "https://attacker.example/a.css"; @font-face{font-family:x;src:url(https://attacker.example/f.woff)} .n{background:image-set("https://attacker.example/b.png" 1x)} .e{marker-end:url(#arrow)}</style><g><rect style="mask-image:url(\'https://attacker.example/m.png\');fill:red"></rect></g></svg>';

    it('is dropped from a diagram of untrusted text', async () => {
      mermaid.render.mockResolvedValueOnce({ svg });
      render(<MermaidDiagram source="graph TD; A-->B" untrusted />);

      const diagram = await screen.findByTestId('mermaid-diagram');
      expect(diagram.innerHTML).not.toContain('attacker.example');
      expect(diagram.querySelector('style')).toHaveTextContent('url(#arrow)');
      expect(diagram.querySelector('rect')).toHaveAttribute(
        'style',
        expect.stringContaining('fill:red'),
      );
    });

    it('is kept by default', async () => {
      mermaid.render.mockResolvedValueOnce({ svg });
      render(<MermaidDiagram source="graph TD; A-->B" />);

      const diagram = await screen.findByTestId('mermaid-diagram');
      expect(diagram.innerHTML).toContain('attacker.example/f.woff');
    });
  });
});
