import { useCallback, useId, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Select, Text, TextField } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  useFieldValidation,
  useProvidePageHeaderActions,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { newMcpServerRouteRef, newMcpServerVerifyRouteRef } from '../../routes';
import {
  SIGV4_SHARED_IDENTITY_WARNING,
  hasAdvancedAuthorizationServer,
  type McpServerAuthMode,
} from '../../lib/mcpServerDefinition';
import { mutationErrorMessage } from '../../lib/authError';
import { musterOAuthCallbackUrl } from '../../lib/oauthCallback';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { useRegisterMcpServer } from '../NewMcpServerReviewPage';
import { SelectableCard } from '../SelectableCard';
import { DisclosureAccordion, SessionGate } from '../shared';
import { withEditParam } from '../NewMcpServerEditGate';
import { ConnectorWizardFrame } from './ConnectorWizardFrame';

const useStyles = makeStyles({
  callbackUrl: {
    fontFamily: 'monospace',
    userSelect: 'all',
    overflowWrap: 'anywhere',
  },
  disclosureBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '0 12px 12px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    margin: 0,
  },
  disclosureSummary: {
    padding: '4px 0',
    fontWeight: 500,
  },
  // One card per row at every width — a fixed-minimum auto-fill grid would
  // overflow the 375px layout the shell promises.
  choices: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
});

// The auth question is asked about the people using the connector, never as
// muster spec fields. One card per mode the platform decided to offer; token
// exchange, forwardIdentity and plaintext header credentials are deliberately
// not on this list (operator-level, niche, or insecurely stored). Company login
// leads and is where a new connector starts (the design's recommendation); each
// description says what people experience first and the caveat second.
const SIGN_IN_CHOICES: Array<{
  value: McpServerAuthMode;
  title: string;
  description: string;
  recommended?: boolean;
}> = [
  {
    value: 'platform-sso',
    title: 'Company login',
    recommended: true,
    description:
      'Signs people in automatically with the company account and forwards their platform identity token, which is not scoped to this connector. Use it only for apps your platform team runs.',
  },
  {
    value: 'own-account',
    title: 'Each person signs in with their own account',
    description:
      'Each person connects their account on first use; their own permissions apply.',
  },
  {
    value: 'none',
    title: 'No sign-in',
    description: 'Use it for public connectors, such as web search.',
  },
  {
    value: 'sigv4',
    title: 'AWS request signing (SigV4)',
    description:
      'Use it for connectors hosted on AWS. Muster signs every request with one shared AWS identity, not the person’s.',
  },
];

// Plain first, muster's `grantScope` value in parentheses for whoever is
// matching this up with the MCPServer resource.
const GRANT_SCOPE_OPTIONS = [
  {
    id: 'session',
    label: 'Sign in again in every new session (session, default)',
  },
  {
    id: 'subject',
    label: "Sign in once, reused across the person's sessions (subject)",
  },
];

/**
 * Step 2 (Sign-in) of the shell's connector wizard: how people sign in to the
 * connector, one honest card per offered mode, the per-mode fields under the
 * selected card, and the registration itself — "Add connector" validates the
 * composed definition through muster and creates (or, editing, updates) the
 * server, then moves on to test it.
 */
