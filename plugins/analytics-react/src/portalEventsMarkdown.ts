import { portalEvents, type PortalEventSpec } from './events';

/**
 * The event list as the Markdown table `docs/telemetry.md` carries between its
 * `portal-events` markers; a test keeps the two equal.
 */
export function portalEventsMarkdown(): string {
  const rows = Object.entries(portalEvents as Record<string, PortalEventSpec>)
    .map(([name, { description, attributes }]) => {
      const values = Object.entries(attributes)
        .map(
          ([key, allowed]) =>
            `\`${key}\`: ${allowed.map(v => `\`${v}\``).join(', ')}`,
        )
        .join('; ');
      return `| \`${name}\` | ${description} | ${values} |`;
    })
    .join('\n');
  return [
    '| Event | When | Attributes and their only possible values |',
    '| --- | --- | --- |',
    rows,
  ].join('\n');
}
