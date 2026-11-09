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
  type ExternalUrlWarning,
  describeExternalUrl,
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

const WARNING_TEXT: Record<ExternalUrlWarning, (domain: string) => string> = {
  punycode: () =>
    'The domain is an internationalized name, shown in its punycode form (xn--…). Such names can imitate a familiar site: make sure it is the one you expect.',
  insecure: () =>
    'The page is not served over HTTPS: what you enter on it can be read on the way.',
  userinfo: domain =>
    `The address has a user name before the domain. It leads to ${domain}, not to the name before the @.`,
};

export type ExternalUrlConsentDialogProps = {
  request: PendingExternalUrlConsent;
  onAnswer: (answer: ExternalUrlConsentAnswer) => void;
};

/**
 * Asks before opening an address a server provided: the full address as
 * text with its domain highlighted, warnings for a punycode domain, plain
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
              <Text variant="body-medium">
                Domain:{' '}
                <Text as="span" variant="body-medium" weight="bold">
                  {described.domain}
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
                  description={WARNING_TEXT[warning](described.domain)}
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