export function NewConnectorSignInPage() {
  const classes = useStyles();
  const credentialsHeadingId = useId();
  const navigate = useNavigate();
  const connectLink = useRouteRef(newMcpServerRouteRef);
  const testLink = useRouteRef(newMcpServerVerifyRouteRef);
  const { activeInstallationInfo } = useMusterInstance();
  const session = useMusterSession();
  const { authenticated } = session;
  const {
    state,
    setAuthMode,
    setIssuer,
    setScopes,
    setAuthorizationEndpoint,
    setTokenEndpoint,
    setClientSecretName,
    setClientSecretNamespace,
    setClientIdKey,
    setClientSecretKey,
    setGrantScope,
    setRequiredAudiences,
    setSigv4Region,
    setSigv4Service,
    setSigv4RoleArn,
    authFields,
    authAdvisories,
    detailsErrors,
    validationErrors,
    fieldErrors,
    definition,
    registeredName,
    registeredInstallation,
    markSaved,
  } = useNewMcpServerForm();

  // Audiences are a list in the form state but one comma-separated field here;
  // raw text is local so typing "aud1, " isn't normalised mid-keystroke. A
  // mode switch replaces the audiences in the form state, so the text follows
  // along — adjusted during render, React's pattern for derived state.
  const [audiencesRaw, setAudiencesRaw] = useState(
    state.requiredAudiences.join(', '),
  );
  const [audiencesMode, setAudiencesMode] = useState(state.authMode);
  if (audiencesMode !== state.authMode) {
    setAudiencesMode(state.authMode);
    setAudiencesRaw(state.requiredAudiences.join(', '));
  }
  const onAudiencesChange = (raw: string) => {
    setAudiencesRaw(raw);
    setRequiredAudiences(
      raw
        .split(',')
        .map(a => a.trim())
        .filter(Boolean),
    );
  };

  const callbackUrl = musterOAuthCallbackUrl(activeInstallationInfo?.endpoint);
  const authErrors = validationErrors.filter(
    error => !detailsErrors.includes(error),
  );
  // The own-account fields all sit in the Advanced disclosure.
  const hasAdvancedProblem = Boolean(
    fieldErrors.issuer ||
    fieldErrors.authorizationEndpoint ||
    fieldErrors.tokenEndpoint ||
    fieldErrors.clientSecretName,
  );

  const isEdit = Boolean(registeredName);
  const registration = useRegisterMcpServer();
  const { mutate: register } = registration;
  const busy = registration.isPending;
  const registrationError = registration.error
    ? mutationErrorMessage(registration.error)
    : undefined;

  // Each field shows its own problem once the person leaves it having typed
  // in it, or once a registration was blocked, and a blocked registration
  // moves the focus to the first one (the `forms` skill).
  const validation = useFieldValidation();
  const { reveal, textFieldProps } = validation;
  const authErrorCount = authErrors.length;
  const installation = state.installation;
  const authMode = state.authMode;
  const onRegister = useCallback(() => {
    if (authErrorCount > 0) {
      reveal();
      return;
    }
    register(
      { definition, installation, authMode, isEdit },
      {
        onSuccess: () => {
          // What was just written is the base of any further save in this run.
          markSaved(definition);
          if (testLink) {
            navigate(withEditParam(testLink(), definition.name, installation));
          }
        },
      },
    );
  }, [
    authErrorCount,
    reveal,
    register,
    definition,
    installation,
    authMode,
    isEdit,
    markSaved,
    testLink,
    navigate,
  ]);

  const registerLabel = isEdit ? 'Save changes' : 'Add connector';
  const busyLabel = isEdit ? 'Saving…' : 'Adding…';

  const actions = useMemo(
    () => (
      <Button
        variant="primary"
        isDisabled={busy || !authenticated}
        onPress={onRegister}
      >
        {busy ? busyLabel : registerLabel}
      </Button>
    ),
    [busy, authenticated, onRegister, busyLabel, registerLabel],
  );

  const onBack = useCallback(() => {
    if (connectLink) {
      navigate(
        withEditParam(connectLink(), registeredName, registeredInstallation),
      );
    }
  }, [connectLink, navigate, registeredName, registeredInstallation]);

  // Guarded: when this render only redirects, pushing
  // actions into the footer slot would flash controls for an unseen page.
  const isRedirecting = detailsErrors.length > 0;
  useProvidePageHeaderActions(isRedirecting ? null : actions);

  // A deep link with required step-1 fields missing can't be fixed here.
  if (isRedirecting) {
    return (
      <Navigate
        to={
          connectLink
            ? withEditParam(
                connectLink(),
                registeredName,
                registeredInstallation,
              )
            : '..'
        }
        replace
      />
    );
  }

  // sigv4 is only offered where the CRD allows it (streamable-http). The
  // transport comes from the probe here, not from a control — but a selected
  // sigv4 (an edit of such a server) always keeps its card, or the current
  // choice would be undisplayable.
  const choices = SIGN_IN_CHOICES.filter(
    choice =>
      choice.value !== 'sigv4' ||
      state.authMode === 'sigv4' ||
      state.transport === 'streamable-http',
  );

  return (
    <ConnectorWizardFrame step="signin" onBack={onBack}>
      <WizardStepHeading title="How do people sign in?">
        Agents act as the person chatting with them.
      </WizardStepHeading>

      <div
        className={classes.choices}
        role="radiogroup"
        aria-label="How do people sign in?"
      >
        {choices.map(choice => (
          <SelectableCard
            key={choice.value}
            selected={state.authMode === choice.value}
            ariaLabel={choice.title}
            onSelect={() => setAuthMode(choice.value)}
          >
            <Text weight="bold">{choice.title}</Text>
            <Text variant="body-small" color="secondary">
              {choice.recommended
                ? `Recommended. ${choice.description}`
                : choice.description}
            </Text>
          </SelectableCard>
        ))}
      </div>

      {state.authMode === 'own-account' && (
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-small" color="secondary">
            The app&apos;s authorization server must allow redirects to
            muster&apos;s callback URL
            {callbackUrl ? ':' : ' (https://<muster host>/oauth/callback).'}
          </Text>
          {callbackUrl && (
            <Text as="p" variant="body-small" className={classes.callbackUrl}>
              {callbackUrl}
            </Text>
          )}
          {/* Remounted on each blocked attempt, open when a field inside
              has a problem: a collapsed panel unmounts its fields, and the
              one that says what is wrong must be on screen. */}
          <DisclosureAccordion
            key={validation.attempt}
            summary={
              <span className={classes.disclosureSummary}>
                Advanced: sign-in settings for apps muster can&apos;t look up
              </span>
            }
            defaultExpanded={
              hasAdvancedAuthorizationServer(state) ||
              (validation.submitted && hasAdvancedProblem)
            }
          >
            <div className={classes.disclosureBody}>
              <Text variant="body-small" color="secondary">
                Only for apps that don&apos;t publish their sign-in settings,
                such as GitHub. Leave empty and muster looks them up.
              </Text>
              <TextField
                label="Where people sign in (issuer URL)"
                secondaryLabel="optional"
                value={state.issuer}
                onChange={setIssuer}
                placeholder="https://auth.example.com"
                description="Every setting below requires this."
                {...textFieldProps('issuer', fieldErrors.issuer)}
              />
              <TextField
                label="Permissions to ask for (scopes)"
                secondaryLabel="optional"
                isDisabled={!authFields.scopes.available}
                value={state.scopes}
                onChange={setScopes}
                placeholder="read write"
                description={
                  authFields.scopes.available
                    ? "Separate them with spaces, as the app's documentation names them."
                    : authFields.scopes.reason
                }
              />
              <TextField
                label="Sign-in page address (authorization endpoint)"
                secondaryLabel="optional"
                value={state.authorizationEndpoint}
                onChange={setAuthorizationEndpoint}
                placeholder="https://github.com/login/oauth/authorize"
                description="Set together with the token address, or leave both empty."
                {...textFieldProps(
                  'authorizationEndpoint',
                  fieldErrors.authorizationEndpoint,
                )}
              />
              <TextField
                label="Token address (token endpoint)"
                secondaryLabel="optional"
                value={state.tokenEndpoint}
                onChange={setTokenEndpoint}
                placeholder="https://github.com/login/oauth/access_token"
                description="Set together with the sign-in page address."
                {...textFieldProps('tokenEndpoint', fieldErrors.tokenEndpoint)}
              />
              <div
                className={classes.fieldGroup}
                role="group"
                aria-labelledby={credentialsHeadingId}
              >
                <Text
                  as="h3"
                  id={credentialsHeadingId}
                  variant="body-medium"
                  weight="bold"
                >
                  Client credentials — stored in a Kubernetes Secret
                </Text>
                <Text variant="body-small" color="secondary">
                  Only if you registered the app with its provider yourself,
                  such as a GitHub App. Enter the Secret&apos;s name and key
                  names — never the client ID or secret themselves. Leave empty
                  when muster can register itself.
                </Text>
                <TextField
                  label="Secret name"
                  secondaryLabel="optional"
                  value={state.clientSecretName}
                  onChange={setClientSecretName}
                  placeholder="github-oauth-client"
                  {...textFieldProps(
                    'clientSecretName',
                    fieldErrors.clientSecretName,
                  )}
                />
                <TextField
                  label="Secret namespace"
                  secondaryLabel="optional"
                  value={state.clientSecretNamespace}
                  onChange={setClientSecretNamespace}
                  placeholder="muster"
                  description="Defaults to the connector's namespace."
                />
                <TextField
                  label="Key holding the client ID"
                  secondaryLabel="optional"
                  value={state.clientIdKey}
                  onChange={setClientIdKey}
                  placeholder="client-id"
                  description="Defaults to client-id."
                />
                <TextField
                  label="Key holding the client secret"
                  secondaryLabel="optional"
                  value={state.clientSecretKey}
                  onChange={setClientSecretKey}
                  placeholder="client-secret"
                  description="Defaults to client-secret."
                />
              </div>
              <Select
                label="How long a sign-in lasts"
                options={GRANT_SCOPE_OPTIONS}
                selectedKey={state.grantScope}
                onSelectionChange={key => {
                  if (key === 'session' || key === 'subject') {
                    setGrantScope(key);
                  }
                }}
                description="Reuse suits personal accounts like GitHub; it lasts until the person signs out."
              />
            </div>
          </DisclosureAccordion>
        </Flex>
      )}

      {state.authMode === 'platform-sso' && (
        <Flex direction="column" gap="3">
          <TextField
            label="Required audiences"
            secondaryLabel="optional"
            value={audiencesRaw}
            onChange={onAudiencesChange}
            placeholder="my-backend-audience"
            description="Separate them with commas. Fill this in only if the backend checks a specific audience."
          />
          <Text as="p" variant="body-small" color="secondary">
            A new audience takes effect only after muster restarts and people
            sign in to the platform again; one muster already requests works
            right away.
          </Text>
        </Flex>
      )}

      {state.authMode === 'sigv4' && (
        <Flex direction="column" gap="3">
          <Alert
            status="warning"
            title="Every user shares one AWS identity"
            description={SIGV4_SHARED_IDENTITY_WARNING}
          />
          <TextField
            label="Signing region"
            isRequired
            isDisabled={!authFields.sigv4.available}
            value={state.sigv4Region}
            onChange={setSigv4Region}
            placeholder="eu-central-1"
            description={
              authFields.sigv4.available
                ? "Must match the region in the server's URL."
                : authFields.sigv4.reason
            }
            {...textFieldProps('sigv4Region', fieldErrors.sigv4Region)}
          />
          <TextField
            label="Signing service"
            secondaryLabel="optional"
            isDisabled={!authFields.sigv4.available}
            value={state.sigv4Service}
            onChange={setSigv4Service}
            placeholder="aws-mcp"
            description="Defaults to the URL's first hostname label."
          />
          <TextField
            label="Assumed role ARN"
            secondaryLabel="optional"
            isDisabled={!authFields.sigv4.available}
            value={state.sigv4RoleArn}
            onChange={setSigv4RoleArn}
            placeholder="arn:aws:iam::123456789012:role/muster-mcp"
            description="Defaults to muster's own identity."
          />
          {authAdvisories.map(advisory => (
            <Alert
              key={advisory}
              status="info"
              title="Worth checking"
              description={advisory}
            />
          ))}
        </Flex>
      )}

      {!authenticated && (
        <SessionGate
          session={session}
          context="Adding the connector needs a muster session."
        />
      )}
      {validation.submitted && fieldErrors.transport && (
        <Alert
          status="danger"
          title="Fix before continuing"
          description={fieldErrors.transport}
        />
      )}
      {registrationError && (
        <Alert
          status="danger"
          title={
            isEdit
              ? 'Could not save the connector'
              : 'Could not add the connector'
          }
          description={registrationError}
        />
      )}
    </ConnectorWizardFrame>
  );
}
