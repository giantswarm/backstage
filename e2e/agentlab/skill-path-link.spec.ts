import { expect, open, test } from './fixtures';

/**
 * A skill page's Path opens the SKILL.md on GitHub at the commit the page
 * shows under Latest commit, in a new tab, and says so as every link out of
 * the portal does: the launch icon and "(opens in a new tab)". The test opens
 * the lab catalog's github.com skills until one has a known latest commit,
 * and changes nothing. It skips on a lab whose catalog holds no github.com
 * skill with a known commit; a Skills page that does not load fails it.
 */

/** A skill page on github.com: `<skills>/<owner>/<repo>[/<dir>]`, not edit. */
const GITHUB_SKILL_PAGE =
  /^\/customize\/skills\/(?!-\/|edit\/)[^/?#]+\/[^/?#]+/;

/** How many skill pages to try before giving up on a known commit. */
const MAX_CANDIDATES = 5;

const COMMIT_LINK = /^[0-9a-f]{7,} \(opens in a new tab\)$/;

test('a skill page links its Path to the SKILL.md at the latest commit', async ({
  admin,
}) => {
  await open(admin, '/customize/skills');
  const main = admin.getByRole('main');
  const list = main.getByRole('list', { name: 'Skills' });
  const empty = main.getByText(/^(No skill repositories|No skills yet)$/);
  const failed = main.getByText('Could not read the skill repositories');
  // The page settles on the list, an empty state or an error; a page that
  // settles on none fails here rather than skipping.
  await expect(list.or(empty).or(failed).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed, 'the Skills page reads its repositories').toBeHidden();
  test.skip(await empty.isVisible(), 'the lab catalog holds no skills');

  const hrefs = await list
    .locator('a[href^="/customize/skills/"]')
    .evaluateAll(links => links.map(link => link.getAttribute('href') ?? ''));
  const candidates = hrefs
    .filter(href => GITHUB_SKILL_PAGE.test(href))
    .slice(0, MAX_CANDIDATES);
  test.skip(
    candidates.length === 0,
    'the lab catalog holds no github.com skill',
  );

  for (const skillPage of candidates) {
    await open(admin, skillPage);
    const facts = admin.getByRole('region', { name: 'Where it lives' });
    await expect(facts).toBeVisible();
    const commit = facts.getByRole('link', { name: COMMIT_LINK });
    if ((await commit.count()) === 0) {
      // A commit the catalog does not know yet: no tree, and no Path link.
      await expect(facts.getByRole('link', { name: /SKILL\.md/ })).toHaveCount(
        0,
      );
      continue;
    }

    const sha = (await commit.getAttribute('href'))?.match(
      /\/tree\/([0-9a-f]{40})(\/|$)/,
    )?.[1];
    expect(sha, 'the latest commit opens the tree at a full SHA').toBeTruthy();

    const path = facts.getByRole('link', {
      name: /SKILL\.md \(opens in a new tab\)$/,
    });
    await expect(path).toHaveAttribute(
      'href',
      new RegExp(
        `^https://github\\.com/[^/]+/[^/]+/blob/${sha}/(.+/)?SKILL\\.md$`,
      ),
    );
    await expect(path).toHaveAttribute('target', '_blank');
    await expect(path).toHaveAttribute('rel', 'noopener noreferrer');
    // The launch icon, not a text arrow.
    await expect(path.locator('svg')).toBeVisible();
    await expect(path).not.toContainText('↗');
    await test.info().attach('the Path and Latest commit facts', {
      body: await facts.screenshot(),
      contentType: 'image/png',
    });
    return;
  }
  test.skip(
    true,
    `none of the first ${candidates.length} github.com skills has a known latest commit`,
  );
});
