import {
  MUSTER_INPUT_REQUIRED_STATUS,
  type MusterElicitationAction,
  type MusterInputAnswer,
  type MusterUrlElicitation,
  musterServerOfTool,
} from '@giantswarm/backstage-plugin-gs-common';
import type { ExternalUrlConsentApi } from '@giantswarm/backstage-plugin-ui-react';

/**
 * muster answered a tool call with URL elicitations (MCP 2026-07-28
 * `input_required`): the tool has not run. {@link MusterApiClient} puts them
 * to the person and sends the call again; this reaches a caller only when it
 * could not (no consent dialog in the app, or muster kept asking).
 */
export class MusterInputRequiredError extends Error {
  override readonly name = 'MusterInputRequiredError';
  readonly status = MUSTER_INPUT_REQUIRED_STATUS;

  constructor(
    message: string,
    readonly elicitations: MusterUrlElicitation[],
    readonly requestState: string | undefined,
  ) {
    super(message);
  }
}

/**
 * How long the person's answer to a page stands for the same page: muster
 * keeps a pending sign-in's link for minutes, and a page that polls a tool
 * would otherwise put the same page to the person on every poll. A new link
 * is asked about again.
 */
export const ELICITATION_ANSWER_REUSE_MS = 2 * 60_000;

/**
 * Puts the URL elicitations of a call to the person through the portal's
 * consent dialog, one after another, and answers each with the person's
 * choice (`accept` opens the page). An answer stands for its page, asked by
 * the same server, for {@link ELICITATION_ANSWER_REUSE_MS}: the page is not
 * opened again, and neither is the dialog. Another server asking for the same
 * page is asked about: the person answered the server the dialog named.
 */
export class UrlElicitationAnswers {
  private readonly answers = new Map<
    string,
    { action: MusterElicitationAction; until: number }
  >();

  constructor(
    private readonly consentApi: ExternalUrlConsentApi,
    private readonly now: () => number = Date.now,
  ) {}

  /** The retry's answer to the elicitations of a call of `tool`. */
  async answer(
    tool: string,
    elicitations: MusterUrlElicitation[],
    requestState: string | undefined,
  ): Promise<MusterInputAnswer> {
    const inputResponses: MusterInputAnswer['inputResponses'] = {};
    for (const elicitation of elicitations) {
      inputResponses[elicitation.key] = {
        action: await this.actionFor(tool, elicitation),
      };
    }
    return {
      inputResponses,
      ...(requestState !== undefined ? { requestState } : {}),
    };
  }

  private async actionFor(
    tool: string,
    elicitation: MusterUrlElicitation,
  ): Promise<MusterElicitationAction> {
    const requester = musterServerOfTool(tool) ?? 'muster';
    const key = JSON.stringify([requester, elicitation.url]);
    const kept = this.answers.get(key);
    if (kept && kept.until > this.now()) {
      return kept.action;
    }
    const action = await this.consentApi.open({
      url: elicitation.url,
      requester,
      message: elicitation.message,
    });
    this.answers.set(key, {
      action,
      until: this.now() + ELICITATION_ANSWER_REUSE_MS,
    });
    return action;
  }
}
