import { ReactNode } from 'react';
import {
  SelectableCard as SharedSelectableCard,
  SelectableCardGrid as SharedSelectableCardGrid,
} from '@giantswarm/backstage-plugin-ui-react';

// The single-select option cards of the MCP server registration wizard
// (transport, auth mode). The shared ui-react SelectableCard, pinned to its
// radio flavour — so the connector and agent creation flows look like one
// system.

type SelectableCardGridProps = {
  ariaLabel: string;
  /** Minimum card width for the auto-fill grid. */
  minWidth?: number;
  children: ReactNode;
};

/** Responsive auto-fill grid of single-select cards. */
export function SelectableCardGrid(props: SelectableCardGridProps) {
  return <SharedSelectableCardGrid role="radiogroup" {...props} />;
}

type SelectableCardProps = {
  selected: boolean;
  ariaLabel: string;
  onSelect: () => void;
  /**
   * Renders the option as unpickable. Used where a rule elsewhere in the form
   * makes the choice invalid — the card stays visible (and says why in its
   * body) rather than disappearing, so the option is still discoverable.
   */
  disabled?: boolean;
  children: ReactNode;
};

/** A full-area single-select card with a radio indicator icon. */
export function SelectableCard(props: SelectableCardProps) {
  return <SharedSelectableCard role="radio" {...props} />;
}
