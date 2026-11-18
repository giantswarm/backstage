import type {
  ExternalUrlConsentAnswer,
  ExternalUrlConsentApi,
  ExternalUrlConsentRequest,
  PendingExternalUrlConsent,
} from './ExternalUrlConsentApi';
import { describeExternalUrl } from './describeExternalUrl';

export type OpenExternalUrl = (
  href: string,
  target: NonNullable<ExternalUrlConsentRequest['target']>,
) => void;

/**
 * A new tab gets no `window.opener` and no referrer: the page cannot reach
 * back into the portal, and the portal cannot read it.
 */
export const openExternalUrl: OpenExternalUrl = (href, target) => {
  if (target === 'page') {
    window.location.assign(href);
  } else {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
};

type Waiting = {
  request: PendingExternalUrlConsent;
  answered: Promise<ExternalUrlConsentAnswer>;
  resolve: (answer: ExternalUrlConsentAnswer) => void;
};

export class ExternalUrlConsentManager implements ExternalUrlConsentApi {
  private readonly queue: Waiting[] = [];
  private readonly listeners = new Set<() => void>();
  private nextId = 1;

  constructor(private readonly openUrl: OpenExternalUrl = openExternalUrl) {}

  open(request: ExternalUrlConsentRequest): Promise<ExternalUrlConsentAnswer> {
    const same = this.queue.find(
      waiting =>
        waiting.request.url === request.url &&
        (waiting.request.target ?? 'tab') === (request.target ?? 'tab'),
    );
    if (same) {
      return same.answered;
    }
    let resolve!: (answer: ExternalUrlConsentAnswer) => void;
    const answered = new Promise<ExternalUrlConsentAnswer>(r => {
      resolve = r;
    });
    this.queue.push({
      request: { ...request, id: this.nextId++ },
      answered,
      resolve,
    });
    this.notify();
    return answered;
  }

  current(): PendingExternalUrlConsent | undefined {
    return this.queue[0]?.request;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  answer(id: number, answer: ExternalUrlConsentAnswer): void {
    const index = this.queue.findIndex(waiting => waiting.request.id === id);
    if (index < 0) {
      return;
    }
    const [waiting] = this.queue.splice(index, 1);
    const described = describeExternalUrl(waiting.request.url);
    if (answer === 'accept' && described) {
      this.openUrl(described.href, waiting.request.target ?? 'tab');
      waiting.resolve('accept');
    } else {
      waiting.resolve(answer === 'accept' ? 'cancel' : answer);
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }
}
