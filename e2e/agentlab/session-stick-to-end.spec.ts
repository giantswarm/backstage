import type { CDPSession, Page } from '@playwright/test';
import { expect, openReadyAgent, startSessionButton, test } from './fixtures';
import { lab } from './lab';

/**
 * Stick to the end while a turn streams: a session page at its end follows
 * the reply as it streams in, and a reader who scrolls up — wheel, keys, a
 * swipe on a phone — keeps their place however much more arrives, until they
 * scroll back down to the end.
 *
 * **The turn's stream is stubbed in the browser**, and nothing else: the
 * session is started on the lab's kagent through the portal's own path. Its
 * first message's stream (`…/messages/stream`) is answered by a reply that
 * keeps writing a paragraph every {@link CHUNK_MS} ms until the test stops it,
 * because a real model's reply is neither long nor slow enough on demand to
 * scroll the page while it streams. The stub is a `fetch` wrapper installed
 * before the app loads (the portal's fetch takes `window.fetch` at start), so
 * the reply arrives as a real stream the page reads chunk by chunk.
 */

test.describe.configure({ mode: 'serial' });

const prompt =
  'Write a very long essay about barbecues, one paragraph at a time.';

/** How often the stubbed reply writes another paragraph (ms). */
const CHUNK_MS = 150;

/** How near the end still counts as at it — `AT_END_THRESHOLD_PX`. */
const AT_END_PX = 48;

type Metrics = { top: number; height: number; distance: number };

function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return {
      top: Math.round(el.scrollTop),
      height: el.scrollHeight,
      distance: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight),
    };
  });
}

/**
 * Wraps `fetch` so the first `…/messages/stream` request is answered by a
 * reply that never ends until `window.__e2eStream.finish()`. Every other
 * request, and every later stream, goes through untouched.
 */
async function armEndlessReply(page: Page): Promise<void> {
  await page.addInitScript(
    ({ chunkMs }) => {
      const original = window.fetch.bind(window);
      let used = false;
      const w = window as unknown as {
        __e2eStream?: { chunks: number; finish: () => void };
      };
      window.fetch = (input, init) => {
        const url = new URL(
          typeof input === 'string' || input instanceof URL
            ? input.toString()
            : input.url,
          window.location.href,
        );
        if (used || !url.pathname.endsWith('/messages/stream')) {
          return original(input, init);
        }
        used = true;
        const sent = JSON.parse(String(init?.body ?? '{}')) as {
          messageId?: string;
          text?: string;
        };
        const taskId = 'e2e-stick-task';
        const encoder = new TextEncoder();
        const frame = (value: unknown) =>
          encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
        const text = (part: string, partial: boolean) => ({
          artifactUpdate: {
            taskId,
            contextId: 'e2e-stick-ctx',
            artifact: {
              artifactId: 'e2e-stick-reply',
              parts: [{ text: part }],
              metadata: { kagent_partial: partial },
            },
            ...(partial ? { append: true } : { lastChunk: true }),
          },
        });
        let timer: ReturnType<typeof setInterval> | undefined;
        let written = '';
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              frame({
                task: {
                  id: taskId,
                  contextId: 'e2e-stick-ctx',
                  status: { state: 'TASK_STATE_WORKING' },
                  history: [
                    {
                      messageId: sent.messageId,
                      role: 'ROLE_USER',
                      contextId: 'e2e-stick-ctx',
                      taskId,
                      parts: [{ text: sent.text ?? '' }],
                    },
                  ],
                },
              }),
            );
            const state = {
              chunks: 0,
              finish: () => {
                clearInterval(timer);
                controller.enqueue(frame(text(written, false)));
                controller.enqueue(
                  frame({
                    statusUpdate: {
                      taskId,
                      contextId: 'e2e-stick-ctx',
                      status: { state: 'TASK_STATE_COMPLETED' },
                    },
                  }),
                );
                controller.close();
              },
            };
            w.__e2eStream = state;
            timer = setInterval(() => {
              state.chunks += 1;
              const paragraph = `Paragraph ${state.chunks}. Charcoal wants patience: light it, wait for the white ash, and only then put anything on the grill.\n\n`;
              written += paragraph;
              controller.enqueue(frame(text(paragraph, true)));
            }, chunkMs);
          },
          cancel() {
            clearInterval(timer);
          },
        });
        return Promise.resolve(
          new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          }),
        );
      };
    },
    { chunkMs: CHUNK_MS },
  );
}

function streamedChunks(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __e2eStream?: { chunks: number } }).__e2eStream
        ?.chunks ?? 0,
  );
}

