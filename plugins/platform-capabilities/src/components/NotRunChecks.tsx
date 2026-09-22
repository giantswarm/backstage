import { Button, Flex, Link, Text } from '@backstage/ui';
import { SimpleAccordion } from '@giantswarm/backstage-plugin-ui-react';
import { useQueryClient } from '@tanstack/react-query';
import { VerifyDimension, VerifyResult } from '../apis';
import { count, notChecked } from '../lib/comparison';
import { LIST_STYLE } from './DimensionItem';
import { ErrorAlert } from './ErrorAlert';
import { useLiveVerify, verifyKey } from './queries';

/** The line a list of checks opens from takes the row's width beside the button. */
const GROW = { flex: 1 };

/**
 * One check by name: its id and the definition's key, and muster's sign-in
 * where the check ran and found the installation not connected.
 */
function CheckLine({ dimension }: { dimension: VerifyDimension }) {
  const auth = dimension.live?.authRequired;
  return (
    <li data-testid={`check-${dimension.id}`}>
      <code>{dimension.id}</code>
      {dimension.key ? ` — ${dimension.key}` : ''}
      {auth?.authUrl && (
        <>
          {' · '}
          <Link href={auth.authUrl} target="_blank" rel="noopener">
            connect {auth.server} in muster
          </Link>
        </>
      )}
    </li>
  );
}

/** A skipped-check note: the line the checks open from, smaller than the record's lines. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text as="span" variant="body-small" color="secondary">
      {children}
    </Text>
  );
}

/**
 * The checks the comparison did not run, each by name under an expandable
 * line: those that need the person's session on the installation, with the
 * button that runs them as the person through muster (the live half merged
 * into the comparison the tab holds, so the checks that answered leave this
 * list for the features), and the rest under the manager's reason. A
 * comparison the tab does not hold (a dialog's review) lists them without
 * the button.
 */
export function NotRunChecks({ result }: { result: VerifyResult }) {
  const pending = notChecked(result.features ?? []);
  const live = useLiveVerify(result.installation, result.capability);
  const queryClient = useQueryClient();
  const held =
    queryClient.getQueryData(
      verifyKey(result.installation, result.capability),
    ) === result;
  if (pending.session.length === 0 && pending.other.length === 0) {
    return null;
  }
  return (
    <>
      {pending.session.length > 0 && (
        <Flex gap="2" align="start" justify="between">
          <div data-testid="needs-session" style={GROW}>
            <SimpleAccordion
              title={
                <Note>
                  {pending.session.length === 1
                    ? '1 check needs'
                    : `${pending.session.length} checks need`}{' '}
                  your session on {result.installation}
                </Note>
              }
            >
              <ul style={LIST_STYLE}>
                {pending.session.map(d => (
                  <CheckLine key={d.id} dimension={d} />
                ))}
              </ul>
            </SimpleAccordion>
          </div>
          {held && (
            <Button
              variant="secondary"
              size="small"
              onPress={() => live.mutate(result)}
              isDisabled={live.isPending}
            >
              {live.isPending ? 'Reading as you…' : 'Run them as you'}
            </Button>
          )}
        </Flex>
      )}
      {live.error && (
        <ErrorAlert
          title="The checks did not run as you"
          error={live.error as Error}
        />
      )}
      {pending.other.map(([reason, dimensions]) => (
        <div key={reason} data-testid="not-run">
          <SimpleAccordion
            title={
              <Note>
                {count(dimensions.length, 'check')} could not run: {reason}
              </Note>
            }
          >
            <ul style={LIST_STYLE}>
              {dimensions.map(d => (
                <CheckLine key={d.id} dimension={d} />
              ))}
            </ul>
          </SimpleAccordion>
        </div>
      ))}
    </>
  );
}
