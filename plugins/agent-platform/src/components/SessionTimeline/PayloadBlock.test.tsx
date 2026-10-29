import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { normalizeTaskList } from '@giantswarm/backstage-plugin-agent-platform-common';
import { tasksV099 } from '@giantswarm/backstage-plugin-agent-platform-common/testFixtures';
import { buildTimeline } from '../../lib/kagentTimeline';
import { PayloadBlock } from './PayloadBlock';
import { SessionTimeline } from './SessionTimeline';

const injectedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent ?? '')
    .join('\n');

/** The declarations under the phone query for the first class matching `name`. */
function phoneRule(name: RegExp): string | undefined {
  return new RegExp(
    `@media \\(max-width: 599\\.95px\\) \\{\\s*\\.[\\w-]*${name.source}[\\w-]* \\{([^}]*)\\}`,
  ).exec(injectedCss())?.[1];
}

// jsdom applies no media queries; the injected rule is what can be pinned
// (T22 C3). The geometry — a swipe beside the box moves the conversation —
// is a real-browser check.
describe('the timeline’s inner scrollers on a phone', () => {
  it('caps a payload at two fifths of the view', async () => {
    await renderInTestApp(
      <PayloadBlock label="Result" content='{"ok":true}' />,
    );

    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(phoneRule(/scroll/)).toMatch(/max-height: min\(400px, 40dvh\);/);
  });

  it('caps the reasoning fold-out the same way', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={buildTimeline(normalizeTaskList(tasksV099).tasks)}
        agentName="Issue tracker"
        isAgentWorking={false}
      />,
    );

    expect(phoneRule(/reasoningBody/)).toMatch(
      /max-height: min\(320px, 40dvh\);/,
    );
  });
});
