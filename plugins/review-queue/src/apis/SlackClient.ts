import {
  musterUnauthorizedInfoOf,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import {
  channelIdIn,
  channelNameOf,
  isChannelId,
  postOf,
  SLACK_TOOLS,
  slackToolName,
  type SlackPost,
  type SlackTool,
} from '../lib/slack';

/**
 * The person's muster session reaches no `slack` server: they have not given
 * muster their Slack grant, or declined the sign-in the send asked for.
 */
export class SlackNotConnectedError extends Error {
  readonly name = 'SlackNotConnectedError';
}

/**
 * Slack's tools on one installation's muster, as the signed-in person: the
 * message is posted under their own name with their own Slack grant.
 *
 * Every call here starts with the person's click, so it declares URL
 * elicitation: a person without a Slack grant is asked, in muster's consent
 * dialog, to connect Slack, and the call runs once they have.
 */
export class SlackClient {
  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
  ) {}

  private async call(
    tool: SlackTool,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      return await this.musterApi.callTool(
        slackToolName(tool),
        args,
        this.installation,
        { urlElicitation: true },
      );
    } catch (error) {
      if (musterUnauthorizedInfoOf(error)) {
        throw new SlackNotConnectedError(
          (error as Error).message ?? String(error),
          { cause: error },
        );
      }
      throw error;
    }
  }

  /**
   * The channel's ID: an ID as it is, a name looked up among the channels
   * the person can see. A name Slack's answer does not match is passed on as
   * it is, for Slack to take or refuse in its own words.
   */
  async resolveChannel(input: string): Promise<string> {
    const name = channelNameOf(input);
    if (isChannelId(name)) {
      return name;
    }
    const answer = await this.call(SLACK_TOOLS.searchChannels, {
      query: name,
      limit: 20,
    });
    return channelIdIn(answer, name) ?? name;
  }

  /** Posts the message as the person; where it landed, when Slack says. */
  async send(
    channel: string,
    message: string,
  ): Promise<{ post: SlackPost | undefined; channel: string }> {
    const channelId = await this.resolveChannel(channel);
    const answer = await this.call(SLACK_TOOLS.sendMessage, {
      channel_id: channelId,
      message,
    });
    return { post: postOf(answer), channel: channelId };
  }
}
