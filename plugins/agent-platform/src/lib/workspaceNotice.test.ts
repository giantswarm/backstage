import type { A2aMessageWire } from '@giantswarm/backstage-plugin-agent-platform-common';

import {
  isWorkspaceNotice,
  parseWorkspaceNotice,
  readWorkspaceNotice,
  summarizeEntry,
} from './workspaceNotice';
import {
  NOTICE_FAILED,
  NOTICE_RECOVERED,
  NOTICE_RESET,
  NOTICE_STALE,
} from './__fixtures__/workspaceNotice';

const OPENS = { opensTurn: true };
const LATER = { opensTurn: false };

const agentMessage = (
  parts: unknown[],
  extra: Partial<A2aMessageWire> = {},
): A2aMessageWire => ({
  messageId: 'm-1',
  role: 'agent',
  parts,
  ...extra,
});

describe('isWorkspaceNotice', () => {
  it('recognises an agent message of text starting with "Workspace setup"', () => {
    expect(
      isWorkspaceNotice(agentMessage([{ text: NOTICE_STALE }]), OPENS),
    ).toBe(true);
  });

  it('does not take the person’s own words for a notice', () => {
    expect(
      isWorkspaceNotice(
        agentMessage([{ text: NOTICE_STALE }], { role: 'user' }),
        OPENS,
      ),
    ).toBe(false);
  });

  it('does not take a reply that only mentions workspace setup for one', () => {
    expect(
      isWorkspaceNotice(
        agentMessage([{ text: 'The workspace setup looks fine to me.' }]),
        OPENS,
      ),
    ).toBe(false);
  });

  it('does not take a message that also calls a tool for one', () => {
    // The model's own message, whatever its words: the harness's notice is one
    // text part and nothing else.
    expect(
      isWorkspaceNotice(
        agentMessage([
          { text: 'Workspace setup: let me check the repositories.' },
          {
            data: { id: 'c-1', name: 'Bash', args: {} },
            metadata: { 'kagent.dev/a2a/part-type': 'function_call' },
          },
        ]),
        OPENS,
      ),
    ).toBe(false);
  });

  it.each(['kagent.dev/notice', 'kagent.dev/a2a/notice'])(
    'recognises the %s marker whatever the text says and wherever it sits',
    key => {
      expect(
        isWorkspaceNotice(
          agentMessage([{ text: 'The directory is being repaired.' }], {
            metadata: { [key]: 'workspace-setup' },
          }),
          LATER,
        ),
      ).toBe(true);
    },
  );

  it('does not take a reply that starts with the same words for one', () => {
    // An answer to "explain our workspace setup": not the message that opens
    // the turn, so the prefix is not tested at all.
    expect(
      isWorkspaceNotice(
        agentMessage([{ text: 'Workspace setup here uses mirrors.' }]),
        LATER,
      ),
    ).toBe(false);
  });

  it('ignores a marker for another kind of notice', () => {
    expect(
      isWorkspaceNotice(
        agentMessage([{ text: 'Something else.' }], {
          metadata: { 'kagent.dev/notice': 'quota' },
        }),
        OPENS,
      ),
    ).toBe(false);
  });
});

describe('parseWorkspaceNotice', () => {
  it('reads a failed setup as a warning with its error', () => {
    expect(parseWorkspaceNotice(NOTICE_FAILED)).toEqual({
      text: expect.any(String),
      severity: 'warning',
      entries: [
        {
          kind: 'failed',
          error:
            'could not create the session directory: no space left on device',
        },
      ],
    });
  });

  it('reads a directory set up again as a warning, in kagent’s words', () => {
    expect(parseWorkspaceNotice(NOTICE_RESET)).toEqual({
      text: expect.any(String),
      severity: 'warning',
      entries: [
        {
          kind: 'reset',
          text: "This session's directory was set up again from the workspace's mirrors. What was pushed is on the provider; what was not pushed is gone.",
        },
      ],
    });
  });

  it('reads repositories up to date again as information', () => {
    expect(parseWorkspaceNotice(NOTICE_RECOVERED)).toEqual({
      text: expect.any(String),
      severity: 'info',
      entries: [
        {
          kind: 'recovered',
          repositories: ['acme/app', 'acme/docs', 'acme/infra'],
        },
      ],
    });
  });

  it('reads repositories at the last sync as a warning, each with its reason', () => {
    const notice = parseWorkspaceNotice(NOTICE_STALE);
    expect(notice.severity).toBe('warning');
    expect(notice.entries).toEqual([
      {
        kind: 'stale',
        repositories: [
          {
            name: 'acme/app',
            reason: expect.stringMatching(
              /^the origin refused the fetch: fatal: You are attempting to fetch 20fd2e28/,
            ),
          },
          { name: 'acme/docs', reason: expect.stringContaining('0fd5d086') },
          { name: 'acme/infra', reason: expect.stringContaining('d1f41e67') },
        ],
      },
    ]);
  });

  it('reads every variant of a combined notice, in order', () => {
    const notice = parseWorkspaceNotice(
      [NOTICE_RESET, NOTICE_RECOVERED, NOTICE_STALE].join('\n'),
    );
    expect(notice.entries.map(entry => entry.kind)).toEqual([
      'reset',
      'recovered',
      'stale',
    ]);
    expect(notice.severity).toBe('warning');
  });

  it('is information when every variant is', () => {
    expect(
      parseWorkspaceNotice(`${NOTICE_RECOVERED}\n${NOTICE_RECOVERED}`).severity,
    ).toBe('info');
  });

  it('keeps a reason that runs over several lines with its repository', () => {
    const notice = parseWorkspaceNotice(
      [
        "Workspace setup: these repositories stay at the workspace's last sync.",
        '- acme/app: fatal: bad object',
        'hint: run git fsck',
        '- acme/docs',
      ].join('\n'),
    );
    expect(notice.entries).toEqual([
      {
        kind: 'stale',
        repositories: [
          { name: 'acme/app', reason: 'fatal: bad object\nhint: run git fsck' },
          { name: 'acme/docs' },
        ],
      },
    ]);
  });

  it('keeps a variant it does not know as kagent wrote it', () => {
    expect(
      parseWorkspaceNotice('Workspace setup: the mirrors are being repacked.'),
    ).toEqual({
      text: expect.any(String),
      severity: 'info',
      entries: [
        {
          kind: 'other',
          text: 'Workspace setup: the mirrors are being repacked.',
        },
      ],
    });
  });

  it('keeps the text of a marked notice that does not start with the prefix', () => {
    expect(parseWorkspaceNotice('The directory is being repaired.')).toEqual({
      text: expect.any(String),
      severity: 'info',
      entries: [{ kind: 'other', text: 'The directory is being repaired.' }],
    });
  });
});

