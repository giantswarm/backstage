import { Alert, Flex, Link, Text } from '@backstage/ui';
import { CapabilityPlan, OptIn, PlanInstallation } from '../apis';
import { StateTag } from './StateTag';

const LIST_STYLE = { margin: 0, paddingLeft: 16 };

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="1" data-testid={testId}>
      <Text variant="body-small" weight="bold">
        {title}
      </Text>
      {children}
    </Flex>
  );
}

/** The opt-in file's path and how the owners add it, as the manager reports them. */
export function OptInNote({ optIn }: { optIn: OptIn }) {
  const where = [optIn.repository, optIn.path].filter(Boolean).join(': ');
  return (
    <Alert
      status="info"
      title="Not opted in"
      description={
        <Flex direction="column" gap="1" data-testid="opt-in-note">
          <Text variant="body-small">
            The installation&apos;s owners opt in with the file{' '}
            <code>{where}</code>
            {optIn.optIn === false ? ' (present, optIn: false)' : ''}.
          </Text>
          {optIn.howToOptIn && (
            <Text variant="body-small">
              {/^https?:\/\//.test(optIn.howToOptIn) ? (
                <Link href={optIn.howToOptIn} target="_blank" rel="noopener">
                  The pull request that adds it
                </Link>
              ) : (
                optIn.howToOptIn
              )}
            </Text>
          )}
          {optIn.error && (
            <Text variant="body-small" color="secondary">
              {optIn.error}
            </Text>
          )}
        </Flex>
      }
    />
  );
}

function InstallationPlan({ plan }: { plan: PlanInstallation }) {
  const byRepository = new Map<string, typeof plan.files>();
  for (const file of plan.files ?? []) {
    byRepository.set(file.repository, [
      ...(byRepository.get(file.repository) ?? []),
      file,
    ]);
  }
  return (
    <Flex direction="column" gap="3" data-testid={`plan-${plan.name}`}>
      <Flex gap="2" align="center">
        <Text variant="body-medium" weight="bold">
          {plan.name}
        </Text>
        {plan.state && <StateTag state={plan.state} />}
      </Flex>
      {plan.refused && (
        <Alert
          status="danger"
          title="Refused by the definition"
          description={plan.refused}
        />
      )}
      {plan.commitRefused && (
        <Alert
          status="warning"
          title="A commit would be refused"
          description={plan.commitRefused}
        />
      )}
      {plan.optIn?.state === 'not opted in' && <OptInNote optIn={plan.optIn} />}
      {byRepository.size > 0 && (
        <Section title="Files" testId="plan-files">
          {[...byRepository.entries()].map(([repository, files]) => (
            <div key={repository}>
              <Text variant="body-small" color="secondary">
                {repository}
              </Text>
              <ul style={LIST_STYLE}>
                {files?.map(file => (
                  <li key={file.path}>
                    <code>{file.path}</code> — {file.change}
                    {file.generated?.length
                      ? ` (generated: ${file.generated.join(', ')})`
                      : ''}
                    {file.error ? ` — ${file.error}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}
      {!!plan.generatedSecrets?.length && (
        <Section title="Generated secrets (by name)" testId="plan-secrets">
          <ul style={LIST_STYLE}>
            {plan.generatedSecrets.map(secret => (
              <li key={secret.name}>
                <code>{secret.name}</code>
                {secret.kind ? ` — ${secret.kind}` : ''}
                {secret.length ? `, ${secret.length} characters` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!!plan.dexClients?.length && (
        <Section title="Dex clients" testId="plan-dex-clients">
          <ul style={LIST_STYLE}>
            {plan.dexClients.map(client => (
              <li key={client.id}>
                <code>{client.id}</code>
                {client.name ? ` (${client.name})` : ''}
                {client.secret ? ` — secret ${client.secret}` : ''}
                {client.redirectURIs?.length ? (
                  <ul style={LIST_STYLE}>
                    {client.redirectURIs.map(uri => (
                      <li key={uri}>
                        <code>{uri}</code>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!!plan.customerActions?.length && (
        <Section title="Customer actions" testId="plan-customer-actions">
          <ul style={LIST_STYLE}>
            {plan.customerActions.map((action, i) => (
              <li key={`${action.action}-${i}`}>
                {action.action}
                {action.why ? ` — ${action.why}` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!!plan.probes?.length && (
        <Section title="Probes" testId="plan-probes">
          <ul style={LIST_STYLE}>
            {plan.probes.map(probe => (
              <li key={probe.id}>
                <code>{probe.id}</code>
                {probe.feature ? ` — ${probe.feature}` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Flex>
  );
}

/**
 * A dry run as the manager rendered it: per installation the files by
 * repository, the generated secrets by name, the Dex clients with their
 * redirect URIs, the customer actions and the probes; then the pull requests
 * in the order they would open, the installations a set skipped, and what a
 * commit does. Nothing here is computed by the page.
 */
export function PlanView({ plan }: { plan: CapabilityPlan }) {
  return (
    <Flex direction="column" gap="4" data-testid="plan">
      {plan.installations.map(installation => (
        <InstallationPlan key={installation.name} plan={installation} />
      ))}
      {!!plan.pullRequests?.length && (
        <Section title="Pull requests, in order" testId="plan-pull-requests">
          <ol style={LIST_STYLE}>
            {plan.pullRequests.map(pr => (
              <li key={`${pr.order}-${pr.repository}`}>
                {pr.repository}
                {pr.changes !== undefined ? ` — ${pr.changes} change(s)` : ''}
                {pr.files?.length ? `: ${pr.files.join(', ')}` : ''}
              </li>
            ))}
          </ol>
        </Section>
      )}
      {plan.pullRequests?.length === 0 && (
        <Text variant="body-small" color="secondary">
          No pull request: every file is unchanged.
        </Text>
      )}
      {!!plan.skipped?.length && (
        <Section title="Skipped" testId="plan-skipped">
          <ul style={LIST_STYLE}>
            {plan.skipped.map(s => (
              <li key={s.name}>
                {s.name} — {s.reason}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {plan.commit && (
        <Text variant="body-small" color="secondary" data-testid="plan-commit">
          {plan.commit}
        </Text>
      )}
    </Flex>
  );
}
