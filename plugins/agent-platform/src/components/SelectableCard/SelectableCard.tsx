import {
  SelectableCard as SharedSelectableCard,
  type SelectableCardProps as SharedSelectableCardProps,
} from '@giantswarm/backstage-plugin-ui-react';
import { STABLE_CLASS_NAMES } from '../../lib/stableClassNames';

// The shared ui-react selectable option cards, used by the model, harness and
// skill pickers. This plugin's flavour only adds its stable class name, which
// the agent shell's stylesheet targets.

export {
  SelectableCardGrid,
  StaticCard,
  useSelectableCardStyles,
} from '@giantswarm/backstage-plugin-ui-react';

export type SelectableCardProps = Omit<SharedSelectableCardProps, 'className'>;

/** A full-area selectable card with a selection indicator icon. */
export function SelectableCard(props: SelectableCardProps) {
  return (
    <SharedSelectableCard
      className={STABLE_CLASS_NAMES.selectableCard}
      {...props}
    />
  );
}
