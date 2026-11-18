import type { CDPSession, Page } from '@playwright/test';
import { expect, openReadyAgent, startSessionButton, test } from './fixtures';
import { lab } from './lab';

/**
 * The reading position is the reader's while a turn streams: the session
 * page never scrolls for the agent's content — not at the end either — and
 * "Jump to bottom" appears above the composer once content lands below the
 * view. Reaching the end, by scrolling or with the button, takes it away.
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

const JUMP = { name: 'Jump to bottom', exact: true } as const;

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
        __e2eStream?: {
          chunks: number;
          finish: () => void;
          pause: () => void;
          resume: () => void;
        };
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
              pause: () => {},
              resume: () => {},
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
            const write = () => {
              state.chunks += 1;
              const paragraph = `Paragraph ${state.chunks}. Charcoal wants patience: light it, wait for the white ash, and only then put anything on the grill.\n\n`;
              written += paragraph;
              controller.enqueue(frame(text(paragraph, true)));
            };
            timer = setInterval(write, chunkMs);
            state.pause = () => clearInterval(timer);
            state.resume = () => {
              clearInterval(timer);
              timer = setInterval(write, chunkMs);
            };
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
 * Expects the page to stay exactly where it is while more of the reply
 * streams in, and returns where that is.
 */
async function expectKeepsPlace(page: Page, message: string): Promise<Metrics> {
  const from = await metrics(page);
  await whileItStreams(page);
  const later = await metrics(page);
  expect(later.height, 'the reply went on growing').toBeGreaterThan(
    from.height,
  );
  expect(Math.abs(later.top - from.top), message).toBeLessThanOrEqual(1);
  return later;
}

function pauseReply(page: Page): Promise<void> {
  return page.evaluate(() =>
    (
      window as unknown as { __e2eStream?: { pause: () => void } }
    ).__e2eStream?.pause(),
  );
}

function resumeReply(page: Page): Promise<void> {
  return page.evaluate(() =>
    (
      window as unknown as { __e2eStream?: { resume: () => void } }
    ).__e2eStream?.resume(),
  );
}

/** Expects the page to come to rest at its very bottom. */
async function expectAtBottom(page: Page, message: string): Promise<void> {
  await expect
    .poll(async () => (await metrics(page)).distance, {
      message,
      timeout: 10_000,
    })
    .toBeLessThanOrEqual(1);
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

test('a streaming reply never moves the page and offers Jump to bottom instead', async ({
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

  const jump = admin.getByRole('button', JUMP);
  let failure: unknown;
  let cdp: CDPSession | undefined;
  try {
    // --- The reply streams in, longer than the view: the page stays put ----
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
    await expect(
      jump,
      'content below the view offers the way down',
    ).toBeVisible();
    await expectKeepsPlace(admin, 'the page does not follow the stream');

    // --- At the very end, by the reader's own scroll: the cue goes, and the
    // page still does not follow ----------------------------------------------
    await admin.mouse.move(400, 400);
    await pauseReply(admin);
    let before = await metrics(admin);
    await admin.mouse.wheel(0, 100_000);
    await settled(admin, before);
    await expect(jump, 'reaching the end takes the cue away').toBeHidden();
    await resumeReply(admin);
    await expectKeepsPlace(admin, 'at the very end the page waits too');
    await expect(jump).toBeVisible();

    // --- Scrolled up with the wheel, mid-stream: the place is kept ---------
    before = await metrics(admin);
    await admin.mouse.wheel(0, -600);
    await settled(admin, before);
    await expectKeepsPlace(
      admin,
      'the page stays where the reader scrolled to',
    );
    await expect(jump).toBeVisible();

    // --- Jump to bottom: at the very bottom, the cue gone ------------------
    await pauseReply(admin);
    await jump.click();
    await expectAtBottom(admin, 'Jump to bottom goes to the very bottom');
    await expect(jump).toBeHidden();
    await resumeReply(admin);
    await expect(jump, 'what streams in next is new again').toBeVisible();

    // --- A phone, by touch -------------------------------------------------
    await admin.setViewportSize({ width: 375, height: 812 });
    cdp = await admin.context().newCDPSession(admin);
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    await expectKeepsPlace(admin, 'at 375px the page stays put too');

    // Finger down the screen: the page scrolls up, and keeps its place.
    before = await metrics(admin);
    await swipe(cdp, 180, 250, 20);
    await settled(admin, before);
    await expectKeepsPlace(
      admin,
      'a swipe up keeps its place while the reply streams',
    );

    // The button sits above the composer, not on it.
    const box = await jump.boundingBox();
    const dock = await admin.getByTestId('session-dock').boundingBox();
    expect(box && dock && box.y + box.height <= dock.y).toBe(true);

    await pauseReply(admin);
    await jump.tap();
    await expectAtBottom(admin, 'tapped, Jump to bottom goes to the bottom');
    await expect(jump).toBeHidden();
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
