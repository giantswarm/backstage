import { useCallback, useSyncExternalStore } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  Alert,
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { BusyDialog } from '../BusyDialog';
import {
  type ExternalUrlConsentAnswer,
  type PendingExternalUrlConsent,
  externalUrlConsentApiRef,
} from '../../apis/externalUrlConsent';
import {
  describeExternalUrl,
  externalUrlWarningText,
} from '../../apis/externalUrlConsent/describeExternalUrl';

const useStyles = makeStyles({
  address: {
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    overflowWrap: 'anywhere',
    padding: 'var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    backgroundColor: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-fg-primary)',
  },
  domain: {
    fontWeight: 700,
    color: 'inherit',
    backgroundColor: 'var(--bui-warning-bg-subdued)',
  },
});

export type ExternalUrlConsentDialogProps = {
  request: PendingExternalUrlConsent;
  onAnswer: (answer: ExternalUrlConsentAnswer) => void;
};

/**
 * Asks before opening an address a server provided: its full host, the full
 * address as text with its registrable domain highlighted, warnings for a punycode domain, plain
 * http and user info, and an explicit Open. The address is never a link.
 * Escape, a click outside and the close button answer `cancel`; "Don't open"
 * answers `decline`.
 */
export function ExternalUrlConsentDialog({
  request,
  onAnswer,
}: ExternalUrlConsentDialogProps) {
  const classes = useStyles();
  const described = describeExternalUrl(request.url);
  const inNewTab = (request.target ?? 'tab') === 'tab';

  return (
    <BusyDialog
      isOpen
      isBusy={false}
      onOpenChange={isOpen => {
        if (!isOpen) {
          onAnswer('cancel');
        }
      }}
      width="min(90vw, 560px)"
    >
      <DialogHeader>Open a page for {request.requester}?</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          {described ? (
            <>
              <Text variant="body-medium">
                {request.requester} asks you to open this page
                {inNewTab ? ' in a new tab' : ''}.
              </Text>
              {request.message ? (
                <Text variant="body-medium" color="secondary">
                  “{request.message}”
                </Text>
              ) : null}
              {/* The full host, as the browser's address bar will show it:
                  the registrable domain alone hides the name that tells
                  services apart on a shared or wildcard-DNS domain
                  (muster.127.0.0.1.nip.io is not nip.io). The address below
                  keeps the registrable domain highlighted, against
                  look-alikes such as login.github.com.evil.example. */}
              <Text variant="body-medium">
                Host:{' '}
                <Text
                  as="span"
                  variant="body-medium"
                  weight="bold"
                  data-testid="external-url-host"
                >
                  {described.hostname}
                </Text>
              </Text>
              <div className={classes.address} data-testid="external-url">
                {described.before}
                <mark className={classes.domain}>{described.domain}</mark>
                {described.after}
              </div>
              {described.warnings.map(warning => (
                <Alert
                  key={warning}
                  status="warning"
                  description={externalUrlWarningText(
                    warning,
                    described.domain,
                  )}
                />
              ))}
            </>
          ) : (
            <Alert
              status="danger"
              description={`${request.requester} asked to open an address that is not a web page, so it cannot be opened.`}
            />
          )}
        </Flex>
      </DialogBody>
      <DialogFooter>
        {described ? (
          <>
            <Button variant="secondary" onPress={() => onAnswer('decline')}>
              Don't open page
            </Button>
            <Button variant="primary" onPress={() => onAnswer('accept')}>
              {inNewTab ? 'Open page in new tab' : 'Open page'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onPress={() => onAnswer('cancel')}>
            Close
          </Button>
        )}
      </DialogFooter>
    </BusyDialog>
  );
}

/**
 * Presents the {@link externalUrlConsentApiRef} requests, one at a time.
 * Mounted once at the app root, like Backstage's `OAuthRequestDialog`.
 */
export function ExternalUrlConsentDialogHost() {
  const api = useApi(externalUrlConsentApiRef);
  const subscribe = useCallback(
    (listener: () => void) => api.subscribe(listener),
    [api],
  );
  const request = useSyncExternalStore(subscribe, () => api.current());
  if (!request) {
    return null;
  }
  return (
    <ExternalUrlConsentDialog
      key={request.id}
      request={request}
      onAnswer={answer => api.answer(request.id, answer)}
    />
  );
}
