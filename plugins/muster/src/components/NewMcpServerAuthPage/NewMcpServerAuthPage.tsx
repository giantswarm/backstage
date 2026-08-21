import { useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Flex,
  Text,
  TextField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  SectionHeader,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { newMcpServerRouteRef } from '../../routes';
import type { McpServerAuthMode } from '../../lib/mcpServerDefinition';
import { musterOAuthCallbackUrl } from '../../lib/oauthCallback';
import { useMusterInstance } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { SelectableCard, SelectableCardGrid } from '../SelectableCard';

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  stepLabel: {
    marginBottom: theme.spacing(0.5),
  },
  pageTitle: {
    marginBottom: theme.spacing(1),
  },
  intro: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
  footerNote: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(2),
  },
  callbackUrl: {
    fontFamily: 'monospace',
    userSelect: 'all',
    overflowWrap: 'anywhere',
  },
}));

// The auth question is asked about the BACKEND, never as muster spec fields —
// a registrant should not need to know the CRD's auth modes or their
// mutual-exclusion rules (they are enforced structurally by these being
// exclusive choices; see lib/mcpServerDefinition).
const AUTH_CHOICES: Array<{
  value: McpServerAuthMode;
  title: string;
  description: string;
}> = [
  {
    value: 'none',
    title: 'No authentication',
    description:
      'The server is public or trusted on the network. Muster connects without credentials.',
  },
  {
    value: 'own-account',
    title: 'Sign in with your own account',
    description:
      'The backend runs its own authorization server (GitHub-style). Each user completes a one-time sign-in; muster acts as the OAuth client.',
  },
  {
    value: 'platform-sso',
    title: 'Platform SSO',
    description:
      'The backend is administered by your platform team and accepts the platform identity token directly.',
  },
];

/**
 * Step 2 (Authentication) of the MCP server registration wizard: one guided
 * question about the backend, with the per-choice details (callback URL to
 * allowlist, issuer/scopes override, token-exposure warning) inline under the
 * selected choice. Deep links with the details step incomplete are sent back
 * to step 1, matching agent creation's step guards.
 */
export function NewMcpServerAuthPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const detailsLink = useRouteRef(newMcpServerRouteRef);
  const { activeInstallationInfo } = useMusterInstance();
  const {
    state,
    setAuthMode,
    setIssuer,
    setScopes,
    setRequiredAudiences,
    authFields,
    detailsErrors,
    validationErrors,
  } = useNewMcpServerForm();

  // Audiences are a list in the form state but one comma-separated field here.
  // The raw text is local so typing "aud1, " doesn't get normalised (and the
  // cursor yanked) mid-keystroke; the form state only sees the parsed list.
  const [audiencesRaw, setAudiencesRaw] = useState(
    state.requiredAudiences.join(', '),
  );
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

  // Auth-only problems (the issuer override): everything in validationErrors
  // that isn't a details problem. Surfaced inline — there is no Continue on
  // this step yet (review & register lands with the wizard's entry point).
  const authErrors = validationErrors.filter(
    error => !detailsErrors.includes(error),
  );

  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          onPress={() => detailsLink && navigate(detailsLink())}
        >
          Back
        </Button>
      </Flex>
    ),
    [detailsLink, navigate],
  );

  // Guarded like the agent flow's later steps: when this render only produces
  // a redirect, pushing this step's actions into the shared section header
  // would flash controls for a page the user never sees.
  const isRedirecting = detailsErrors.length > 0;
  useProvidePageHeaderActions(isRedirecting ? null : actions);

  // A direct deep link with required step-1 fields missing can't be fixed on
  // this page — send the user back to fill those in first.
  if (isRedirecting) {
    return <Navigate to={detailsLink ? detailsLink() : '..'} replace />;
  }

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.stepLabel}
        >
          Step 2 of 4: Authentication
        </Text>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          How do users authenticate to this server?
        </Text>
        <Text as="p" className={classes.intro}>
          Answer for the server's backend — this decides how muster connects on
          each user's behalf. You don't need to know muster's auth
          configuration; the wizard composes it from your answer.
        </Text>

        <Flex direction="column" gap="4">
          <Card>
            <CardBody>
              <SelectableCardGrid
                ariaLabel="How do users authenticate to this server?"
                minWidth={280}
              >
                {AUTH_CHOICES.map(choice => (
                  <SelectableCard
                    key={choice.value}
                    selected={state.authMode === choice.value}
                    ariaLabel={choice.title}
                    onSelect={() => setAuthMode(choice.value)}
                  >
                    <Text weight="bold">{choice.title}</Text>
                    <Text variant="body-small" color="secondary">
                      {choice.description}
                    </Text>
                  </SelectableCard>
                ))}
              </SelectableCardGrid>
            </CardBody>
          </Card>

          {state.authMode === 'own-account' && (
            <Card>
              <CardBody>
                <SectionHeader
                  title="Allowlist muster's callback URL"
                  description="Before users can sign in, the backend's authorization server must allow redirects back to muster."
                />
                <Flex direction="column" gap="4">
                  {callbackUrl ? (
                    <Text as="p" className={classes.callbackUrl}>
                      {callbackUrl}
                    </Text>
                  ) : (
                    <Text as="p" color="secondary">
                      Select an installation to see its callback URL — it
                      follows the pattern{' '}
                      <span className={classes.callbackUrl}>
                        https://&lt;muster host&gt;/oauth/callback
                      </span>
                      .
                    </Text>
                  )}

                  <SectionHeader
                    title="Authorization server override"
                    description="Only needed when the server doesn't publish RFC 9728 resource metadata. Leave empty to discover the authorization server automatically — the default, and what compliant servers expect."
                  />
                  <TextField
                    label="Issuer"
                    secondaryLabel="optional"
                    value={state.issuer}
                    onChange={setIssuer}
                    placeholder="https://auth.example.com"
                    description="The authorization server's issuer URL."
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
                  {authErrors.length > 0 && (
                    <Alert
                      status="danger"
                      title="Please fix the following"
                      description={authErrors.join('. ')}
                    />
                  )}
                </Flex>
              </CardBody>
            </Card>
          )}

          {state.authMode === 'platform-sso' && (
            <Card>
              <CardBody>
                <Flex direction="column" gap="4">
                  <Alert
                    status="warning"
                    title="This server receives the platform identity token of every user who uses its tools"
                    description="Only choose this for backends your platform team administers."
                  />
                  <TextField
                    label="Required audiences"
                    secondaryLabel="optional"
                    value={audiencesRaw}
                    onChange={onAudiencesChange}
                    placeholder="my-backend-audience"
                    description="Audiences the forwarded token must carry, comma-separated. Leave empty unless the backend checks a specific audience."
                  />
                  <Alert
                    status="info"
                    title="New audiences need a muster restart"
                    description="Muster computes its identity-provider scope set from required audiences at startup, so a new audience takes effect only after muster reloads and users re-authenticate. Reusing an audience muster already requests needs no such step."
                  />
                </Flex>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                <Text as="p" color="secondary" className={classes.footerNote}>
                  Next you review the composed server definition and register
                  it. That step is on its way — for now, this is the end of the
                  flow.
                </Text>
                {actions}
              </Flex>
            </CardBody>
          </Card>
        </Flex>
      </div>
    </Content>
  );
}
