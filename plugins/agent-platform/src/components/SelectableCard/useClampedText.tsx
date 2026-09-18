import { ReactNode, useId, useRef, useState } from 'react';
import { Button, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useIsTruncated } from '@giantswarm/backstage-plugin-ui-react';

const CLAMP_LINES = 3;

const useStyles = makeStyles({
  clamped: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: CLAMP_LINES,
    overflow: 'hidden',
  },
});

export type ClampedText = {
  /** The text itself, cut to a few lines until it is expanded. */
  content: ReactNode;
  /** The control that reveals the rest, or `null` when nothing is hidden. */
  toggle: ReactNode;
  /**
   * The id of the element holding the text, for the card to point
   * `aria-describedby` at — the text itself is inside the card's
   * `role="checkbox"` button, where assistive tech treats it as presentational.
   */
  describedById: string | undefined;
};

/**
 * A card's prose, cut down to a few lines so one long description can't set the
 * height of a whole row of cards, plus the control that reveals the rest.
 *
 * The two come back separately because they belong in different places: a
 * selectable card is one big `<button role="checkbox">`, and a control nested
 * inside it would be invalid markup and presentational to assistive tech. The
 * toggle goes in the card's `hoverAction` slot, outside the button and outside
 * its layout; only cards that actually overflow have one at all.
 */
export function useClampedText({
  text,
  subject,
}: {
  text: string | undefined;
  /** What the text describes, to tell one card's toggle from the next one's. */
  subject: string;
}): ClampedText {
  const classes = useStyles();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [ref, isTruncated] = useIsTruncated();

  // Sticky: expanding lifts the clamp, so the text stops measuring as truncated
  // while it is open. Deriving the toggle from the live measurement would
  // unmount it the moment *Show less* is pressed -- taking the keyboard focus
  // that is on it with it -- until the clamp is back and the observer fires.
  const hasOverflowed = useRef(false);
  if (isTruncated) {
    hasOverflowed.current = true;
  }

  if (!text) {
    return { content: null, toggle: null, describedById: undefined };
  }

  return {
    content: (
      <Text
        ref={ref}
        id={id}
        variant="body-small"
        color="secondary"
        className={expanded ? undefined : classes.clamped}
      >
        {text}
      </Text>
    ),
    toggle:
      isTruncated || hasOverflowed.current ? (
        <Button
          variant="tertiary"
          size="small"
          aria-label={`${expanded ? 'Show less of' : 'Show more of'} ${subject}`}
          aria-expanded={expanded}
          onPress={() => setExpanded(value => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      ) : null,
    describedById: id,
  };
}
