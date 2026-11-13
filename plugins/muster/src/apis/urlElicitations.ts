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
 * `input_required`): the tool has not run. For a call that declares URL
 * elicitation {@link MusterApiClient} puts them to the person and sends the
 * call again; this reaches a caller only when it could not (no consent dialog
 * in the app, or muster kept asking).
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
 * Puts the URL elicitations of one person's action -- a call they started
 * with a click, and its retries -- to them through the portal's consent
 * dialog, one after another, and answers each with their choice (`accept`
 * opens the page). A page is put to them once per action: when muster asks
 * for it again (a sign-in they accepted and did not finish), it is answered
 * `cancel` without a dialog, and the call ends in muster's answer to that
 * until they act again. Concurrent actions asking for the same page share
 * one dialog ({@link ExternalUrlConsentApi.open}).
 */
export class UrlElicitationAnswers {
  private readonly asked = new Set<string>();

  constructor(private readonly consentApi: ExternalUrlConsentApi) {}

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
    if (this.asked.has(key)) {
      return 'cancel';
    }
    this.asked.add(key);
    return this.consentApi.open({
      url: elicitation.url,
      requester,
      message: elicitation.message,
    });
  }
}