describe('parseWorkspaceNotice, lists in other shapes', () => {
  const LAST_SYNC =
    "Workspace setup: these repositories stay at the workspace's last sync.";
  const UP_TO_DATE =
    'Workspace setup: an earlier turn could not clone or fetch these repositories; they are up to date now:';

  it('reads an up-to-date list that wraps onto the next line', () => {
    expect(
      parseWorkspaceNotice(`${UP_TO_DATE} acme/app, acme/docs,\nacme/infra.`)
        .entries,
    ).toEqual([
      {
        kind: 'recovered',
        repositories: ['acme/app', 'acme/docs', 'acme/infra'],
      },
    ]);
  });

  it('reads an up-to-date list written one repository per line', () => {
    expect(
      parseWorkspaceNotice(`${UP_TO_DATE}\n- acme/app\n- acme/docs`).entries,
    ).toEqual([{ kind: 'recovered', repositories: ['acme/app', 'acme/docs'] }]);
  });

  it('keeps a sentence after an up-to-date list on its own', () => {
    expect(
      parseWorkspaceNotice(`${UP_TO_DATE} acme/app.\nThe mirrors were slow.`)
        .entries,
    ).toEqual([
      { kind: 'recovered', repositories: ['acme/app'] },
      { kind: 'other', text: 'The mirrors were slow.' },
    ]);
  });

  it('reads repositories named on the last-sync line itself', () => {
    expect(
      parseWorkspaceNotice(
        "Workspace setup: these repositories stay at the workspace's last sync: acme/app, acme/docs",
      ).entries,
    ).toEqual([
      {
        kind: 'stale',
        repositories: [{ name: 'acme/app' }, { name: 'acme/docs' }],
      },
    ]);
  });

  it('keeps what is not a repository line as the list’s note', () => {
    expect(
      parseWorkspaceNotice(
        "Workspace setup: these repositories stay at the workspace's last sync because the mirrors are being repacked.\nNo fetch was attempted.",
      ).entries,
    ).toEqual([
      {
        kind: 'stale',
        repositories: [],
        note: 'because the mirrors are being repacked.\nNo fetch was attempted.',
      },
    ]);
  });

  it('reads repository lines with other bullets and separators', () => {
    expect(
      parseWorkspaceNotice(
        [
          LAST_SYNC,
          '- acme/app (main): fetch refused',
          '* acme/docs — fetch refused',
          '- acme/infra:fetch refused',
        ].join('\n'),
      ).entries,
    ).toEqual([
      {
        kind: 'stale',
        repositories: [
          { name: 'acme/app', reason: '(main): fetch refused' },
          { name: 'acme/docs', reason: 'fetch refused' },
          { name: 'acme/infra', reason: 'fetch refused' },
        ],
      },
    ]);
  });

  it('says "some repositories" rather than none when no list could be read', () => {
    expect(
      summarizeEntry(
        parseWorkspaceNotice(`${LAST_SYNC}\nThe list is unavailable.`)
          .entries[0],
      ),
    ).toBe('Workspace setup: some repositories not updated');
  });
});

describe('readWorkspaceNotice', () => {
  it('parses a notice message', () => {
    expect(
      readWorkspaceNotice(agentMessage([{ text: NOTICE_RECOVERED }]), OPENS)
        ?.entries,
    ).toEqual([
      {
        kind: 'recovered',
        repositories: ['acme/app', 'acme/docs', 'acme/infra'],
      },
    ]);
  });

  it('is undefined for the agent’s reply', () => {
    expect(
      readWorkspaceNotice(
        agentMessage([{ text: 'No, gh is not installed.' }]),
        OPENS,
      ),
    ).toBeUndefined();
  });
});

describe('summarizeEntry', () => {
  it.each([
    [NOTICE_FAILED, 'Workspace setup failed'],
    [NOTICE_RESET, 'Workspace setup: directory set up again'],
    [NOTICE_RECOVERED, 'Workspace setup: 3 repositories up to date again'],
    [NOTICE_STALE, 'Workspace setup: 3 repositories not updated'],
  ])('summarizes %j as one line', (text, summary) => {
    expect(summarizeEntry(parseWorkspaceNotice(text).entries[0])).toBe(summary);
  });

  it('counts one repository in the singular', () => {
    expect(
      summarizeEntry(
        parseWorkspaceNotice(
          "Workspace setup: these repositories stay at the workspace's last sync.\n- acme/app: fatal: bad object",
        ).entries[0],
      ),
    ).toBe('Workspace setup: 1 repository not updated');
  });
});
