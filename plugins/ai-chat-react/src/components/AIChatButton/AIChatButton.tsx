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
import { useNavigate } from 'react-router-dom';
import { AIChatIcon } from '../../assets/icons';

const AI_CHAT_PATH = '/ai-chat';

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

export type AIChatButtonItem = {
  label: string;
  message: string;
};

type AIChatButtonProps = {
  items: AIChatButtonItem[];
  tooltip?: string;
  label?: string;
  troubleshoot?: boolean;
};

export const AIChatButton = ({
  items,
  tooltip,
  label,
  troubleshoot,
}: AIChatButtonProps) => {
  const displayLabel =
    label ?? (troubleshoot ? 'Troubleshoot with AI' : 'Inspect with AI');
  const displayTooltip = tooltip ?? displayLabel;
  const classes = useStyles();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (items.length === 0) {
    return null;
  }

  const navigateToChat = (message: string) => {
    const params = new URLSearchParams({ message });
    navigate(`${AI_CHAT_PATH}?${params.toString()}`);
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();

    if (items.length === 1) {
      navigateToChat(items[0].message);
      return;
    }

    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleItemClick = (item: AIChatButtonItem) => {
    handleClose();
    navigateToChat(item.message);
  };

  return (
    <Box>
      <Tooltip title={displayTooltip}>
        <Button
          className={classNames(
            classes.button,
            troubleshoot && classes.troubleshootButton,
          )}
          color="inherit"
          size="small"
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
          {items.map(item => (
            <MenuItem
              key={item.label}
              className={classes.menuItem}
              onClick={() => handleItemClick(item)}
            >
              <Typography variant="body2">{item.label}</Typography>
            </MenuItem>
          ))}
        </Menu>
      )}
    </Box>
  );
};
