import type { ReactElement } from 'react';
import {
  Button,
  ButtonIcon,
  Flex,
  Menu,
  MenuItem,
  MenuTrigger,
} from '@backstage/ui';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import {
  DisabledAction,
  MENU_WIDTH,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

/**
 * The context line of Model hosting's create flows (`WizardFrame`'s
 * `context`): where the flow sits, as the hosting page's breadcrumbs say it.
 */
export const HOSTING_FLOW_CONTEXT = 'Customize / Models / Model hosting';

/** One action of a Model hosting view's header. */
export type HostingAction = {
  /** Stable key, unique among the header's actions. */
  id: string;
  label: string;
  icon?: ReactElement;
  onAction: () => void;
  /** Offered but not usable yet (e.g. still reading where it would apply). */
  isDisabled?: boolean;
  /**
   * Why a disabled action cannot succeed here, in one sentence: a button
   * says it on hover, focus and press (`DisabledAction`); in the ⋯ menu,
   * where a disabled item cannot say why, the action is left out.
   */
  disabledReason?: string;
};

/** Whether the action is disabled for a reason it can only say as a button. */
function isUnavailable(action: HostingAction): boolean {
  return Boolean(action.isDisabled && action.disabledReason);
}

/** One header button, saying why when it is disabled for a reason. */
function ActionButton({
  action,
  variant,
}: {
  action: HostingAction;
  variant: 'primary' | 'secondary';
}): JSX.Element {
  if (isUnavailable(action)) {
    return (
      <DisabledAction reason={action.disabledReason!}>
        {describedBy => (
          <Button
            variant={variant}
            iconStart={action.icon}
            isDisabled
            aria-describedby={describedBy}
          >
            {action.label}
          </Button>
        )}
      </DisabledAction>
    );
  }
  return (
    <Button
      variant={variant}
      iconStart={action.icon}
      onPress={action.onAction}
      isDisabled={action.isDisabled}
    >
      {action.label}
    </Button>
  );
}

export type ModelHostingActionsProps = {
  /** The view's main action, rightmost (Serve model, Add GPU node pool). */
  primary?: HostingAction;
  /** The one action that sits beside it as a button on a wide screen. */
  secondary?: HostingAction;
  /** Everything else: the ⋯ menu. */
  more?: HostingAction[];
};

/**
 * A Model hosting view's header actions, in the platform's standard places —
 * the idiom of Agent and Skill detail: one secondary button, the primary one
 * rightmost, and the rest in a ⋯ menu after them, at the top right of the
 * page header. Never a free-floating row of every action: five buttons there
 * were ~730px wide and pushed the page sideways on a phone.
 *
 * At phone width (`usePhoneLayout`) one button stays — the primary, else the
 * secondary — and the others move into the menu, so the header is one
 * button and the ⋯ wide. A menu that would hold nothing is left out, and so
 * is a menu item disabled for a reason (`disabledReason`): only a button can
 * say why.
 */
export function ModelHostingActions({
  primary,
  secondary,
  more = [],
}: ModelHostingActionsProps) {
  const isPhone = usePhoneLayout();

  const shownSecondary = isPhone && primary ? undefined : secondary;
  const menuItems = [
    ...(secondary && secondary !== shownSecondary ? [secondary] : []),
    ...more,
  ].filter(action => !isUnavailable(action));
  if (!primary && !shownSecondary && menuItems.length === 0) {
    return null;
  }

  return (
    <Flex align="center" gap="2">
      {shownSecondary && (
        <ActionButton action={shownSecondary} variant="secondary" />
      )}
      {primary && <ActionButton action={primary} variant="primary" />}
      {menuItems.length > 0 && (
        <MenuTrigger>
          <ButtonIcon
            icon={<MoreVertIcon />}
            aria-label="Model hosting actions"
            variant="tertiary"
          />
          <Menu maxWidth={MENU_WIDTH}>
            {menuItems.map(action => (
              <MenuItem
                key={action.id}
                id={action.id}
                iconStart={action.icon}
                onAction={action.onAction}
                isDisabled={action.isDisabled}
              >
                {action.label}
              </MenuItem>
            ))}
          </Menu>
        </MenuTrigger>
      )}
    </Flex>
  );
}
