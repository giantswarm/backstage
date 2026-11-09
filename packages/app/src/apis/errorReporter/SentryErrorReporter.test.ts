import {
  scrubBreadcrumb,
  scrubEvent,
  scrubPromptFromUrl,
} from './SentryErrorReporter';

describe('scrubbing the new-session brief', () => {
  it('filters prompt in the fragment and the query, nothing else', () => {
    expect(
      scrubPromptFromUrl(
        'https://portal/?agent=golem%2Fkagent%2Fdefault-agent#prompt=Watch%20backups&x=1',
      ),
    ).toBe(
      'https://portal/?agent=golem%2Fkagent%2Fdefault-agent#prompt=[Filtered]&x=1',
    );
    expect(scrubPromptFromUrl('/?prompt=secret&agent=a')).toBe(
      '/?prompt=[Filtered]&agent=a',
    );
    expect(scrubPromptFromUrl('/sessions?promptless=1')).toBe(
      '/sessions?promptless=1',
    );
  });

  it('scrubs navigation breadcrumbs and event request URLs', () => {
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/sessions', to: '/#prompt=Hi' },
      }).data,
    ).toEqual({ from: '/sessions', to: '/#prompt=[Filtered]' });
    expect(
      scrubEvent({ request: { url: 'https://portal/#prompt=Hi' } }).request
        ?.url,
    ).toBe('https://portal/#prompt=[Filtered]');
  });
});
