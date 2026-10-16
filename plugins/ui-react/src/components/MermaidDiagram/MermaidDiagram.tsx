import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Flex } from '@backstage/ui';
import { makeStyles, useTheme } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  diagram: {
    display: 'flex',
    justifyContent: 'center',
    margin: theme.spacing(2, 0),
    // Scaled to fit, as GitHub shows a diagram.
    '& svg': {
      maxWidth: '100%',
      height: 'auto',
    },
  },
}));

type Rendered = { svg: string } | { error: string } | undefined;

async function renderDiagram(id: string, source: string, dark: boolean) {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    securityLevel: 'strict',
    // An invalid diagram throws without leaving Mermaid's error graphic
    // behind on the page.
    suppressErrorRendering: true,
  });
  const { svg } = await mermaid.render(id, source);
  return svg;
}

// Mermaid's parse errors start with "Parse error on line 2:", then quote the
// line; the first line is the part a reader can act on.
const summarize = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .split('\n')
    .find(line => line.trim() !== '')
    ?.replace(/:\s*$/, '')
    .trim();

/**
 * A Mermaid diagram as SVG, in the theme's light or dark palette. While
 * Mermaid loads, and when the diagram cannot be rendered, its source shows
 * instead; a failed one says why.
 */
export const MermaidDiagram = ({ source }: { source: string }) => {
  const classes = useStyles();
  const dark = useTheme().palette.type === 'dark';
  // Mermaid needs an id usable as a CSS selector; useId returns ":r1:".
  const baseId = `mermaid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Each render takes a fresh id: Mermaid first removes the element with its
  // id, which would be the diagram shown until the new one is in.
  const renders = useRef(0);
  const [rendered, setRendered] = useState<Rendered>();

  useEffect(() => {
    let cancelled = false;
    renders.current += 1;
    renderDiagram(`${baseId}-${renders.current}`, source, dark).then(
      svg => !cancelled && setRendered({ svg }),
      error => !cancelled && setRendered({ error: summarize(error) ?? '' }),
    );
    return () => {
      cancelled = true;
    };
  }, [baseId, source, dark]);

  const code = (
    <pre>
      <code className="language-mermaid">{source}</code>
    </pre>
  );

  if (rendered && 'svg' in rendered) {
    return (
      <div
        className={classes.diagram}
        data-testid="mermaid-diagram"
        // Mermaid sanitizes its own output at securityLevel 'strict'.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: rendered.svg }}
      />
    );
  }
  if (rendered) {
    return (
      <Flex direction="column" gap="2">
        <Alert
          role="note"
          status="warning"
          icon
          title="This Mermaid diagram could not be rendered; its source is shown below."
          description={rendered.error || undefined}
        />
        {code}
      </Flex>
    );
  }
  return <div aria-busy="true">{code}</div>;
};
