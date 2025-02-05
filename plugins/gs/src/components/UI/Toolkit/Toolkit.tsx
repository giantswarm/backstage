import React from 'react';
import { Link } from '@backstage/core-components';
import List from '@material-ui/core/List';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import { makeStyles } from '@material-ui/core/styles';
import { Tooltip, Typography } from '@material-ui/core';
import classNames from 'classnames';

type Tool =
  | {
      label: React.ReactNode;
      url: string;
      icon: React.ReactNode;
      disabled?: false;
    }
  | {
      label: React.ReactNode;
      url: string;
      icon: React.ReactNode;
      disabled: true;
      disabledNote: string;
    };

type ToolkitProps = {
  tools: Tool[];
};

const useStyles = makeStyles(theme => ({
  toolkit: {
    display: 'flex',
    flexWrap: 'wrap',
    textAlign: 'center',
    padding: 0,
  },
  tool: {
    margin: theme.spacing(0.5, 1),
  },
  label: {
    marginTop: theme.spacing(1),
    minWidth: '72px',
    fontSize: '0.9em',
    lineHeight: '1.25',
    overflowWrap: 'break-word',
    color: theme.palette.text.primary,
  },
  labelDisabled: {
    color: theme.palette.text.disabled,
  },
  icon: {
    width: '64px',
    height: '64px',
    borderRadius: '50px',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: theme.shadows[1],
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.primary,
  },
  iconDisabled: {
    color: theme.palette.text.disabled,
  },
}));

export const Toolkit = ({ tools }: ToolkitProps) => {
  const classes = useStyles();

  return (
    <List className={classes.toolkit}>
      {tools.map((tool, idx) => {
        const el = (
          <>
            <ListItemIcon
              className={classNames(classes.icon, {
                [classes.iconDisabled]: tool.disabled,
              })}
            >
              {tool.icon}
            </ListItemIcon>
            <ListItemText
              secondaryTypographyProps={{
                className: classNames(classes.label, {
                  [classes.labelDisabled]: tool.disabled,
                }),
              }}
              secondary={tool.label}
            />
          </>
        );

        if (tool.disabled) {
          return (
            <Tooltip title={tool.disabledNote} key={idx}>
              <Typography
                variant="inherit"
                color="textSecondary"
                className={classes.tool}
              >
                {el}
              </Typography>
            </Tooltip>
          );
        }

        return (
          <Link key={idx} to={tool.url} className={classes.tool}>
            {el}
          </Link>
        );
      })}
    </List>
  );
};
