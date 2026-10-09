import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  DateComponent,
  dialogDismissLock,
} from '@giantswarm/backstage-plugin-ui-react';

import { useCreateSessionShare } from '../../hooks/useCreateSessionShare';
import { useRevokeSessionShare } from '../../hooks/useRevokeSessionShare';
import { useSessionShares } from '../../hooks/useSessionShares';
import {
  SESSION_SHARE_TTL_CHOICES,
  type SessionShare,
  type SessionShareTtl,
} from '../../lib/sessionShares';

/** How the permission reads in the dialog — the grant, not the enum. */
const PERMISSION_LABELS: Record<SessionShare['permission'], string> = {
  'read-only': 'Read only',
  'read-write': 'Read and write',
  // A future controller permission shows as itself rather than borrowing a
  // label that may understate it.
  unknown: 'Unknown permission',
};

/** How long the copy button claims success before reverting. */
const COPIED_MS = 2_000;

const useStyles = makeStyles(theme => ({
  // One share per row: what it grants, when it ends, and the revoke. Wraps, so
  // at 375px the revoke drops under the dates instead of forcing a scroll.
  shareRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1, 2),
    padding: theme.spacing(1, 0),
    borderTop: `1px solid var(--bui-border-2, ${theme.palette.divider})`,
  },
  shareDates: {
    flex: 1,
    minWidth: 160,
  },
  // The token is opaque machine input; monospace says so and keeps characters
  // distinguishable when someone compares what they pasted.
  token: {
    flex: 1,
    minWidth: 0,
    '& input': {
      fontFamily: 'monospace',
    },
  },
}));

