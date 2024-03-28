import React, { useEffect, useState } from 'react';
import {
  Button,
  ListItem,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  Tooltip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import {
  SessionApi,
  SessionState,
  ProfileInfoApi,
  ProfileInfo,
  useApi,
  errorApiRef,
  IconComponent,
} from '@backstage/core-plugin-api';

const useStyles = makeStyles(theme => ({
  root: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    paddingRight: theme.spacing(16),
  },
  text: {
    whiteSpace: 'normal',
  },
}));

const emptyProfile: ProfileInfo = {};

/** @public */
export const ProviderSettingsItem = (props: {
  title: string;
  description: string;
  icon: IconComponent;
  authApi: ProfileInfoApi & SessionApi;
}) => {
  const { title, description, icon: Icon, authApi } = props;

  const errorApi = useApi(errorApiRef);
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo>(emptyProfile);

  useEffect(() => {
    let didCancel = false;

    const subscription = authApi
      .sessionState$()
      .subscribe((sessionState: SessionState) => {
        if (sessionState !== SessionState.SignedIn) {
          setProfile(emptyProfile);
          setSignedIn(false);
        }
        if (!didCancel) {
          authApi
            .getProfile({ optional: true })
            .then((profileResponse: ProfileInfo | undefined) => {
              if (!didCancel) {
                if (sessionState === SessionState.SignedIn) {
                  setSignedIn(true);
                }
                if (profileResponse) {
                  setProfile(profileResponse);
                }
              }
            });
        }
      });

    return () => {
      didCancel = true;
      subscription.unsubscribe();
    };
  }, [authApi]);

  const classes = useStyles();

  return (
    <ListItem className={classes.root}>
      <ListItemIcon>
        <Icon />
      </ListItemIcon>
      <ListItemText
        className={classes.text}
        primary={
          <>
            <Typography variant="subtitle2" component="span">
              {title}
            </Typography>
            <Typography variant="body2" component="span" color="textSecondary">
              {' - '}
              {description}
            </Typography>
          </>
        }
        secondary={
          signedIn ? (
            <>
              <Typography
                variant="body2"
                component="span"
                color="textPrimary"
                gutterBottom
              >
                {profile.displayName}
              </Typography>
              {' - '}
              <Typography
                variant="body2"
                component="span"
                color="textSecondary"
              >
                {profile.email}
              </Typography>
            </>
          ) : null
        }
      />
      <ListItemSecondaryAction>
        <Tooltip
          placement="top"
          arrow
          title={signedIn ? `Sign out from ${title}` : `Sign in to ${title}`}
        >
          <Button
            variant="outlined"
            color="primary"
            onClick={() => {
              const action = signedIn ? authApi.signOut() : authApi.signIn();
              action.catch(error => errorApi.post(error));
            }}
          >
            {signedIn ? `Sign out` : `Sign in`}
          </Button>
        </Tooltip>
      </ListItemSecondaryAction>
    </ListItem>
  );
};
