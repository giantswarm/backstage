import { Link } from '@backstage/core-components';
import List from '@material-ui/core/List';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import { makeStyles } from '@material-ui/core/styles';
import { Tooltip, Typography } from '@material-ui/core';
import classNames from 'classnames';
import IconResolver from '../IconResolver/IconResolver';

function replaceWithBr(text: string): string {
  return text.replaceAll('\n', '<br />').replaceAll('\\n', '<br />');
}

export type Tool =
  | {
      label: string | React.ReactNode;
      url: string;
      icon: string | React.ReactNode;
      disabled?: false;
    }
  | {
      label: string | React.ReactNode;
      url: string;
      icon: string | React.ReactNode;
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
    margin: theme.spacing(1, 1),
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
              {typeof tool.icon === 'string' ? (
                <IconResolver iconName={tool.icon} />
              ) : (
                tool.icon
              )}
            </ListItemIcon>
            <ListItemText
              secondaryTypographyProps={{
                className: classNames(classes.label, {
                  [classes.labelDisabled]: tool.disabled,
                }),
              }}
              secondary={
                typeof tool.label === 'string' ? (
                  <>
                    <Typography
                      variant="inherit"
                      dangerouslySetInnerHTML={{
                        __html: replaceWithBr(tool.label),
                      }}
                    />
                  </>
                ) : (
                  tool.label
                )
              }
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
