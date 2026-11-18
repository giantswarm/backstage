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

/**
 * CSS that makes the browser fetch: `@import`, and `url(…)` or `image-set(…)`
 * other than a reference into the SVG itself (`url(#marker)`). A diagram's
 * source reaches its `<style>` through `classDef`, `style` and an `init`
 * directive's `themeCSS` (an `@font-face` with a remote `src`, for one).
 */
const REMOTE_CSS =
  /@import[^;]*;?|(?:-webkit-)?image-set\([^)]*\)|url\(\s*(?!['"]?#)[^)]*\)/gi;

/**
 * Mermaid draws an image node (`A@{ img: … }`) as an element the browser
 * fetches, and passes the diagram's own CSS through. The markup is parsed
 * into an inert template, so nothing loads before the elements and remote
 * CSS references are gone.
 */
function withoutRemoteResources(svg: string): string {
  const template = document.createElement('template');
  template.innerHTML = svg;
  const { content } = template;
  content
    .querySelectorAll('image, img, feImage')
    .forEach(element => element.remove());
  content.querySelectorAll('style').forEach(style => {
    style.textContent = (style.textContent ?? '').replace(REMOTE_CSS, 'none');
  });
  content.querySelectorAll('[style]').forEach(element => {
    element.setAttribute(
      'style',
      (element.getAttribute('style') ?? '').replace(REMOTE_CSS, 'none'),
    );
  });
  return template.innerHTML;
}

async function renderDiagram(
  id: string,
  source: string,
  dark: boolean,
  untrusted: boolean,
) {
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
  return untrusted ? withoutRemoteResources(svg) : svg;
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
 * instead; a failed one says why. An `untrusted` diagram (one from model or
 * tool output) loads nothing: its image nodes and remote CSS references are
 * dropped.
 */
export const MermaidDiagram = ({
  source,
  untrusted = false,
}: {
  source: string;
  untrusted?: boolean;
}) => {
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
    renderDiagram(`${baseId}-${renders.current}`, source, dark, untrusted).then(
      svg => !cancelled && setRendered({ svg }),
      error => !cancelled && setRendered({ error: summarize(error) ?? '' }),
    );
    return () => {
      cancelled = true;
    };
  }, [baseId, source, dark, untrusted]);

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
