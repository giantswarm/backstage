import { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Select, Text, TextField } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
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
      'People are signed in with their company account automatically. Muster forwards each person’s platform identity token, which is not scoped to this server — use it for apps your platform team runs.',
  },
  {
    value: 'own-account',
    title: 'Each person signs in with their own account',
    description:
      'People connect their own account the first time an agent needs it, and their own permissions apply. Muster acts as the OAuth client.',
  },
  {
    value: 'none',
    title: 'No sign-in',
    description: 'For public servers, such as web search.',
  },
  {
    value: 'sigv4',
    title: 'AWS request signing (SigV4)',
    description:
      'Muster signs every request with its own shared AWS identity — not the person’s. For AWS-hosted servers.',
  },
];

const GRANT_SCOPE_OPTIONS = [
  { id: 'session', label: 'Each login session (default)' },
  { id: 'subject', label: 'Each person — reused across their sessions' },
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
    definition,
    registeredName,
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

  const isEdit = Boolean(registeredName);
  const registration = useRegisterMcpServer();
  const { mutate: register } = registration;
  const busy = registration.isPending;
  const registrationError = registration.error
    ? mutationErrorMessage(registration.error)
    : undefined;

  const [showValidation, setShowValidation] = useState(false);
  const authErrorCount = authErrors.length;
  const installation = state.installation;
  const authMode = state.authMode;
  const onRegister = useCallback(() => {
    if (authErrorCount > 0) {
      setShowValidation(true);
      return;
    }
    register(
      { definition, installation, authMode, isEdit },
      {
        onSuccess: () => {
          // What was just written is the base of any further save in this run.
          markSaved(definition);
          if (testLink) {
            navigate(withEditParam(testLink(), definition.name));
          }
        },
      },
    );
  }, [
    authErrorCount,
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
      navigate(withEditParam(connectLink(), registeredName));
    }
  }, [connectLink, navigate, registeredName]);

  // Guarded like the classic steps: when this render only redirects, pushing
  // actions into the footer slot would flash controls for an unseen page.
  const isRedirecting = detailsErrors.length > 0;
  useProvidePageHeaderActions(isRedirecting ? null : actions);

  // A deep link with required step-1 fields missing can't be fixed here.
  if (isRedirecting) {
    return (
      <Navigate
        to={connectLink ? withEditParam(connectLink(), registeredName) : '..'}
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
        Agents act as the person chatting with them, so with a personal sign-in
        each person&apos;s own permissions apply.
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
            Before people can sign in, the app&apos;s authorization server must
            allow redirects back to muster&apos;s callback URL
            {callbackUrl ? ':' : ' (https://<muster host>/oauth/callback).'}
          </Text>
          {callbackUrl && (
            <Text as="p" variant="body-small" className={classes.callbackUrl}>
              {callbackUrl}
            </Text>
          )}
          <DisclosureAccordion
            summary={
              <span className={classes.disclosureSummary}>
                Advanced: authorization server override
              </span>
            }
            defaultExpanded={hasAdvancedAuthorizationServer(state)}
          >
            <div className={classes.disclosureBody}>
              <Text variant="body-small" color="secondary">
                Only needed when the app&apos;s authorization server publishes
                no discovery metadata (GitHub-style). Leave everything empty to
                discover it automatically — the default, and what compliant
                servers expect.
              </Text>
              <TextField
                label="Issuer"
                secondaryLabel="optional"
                value={state.issuer}
                onChange={setIssuer}
                placeholder="https://auth.example.com"
                description="The authorization server's issuer URL. Everything below belongs to it."
              />
              <TextField
                label="Scopes"
                secondaryLabel="optional"
                isDisabled={!authFields.scopes.available}
                value={state.scopes}
                onChange={setScopes}
                placeholder="read write"
                description={
                  authFields.scopes.available
                    ? 'Space-separated OAuth scopes to request from the issuer.'
                    : authFields.scopes.reason
                }
              />
              <TextField
                label="Authorization endpoint"
                secondaryLabel="optional"
                value={state.authorizationEndpoint}
                onChange={setAuthorizationEndpoint}
                placeholder="https://github.com/login/oauth/authorize"
                description="Pinned for authorization servers without RFC 8414 discovery. Set together with the token endpoint."
              />
              <TextField
                label="Token endpoint"
                secondaryLabel="optional"
                value={state.tokenEndpoint}
                onChange={setTokenEndpoint}
                placeholder="https://github.com/login/oauth/access_token"
                description="Pinned together with the authorization endpoint."
              />
              <TextField
                label="Client credentials Secret"
                secondaryLabel="optional"
                value={state.clientSecretName}
                onChange={setClientSecretName}
                placeholder="github-oauth-client"
                description="Name of a Kubernetes Secret holding an out-of-band registered OAuth client (e.g. a GitHub App) — the credential itself never enters this definition. Leave empty when the server supports dynamic client registration."
              />
              <TextField
                label="Secret namespace"
                secondaryLabel="optional"
                value={state.clientSecretNamespace}
                onChange={setClientSecretNamespace}
                placeholder="muster"
                description="Where that Secret lives. Leave empty for muster's own namespace."
              />
              <TextField
                label="Client id key"
                secondaryLabel="optional"
                value={state.clientIdKey}
                onChange={setClientIdKey}
                placeholder="clientId"
                description="The Secret key holding the client id."
              />
              <TextField
                label="Client secret key"
                secondaryLabel="optional"
                value={state.clientSecretKey}
                onChange={setClientSecretKey}
                placeholder="clientSecret"
                description="The Secret key holding the client secret."
              />
              <Select
                label="Sign-in grant lasts for"
                options={GRANT_SCOPE_OPTIONS}
                selectedKey={state.grantScope}
                onSelectionChange={key => {
                  if (key === 'session' || key === 'subject') {
                    setGrantScope(key);
                  }
                }}
                description="By default a person signs in once per login session; per person, the grant is reused across their sessions."
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
            description="Audiences the forwarded token must carry, comma-separated. Leave empty unless the backend checks a specific audience."
          />
          <Text as="p" variant="body-small" color="secondary">
            Muster computes its identity-provider scope set from required
            audiences at startup — a new audience takes effect only after muster
            restarts and people sign in to the platform again. Reusing an
            audience muster already requests needs no such step.
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
                ? "The region in the server's URL — the endpoint checks the signature against it."
                : authFields.sigv4.reason
            }
          />
          <TextField
            label="Signing service"
            secondaryLabel="optional"
            isDisabled={!authFields.sigv4.available}
            value={state.sigv4Service}
            onChange={setSigv4Service}
            placeholder="aws-mcp"
            description="Leave empty to derive it from the URL's first hostname label."
          />
          <TextField
            label="Assumed role ARN"
            secondaryLabel="optional"
            isDisabled={!authFields.sigv4.available}
            value={state.sigv4RoleArn}
            onChange={setSigv4RoleArn}
            placeholder="arn:aws:iam::123456789012:role/muster-mcp"
            description="A role muster assumes before signing. Leave empty to sign as muster's own identity."
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
          context="Adding the connector runs live through muster, which needs a live session."
        />
      )}
      {showValidation && authErrors.length > 0 && (
        <Alert
          status="danger"
          title="Please fix the following before continuing"
          description={authErrors.join('. ')}
        />
      )}
      {registrationError && (
        <Alert
          status="danger"
          title={isEdit ? 'Save failed' : 'Adding the connector failed'}
          description={registrationError}
        />
      )}
    </ConnectorWizardFrame>
  );
}
