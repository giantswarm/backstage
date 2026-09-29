import { render, screen } from '@testing-library/react';
import { CapabilityState, VerifyResult } from '../apis';
import {
  ENABLED,
  NOT_COMPARED,
  UP_TO_DATE,
  VERIFIED,
} from '../fixtures/fakeApi';
import { SESSION_REASON } from '../lib/comparison';
import { StateIcon } from './StateIcon';
import { markOf, StateTag, statusOf } from './StateTag';

type Listed = Pick<CapabilityState, 'state' | 'lastAction'>;

/** Nothing on record. */
const NOT_INSTALLED: Listed = { state: 'not enabled', lastAction: null };

/** birch: enabled through the manager, its last action rolled out and verified. */
const INSTALLED: Listed = ENABLED.capabilities[0];

/** The comparison ran nothing: the manager read as itself, and the live checks need the person. */
const NOTHING_CHECKED: VerifyResult = {
  ...UP_TO_DATE,
  features: [
    {
      id: 'runtime',
      title: 'Runtime',
      mark: 'not checked',
      dimensions: [
        {
          id: 'kagent',
          mark: 'not checked',
          reason: 'read as the manager, not as you',
        },
        {
          id: 'postgres',
          mark: 'not checked',
          reason: 'read as the manager, not as you',
        },
        { id: 'dex-auth-request', mark: 'not checked', reason: SESSION_REASON },
      ],
    },
  ],
  summary: { 'not checked': 3 },
};

describe('statusOf', () => {
  it.each<[string, Listed, VerifyResult | undefined, string, string, string]>([
    [
      'not installed',
      NOT_INSTALLED,
      undefined,
      'Not installed',
      'not installed',
      'not installed: Not installed',
    ],
    [
      'not installed, the definition refused',
      NOT_INSTALLED,
      NOT_COMPARED,
      'Not installed · not compared',
      'not installed',
      `not installed: Not installed, not compared: ${NOT_COMPARED.refused}`,
    ],
    [
      'installed',
      INSTALLED,
      undefined,
      'Installed',
      'in sync',
      'in sync: Installed',
    ],
    [
      'installed, up to date',
      INSTALLED,
      UP_TO_DATE,
      'Installed · up to date',
      'in sync',
      'in sync: Installed',
    ],
    [
      'installed with differences',
      INSTALLED,
      VERIFIED,
      'Installed · 2 checks differ',
      'not in sync',
      'not in sync: Installed, with differences',
    ],
    [
      'installed, the definition refused',
      INSTALLED,
      NOT_COMPARED,
      'Installed · not compared',
      'in sync',
      `in sync: Installed, not compared: ${NOT_COMPARED.refused}`,
    ],
    [
      'installed, nothing checked',
      INSTALLED,
      NOTHING_CHECKED,
      'Installed · not compared',
      'in sync',
      `in sync: Installed, not compared: read as the manager, not as you; ${SESSION_REASON}`,
    ],
  ])(
    '%s: the words, the mark and its gloss',
    (_, listed, comparison, words, mark, gloss) => {
      expect(statusOf(listed, comparison)).toEqual({ words, mark, gloss });
    },
  );

  it('never reads Unknown where the comparison did not run: the mark is the listing’s', () => {
    for (const listed of [NOT_INSTALLED, INSTALLED]) {
      for (const comparison of [NOT_COMPARED, NOTHING_CHECKED]) {
        const status = statusOf(listed, comparison);
        expect(status.mark).toBe(markOf(listed));
        expect(status.gloss).not.toMatch(/unknown/i);
      }
    }
  });
});

describe('StateTag', () => {
  it('carries the gloss on the tooltip and the mark the Installations page shows in its cell', () => {
    render(
      <>
        <StateTag
          state="not enabled"
          status={statusOf(NOT_INSTALLED, NOT_COMPARED)}
          testId="header"
        />
        <StateIcon capability={NOT_INSTALLED} testId="cell" />
      </>,
    );
    const header = screen.getByTestId('header');
    expect(header).toHaveTextContent('Not installed · not compared');
    expect(header).toHaveAttribute('data-state', 'not enabled');
    expect(header).toHaveAttribute('data-mark', 'not installed');
    expect(header).toHaveAttribute(
      'title',
      `not installed: Not installed, not compared: ${NOT_COMPARED.refused}`,
    );
    // The same capability on the Installations page: the same mark.
    const cell = screen.getByTestId('cell');
    expect(cell).toHaveAttribute('data-mark', 'not installed');
    expect(cell).toHaveAccessibleName('Not installed');
  });

  it('glosses a mark with the legend’s line where the comparison ran or has not', () => {
    render(
      <>
        <StateTag state="not enabled" testId="listed" />
        <StateTag
          state="enabled"
          status={statusOf(INSTALLED, VERIFIED)}
          testId="compared"
        />
      </>,
    );
    expect(screen.getByTestId('listed')).toHaveAttribute(
      'title',
      'not installed: Not installed',
    );
    expect(screen.getByTestId('compared')).toHaveAttribute(
      'title',
      'not in sync: Installed, with differences',
    );
  });
});