/** Waits for several more paragraphs to stream in. */
async function whileItStreams(page: Page): Promise<void> {
  const from = await streamedChunks(page);
  await expect
    .poll(() => streamedChunks(page), {
      message: 'more paragraphs stream in',
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(from + 8);
}

/**
 * Waits for a scroll the test started to come to rest — moved from `from`,
 * and still across two frames (a wheel's smooth scroll, a swipe's fling) —
 * and returns where it rests.
 */
async function settled(page: Page, from: Metrics): Promise<Metrics> {
  let rest = from;
  await expect
    .poll(
      async () => {
        const before = await metrics(page);
        await page.evaluate(
          () =>
            new Promise(resolve =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        rest = await metrics(page);
        return rest.top !== from.top && Math.abs(rest.top - before.top) <= 1;
      },
      { message: 'the scroll comes to rest', timeout: 30_000 },
    )
    .toBe(true);
  return rest;
}

/**
 * Expects the page to follow the end. A single read can land between a
 * streamed chunk's render and the frame that follows it — at 375px one
 * paragraph is more than {@link AT_END_PX} — so it is polled: a page that
 * follows is at the end at every frame, one that stopped following drifts
 * further from it with every chunk and never comes back.
 */
async function expectFollowsEnd(page: Page, message: string): Promise<void> {
  await expect
    .poll(async () => (await metrics(page)).distance, {
      message,
      timeout: 10_000,
    })
    .toBeLessThanOrEqual(AT_END_PX);
}

/** A swipe on the touch screen, `step` px per move (positive: finger down). */
async function swipe(
  cdp: CDPSession,
  x: number,
  y: number,
  step: number,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 15; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + i * step }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

/** Deletes the session on screen through its actions menu. */
async function deleteCurrentSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Session actions' }).click();
  await page.getByRole('menuitem', { name: /Delete session/ }).click();
  const dialog = page.getByRole('dialog', { name: /Delete session/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete session' }).click();
  await expect(page).toHaveURL(/\/sessions$/, { timeout: 60_000 });
}

test('a streaming reply is followed at the end and leaves a reader who scrolled up where they are', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(10 * 60_000);

  await armEndlessReply(admin);
  await openReadyAgent(admin, labAgent);
  await startSessionButton(admin).click();
  const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
  await expect(promptBox).toBeVisible();
  await promptBox.fill(prompt);
  await admin.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(admin).toHaveURL(
    new RegExp(`/sessions/${lab.installation}/[^/]+$`),
    { timeout: 60_000 },
  );

  let failure: unknown;
  let cdp: CDPSession | undefined;
  try {
    // --- The reply streams in, longer than the view: the page follows it ---
    await expect(
      admin.getByText(/Paragraph 1\./),
      'the stubbed reply streams onto the session page',
    ).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(
        async () => {
          const { height } = await metrics(admin);
          const view = admin.viewportSize()!.height;
          return height > view * 2;
        },
        { message: 'the reply grows past two views', timeout: 60_000 },
      )
      .toBe(true);
    await expectFollowsEnd(admin, 'at the end while the reply streams');

    // --- Scrolled up with the wheel, mid-stream: the place is kept ---------
    await admin.mouse.move(400, 400);
    let before = await metrics(admin);
    await admin.mouse.wheel(0, -600);
    const read = await settled(admin, before);
    await whileItStreams(admin);
    const later = await metrics(admin);
    expect(later.height, 'the reply went on growing').toBeGreaterThan(
      read.height,
    );
    expect(
      Math.abs(later.top - read.top),
      'the page stays where the reader scrolled to',
    ).toBeLessThanOrEqual(1);

    // --- End: back to the end, followed again --------------------------
    // The composer has the focus (the session was just started), where End
    // only moves the caret; the page takes the key once the focus is off it.
    await admin.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await admin.keyboard.press('End');
    await whileItStreams(admin);
    await expectFollowsEnd(
      admin,
      'End goes back to the end and follows the reply',
    );

    // A nudge of one line up, from the end, leaves the end just the same:
    // the old follow pulled back anything within 240px.
    before = await metrics(admin);
    await admin.mouse.wheel(0, -40);
    const nudged = await settled(admin, before);
    await whileItStreams(admin);
    expect(
      Math.abs((await metrics(admin)).top - nudged.top),
      'a small scroll up is not pulled back down',
    ).toBeLessThanOrEqual(1);

    // --- Back to the end: the page follows again ---------------------------
    before = await metrics(admin);
    await admin.mouse.wheel(0, 100_000);
    const back = await settled(admin, before);
    await whileItStreams(admin);
    expect((await metrics(admin)).height).toBeGreaterThan(back.height);
    await expectFollowsEnd(
      admin,
      'scrolled back to the end, the reply is followed again',
    );

    // --- A phone, by touch -------------------------------------------------
    await admin.setViewportSize({ width: 375, height: 812 });
    cdp = await admin.context().newCDPSession(admin);
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    await whileItStreams(admin);
    await expectFollowsEnd(admin, 'at 375px the page still follows the end');

    // Finger down the screen: the page scrolls up.
    before = await metrics(admin);
    await swipe(cdp, 180, 250, 20);
    const swiped = await settled(admin, before);
    await whileItStreams(admin);
    const afterSwipe = await metrics(admin);
    expect(afterSwipe.height).toBeGreaterThan(swiped.height);
    expect(
      Math.abs(afterSwipe.top - swiped.top),
      'a swipe up keeps its place while the reply streams',
    ).toBeLessThanOrEqual(1);

    // Swiped back down to the end: followed again.
    before = await metrics(admin);
    for (let i = 0; i < 8; i++) {
      await swipe(cdp, 180, 700, -40);
    }
    await settled(admin, before);
    await whileItStreams(admin);
    await expectFollowsEnd(
      admin,
      'swiped back to the end, the reply is followed again',
    );
  } catch (error) {
    failure = error;
  } finally {
    // Back to the desktop before cleaning up, whichever step failed.
    if (cdp) {
      await cdp
        .send('Emulation.setTouchEmulationEnabled', { enabled: false })
        .catch(() => {});
      await cdp.detach().catch(() => {});
    }
    await admin.setViewportSize({ width: 1440, height: 900 });
  }

  // --- Clean up: end the stubbed reply, delete the session -----------------
  // A failed cleanup is reported, but never in place of the test's own
  // failure.
  try {
    await admin.evaluate(() =>
      (
        window as unknown as { __e2eStream?: { finish: () => void } }
      ).__e2eStream?.finish(),
    );
    await deleteCurrentSession(admin);
  } catch (cleanup) {
    if (!failure) {
      throw cleanup;
    }
    // eslint-disable-next-line no-console
    console.warn(`agentlab e2e: cleanup failed after a failure: ${cleanup}`);
  }
  if (failure) {
    throw failure;
  }
});
