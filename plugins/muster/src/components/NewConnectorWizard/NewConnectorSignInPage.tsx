import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Flex,
  PasswordField,
  Radio,
  RadioGroup,
  Text,
  TextField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  useFieldValidation,
  useProvidePageHeaderActions,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  SIGV4_SHARED_IDENTITY_WARNING,
  clientCredentialsArgument,
  clientCredentialsProblems,
  effectiveGrantScope,
  hasAdvancedAuthorizationServer,
  hasStoredClientSecret,
  mcpServerFieldErrors,
  type ClientCredentials,
  type McpServerAuthMode,
} from '../../lib/mcpServerDefinition';
import { mutationErrorMessage } from '../../lib/authError';
import { musterOAuthCallbackUrl } from '../../lib/oauthCallback';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import {
  OneTimeClientCredentials,
  useRegisterMcpServer,
} from '../NewMcpServerReviewPage';
import { SelectableCard } from '../SelectableCard';
import { DisclosureAccordion, SessionGate } from '../shared';
import { useToolArgumentSupport } from '../shared/hooks';
import { useConnectorWizardLinks } from '../NewMcpServerEditGate';
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
  // A tertiary button's label lines up with the fields' left edge: its own
  // inline padding (bui's small size, space-2) moves outside the column.
  inlineAction: {
    alignSelf: 'flex-start',
    marginInlineStart: 'calc(-1 * var(--bui-space-2))',
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

const NO_CREDENTIALS: ClientCredentials = { clientId: '', clientSecret: '' };

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

/**
 * What `grantScope: session` means for the people using the connector: the
 * portal is one muster session and every agent conversation another.
 */
const SESSION_GRANT_WARNING =
  'Agents will ask you to sign in again in every conversation.';

/**
 * How often people sign in to an own-account connector, outside the Advanced
 * disclosure: it decides whether their agents see the sign-in at all. Plain
 * first, muster's `grantScope` value in parentheses for whoever is matching
 * this up with the MCPServer resource. muster takes `subject` only on a pinned
 * authorization server, so without an issuer the choice shows `session`,
 * disabled, and says what lifts it.
 */
function GrantScopeChoice({
  grantScope,
  hasIssuer,
  onChange,
}: {
  /** The scope the connector ends up with (`effectiveGrantScope`). */
  grantScope: 'session' | 'subject';
  hasIssuer: boolean;
  onChange: (grantScope: 'session' | 'subject') => void;
}) {
  let description: string | undefined;
  if (!hasIssuer) {
    description =
      "Signing in once needs the app's issuer URL, under Advanced: Muster can't yet reuse a sign-in to an app whose sign-in settings it looks up.";
  } else if (grantScope === 'subject') {
    description = 'A sign-in lasts until the person signs out of it.';
  }
  // Why the choice is disabled is the description's to say; the warning only
  // says what a session sign-in means.
  const warning =
    grantScope === 'session'
      ? 'A sign-in covers one session only: the portal, or one agent conversation.'
      : undefined;
  return (
    <Flex direction="column" gap="3">
      <RadioGroup
        label="How often people sign in"
        value={grantScope}
        onChange={value => {
          if (value === 'session' || value === 'subject') {
            onChange(value);
          }
        }}
        isDisabled={!hasIssuer}
        description={description}
      >
        <Radio value="subject">
          Once, for the portal and every agent conversation (subject)
        </Radio>
        <Radio value="session">Again in every conversation (session)</Radio>
      </RadioGroup>
      {warning && (
        <Alert
          status="warning"
          title={SESSION_GRANT_WARNING}
          description={warning}
        />
      )}
    </Flex>
  );
}

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
  const wizardLinks = useConnectorWizardLinks();
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
    setUseExistingSecret,
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
    startedFromEdit,
    markSaved,
    storedClientCredentials,
    authorizationServerChanged,
  } = useNewMcpServerForm();

  // A client's ID and secret live here only, never in the form state: they
  // go into the create or update call and are cleared once it succeeds. A
  // refused save keeps them for the retry (see `onRegister`).
  const [credentials, setCredentials] =
    useState<ClientCredentials>(NO_CREDENTIALS);
  // An older muster takes no `clientCredentials` (giantswarm/muster#1737):
  // New Secret then has no fields to type a client into, and says why.
  const takesClient = useToolArgumentSupport(
    registeredName ? 'core_mcpserver_update' : 'core_mcpserver_create',
    state.installation,
    'clientCredentials',
    { enabled: state.authMode === 'own-account' },
  );
  const cannotStoreClient = takesClient === false;
  const [replacing, setReplacing] = useState(false);
  // A client muster stored for this connector. It is used only while an
  // issuer is set; it is bound to its authorization server, so pointing the
  // connector at another one needs the client again (muster refuses the save
  // otherwise).
  const hadClient =
    !state.useExistingSecret &&
    (hasStoredClientSecret(state) || storedClientCredentials);
  const clientSecretStored = hadClient && Boolean(state.issuer.trim());
  const serverChanged = clientSecretStored && authorizationServerChanged;
  const replaceMode = clientSecretStored && (replacing || serverChanged);
  const enteringCredentials =
    !state.useExistingSecret &&
    !cannotStoreClient &&
    (!clientSecretStored || replaceMode);
  const credentialProblems = enteringCredentials
    ? clientCredentialsProblems(state, credentials, { required: replaceMode })
    : [];
  const credentialErrors = mcpServerFieldErrors(credentialProblems);
  const issuerError = fieldErrors.issuer ?? credentialErrors.issuer;

  // Replace and Keep stored secret take themselves off the page, so the
  // focus moves to what replaces them rather than to the body.
  const clientIdRef = useRef<HTMLDivElement>(null);
  const replaceButtonRef = useRef<HTMLButtonElement>(null);
  const [focusAfter, setFocusAfter] = useState<'clientId' | 'replace'>();
  useEffect(() => {
    if (focusAfter === 'clientId') {
      clientIdRef.current?.querySelector('input')?.focus();
    } else if (focusAfter === 'replace') {
      replaceButtonRef.current?.focus();
    }
    setFocusAfter(undefined);
  }, [focusAfter]);
  // What was typed on the other side stays for the way back (the forms
  // skill), except the client secret: a typed secret is never kept around
  // out of sight.
  const chooseSource = (existing: boolean) => {
    setUseExistingSecret(existing);
    setCredentials(prev => ({ ...prev, clientSecret: '' }));
    setReplacing(false);
  };
  const startReplacing = () => {
    setReplacing(true);
    setFocusAfter('clientId');
  };
  const keepStoredSecret = () => {
    setReplacing(false);
    setCredentials(NO_CREDENTIALS);
    setFocusAfter('replace');
  };

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
    // Typed client values belong to "own account"; another mode drops them,
    // as switching the client's source does.
    setCredentials(NO_CREDENTIALS);
    setReplacing(false);
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
    issuerError ||
    fieldErrors.authorizationEndpoint ||
    fieldErrors.tokenEndpoint ||
    fieldErrors.clientSecretName ||
    fieldErrors.clientSecretNamespace ||
    fieldErrors.clientIdKey ||
    fieldErrors.clientSecretKey ||
    credentialErrors.clientId ||
    credentialErrors.clientSecret,
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
  const authErrorCount = authErrors.length + credentialProblems.length;
  const installation = state.installation;
  const authMode = state.authMode;
  const onRegister = useCallback(() => {
    if (authErrorCount > 0) {
      reveal();
      return;
    }
    const clientCredentials = enteringCredentials
      ? clientCredentialsArgument(state, credentials)
      : undefined;
    register(
      {
        definition,
        installation,
        authMode,
        isEdit,
        startedFromEdit,
        clientCredentials: clientCredentials
          ? new OneTimeClientCredentials(clientCredentials)
          : undefined,
      },
      {
        // Cleared only once stored: after a refusal the person fixes what
        // muster named and saves again with the values still typed (the
        // forms skill: never clear typed input on a failed submit). They
        // stay in this page's state only, never in the form, its saved base
        // or the edit draft.
        onSuccess: sent => {
          setCredentials(NO_CREDENTIALS);
          // What was just written is the base of any further save in this run.
          markSaved(sent, {
            storedClientCredentials: Boolean(clientCredentials),
          });
          setReplacing(false);
          const test = wizardLinks('verify', {
            name: sent.name,
            installation,
          });
          if (test) {
            navigate(test);
          }
        },
      },
    );
  }, [
    authErrorCount,
    reveal,
    enteringCredentials,
    state,
    credentials,
    register,
    definition,
    installation,
    authMode,
    isEdit,
    startedFromEdit,
    markSaved,
    wizardLinks,
    navigate,
  ]);

  let newSecretText =
    'When you enter a client, Muster stores it in a new Kubernetes Secret of type Opaque, which belongs to the connector and is deleted with it.';
  if (cannotStoreClient && !clientSecretStored) {
    newSecretText =
      'Muster on this installation cannot store a client yet. To use your own client, choose Existing Secret and name a Secret that holds it.';
  } else if (!enteringCredentials) {
    newSecretText =
      'Muster keeps the client in a Kubernetes Secret of type Opaque, which belongs to the connector and is deleted with it.';
  }

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
    const connect = wizardLinks('connect', {
      name: registeredName,
      installation: registeredInstallation,
    });
    if (connect) {
      navigate(connect);
    }
  }, [wizardLinks, navigate, registeredName, registeredInstallation]);

  // Guarded: when this render only redirects, pushing
  // actions into the footer slot would flash controls for an unseen page.
  const isRedirecting = detailsErrors.length > 0;
  useProvidePageHeaderActions(isRedirecting ? null : actions);

  // A deep link with required step-1 fields missing can't be fixed here.
  if (isRedirecting) {
    return (
      <Navigate
        to={
          wizardLinks('connect', {
            name: registeredName,
            installation: registeredInstallation,
          }) ?? '..'
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
            Muster&apos;s callback URL
            {callbackUrl ? ':' : ' (https://<muster host>/oauth/callback).'}
          </Text>
          {callbackUrl && (
            <Text as="p" variant="body-small" className={classes.callbackUrl}>
              {callbackUrl}
            </Text>
          )}
          <GrantScopeChoice
            grantScope={effectiveGrantScope(state)}
            hasIssuer={Boolean(state.issuer.trim())}
            onChange={setGrantScope}
          />
          {/* Remounted on each blocked attempt, open when a field inside
              has a problem: a collapsed panel unmounts its fields, and the
              one that says what is wrong must be on screen. */}
          <DisclosureAccordion
            key={validation.attempt}
            summary={
              <span className={classes.disclosureSummary}>
                Advanced: sign-in settings for apps Muster can&apos;t look up
              </span>
            }
            // An issuer opens it too: the grant-scope choice above depends on
            // it and sends people here for it.
            defaultExpanded={
              Boolean(state.issuer.trim()) ||
              hasAdvancedAuthorizationServer(state) ||
              hadClient ||
              (validation.submitted && hasAdvancedProblem)
            }
          >
            <div className={classes.disclosureBody}>
              <Text variant="body-small" color="secondary">
                Only for apps that don&apos;t publish their sign-in settings,
                such as GitHub. Leave empty and Muster looks them up.
              </Text>
              <TextField
                label="Where people sign in (issuer URL)"
                secondaryLabel="optional"
                value={state.issuer}
                onChange={setIssuer}
                placeholder="e.g. https://auth.example.com"
                description="Every setting below requires this."
                {...textFieldProps('issuer', issuerError)}
              />
              <TextField
                label="Sign-in page address (authorization endpoint)"
                secondaryLabel="optional"
                value={state.authorizationEndpoint}
                onChange={setAuthorizationEndpoint}
                placeholder="e.g. https://github.com/login/oauth/authorize"
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
                placeholder="e.g. https://github.com/login/oauth/access_token"
                description="Set together with the sign-in page address."
                {...textFieldProps('tokenEndpoint', fieldErrors.tokenEndpoint)}
              />
              {/* Enabled with or without an issuer: a field greyed out until
                  one above is filled reads as broken. Validation names the
                  missing issuer instead. */}
              <TextField
                label="Permissions to ask for (scopes)"
                secondaryLabel="optional"
                value={state.scopes}
                onChange={setScopes}
                placeholder="e.g. read write"
                description="Separated by spaces. Needs an issuer."
                {...textFieldProps('scopes', fieldErrors.scopes)}
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
                  Client credentials
                </Text>
                <Text variant="body-small" color="secondary">
                  Only if you registered the app with its provider yourself,
                  such as a GitHub App. Leave empty when Muster can register
                  itself.
                </Text>
                <RadioGroup
                  aria-labelledby={credentialsHeadingId}
                  orientation="horizontal"
                  value={state.useExistingSecret ? 'existing' : 'new'}
                  onChange={value => chooseSource(value === 'existing')}
                >
                  <Radio value="new">New Secret</Radio>
                  <Radio value="existing">Existing Secret</Radio>
                </RadioGroup>
                {/* What either choice means in Kubernetes terms. muster
                    writes its own client Secret as `Opaque`, and reads any
                    other type but the ones that hold the cluster's or its own
                    credentials (TLS, tokens, image pulls, Helm releases). */}
                {state.useExistingSecret ? (
                  <Text variant="body-small" color="secondary">
                    Name a Kubernetes Secret of type Opaque that holds the
                    client ID and secret in its data, by default under the keys
                    client-id and client-secret. Whoever saves the connector
                    must be allowed to get this Secret.
                  </Text>
                ) : (
                  <Text variant="body-small" color="secondary">
                    {newSecretText}
                  </Text>
                )}
                {clientSecretStored && !replaceMode && (
                  <Flex align="center" justify="between" gap="3">
                    <Text variant="body-medium">Client secret stored</Text>
                    {!cannotStoreClient && (
                      <Button
                        ref={replaceButtonRef}
                        variant="secondary"
                        size="small"
                        onPress={startReplacing}
                      >
                        Replace
                      </Button>
                    )}
                  </Flex>
                )}
                {serverChanged && (
                  <Text variant="body-small" color="secondary">
                    The sign-in server changed, so enter the client again.
                  </Text>
                )}
                {hadClient && !clientSecretStored && (
                  <Text variant="body-small" color="secondary">
                    Without an issuer, the stored client is no longer used.
                  </Text>
                )}
                {enteringCredentials && (
                  <>
                    <TextField
                      ref={clientIdRef}
                      label="Client ID"
                      isRequired={replaceMode}
                      secondaryLabel={replaceMode ? undefined : 'optional'}
                      autoComplete="off"
                      value={credentials.clientId}
                      onChange={clientId =>
                        setCredentials(prev => ({ ...prev, clientId }))
                      }
                      {...textFieldProps('clientId', credentialErrors.clientId)}
                    />
                    <PasswordField
                      label="Client secret"
                      isRequired={replaceMode}
                      secondaryLabel={replaceMode ? undefined : 'optional'}
                      autoComplete="new-password"
                      value={credentials.clientSecret}
                      onChange={clientSecret =>
                        setCredentials(prev => ({ ...prev, clientSecret }))
                      }
                      description="It cannot be read back once saved."
                      {...textFieldProps(
                        'clientSecret',
                        credentialErrors.clientSecret,
                      )}
                    />
                    {replaceMode && !serverChanged && (
                      <Button
                        className={classes.inlineAction}
                        variant="tertiary"
                        size="small"
                        onPress={keepStoredSecret}
                      >
                        Keep stored secret
                      </Button>
                    )}
                  </>
                )}
                {state.useExistingSecret && (
                  <>
                    <TextField
                      label="Secret name"
                      value={state.clientSecretName}
                      onChange={setClientSecretName}
                      placeholder="e.g. github-oauth-client"
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
                      description="Defaults to the connector's namespace."
                      {...textFieldProps(
                        'clientSecretNamespace',
                        fieldErrors.clientSecretNamespace,
                      )}
                    />
                    {/* The placeholder is the default key itself, not an
                        "e.g.": an empty field sends nothing and Muster uses
                        that key, which the text above says too. */}
                    <TextField
                      label="Key in the Secret's data that holds the client ID"
                      secondaryLabel="optional"
                      value={state.clientIdKey}
                      onChange={setClientIdKey}
                      placeholder="client-id"
                      {...textFieldProps(
                        'clientIdKey',
                        fieldErrors.clientIdKey,
                      )}
                    />
                    <TextField
                      label="Key in the Secret's data that holds the client secret"
                      secondaryLabel="optional"
                      value={state.clientSecretKey}
                      onChange={setClientSecretKey}
                      placeholder="client-secret"
                      {...textFieldProps(
                        'clientSecretKey',
                        fieldErrors.clientSecretKey,
                      )}
                    />
                  </>
                )}
              </div>
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
            A new audience takes effect only after Muster restarts and people
            sign in to the platform again; one Muster already requests works
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
            description="Defaults to Muster's own identity."
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
          context="Adding the connector needs a Muster session."
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
