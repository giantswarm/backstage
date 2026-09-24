import { Avatar, AvatarProps } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

/**
 * A percentage of the width, so the corner rounding scales with the avatar
 * and the shape looks the same at every size.
 */
const CORNER_RADIUS = '20%';

const useStyles = makeStyles({
  root: {
    borderRadius: CORNER_RADIUS,
    '& .bui-AvatarFallback': {
      borderRadius: 'inherit',
    },
  },
});

/** An agent's avatar: bui's `Avatar` as a rounded square instead of a circle. */
export function AgentAvatar({ className, ...props }: AvatarProps) {
  const classes = useStyles();
  return (
    <Avatar
      {...props}
      className={className ? `${classes.root} ${className}` : classes.root}
    />
  );
}
