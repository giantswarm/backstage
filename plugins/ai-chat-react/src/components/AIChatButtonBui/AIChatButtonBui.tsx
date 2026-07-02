import { useApiHolder } from '@backstage/core-plugin-api';
import { Button, Menu, MenuItem, MenuTrigger } from '@backstage/ui';
import { AIChatIcon } from '../../assets/icons';
import { aiChatApiRef } from '../../api';
import { AIChatButtonItem, AIChatButtonOpenMode } from '../AIChatButton/types';
import { useOpenChat } from '../AIChatButton/useOpenChat';

type AIChatButtonBuiProps = {
  items: AIChatButtonItem[];
  label?: string;
  troubleshoot?: boolean;
  openMode?: AIChatButtonOpenMode;
  variant?: 'primary' | 'secondary' | 'tertiary';
};

/**
 * Backstage UI (bui) variant of the AI chat button, for use in bui contexts
 * such as the plugin header toolbar. Shares its open-chat behavior with the
 * Material UI {@link AIChatButton} via {@link useOpenChat}. The troubleshoot
 * state maps to bui's built-in `destructive` styling.
 */
export const AIChatButtonBui = ({
  items,
  label,
  troubleshoot,
  openMode,
  variant = 'secondary',
}: AIChatButtonBuiProps) => {
  const apiHolder = useApiHolder();
  const aiChatApi = apiHolder.get(aiChatApiRef);
  const openChat = useOpenChat(openMode);

  const displayLabel =
    label ?? (troubleshoot ? 'Troubleshoot with AI' : 'Inspect with AI');

  if (!aiChatApi || items.length === 0) {
    return null;
  }

  const icon = <AIChatIcon fontSize="inherit" />;

  if (items.length === 1) {
    return (
      <Button
        variant={variant}
        destructive={troubleshoot}
        iconStart={icon}
        onClick={() => openChat(items[0].message)}
      >
        {displayLabel}
      </Button>
    );
  }

  return (
    <MenuTrigger>
      <Button variant={variant} destructive={troubleshoot} iconStart={icon}>
        {displayLabel}
      </Button>
      <Menu>
        {items.map((item, index) => (
          <MenuItem
            key={item.label ?? index}
            onAction={() => openChat(item.message)}
          >
            {item.label ?? displayLabel}
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
};
