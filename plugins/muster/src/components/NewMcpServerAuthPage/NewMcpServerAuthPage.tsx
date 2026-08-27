import { useCallback, useMemo, useState } from 'react';
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

import { newMcpServerRouteRef, newMcpServerReviewRouteRef } from '../../routes';
import {
  SIGV4_SHARED_IDENTITY_WARNING,
  SIGV4_TRANSPORT_REQUIREMENT,
  type McpServerAuthMode,
} from '../../lib/mcpServerDefinition';
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
  {
    value: 'sigv4',
    title: 'AWS request signing (SigV4)',
    description:
      "The backend is AWS-hosted and takes no token. Muster signs every request with its own AWS identity — shared by all users, not the caller's.",
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
    setSigv4Region,
    setSigv4Service,
    setSigv4RoleArn,
    authFields,
    authAdvisories,
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
  const reviewLink = useRouteRef(newMcpServerReviewRouteRef);

  // Auth-only problems (the issuer override): everything in validationErrors
  // that isn't a details problem. Surfaced inline and checked on Continue.
  const authErrors = validationErrors.filter(
    error => !detailsErrors.includes(error),
  );

  // Show auth validation feedback only once the user tries to proceed, same
  // rule as step 1.
  const [showValidation, setShowValidation] = useState(false);
  const authErrorCount = authErrors.length;
  const onContinue = useCallback(() => {
    if (authErrorCount > 0) {
      setShowValidation(true);
      return;
    }
    if (reviewLink) {
      navigate(reviewLink());
    }
  }, [authErrorCount, reviewLink, navigate]);

  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          onPress={() => detailsLink && navigate(detailsLink())}
        >
          Back
        </Button>
        <Button variant="primary" onPress={onContinue}>
          Continue
        </Button>
      </Flex>
    ),
    [detailsLink, navigate, onContinue],
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
                {AUTH_CHOICES.map(choice => {
                  // sigv4 is the one choice a step-1 answer can rule out: the
                  // CRD only allows it with streamable-http. Shown disabled
                  // with the reason rather than hidden, so the option stays
                  // discoverable and the transport link is obvious. An already
                  // selected sigv4 stays pickable — its own card below carries
                  // the error, and un-selecting the current choice by disabling
                  // it would strand the user.
                  const unavailable =
                    choice.value === 'sigv4' &&
                    state.authMode !== 'sigv4' &&
                    state.transport !== 'streamable-http';
                  return (
                    <SelectableCard
                      key={choice.value}
                      selected={state.authMode === choice.value}
                      ariaLabel={choice.title}
                      disabled={unavailable}
                      onSelect={() => setAuthMode(choice.value)}
                    >
                      <Text weight="bold">{choice.title}</Text>
                      <Text variant="body-small" color="secondary">
                        {choice.description}
                      </Text>
                      {unavailable && (
                        <Text variant="body-small" color="warning">
                          {SIGV4_TRANSPORT_REQUIREMENT}
                        </Text>
                      )}
                    </SelectableCard>
                  );
                })}
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

          {state.authMode === 'sigv4' && (
            <Card>
              <CardBody>
                <Flex direction="column" gap="4">
                  {/* The point of the whole step for this choice: the other
                      three modes resolve to the calling user, this one does
                      not, and nothing in the composed definition says so. */}
                  <Alert
                    status="warning"
                    title="This grants every user the same shared AWS identity"
                    description={SIGV4_SHARED_IDENTITY_WARNING}
                  />
                  <SectionHeader
                    title="Signing configuration"
                    description="How muster signs each request. Muster's own AWS credentials come from its pod identity; only the signing parameters are configured here."
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
                        ? "The region in the server's URL. The endpoint checks the signature against it, so a mismatch is rejected. This is not the region the server reads your resources from."
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
                    description={
                      authFields.sigv4.available
                        ? "Leave empty to derive it from the URL's first hostname label, which is how AWS's own clients do it (aws-mcp.eu-central-1.api.aws signs as aws-mcp)."
                        : authFields.sigv4.reason
                    }
                  />
                  <TextField
                    label="Assumed role ARN"
                    secondaryLabel="optional"
                    isDisabled={!authFields.sigv4.available}
                    value={state.sigv4RoleArn}
                    onChange={setSigv4RoleArn}
                    placeholder="arn:aws:iam::123456789012:role/muster-mcp"
                    description={
                      authFields.sigv4.available
                        ? "A role muster assumes before signing, to reach another account. Leave empty to sign as muster's own identity."
                        : authFields.sigv4.reason
                    }
                  />
                  {/* Advisories only: a missing signing region is a validation
                      error, and the footer surfaces those on Continue rather
                      than shouting at a card the user just opened. */}
                  {authAdvisories.map(advisory => (
                    <Alert
                      key={advisory}
                      status="info"
                      title="Worth checking"
                      description={advisory}
                    />
                  ))}
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
                  Next you review the composed server definition, register it,
                  and watch it connect.
                </Text>
                {showValidation && authErrors.length > 0 && (
                  <Alert
                    status="danger"
                    title="Please fix the following before continuing"
                    description={authErrors.join('. ')}
                  />
                )}
                {actions}
              </Flex>
            </CardBody>
          </Card>
        </Flex>
      </div>
    </Content>
  );
}