export type SessionShareDialogProps = {
  installation: string;
  sessionId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * Share one session: mint a share token, and list or revoke the shares that
 * exist.
 *
 * What a share **is**, on this kagent line: a token granting A2A access to the
 * session — read-only (get, list, subscribe) or read-write (also send and
 * cancel) — until it expires or is revoked. The controller stores only a hash,
 * so the token appears exactly once, in the create's answer, and the dialog's
 * job is to get it copied there and then. There is **no resolve-by-token API**
 * in the pinned kagent generation, so this portal cannot open a shared
 * session; the copy says so instead of producing a portal link that would 404.
 *
 * The dialog follows the rename dialog's two conventions: creating does not
 * close it (the token has to be shown, and a failure needs somewhere to be
 * said), and while a write is in flight it cannot be dismissed. Closing it
 * drops the token via the create hook's `reset`.
 */
export function SessionShareDialog({
  installation,
  sessionId,
  isOpen,
  onOpenChange,
}: SessionShareDialogProps) {
  const classes = useStyles();

  const [permission, setPermission] = useState<'read-only' | 'read-write'>(
    'read-only',
  );
  const [ttl, setTtl] = useState<SessionShareTtl>('24h');

  const {
    shares,
    isLoading,
    error: listError,
  } = useSessionShares(installation, sessionId, { enabled: isOpen });
  const creation = useCreateSessionShare(installation, sessionId);
  const revocation = useRevokeSessionShare(installation, sessionId);

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const token = creation.created?.token;
  const copyToken = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // Refused clipboard access (an insecure context, a permission): the
      // token stays in the field to copy by hand.
      return;
    }
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  }, [token]);

  const isBusy = creation.isCreating || revocation.isRevoking;

  const { reset: resetCreation } = creation;
  const { reset: resetRevocation } = revocation;
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // Drop the token — the dialog is its only home — and any stale errors,
        // so reopening starts clean.
        resetCreation();
        resetRevocation();
        setCopied(false);
      }
      onOpenChange(open);
    },
    [onOpenChange, resetCreation, resetRevocation],
  );

  return (
    <Dialog
      isOpen={isOpen}
      // While a write is in flight, closing would leave it running with
      // nowhere to report — and a create's token would be minted and lost.
      {...dialogDismissLock(isBusy, handleOpenChange)}
      width="min(92vw, 560px)"
    >
      <DialogHeader>Share session</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          <Text variant="body-medium" color="secondary">
            A share token grants access to this session through the
            platform&apos;s agent API (kagent) until it expires or is revoked —
            read-only, or read &amp; write to also send messages. This portal
            cannot open shared sessions yet, so the token is for
            kagent-compatible clients.
          </Text>

          <Flex gap="2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Select
              label="Access"
              aria-label="Access"
              options={[
                { id: 'read-only', label: 'Read only' },
                { id: 'read-write', label: 'Read and write' },
              ]}
              selectedKey={permission}
              onSelectionChange={key =>
                setPermission(key === 'read-write' ? 'read-write' : 'read-only')
              }
              isDisabled={creation.isCreating}
            />
            <Select
              label="Expires after"
              aria-label="Expires after"
              options={SESSION_SHARE_TTL_CHOICES.map(choice => ({
                id: choice.id,
                label: choice.label,
              }))}
              selectedKey={ttl}
              onSelectionChange={key => {
                const choice = SESSION_SHARE_TTL_CHOICES.find(
                  entry => entry.id === key,
                );
                if (choice) {
                  setTtl(choice.id);
                }
              }}
              isDisabled={creation.isCreating}
            />
            <Button
              variant="primary"
              isPending={creation.isCreating}
              onPress={() => {
                // Errors surface through the hook's `error`, rendered below.
                creation.createShare({ permission, ttl }).catch(() => {});
              }}
            >
              {creation.isCreating ? 'Creating…' : 'Create share token'}
            </Button>
          </Flex>

          {creation.error && (
            <Alert
              status="danger"
              title="Could not create the share"
              description={creation.error.message}
            />
          )}

          {token && (
            <Flex direction="column" gap="2">
              <Alert
                status="success"
                title="Share token created"
                description="Copy it now — it is shown only once and cannot be read back later. The list below can only revoke it."
              />
              <Flex gap="2" style={{ alignItems: 'center' }}>
                <TextField
                  aria-label="Share token"
                  value={token}
                  isReadOnly
                  className={classes.token}
                />
                <Button variant="secondary" onPress={copyToken}>
                  {copied ? 'Copied' : 'Copy token'}
                </Button>
              </Flex>
            </Flex>
          )}

          <Flex direction="column" gap="1">
            <Text variant="title-x-small">Active shares</Text>
            {listError && (
              <Alert
                status="warning"
                title="Could not read the existing shares"
                description={listError.message}
              />
            )}
            {revocation.error && (
              <Alert
                status="danger"
                title="Could not revoke the share"
                description={revocation.error.message}
              />
            )}
            {isLoading && (
              <Text variant="body-small" color="secondary">
                Loading shares…
              </Text>
            )}
            {!isLoading && !listError && shares.length === 0 && (
              <Text variant="body-small" color="secondary">
                This session has no active shares.
              </Text>
            )}
            {shares.map(share => (
              <div key={share.id} className={classes.shareRow}>
                <Text variant="body-medium">
                  {PERMISSION_LABELS[share.permission]}
                </Text>
                <div className={classes.shareDates}>
                  <Text variant="body-small" color="secondary">
                    {share.createdAt ? (
                      <>
                        created{' '}
                        <DateComponent value={share.createdAt} relative />
                        {' · '}
                      </>
                    ) : null}
                    {share.expiresAt ? (
                      <>
                        expires <DateComponent value={share.expiresAt} />
                      </>
                    ) : (
                      'does not expire'
                    )}
                  </Text>
                </div>
                <Button
                  size="small"
                  variant="secondary"
                  isPending={revocation.revokingId === share.id}
                  isDisabled={revocation.isRevoking}
                  onPress={() => {
                    // Errors surface through the hook's `error`, rendered above
                    // the list.
                    revocation.revokeShare(share.id).catch(() => {});
                  }}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </Flex>
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          isDisabled={isBusy}
          onClick={() => handleOpenChange(false)}
        >
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
