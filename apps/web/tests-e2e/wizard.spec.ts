import { expect, type Page, test } from '@playwright/test';

/**
 * Authenticated flows for the create-match wizard (`/matches/new`). Uses the storageState the
 * `setup` project writes for a fresh, zero-team user — see `tests-e2e/setup/auth.setup.ts`.
 *
 * The wizard is a chain of client-only state transitions (query bootstrap → form step → mutation
 * → refetch → next step) on a dev server that can take many seconds to compile a route on first
 * hit. Every step below is therefore a "click, then confirm the expected result — retrying the
 * click if it doesn't land" unit rather than a bare click, so a slow render window can't strand
 * the test mid-step.
 */
async function clickUntil(page: Page, buttonName: string, confirm: () => Promise<void>) {
  await expect(async () => {
    await page.getByRole('button', { name: buttonName, exact: true }).click({ timeout: 2_000 });
    await confirm();
  }).toPass({ timeout: 20_000 });
}

/**
 * `useTeams()` is `enabled: !!orgId`, and `orgId` only resolves once `/api/me` returns — so the
 * very first paint of `/matches/new` renders the "zero teams" fallback (`!teams` is true because
 * the query hasn't started, not because it resolved empty), then remounts once org bootstrap
 * completes and the newly-enabled teams query resolves. Drive the identity step (name → "Next:
 * squad") as a retried unit so that remount just means trying the whole thing again against the
 * settled form, instead of a permanently-disabled "Next: squad" button.
 */
async function completeIdentityStep(page: Page, teamName: string) {
  await expect(async () => {
    await page.getByPlaceholder('Team name…').fill(teamName);
    await page.getByRole('button', { name: 'Next: squad' }).click({ timeout: 2_000 });
    await expect(page.getByRole('button', { name: 'Create team' })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
}

test('fresh user completes the create-match wizard end to end', async ({ page }) => {
  // Zero teams: the wizard embeds team registration instead of empty pickers. The very first
  // paint of this branch is the "query hasn't started yet" fallback rather than the real
  // "confirmed zero teams" one (see `completeIdentityStep`'s doc comment) — `isLoading` then
  // flips true for one render once the now-enabled teams query actually starts fetching, which
  // unmounts the embedded form and drops any in-progress input. That only happens once, on this
  // very first fetch, so wait for its response to land before driving the form at all — a fixed
  // sleep here is a guess about compile/bootstrap latency that this dev server can blow past.
  const firstTeamsFetch = page.waitForResponse(
    (res) => res.request().method() === 'GET' && res.url().includes('/api/teams'),
    { timeout: 30_000 },
  );
  await page.goto('/matches/new');
  await firstTeamsFetch;

  await expect(page.getByText('Create your first team')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByPlaceholder('Team name…')).toBeVisible();

  await completeIdentityStep(page, 'E2E Home FC');
  await clickUntil(page, 'Create team', () =>
    expect(page.getByText('Create your second team')).toBeVisible({ timeout: 5_000 }),
  );

  // One team: the same embedded form instance reappears, now prompting for the second team.
  // Its internal step state isn't reset by a successful submit, so it reappears mid-"squad" step
  // (no name field) rather than back at "identity" — go back a step before typing.
  await clickUntil(page, 'Back', () =>
    expect(page.getByPlaceholder('Team name…')).toBeVisible({ timeout: 5_000 }),
  );
  await completeIdentityStep(page, 'E2E Away FC');

  const homeSection = page
    .getByText('Home', { exact: true })
    .locator('xpath=following-sibling::*[1]');
  const awaySection = page
    .getByText('Away', { exact: true })
    .locator('xpath=following-sibling::*[1]');

  // Two teams: pickers replace the registration form.
  await clickUntil(page, 'Create team', () =>
    expect(homeSection.getByRole('button', { name: 'E2E Home FC' })).toBeVisible({
      timeout: 5_000,
    }),
  );

  await homeSection.getByRole('button', { name: 'E2E Home FC' }).click();
  await awaySection.getByRole('button', { name: 'E2E Away FC' }).click();

  await clickUntil(page, 'Next: Lineups', () =>
    expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible({
      timeout: 5_000,
    }),
  );

  // Lineups step — empty rosters are fine, proceed without picking anyone.
  await clickUntil(page, 'Next', () =>
    expect(page.getByText('Stat detail')).toBeVisible({ timeout: 5_000 }),
  );

  // Tier step — default (Basic) tier, start immediately. Match creation is a mutation
  // followed by a client-side route change to a page the dev server may still need to
  // compile for the first time, so this isn't a "click, retry until it lands" unit like
  // the earlier steps — a slow-but-successful navigation racing a short waitForURL would
  // make a retried click find nothing (the button, and the whole step, is gone once we've
  // navigated away), not recover. Click once and give the navigation itself room to be slow.
  await page.getByRole('button', { name: 'Start match now' }).click();
  await page.waitForURL(/\/matches\/[^/]+\/live$/, { timeout: 30_000 });

  // The live scoreboard renders each team's name in more than one place (scoreboard + team
  // panel header), so scope to "present at least once" rather than a single unique match.
  await expect(page.getByText('E2E Home FC').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('E2E Away FC').first()).toBeVisible();
});

test('a failed teams fetch shows a retry state, not the registration form', async ({ page }) => {
  await page.route('**/api/teams', (route) => route.abort());

  await page.goto('/matches/new');

  await expect(page.getByText("Couldn't load your teams")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByPlaceholder('Team name…')).not.toBeVisible();

  await page.unroute('**/api/teams');
  await page.getByRole('button', { name: 'Retry' }).click();

  // Recovery: either the registration form (a zero/one-team account) or the team pickers (an
  // account that already has 2+ teams) — either proves the query recovered from the abort.
  await expect(
    page.getByPlaceholder('Team name…').or(page.getByText('Home', { exact: true })),
  ).toBeVisible({ timeout: 15_000 });
});
