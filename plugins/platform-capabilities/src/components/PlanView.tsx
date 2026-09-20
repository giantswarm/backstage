import { Flex, Text } from '@backstage/ui';
import { PlanFile, VerifyResult } from '../apis';
import { LIST_STYLE } from './DimensionItem';

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

/**
 * The plan the comparison rendered from the inputs: the files by
 * repository, the generated secrets by name, the Dex clients with their
 * redirect URIs, the customer actions, and the pull requests in the order
 * they open. Nothing here is computed by the page.
 */
export function PlanView({ plan }: { plan: VerifyResult }) {
  const byRepository = new Map<string, PlanFile[]>();
  for (const file of plan.files ?? []) {
    byRepository.set(file.repository, [
      ...(byRepository.get(file.repository) ?? []),
      file,
    ]);
  }
  const pullRequests = plan.pullRequests ?? [];
  return (
    <Flex direction="column" gap="3" data-testid="plan">
      {byRepository.size > 0 && (
        <Section title="Files" testId="plan-files">
          {[...byRepository.entries()].map(([repository, files]) => (
            <div key={repository}>
              <Text variant="body-small" color="secondary">
                {repository}
              </Text>
              <ul style={LIST_STYLE}>
                {files.map(file => (
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
        <Section title="Generated secrets, by name" testId="plan-secrets">
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
      {pullRequests.length > 0 ? (
        <Section title="Pull requests, in order" testId="plan-pull-requests">
          <ol style={LIST_STYLE}>
            {pullRequests.map(pr => (
              <li key={`${pr.order}-${pr.repository}`}>
                {pr.repository}
                {pr.changes !== undefined ? ` — ${pr.changes} change(s)` : ''}
                {pr.files?.length ? `: ${pr.files.join(', ')}` : ''}
              </li>
            ))}
          </ol>
        </Section>
      ) : (
        <Text
          variant="body-small"
          color="secondary"
          data-testid="plan-pull-requests"
        >
          No pull request: every file is as defined.
        </Text>
      )}
    </Flex>
  );
}
