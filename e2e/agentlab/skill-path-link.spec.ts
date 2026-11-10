import { expect, open, test } from './fixtures';

/**
 * A skill page's Path opens the SKILL.md on GitHub at the commit the page
 * shows under Latest commit, in a new tab, and says so as every link out of
 * the portal does: the launch icon and "(opens in a new tab)". The test opens
 * the first github.com skill of the lab's catalog, whichever that is, and
 * changes nothing. Skips on a lab whose catalog holds no github.com skill.
 */

/** A skill page on github.com: `<skills>/<owner>/<repo>[/<dir>]`, not edit. */
const GITHUB_SKILL_PAGE =
  /^\/customize\/skills\/(?!-\/|edit\/)[^/?#]+\/[^/?#]+/;

test('a skill page links its Path to the SKILL.md at the latest commit', async ({
  admin,
}) => {
  await open(admin, '/customize/skills');
  const cards = admin
    .getByRole('main')
    .locator('a[href^="/customize/skills/"]');
  await cards
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined);
  const hrefs = await cards.evaluateAll(links =>
    links.map(link => link.getAttribute('href') ?? ''),
  );
  const skillPage = hrefs.find(href => GITHUB_SKILL_PAGE.test(href));
  test.skip(!skillPage, 'the lab catalog holds no github.com skill');

  await open(admin, skillPage!);
  const facts = admin.getByRole('region', { name: 'Where it lives' });
  const commit = facts.getByRole('link', {
    name: /^[0-9a-f]{7,} \(opens in a new tab\)$/,
  });
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
});
