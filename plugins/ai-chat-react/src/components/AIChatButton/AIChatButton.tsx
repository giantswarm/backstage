import { useState, MouseEvent } from 'react';
import classNames from 'classnames';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { useApiHolder } from '@backstage/core-plugin-api';
import { AIChatIcon } from '../../assets/icons';
import { aiChatApiRef } from '../../api';
import { AIChatButtonItem, AIChatButtonOpenMode } from './types';
import { useOpenChat } from './useOpenChat';

export type { AIChatButtonItem, AIChatButtonOpenMode } from './types';

const useStyles = makeStyles(() => ({
  button: {
    textTransform: 'none',
    paddingLeft: 11,
    paddingRight: 11,
  },
  troubleshootButton: {
    backgroundColor: '#9a2c28',
    color: '#ffffff',
    '&:hover': {
      backgroundColor: '#7a2320',
    },
  },
  menuItem: {
    minWidth: 200,
  },
}));

type AIChatButtonProps = {
  items: AIChatButtonItem[];
  tooltip?: string;
  label?: string;
  troubleshoot?: boolean;
  /** Controls how the AI chat is opened. 'drawer' opens the side drawer,
   * 'navigate' navigates to the AI chat page. Defaults to 'drawer' when the
   * drawer API is available, otherwise falls back to 'navigate'. */
  openMode?: AIChatButtonOpenMode;
  variant?: 'text' | 'outlined' | 'contained';
  color?: 'inherit' | 'primary' | 'secondary' | 'default';
};

type AIChatButtonInnerProps = AIChatButtonProps & {
  displayLabel: string;
  displayTooltip: string;
};

const AIChatButtonInner = ({
  items,
  displayLabel,
  displayTooltip,
  troubleshoot,
  openMode,
  variant,
  color,
}: AIChatButtonInnerProps) => {
  const classes = useStyles();
  const openChat = useOpenChat(openMode);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();

    if (items.length === 1) {
      openChat(items[0].message);
      return;
    }

    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleItemClick = (item: AIChatButtonItem) => {
    handleClose();
    openChat(item.message);
  };

  return (
    <Box>
      <Tooltip title={displayTooltip}>
        <Button
          className={classNames(
            classes.button,
            troubleshoot && classes.troubleshootButton,
          )}
          size="small"
          variant={variant}
          color={color}
          startIcon={<AIChatIcon />}
          onClick={handleClick}
          aria-haspopup={items.length > 1 ? 'true' : undefined}
        >
          {displayLabel}
        </Button>
      </Tooltip>
      {items.length > 1 && (
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          getContentAnchorEl={null}
        >
          {items.map((item, index) => (
            <MenuItem
              key={item.label ?? index}
              className={classes.menuItem}
              onClick={() => handleItemClick(item)}
            >
              <Typography variant="body2">
                {item.label ?? displayLabel}
              </Typography>
            </MenuItem>
          ))}
        </Menu>
      )}
    </Box>
  );
};

export const AIChatButton = ({
  items,
  tooltip,
  label,
  troubleshoot,
  openMode,
  variant,
  color,
}: AIChatButtonProps) => {
  const apiHolder = useApiHolder();
  const aiChatApi = apiHolder.get(aiChatApiRef);
  const displayLabel =
    label ?? (troubleshoot ? 'Troubleshoot with AI' : 'Inspect with AI');
  const displayTooltip = tooltip ?? displayLabel;

  if (!aiChatApi || items.length === 0) {
    return null;
  }

  return (
    <AIChatButtonInner
      items={items}
      tooltip={tooltip}
      label={label}
      troubleshoot={troubleshoot}
      openMode={openMode}
      variant={variant}
      color={color}
      displayLabel={displayLabel}
      displayTooltip={displayTooltip}
    />
  );
};
