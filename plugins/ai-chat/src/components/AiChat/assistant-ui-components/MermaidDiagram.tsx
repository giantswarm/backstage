import { memo, useEffect, useId, useState } from 'react';
import { makeStyles, useTheme } from '@material-ui/core/styles';

const useStyles = makeStyles(() => ({
  mermaidWrapper: {
    display: 'flex',
    justifyContent: 'center',
  },
}));

type MermaidDiagramProps = {
  source: string;
};

const MermaidDiagramImpl = ({ source }: MermaidDiagramProps) => {
  const classes = useStyles();
  const theme = useTheme();
  const reactId = useId();
  // mermaid requires a valid HTML id / CSS selector — useId returns ":r1:".
  const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          theme: theme.palette.type === 'dark' ? 'dark' : 'default',
          securityLevel: 'strict',
        });
        const result = await mermaid.render(id, source);
        if (!cancelled) {
          setSvg(result.svg);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, theme.palette.type, id]);

  // The wrapper div is stable across loading → success state transitions, so
  // the CSS appear-animation only fires once when the block first mounts.
  return svg !== null && !failed ? (
    <div
      className={classes.mermaidWrapper}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : (
    <code>{source}</code>
  );
};

export const MermaidDiagram = memo(MermaidDiagramImpl);
