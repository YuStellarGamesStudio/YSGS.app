import { expect, test } from '@playwright/test';

const games = [
  {
    id: 'orbit', status: 'published', defaultLocale: 'en',
    url: 'https://games.example.test/orbit',
    launchUrls: { 'zh-TW': 'https://games.example.test/orbit/zh', ja: 'https://games.example.test/orbit/ja' },
    categories: ['action'], tags: ['space'],
    locales: {
      en: { name: 'Orbit', description: '<img src=x onerror="window.catalogInjected=true">' },
      'zh-TW': { name: '軌道', description: '探索星際軌道' },
      ja: { name: '軌道探検', description: '宇宙を探検する' },
    },
  },
  {
    id: 'puzzle', status: 'published', defaultLocale: 'en',
    url: 'https://games.example.test/puzzle', categories: ['puzzle'], tags: [],
    locales: { en: { name: 'Puzzle', description: 'Solve the puzzle' } },
  },
  {
    id: 'draft', status: 'draft', url: 'https://games.example.test/draft',
    locales: { en: { name: 'Draft', description: 'Not published' } },
  },
  {
    id: 'unsafe', status: 'published', url: 'javascript:alert(1)',
    locales: { en: { name: 'Unsafe', description: 'Disallowed URL' } },
  },
];
const categories = {
  action: { en: 'Action', 'zh-TW': '動作', ja: 'アクション' },
  puzzle: { en: 'Puzzle', 'zh-TW': '解謎', ja: 'パズル' },
};
let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // Keep external catalog inputs deterministic; use the real parser and UI.
  await page.route('https://data.ysgs.app/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/allgames.json'
      ? { games: games.map(({ id }) => ({ id, path: `games/${id}.json` })) }
      : path === '/categories.json'
        ? categories
        : games.find(({ id }) => path === `/games/${id}.json`);
    if (!json) throw new Error(`Unexpected catalog request: ${path}`);
    await route.fulfill({ json });
  });
  await page.route('https://games.example.test/**', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Test game</title><h1>Game loaded</h1>',
  }));
});

test.afterEach(() => {
  expect(errors, 'Uncaught exceptions and browser console errors').toEqual([]);
});

test('language, theme and navigation preserve the document and stored preferences', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(2);
  const documentId = await page.evaluate(() => {
    const id = crypto.randomUUID();
    Object.assign(window, { documentId: id });
    return id;
  });
  const languageTags: Record<string, string> = { 'zh-TW': 'zh-Hant-TW', ja: 'ja', en: 'en' };
  const orbitNames: Record<string, string> = { 'zh-TW': '軌道', ja: '軌道探検', en: 'Orbit' };
  for (const locale of ['zh-TW', 'ja', 'en']) {
    await page.locator(`[data-locale="${locale}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', languageTags[locale]!);
    await expect(page.locator(`.card-title a[href="/?view=games&id=orbit"]`)).toHaveText(orbitNames[locale]!);
    expect(await page.evaluate(() => localStorage.getItem('ysgs-locale'))).toBe(locale);
  }
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  const nextTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
  await page.locator('.site-nav a[href="/?view=data"]').click();
  await expect(page.locator('#main')).toHaveAttribute('data-view', 'data');
  await expect(page.locator('.dictionary-scroll tbody tr')).toHaveCount(2);
  await page.goBack();
  await expect(page.locator('#main')).toHaveAttribute('data-view', 'home');
  expect(await page.evaluate(() => Reflect.get(window, 'documentId'))).toBe(documentId);
  await page.locator('[data-locale="ja"]').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('.card-title a[href="/?view=games&id=orbit"]')).toHaveText('軌道探検');
});

test('catalog filters unpublished and unsafe games, treats text literally, and searches across languages', async ({ page }) => {
  await page.goto('/?view=games');
  await expect(page.locator('.card-title')).toHaveText(['Orbit', 'Puzzle']);
  await expect(page.locator('.card-desc').first()).toHaveText(games[0]!.locales.en.description);
  await expect(page.locator('.card-desc img')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'catalogInjected'))).toBeUndefined();
  await page.getByRole('searchbox').fill('軌道');
  await expect(page.locator('.card-title')).toHaveText(['Orbit']);
  await page.getByRole('searchbox').fill('');
  await page.locator('[data-genre="puzzle"]').click();
  await expect(page).toHaveURL(/genre=puzzle$/);
  await expect(page.locator('.card-title')).toHaveText(['Puzzle']);
  await page.getByRole('searchbox').fill('no-matching-game');
  await expect(page.locator('.game-card')).toHaveCount(0);
  await expect(page.locator('.empty')).toBeVisible();
});

test('localized player pauses music and requires confirmation before exiting', async ({ page }) => {
  await page.goto('/?view=games&id=orbit');
  await page.locator('[data-locale="zh-TW"]').click();
  await expect(page.locator('h1')).toHaveText('軌道');
  await expect(page.locator('.music-toggle')).toHaveAttribute('data-state', 'playing');
  await page.locator('.hero-actions a[href="/?play=orbit"]').click();
  await expect(page.locator('.player-frame')).toHaveAttribute('src', games[0]!.launchUrls!['zh-TW']);
  await expect(page.frameLocator('.player-frame').getByRole('heading')).toHaveText('Game loaded');
  await expect(page.locator('.music-toggle')).toHaveAttribute('data-state', 'blocked');
  await page.locator('.player-exit').click();
  await expect(page.locator('.exit-dialog')).toBeVisible();
  await page.locator('.exit-dialog button').click();
  await expect(page.locator('.exit-dialog')).not.toBeVisible();
  await expect(page).toHaveURL(/\?play=orbit$/);
  await page.locator('.player-exit').click();
  await page.locator('.exit-dialog a').click();
  await expect(page).toHaveURL(/\?view=games&id=orbit$/);
  await expect(page.locator('h1')).toHaveText('軌道');
  await expect(page.locator('.music-toggle')).toHaveAttribute('data-state', 'playing');
  await page.locator('.music-toggle').click();
  await expect(page.locator('.music-toggle')).toHaveAttribute('data-state', 'paused');
  await page.locator('.music-toggle').click();
  await expect(page.locator('.music-toggle')).toHaveAttribute('data-state', 'playing');
});

test('missing games are not indexed and offer valid navigation and stable recommendations', async ({ page }) => {
  await page.goto('/?view=games&id=missing');
  await expect(page.locator('.missing-panel')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('.game-card')).toHaveCount(2);
  const links = await page.locator('.card-title a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
  expect(new Set(links)).toEqual(new Set(['/?view=games&id=orbit', '/?view=games&id=puzzle']));
  await page.locator('[data-locale="ja"]').click();
  expect(await page.locator('.card-title a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))).toEqual(links);
  await page.locator('.missing-panel a[href="/"]').click();
  await expect(page.locator('#main')).toHaveAttribute('data-view', 'home');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});
