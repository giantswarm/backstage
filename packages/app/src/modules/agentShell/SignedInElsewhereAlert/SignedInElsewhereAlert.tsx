import { useCallback, useEffect, useRef, useState } from 'react';
import {
  configApiRef,
  errorApiRef,
  oauthRequestApiRef,
  type PendingOAuthRequest,
  useApi,
  useApiHolder,
} from '@backstage/frontend-plugin-api';
import { Alert, Button } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import {
  gsAuthProvidersApiRef,
  useMainSessionEnd,
} from '@giantswarm/backstage-plugin-gs';
import {
  ContentColumn,
  PHONE_MEDIA,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  SIGNED_IN_ELSEWHERE_DESCRIPTION,
  SIGNED_IN_ELSEWHERE_TITLE,
} from '../SignedInElsewhereNotice';

const useStyles = makeStyles({
  // The page's own gutters (`ShellPage`), so the banner lines up with the
  // header under it.
  root: {
    padding: '28px 48px 0',
    [PHONE_MEDIA]: {
      padding: '20px 16px 0',
    },
  },
});

/**
 * Signs the main login in again. A sign-in the session manager already asked
 * for (the Login Required dialog's request) is triggered at once, so the
 * press opens the provider's popup. Without one, the session manager may
 * still hold the ended session's last tokens, which `signIn` would return
 * as they are: they are dropped first, so `signIn` asks for a new sign-in.
 */
function useMainSignIn(): { signIn: () => void; isPending: boolean } {
  const oauthRequestApi = useApi(oauthRequestApiRef);
  const configApi = useApi(configApiRef);
  const apis = useApiHolder();
  const errorApi = useApi(errorApiRef);
  const requests = useRef<PendingOAuthRequest[]>([]);
  const [isPending, setPending] = useState(false);

  useEffect(() => {
    const subscription = oauthRequestApi.authRequest$().subscribe(next => {
      requests.current = next;
    });
    return () => subscription.unsubscribe();
  }, [oauthRequestApi]);

  const signIn = useCallback(() => {
    const providerId = configApi.getOptionalString('gs.authProvider');
    const request = requests.current.find(
      candidate => candidate.provider.id === providerId,
    );
    setPending(true);
    Promise.resolve()
      .then(async () => {
        if (request) {
          await request.trigger();
          return;
        }
        const mainAuthApi = apis.get(gsAuthProvidersApiRef)?.getMainAuthApi();
        await mainAuthApi?.signOut();
        await mainAuthApi?.signIn();
      })
      .catch(error => errorApi.post(error))
      .finally(() => setPending(false));
  }, [configApi, apis, errorApi]);

  return { signIn, isPending };
}

/**
 * The shell-wide notice that the portal session in this browser ended
 * because the person signed in with the same Dex client elsewhere, with the
 * sign-in that restores it. It has no close button: closed, it would leave
 * pages whose lists cannot be read without saying why.
 */
export function SignedInElsewhereAlert() {
  const classes = useStyles();
  const sessionEnd = useMainSessionEnd();
  const { signIn, isPending } = useMainSignIn();

  if (sessionEnd !== 'signed-in-elsewhere') {
    return null;
  }
  return (
    <div className={classes.root}>
      <ContentColumn>
        <Alert
          role="alert"
          status="warning"
          icon
          title={SIGNED_IN_ELSEWHERE_TITLE}
          description={SIGNED_IN_ELSEWHERE_DESCRIPTION}
          customActions={
            <Button
              variant="secondary"
              size="small"
              isPending={isPending}
              onPress={signIn}
            >
              Sign in again
            </Button>
          }
        />
      </ContentColumn>
    </div>
  );
}
