/**
 * Where an ask or notice goes, as a person reads it: `#<name> (<team>)` from
 * the channel's name, the channel ID when the manager sent no name, the team
 * alone without a channel.
 */
export function messageTarget(message: {
  team: string;
  channel?: string;
  channelName?: string;
}): string {
  const channel = message.channelName
    ? `#${message.channelName}`
    : message.channel;
  return channel ? `${channel} (${message.team})` : message.team;
}
