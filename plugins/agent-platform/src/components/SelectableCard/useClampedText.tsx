import { ReactNode, useRef, useState } from 'react';
import { Button, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useIsTruncated } from '@giantswarm/backstage-plugin-ui-react';

const useStyles = makeStyles({
  clamped: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: ({ lines }: { lines: number }) => lines,
    overflow: 'hidden',
  },
});

export type ClampedText = {
  /** The text itself, cut to `lines` lines until it is expanded. */
  content: ReactNode;
  /** The control that reveals the rest, or `null` when nothing is hidden. */
  toggle: ReactNode;
};

/**
 * A card's prose, cut down to a few lines so one long description can't set the
 * height of a whole row of cards, plus the control that reveals the rest.
 *
 * The two come back separately because they belong in different places: a
 * selectable card is one big `<button role="checkbox">`, and a toggle nested
 * inside it would be invalid markup and presentational to assistive tech. It
 * goes in the card's `hoverAction` slot instead, outside the button and outside
 * its layout; only cards that actually overflow have one at all.
 */
export function useClampedText({
  text,
  subject,
  lines = 3,
}: {
  text: string | undefined;
  /** What the text describes, to tell one card's toggle from the next one's. */
  subject: string;
  lines?: number;
}): ClampedText {
  const classes = useStyles({ lines });
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const isTruncated = useIsTruncated(ref);

  if (!text) {
    return { content: null, toggle: null };
  }

  return {
    content: (
      <Text
        ref={ref}
        variant="body-small"
        color="secondary"
        className={expanded ? undefined : classes.clamped}
      >
        {text}
      </Text>
    ),
    // `expanded` keeps the toggle once it has been pressed: the text is no
    // longer clamped, so it no longer measures as truncated.
    toggle:
      isTruncated || expanded ? (
        <Button
          variant="tertiary"
          size="small"
          aria-label={`${expanded ? 'Show less of' : 'Show more of'} ${subject}`}
          onPress={() => setExpanded(value => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      ) : null,
  };
}
