import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ServerSignInProps } from '@giantswarm/backstage-plugin-muster';

const SIGN_IN_LANDS = 'Sign-in lands';

/**
 * The muster plugin with its real `ServerSignIn`, plus a button beside it
 * that calls its `onSignedIn`: what muster's status moving to connected (a
 * sign-in here or in another tab, or a click that finds the server connected
 * already) does, which `useServerSignIn`'s own tests cover. For a test of
 * what a page does once the sign-in lands:
 *
 *   jest.mock('@giantswarm/backstage-plugin-muster', () =>
 *     jest.requireActual('../../lib/__testUtils__/serverSignInLands')
 *       .musterWithSignInLands(),
 *   );
 */
export function musterWithSignInLands() {
  const actual = jest.requireActual('@giantswarm/backstage-plugin-muster');
  const RealServerSignIn = actual.ServerSignIn;
  return {
    ...actual,
    ServerSignIn: (props: ServerSignInProps) => (
      <>
        <RealServerSignIn {...props} />
        {props.onSignedIn && (
          // Not a submit: the alerts sit inside forms.
          <button type="button" onClick={props.onSignedIn}>
            {SIGN_IN_LANDS}
          </button>
        )}
      </>
    ),
  };
}

/**
 * The sign-in lands, as `musterWithSignInLands` stands it in. `user` is the
 * test's own, where it sets one up (fake timers).
 */
export async function signInLands(
  user: Pick<ReturnType<typeof userEvent.setup>, 'click'> = userEvent,
) {
  await user.click(screen.getByRole('button', { name: SIGN_IN_LANDS }));
}
