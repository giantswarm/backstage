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
import { useApiHolder, useRouteRef } from '@backstage/core-plugin-api';
import { useNavigate } from 'react-router-dom';
import { AIChatIcon } from '../../assets/icons';
import { aiChatApiRef } from '../../api';
import { rootRouteRef } from '../../routes';

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
  label?: string;
  message: string;
};

type AIChatButtonProps = {
  items: AIChatButtonItem[];
  tooltip?: string;
  label?: string;
  troubleshoot?: boolean;
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
}: AIChatButtonInnerProps) => {
  const chatPath = useRouteRef(rootRouteRef);
  const classes = useStyles();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const navigateToChat = (message: string) => {
    const params = new URLSearchParams({ message });
    navigate(`${chatPath()}?${params.toString()}`);
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
      displayLabel={displayLabel}
      displayTooltip={displayTooltip}
    />
  );
};
