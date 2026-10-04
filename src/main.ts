import './style.css';
import { gameText, loadCatalog, type Catalog, type Game } from './catalog';
import { defaultLocale, isLocale, localeMeta, locales, messages, type Locale, type Messages } from './i18n';
import { MusicController } from './music';
import type { Stage, StageState } from './stage';

type Theme = 'dark' | 'light';
type Route = { view: 'home' } | { view: 'games'; genre: string | null } | { view: 'game'; id: string } | { view: 'play'; id: string } | { view: 'data' } | { view: 'privacy' } | { view: 'terms' } | { view: 'missing' };

const LOCALE_KEY = 'ysgs-locale';
const THEME_KEY = 'ysgs-theme';
const MUSIC_ENABLED_KEY = 'ysgs-music-enabled';
const MUSIC_VOLUME_KEY = 'ysgs-music-volume';
const CATALOG_BASE = new URL(import.meta.env.VITE_CATALOG_BASE_URL ?? 'https://data.ysgs.app/');
const SOURCE_URL = 'https://github.com/YuStellarGamesStudio/YSGS.app';
const DATA_REPO_URL = 'https://github.com/YuStellarGamesStudio/GameCatalog';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing may block storage; the choice still applies to this visit.
  }
}

const storedLocale = readStorage(LOCALE_KEY);
const storedMusicVolume = readStorage(MUSIC_VOLUME_KEY);
const parsedMusicVolume = storedMusicVolume?.trim() ? Number(storedMusicVolume) : NaN;
// Snap legacy stored values to the slider's 5% step so playback matches the slider.
const musicVolume = Number.isFinite(parsedMusicVolume) && parsedMusicVolume >= 0 && parsedMusicVolume <= 1 ? Math.round(parsedMusicVolume * 20) / 20 : 0.05;
const state = {
  locale: isLocale(storedLocale) ? storedLocale : defaultLocale,
  theme: (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark') as Theme,
  catalog: null as Catalog | null,
  error: false,
  loading: null as AbortController | null,
  query: '',
  genre: '',
  dictionaryQuery: '',
};

let t: Messages = messages[state.locale];

// ---------- DOM helpers ----------

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === 'class') element.className = String(value);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) element.append(child);
  }
  return element;
}

const ICONS = {
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M7 4.5v15l12-7.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  retry: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  logo: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="logo-hex" d="M24 3 42 13.5v21L24 45 6 34.5v-21Z"/><path class="logo-star" d="m24 13 2.9 8.1L35 24l-8.1 2.9L24 35l-2.9-8.1L13 24l8.1-2.9Z"/></svg>',
} as const;

// Icon markup comes only from the static ICONS table above, never from catalog data.
function icon(name: keyof typeof ICONS, className = 'icon'): HTMLSpanElement {
  const span = h('span', { class: className });
  span.innerHTML = ICONS[name];
  return span;
}

function externalLink(href: string, className: string, ...children: Child[]): HTMLAnchorElement {
  return h('a', { href, class: className, target: '_blank', rel: 'noopener noreferrer' }, ...children, h('span', { class: 'visually-hidden' }, ` ${t.opensNewTab}`));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(localeMeta[state.locale].htmlLang).format(value);
}

function categoryName(key: string): string {
  return state.catalog?.categories.get(key)?.[state.locale] ?? key;
}

// ---------- Routing ----------

// Routes live in the query string so every view is a real, server-resolvable URL
// (GitHub Pages serves index.html for any query on the root):
// `/`, `?view=games`, `?view=games&genre=<category>`, `?view=games&id=<id>`, `?view=data`, `?view=privacy`, `?view=terms`, `?play=<id>`.
const BASE = import.meta.env.BASE_URL;
const HREF = { home: BASE, games: `${BASE}?view=games`, data: `${BASE}?view=data`, privacy: `${BASE}?view=privacy`, terms: `${BASE}?view=terms` } as const;

function gameHref(id: string): string {
  return `${HREF.games}&id=${encodeURIComponent(id)}`;
}

function genreHref(key: string): string {
  return key ? `${HREF.games}&genre=${encodeURIComponent(key)}` : HREF.games;
}

function playHref(id: string): string {
  return `${BASE}?play=${encodeURIComponent(id)}`;
}

function parseRoute(): Route {
  const params = new URLSearchParams(location.search);
  const play = params.get('play');
  if (play) return { view: 'play', id: play };
  const view = params.get('view');
  const id = params.get('id');
  if (view === null) return id === null ? { view: 'home' } : { view: 'missing' };
  if (view === 'games') return id ? { view: 'game', id } : { view: 'games', genre: params.get('genre') };
  if (view === 'data' && id === null) return { view: 'data' };
  if (view === 'privacy' && id === null) return { view: 'privacy' };
  if (view === 'terms' && id === null) return { view: 'terms' };
  return { view: 'missing' };
}

// ---------- App shell ----------

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

const skipLink = h('a', { class: 'skip-link', href: '#main' });
const brandName = h('span', { class: 'brand-name' });
const brand = h('a', { class: 'brand', href: HREF.home }, icon('logo', 'brand-logo'), h('span', { class: 'brand-text' }, brandName, h('span', { class: 'brand-sub' }, 'YuStellarGamesStudio')));
const navLinks = {
  home: h('a', { href: HREF.home }),
  games: h('a', { href: HREF.games }),
  data: h('a', { href: HREF.data }),
};
const nav = h('nav', { class: 'site-nav' }, navLinks.home, navLinks.games, navLinks.data);
const languageButtons = locales.map((locale) =>
  h('button', { type: 'button', class: 'lang-option', lang: localeMeta[locale].htmlLang, 'data-locale': locale, title: localeMeta[locale].native }, localeMeta[locale].short),
);
const languageGroup = h('div', { class: 'lang-switch', role: 'group' }, ...languageButtons);
const themeButton = h('button', { type: 'button', class: 'theme-toggle' });
const musicToggle = h('button', { type: 'button', class: 'music-toggle', 'aria-describedby': 'music-status' });
const musicSlider = h('input', { id: 'music-volume', type: 'range', class: 'music-volume', min: 0, max: 100, step: 5 });
const musicPercent = h('output', { class: 'music-percent', for: 'music-volume', 'aria-live': 'off' });
const musicStatus = h('span', { id: 'music-status', class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
const musicControls = h('div', { class: 'music-controls', role: 'group' }, musicToggle, musicSlider, musicPercent, musicStatus);
const header = h('header', { class: 'site-header' }, h('div', { class: 'header-inner' }, brand, nav, h('div', { class: 'header-controls' }, musicControls, languageGroup, themeButton)));
const main = h('main', { id: 'main', class: 'site-main', tabindex: -1 });
const footerSource = h('a', { href: SOURCE_URL, rel: 'noopener noreferrer', target: '_blank' });
const footerData = h('a', { href: DATA_REPO_URL, rel: 'noopener noreferrer', target: '_blank' });
const footerPrivacy = h('a', { href: HREF.privacy });
const footerTerms = h('a', { href: HREF.terms });
const footerCopy = h('span');
const footer = h('footer', { class: 'site-footer' }, h('div', { class: 'footer-inner' }, footerCopy, h('span', { class: 'footer-links' }, footerPrivacy, footerTerms, footerSource, footerData)));

const stageCanvas = h('canvas', { class: 'stage', 'aria-hidden': 'true' });
let stage: Stage | null = null;
// Set once the current player frame fires `load`; the stage stops rendering from then on.
let gameLoaded = false;

app.replaceChildren(stageCanvas, skipLink, header, main, footer);

let pageSuspended = false;
let musicGestureUsed = false;
const music = new MusicController(updateMusicControls, musicVolume, readStorage(MUSIC_ENABLED_KEY) !== 'false');

function updateMusicControls(): void {
  const status = music.status;
  const action = status === 'error' ? t.musicRetry : music.enabled ? t.musicPause : t.musicPlay;
  const notice = {
    waiting: t.musicWaiting,
    loading: t.musicLoading,
    playing: t.musicPlaying,
    paused: t.musicPaused,
    blocked: t.musicBlocked,
    error: t.musicError,
  }[status];
  const percent = new Intl.NumberFormat(localeMeta[state.locale].htmlLang, { style: 'percent', maximumFractionDigits: 0 }).format(music.volume);
  musicControls.setAttribute('aria-label', t.musicLabel);
  musicToggle.replaceChildren(icon(status === 'error' ? 'retry' : music.enabled ? 'pause' : 'play'));
  musicToggle.setAttribute('aria-label', action);
  musicToggle.setAttribute('aria-pressed', String(music.enabled));
  musicToggle.setAttribute('aria-busy', String(status === 'loading'));
  musicToggle.dataset.state = status;
  musicToggle.disabled = status === 'loading';
  musicToggle.title = `${action} · ${t.musicTrack} — ${notice}`;
  musicSlider.setAttribute('aria-label', t.musicVolume);
  musicSlider.setAttribute('aria-valuetext', percent);
  musicSlider.value = String(Math.round(music.volume * 100));
  musicPercent.textContent = percent;
  musicStatus.textContent = `${t.musicTrack} — ${notice}`;
}

function updateMusicBlocking(route = parseRoute()): void {
  music.setBlocked(pageSuspended || document.hidden || route.view === 'play');
}

function activateMusicFromGesture(event: Event): void {
  if (!event.isTrusted || musicGestureUsed || !music.enabled || pageSuspended || document.hidden || parseRoute().view === 'play') return;
  if (event.target instanceof Node && musicControls.contains(event.target)) return;
  musicGestureUsed = true;
  void music.activate();
}

function stageState(route: Route): StageState {
  const catalog = state.catalog;
  return {
    theme: state.theme,
    view: route.view === 'play' ? 'game' : route.view === 'privacy' || route.view === 'terms' ? 'home' : route.view,
    motion: !reducedMotion.matches,
    // A loaded game covers the whole viewport, and a background tab shows nothing,
    // so in both cases the stage stops drawing entirely.
    paused: document.hidden || (route.view === 'play' && gameLoaded),
    // An unfocused but visible window keeps its last frame instead of animating.
    idle: !document.hasFocus(),
    data: { games: catalog?.games.length ?? 0, genres: catalog ? usedGenres(catalog).map(([, count]) => count) : [] },
  };
}

// Crawlers render the SPA, so each view publishes its own title, description and
// canonical URL. The player is canonicalised to the game's detail page.
function pageMeta(route: Route): { title: string; description: string; href: string; index: boolean } {
  const brand = t.brand;
  if (route.view === 'game' || route.view === 'play') {
    const game = state.catalog?.games.find((candidate) => candidate.id === route.id);
    const href = gameHref(route.id);
    if (!game) return { title: t.pageTitle, description: t.metaDescription, href, index: !state.catalog };
    const text = gameText(game, state.locale);
    return { title: `${text.name} — ${brand}`, description: text.description, href, index: true };
  }
  if (route.view === 'games') {
    const genre = route.genre && state.catalog?.categories.has(route.genre) ? route.genre : '';
    const title = genre ? `${categoryName(genre)} — ${t.libraryTitle}` : t.libraryTitle;
    return { title: `${title} — ${brand}`, description: t.metaDescription, href: genreHref(genre), index: true };
  }
  if (route.view === 'data') return { title: `${t.dataTitle} — ${brand}`, description: t.dataLead, href: HREF.data, index: true };
  if (route.view === 'privacy') return { title: `${t.privacyTitle} — ${brand}`, description: t.privacyLead, href: HREF.privacy, index: true };
  if (route.view === 'terms') return { title: `${t.termsTitle} — ${brand}`, description: t.termsLead, href: HREF.terms, index: true };
  if (route.view === 'missing') return { title: `${t.notFound} — ${brand}`, description: t.metaDescription, href: location.href, index: false };
  return { title: t.pageTitle, description: t.metaDescription, href: HREF.home, index: true };
}

function setMeta(selector: string, content: string): void {
  document.head.querySelector(selector)?.setAttribute('content', content);
}

const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
const robots = h('meta', { name: 'robots', content: 'noindex' });

function updateChrome(route: Route): void {
  const root = document.documentElement;
  root.lang = localeMeta[state.locale].htmlLang;
  const meta = pageMeta(route);
  const url = new URL(meta.href, location.origin).href;
  document.title = meta.title;
  canonical?.setAttribute('href', url);
  setMeta('meta[name="description"]', meta.description);
  setMeta('meta[property="og:title"]', meta.title);
  setMeta('meta[property="og:description"]', meta.description);
  setMeta('meta[property="og:url"]', url);
  setMeta('meta[name="twitter:title"]', meta.title);
  setMeta('meta[name="twitter:description"]', meta.description);
  if (meta.index) robots.remove();
  else document.head.append(robots);
  skipLink.textContent = t.skipToContent;
  brandName.textContent = t.brand;
  brand.setAttribute('aria-label', t.navHome);
  nav.setAttribute('aria-label', t.navLabel);
  navLinks.home.textContent = t.navHome;
  navLinks.games.textContent = t.navGames;
  navLinks.data.textContent = t.navData;
  const active = route.view === 'game' || route.view === 'play' ? 'games' : route.view;
  for (const [view, link] of Object.entries(navLinks)) {
    if (view === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  languageGroup.setAttribute('aria-label', t.languageLabel);
  for (const button of languageButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.locale === state.locale));
  }
  const toLight = state.theme === 'dark';
  themeButton.replaceChildren(icon(toLight ? 'sun' : 'moon'));
  themeButton.setAttribute('aria-label', toLight ? t.themeToLight : t.themeToDark);
  themeButton.title = toLight ? t.themeToLight : t.themeToDark;
  footerSource.textContent = t.footerSource;
  footerData.textContent = t.footerData;
  footerPrivacy.textContent = t.privacyTitle;
  footerTerms.textContent = t.termsTitle;
  for (const [link, view] of [[footerPrivacy, 'privacy'], [footerTerms, 'terms']] as const) {
    if (route.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  footerCopy.textContent = `© ${new Date().getFullYear()} YuStellarGamesStudio`;
  stage?.update(stageState(route));
  updateMusicBlocking(route);
  updateMusicControls();
}

// ---------- Shared pieces ----------

function viewHeading(kicker: string, title: string, lead?: string): HTMLElement {
  return h('header', { class: 'view-heading' }, h('p', { class: 'kicker' }, kicker), h('h1', { tabindex: -1 }, title), lead ? h('p', { class: 'lead' }, lead) : null);
}

function statusPanel(): HTMLElement {
  if (state.error) {
    const retry = h('button', { type: 'button', class: 'btn btn-primary' }, t.retry);
    retry.addEventListener('click', () => void startLoading());
    return h('div', { class: 'status-panel is-error', role: 'alert' }, h('p', {}, t.loadError), h('code', {}, CATALOG_BASE.href), retry);
  }
  return h('div', { class: 'status-panel', role: 'status' }, h('span', { class: 'loader', 'aria-hidden': 'true' }), h('p', {}, t.loading));
}

function categoryChips(keys: string[]): HTMLElement {
  return h('ul', { class: 'chips' }, ...keys.map((key) => h('li', { class: 'chip' }, categoryName(key))));
}

function coverImage(game: Game, className: string): HTMLElement {
  const frame = h('div', { class: `${className} cover-frame` }, h('span', { class: 'cover-fallback', 'aria-hidden': 'true' }, game.id.slice(0, 2).toUpperCase()));
  if (game.cover) {
    const image = h('img', { src: game.cover, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    image.addEventListener('error', () => image.remove(), { once: true });
    frame.prepend(image);
  }
  return frame;
}

function navigate(href: string): void {
  history.pushState(null, '', href);
  render(true);
}

function playButton(game: Game): HTMLAnchorElement {
  return h('a', { href: playHref(game.id), class: 'btn btn-primary' }, icon('play'), t.play);
}

function gameCard(game: Game): HTMLElement {
  const text = gameText(game, state.locale);
  const detail = gameHref(game.id);
  return h(
    'article',
    { class: 'game-card' },
    h('a', { href: detail, class: 'card-media', tabindex: -1, 'aria-hidden': 'true' }, coverImage(game, 'card-cover')),
    h(
      'div',
      { class: 'card-body' },
      h('p', { class: 'card-id' }, h('span', {}, `// ${game.id}`), h('span', { class: 'card-status', 'aria-hidden': 'true' }, 'ONLINE')),
      h('h3', { class: 'card-title' }, h('a', { href: detail }, text.name)),
      categoryChips(game.categories),
      h('p', { class: 'card-desc' }, text.description),
      h('div', { class: 'card-actions' }, playButton(game), h('a', { href: detail, class: 'btn btn-ghost' }, t.details)),
    ),
  );
}

function searchableText(game: Game): string {
  const parts = [game.id, ...game.tags];
  for (const locale of locales) {
    const text = game.text[locale];
    if (text) parts.push(text.name, text.description);
  }
  for (const key of game.categories) {
    parts.push(key, ...Object.values(state.catalog?.categories.get(key) ?? {}));
  }
  return parts.join('\n').toLocaleLowerCase();
}

function usedGenres(catalog: Catalog): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const game of catalog.games) {
    for (const key of game.categories) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || categoryName(a[0]).localeCompare(categoryName(b[0]), localeMeta[state.locale].htmlLang));
}

function countUp(root: HTMLElement, animate: boolean): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-count]')) {
    const target = Number(element.dataset.count);
    if (!animate || reducedMotion.matches) {
      element.textContent = formatNumber(target);
      continue;
    }
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 900);
      element.textContent = formatNumber(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1 && element.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

function statTile(label: string, value: number, accent = false): HTMLElement {
  return h('div', { class: accent ? 'stat-tile is-accent' : 'stat-tile' }, h('span', { class: 'stat-value', 'data-count': value }, '0'), h('span', { class: 'stat-label' }, label));
}

// ---------- Views ----------

// Picked once per loaded catalog so switching language or theme does not reshuffle the homepage.
const featuredCache = new WeakMap<Catalog, Catalog['games']>();
function featuredGames(catalog: Catalog): Catalog['games'] {
  let picked = featuredCache.get(catalog);
  if (!picked) {
    const pool = [...catalog.games];
    picked = [];
    // Draw without replacement: distinct games, in random order.
    while (picked.length < 6 && pool.length > 0) {
      const [game] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      if (game) picked.push(game);
    }
    featuredCache.set(catalog, picked);
  }
  return picked;
}

function renderHome(catalog: Catalog | null): Node[] {
  const hero = h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero-copy' },
      h('p', { class: 'kicker' }, h('span', { class: 'pulse', 'aria-hidden': 'true' }), t.heroKicker, catalog ? h('span', { class: 'kicker-meta', 'aria-hidden': 'true' }, `SIGNALS ${String(catalog.games.length).padStart(2, '0')}`) : null),
      // CJK lines may break between any two characters; keep each word whole so the title never splits 遊戲.
      h('h1', { tabindex: -1 }, ...Array.from(new Intl.Segmenter(state.locale, { granularity: 'word' }).segment(t.heroTitle), (part) => (part.isWordLike ? h('span', { class: 'nowrap' }, part.segment) : part.segment))),
      h('p', { class: 'lead' }, t.heroLead),
      h('div', { class: 'hero-actions' }, h('a', { href: HREF.games, class: 'btn btn-primary' }, t.ctaGames, icon('arrow')), h('a', { href: HREF.data, class: 'btn btn-ghost' }, t.ctaData)),
    ),
    h('div', { class: 'hero-visual', 'aria-hidden': 'true' }, h('div', { class: 'orbit orbit-1' }), h('div', { class: 'orbit orbit-2' }), h('div', { class: 'orbit orbit-3' }), icon('logo', 'hero-core')),
  );
  if (!catalog) return [hero, statusPanel()];

  const stats = h('section', { class: 'stat-strip' }, statTile(t.statGames, catalog.games.length, true), statTile(t.statGenres, usedGenres(catalog).length), statTile(t.statLanguages, locales.length));
  const featured = featuredGames(catalog);
  const library = h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', {}, t.libraryTitle), h('a', { href: HREF.games, class: 'text-link' }, t.viewAll, icon('arrow'))),
    h('div', { class: 'game-grid' }, ...featured.map(gameCard)),
  );
  return [hero, stats, library];
}

function renderGames(catalog: Catalog | null, genre: string | null): Node[] {
  const heading = viewHeading(`// ${t.navGames}`, t.libraryTitle);
  if (!catalog) return [heading, statusPanel()];

  const grid = h('div', { class: 'game-grid' });
  const count = h('p', { class: 'result-count', role: 'status' });
  const search = h('input', { type: 'search', class: 'search-input', placeholder: t.searchPlaceholder, 'aria-label': t.searchLabel, value: state.query, autocomplete: 'off' });
  const index = new Map(catalog.games.map((game) => [game, searchableText(game)]));
  state.genre = genre && catalog.categories.has(genre) ? genre : '';

  const genres = usedGenres(catalog);
  const chipButtons = [['', catalog.games.length] as [string, number], ...genres].map(([key, total]) =>
    h('button', { type: 'button', class: 'filter-chip', 'data-genre': key }, key ? categoryName(key) : t.allGenres, h('span', { class: 'filter-count' }, formatNumber(total))),
  );

  const update = () => {
    const query = state.query.trim().toLocaleLowerCase();
    const matches = catalog.games.filter((game) => (!state.genre || game.categories.includes(state.genre)) && (!query || index.get(game)!.includes(query)));
    grid.replaceChildren(...(matches.length ? matches.map(gameCard) : [h('p', { class: 'empty' }, t.noResults)]));
    count.textContent = t.resultCount(matches.length);
    for (const button of chipButtons) button.setAttribute('aria-pressed', String(button.dataset.genre === state.genre));
  };

  search.addEventListener('input', () => {
    state.query = search.value;
    update();
  });
  for (const button of chipButtons) {
    button.addEventListener('click', () => {
      state.genre = button.dataset.genre ?? '';
      // The filter is a real URL so each genre page can be linked and indexed.
      history.replaceState(null, '', genreHref(state.genre));
      updateChrome(parseRoute());
      update();
    });
  }
  update();

  const toolbar = h('div', { class: 'toolbar' }, h('div', { class: 'search-wrap' }, search), h('div', { class: 'filter-row', role: 'group', 'aria-label': t.filterLabel }, ...chipButtons), count);
  return [heading, toolbar, grid];
}

function renderGame(catalog: Catalog | null, id: string): Node[] {
  const back = h('a', { href: HREF.games, class: 'text-link back-link' }, icon('back'), t.back);
  if (!catalog) return [back, statusPanel()];
  const game = catalog.games.find((candidate) => candidate.id === id);
  if (!game) return renderMissing(catalog, t.gameNotFound);

  const text = gameText(game, state.locale);
  const otherNames = [...new Set(locales.map((locale) => game.text[locale]?.name).filter((name): name is string => !!name && name !== text.name))];
  const launchLocales = locales.filter((locale) => game.launchUrls[locale]);
  const recordUrl = new URL(game.source, catalog.base).href;

  const facts = h(
    'dl',
    { class: 'facts' },
    h('dt', {}, t.genres),
    h('dd', {}, categoryChips(game.categories)),
    game.tags.length ? h('dt', {}, t.tags) : null,
    game.tags.length ? h('dd', {}, h('ul', { class: 'chips' }, ...game.tags.map((tag) => h('li', { class: 'chip chip-tag' }, `#${tag}`)))) : null,
    h('dt', {}, t.launchLanguages),
    h('dd', {}, launchLocales.length ? launchLocales.map((locale) => localeMeta[locale].native).join(' · ') : t.launchDefaultOnly),
    otherNames.length ? h('dt', {}, t.alsoKnownAs) : null,
    otherNames.length ? h('dd', {}, otherNames.join(' / ')) : null,
    h('dt', {}, t.record),
    h('dd', {}, externalLink(recordUrl, 'mono-link', game.source)),
  );

  return [
    back,
    h(
      'article',
      { class: 'game-detail' },
      coverImage(game, 'detail-cover'),
      h(
        'div',
        { class: 'detail-body' },
        h('p', { class: 'kicker' }, `// ${game.id}`),
        h('h1', { tabindex: -1 }, text.name),
        h('p', { class: 'lead' }, text.description),
        h('div', { class: 'hero-actions' }, playButton(game)),
        facts,
      ),
    ),
  ];
}

function renderPlay(catalog: Catalog | null, id: string): Node[] {
  if (!catalog) return [statusPanel()];
  const game = catalog.games.find((candidate) => candidate.id === id);
  if (!game) return renderMissing(catalog, t.gameNotFound);
  const launchUrl = game.launchUrls[state.locale] ?? game.url;
  // Same-origin scripts must not be able to remove their own sandbox.
  const sandbox = new URL(launchUrl).origin === location.origin
    ? 'allow-scripts allow-pointer-lock'
    : 'allow-scripts allow-same-origin allow-pointer-lock';
  const frame = h('iframe', {
    class: 'player-frame',
    src: launchUrl,
    sandbox,
    title: gameText(game, state.locale).name,
    allow: 'fullscreen; autoplay; gamepad; clipboard-write',
    allowfullscreen: true,
  });
  gameLoaded = false;
  frame.addEventListener('load', () => {
    gameLoaded = true;
    stage?.update(stageState(parseRoute()));
  });
  // Exiting asks first: the exit button sits over the game, so a stray tap would
  // otherwise drop unsaved progress.
  const stay = h('button', { type: 'button', class: 'btn btn-ghost' }, t.exitCancel);
  const dialog = h(
    'dialog',
    { class: 'exit-dialog', 'aria-labelledby': 'exit-title', 'aria-describedby': 'exit-body' },
    // The panel carries the padding, so only real backdrop clicks hit the dialog itself.
    h(
      'div',
      { class: 'exit-panel' },
      h('h2', { id: 'exit-title' }, t.exitTitle),
      h('p', { id: 'exit-body' }, t.exitBody),
      // "Keep playing" comes first so it takes the initial focus.
      h('div', { class: 'exit-actions' }, stay, h('a', { href: gameHref(game.id), class: 'btn btn-primary' }, t.exitConfirm)),
    ),
  );
  stay.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  const exit = h('button', { type: 'button', class: 'player-exit', title: t.exitGame, 'aria-label': t.exitGame, 'aria-haspopup': 'dialog' }, icon('back'));
  exit.addEventListener('click', () => dialog.showModal());
  return [h('div', { class: 'player' }, frame, exit, dialog)];
}

function renderLegal(updated: string, title: string, lead: string, sections: readonly { title: string; body: string }[]): Node[] {
  return [
    viewHeading(updated, title, lead),
    h('article', { class: 'privacy-content' },
      ...sections.map((section) => h('section', { class: 'panel' }, h('h2', {}, section.title), h('p', {}, section.body))),
      externalLink(SOURCE_URL, 'text-link', t.footerSource),
    ),
  ];
}

function renderData(catalog: Catalog | null): Node[] {
  const heading = viewHeading(t.dataKicker, t.dataTitle, t.dataLead);
  if (!catalog) return [heading, statusPanel()];

  const genres = usedGenres(catalog);
  const tagCounts = new Map<string, number>();
  for (const game of catalog.games) for (const tag of game.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const launchLinks = catalog.games.reduce((sum, game) => sum + Object.keys(game.launchUrls).length, 0);

  const tiles = h(
    'section',
    { class: 'stat-strip stat-strip-wide' },
    statTile(t.tileGames, catalog.games.length, true),
    statTile(t.tileGenres, catalog.categories.size),
    statTile(t.tileGenresUsed, genres.length),
    statTile(t.tileTags, tagCounts.size),
    statTile(t.tileLaunch, launchLinks),
  );

  const maxGenre = Math.max(1, ...genres.map(([, total]) => total));
  const genreChart = panel(
    t.genreChart,
    'span-2',
    h(
      'ol',
      { class: 'bar-chart' },
      ...genres.map(([key, total], position) =>
        h(
          'li',
          { class: 'bar-row', style: `--delay:${position * 60}ms` },
          h('span', { class: 'bar-label' }, categoryName(key)),
          h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `--value:${total / maxGenre}` })),
          h('span', { class: 'bar-value' }, formatNumber(total)),
        ),
      ),
    ),
  );

  const matrix = h(
    'table',
    { class: 'matrix' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t.coverageGame), ...locales.map((locale) => h('th', { scope: 'col', lang: localeMeta[locale].htmlLang }, localeMeta[locale].short)))),
    h(
      'tbody',
      {},
      ...catalog.games.map((game) =>
        h(
          'tr',
          {},
          h('th', { scope: 'row' }, gameText(game, state.locale).name),
          ...locales.map((locale) => {
            const hasText = !!game.text[locale];
            const hasLaunch = !!game.launchUrls[locale];
            const level = hasText && hasLaunch ? 'full' : hasText ? 'text' : 'none';
            const label = `${t.coverageText}: ${hasText ? '✓' : '✗'} · ${t.coverageLaunch}: ${hasLaunch ? '✓' : '✗'}`;
            return h('td', { class: `cell cell-${level}`, title: label }, h('span', { class: 'cell-mark', 'aria-hidden': 'true' }, level === 'full' ? '■' : level === 'text' ? '▣' : '□'), h('span', { class: 'visually-hidden' }, label));
          }),
        ),
      ),
    ),
  );
  const coverage = panel(t.coverageTitle, '', h('div', { class: 'table-scroll' }, matrix), h('p', { class: 'legend' }, t.coverageLegend));

  const maxTag = Math.max(1, ...tagCounts.values());
  const tags = panel(
    t.tagCloud,
    '',
    h(
      'ul',
      { class: 'tag-cloud' },
      ...[...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, total]) => h('li', { style: `--weight:${total / maxTag}` }, `#${tag}`, h('sup', {}, String(total)))),
    ),
  );

  const usage = new Map(genres);
  const dictionaryBody = h('tbody');
  const dictionaryFilter = h('input', { type: 'search', class: 'search-input', placeholder: t.dictionaryFilter, 'aria-label': t.dictionaryFilter, value: state.dictionaryQuery, autocomplete: 'off' });
  const updateDictionary = () => {
    const query = state.dictionaryQuery.trim().toLocaleLowerCase();
    const rows = [...catalog.categories].filter(([key, names]) => !query || [key, ...Object.values(names)].some((value) => value.toLocaleLowerCase().includes(query)));
    dictionaryBody.replaceChildren(
      ...rows.map(([key, names]) =>
        h(
          'tr',
          { class: usage.has(key) ? 'is-used' : undefined },
          h('td', { class: 'mono' }, key),
          ...locales.map((locale) => h('td', { lang: localeMeta[locale].htmlLang }, names[locale])),
          h('td', { class: 'num' }, formatNumber(usage.get(key) ?? 0)),
        ),
      ),
    );
  };
  dictionaryFilter.addEventListener('input', () => {
    state.dictionaryQuery = dictionaryFilter.value;
    updateDictionary();
  });
  updateDictionary();
  const dictionary = panel(
    t.dictionaryTitle,
    'span-full',
    dictionaryFilter,
    h(
      'div',
      { class: 'table-scroll dictionary-scroll' },
      h(
        'table',
        { class: 'data-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t.dictionaryKey), ...locales.map((locale) => h('th', { scope: 'col' }, localeMeta[locale].native)), h('th', { scope: 'col', class: 'num' }, t.dictionaryUsage))),
        dictionaryBody,
      ),
    ),
  );

  const loadedAt = new Intl.DateTimeFormat(localeMeta[state.locale].htmlLang, { dateStyle: 'medium', timeStyle: 'medium' }).format(catalog.loadedAt);
  const terminal = panel(
    t.networkTitle,
    'span-full',
    h(
      'div',
      { class: 'terminal', role: 'log' },
      h('p', { class: 'terminal-line is-muted' }, `$ uplink --source ${catalog.base.href}`),
      ...catalog.requests.map((request) =>
        h(
          'p',
          { class: request.status !== null && request.status < 400 ? 'terminal-line' : 'terminal-line is-bad' },
          h('span', { class: 'term-status' }, request.status === null ? 'ERR' : String(request.status)),
          h('span', { class: 'term-path' }, new URL(request.url).pathname),
          h('span', { class: 'term-meta' }, `${formatNumber(request.ms)} ms`),
          h('span', { class: 'term-meta' }, `${formatNumber(Math.max(0.1, Math.round(request.bytes / 102.4) / 10))} KB`),
        ),
      ),
      h('p', { class: 'terminal-line is-muted' }, `${t.loadedAt}: ${loadedAt}`, h('span', { class: 'cursor', 'aria-hidden': 'true' })),
    ),
    h('p', { class: 'legend' }, `${t.dataSource}: `, externalLink(catalog.base.href, 'mono-link', catalog.base.host)),
  );

  return [heading, tiles, h('div', { class: 'dashboard' }, genreChart, coverage, tags, dictionary, terminal)];
}

function panel(title: string, span: string, ...children: Child[]): HTMLElement {
  return h('section', { class: `panel ${span}`.trim() }, h('h2', { class: 'panel-title' }, title), ...children);
}

function renderMissing(catalog: Catalog | null, title = t.notFound): Node[] {
  const intro = h(
    'section',
    { class: 'status-panel missing-panel' },
    h('p', { class: 'missing-code', 'aria-hidden': 'true' }, '404'),
    h('h1', { tabindex: -1 }, title),
    h('p', { class: 'lead' }, t.notFoundLead),
    h('div', { class: 'hero-actions' }, h('a', { href: HREF.home, class: 'btn btn-primary' }, t.goHome), h('a', { href: HREF.games, class: 'btn btn-ghost' }, t.ctaGames, icon('arrow'))),
  );
  if (!catalog) return [intro, statusPanel()];
  // Reuse the catalog's cached random draw so language changes preserve the selection.
  const recommendations = featuredGames(catalog).slice(0, 3);
  if (!recommendations.length) return [intro];
  return [
    intro,
    h(
      'section',
      { class: 'section', 'aria-labelledby': 'recommendations-title' },
      h('div', { class: 'section-head' }, h('h2', { id: 'recommendations-title' }, t.recommendationsTitle), h('a', { href: HREF.games, class: 'text-link' }, t.viewAll, icon('arrow'))),
      h('p', { class: 'recommendations-lead' }, t.recommendationsLead),
      h('div', { class: 'game-grid' }, ...recommendations.map(gameCard)),
    ),
  ];
}

// ---------- Render loop ----------

function render(navigated: boolean, animate = navigated): void {
  const route = parseRoute();
  updateChrome(route);
  const catalog = state.catalog;
  const nodes =
    route.view === 'home'
      ? renderHome(catalog)
      : route.view === 'games'
        ? renderGames(catalog, route.genre)
        : route.view === 'game'
          ? renderGame(catalog, route.id)
          : route.view === 'play'
            ? renderPlay(catalog, route.id)
            : route.view === 'data'
              ? renderData(catalog)
              : route.view === 'privacy'
                ? renderLegal(t.privacyUpdated, t.privacyTitle, t.privacyLead, t.privacySections)
                : route.view === 'terms'
                  ? renderLegal(t.termsUpdated, t.termsTitle, t.termsLead, t.termsSections)
                  : renderMissing(catalog);
  main.replaceChildren(h('div', { class: `view view-${route.view}` }, ...nodes));
  main.dataset.view = route.view;
  countUp(main, animate);
  if (navigated) {
    window.scrollTo({ top: 0 });
    main.querySelector<HTMLElement>('h1, iframe')?.focus({ preventScroll: true });
  }
}

async function startLoading(): Promise<void> {
  state.loading?.abort();
  const controller = new AbortController();
  state.loading = controller;
  state.error = false;
  render(false);
  try {
    state.catalog = await loadCatalog(CATALOG_BASE, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error(error);
    state.error = true;
  }
  state.loading = null;
  render(false, true);
}

function setLocale(locale: Locale): void {
  if (locale === state.locale) return;
  state.locale = locale;
  t = messages[locale];
  writeStorage(LOCALE_KEY, locale);
  render(false);
}

function setTheme(theme: Theme): void {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  writeStorage(THEME_KEY, theme);
  updateChrome(parseRoute());
}

languageGroup.addEventListener('click', (event) => {
  const locale = (event.target as Element).closest<HTMLButtonElement>('[data-locale]')?.dataset.locale;
  if (isLocale(locale)) setLocale(locale);
});
themeButton.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
musicToggle.addEventListener('click', () => {
  const enabled = music.status === 'error' || !music.enabled;
  writeStorage(MUSIC_ENABLED_KEY, String(enabled));
  if (enabled) musicGestureUsed = true;
  void music.setEnabled(enabled);
});
musicSlider.addEventListener('input', () => {
  const volume = Number(musicSlider.value) / 100;
  writeStorage(MUSIC_VOLUME_KEY, String(volume));
  music.setVolume(volume);
});
skipLink.addEventListener('click', (event) => {
  // Following #main would add a hash entry to the history; just move focus.
  event.preventDefault();
  main.focus();
});
// In-app links only change the query, so they are handled with the History API
// instead of reloading the document.
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!link || link.target) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname) return;
  event.preventDefault();
  if (url.href !== location.href) navigate(url.href);
});
// Route clicks are handled first, so entering a game never starts its background music.
document.addEventListener('click', activateMusicFromGesture);
document.addEventListener('keydown', activateMusicFromGesture);
window.addEventListener('popstate', () => render(true));
window.addEventListener('keydown', (event) => {
  // Only reaches us while focus is outside the game frame, e.g. on the exit button.
  const route = parseRoute();
  // Esc opens the confirmation; while it is open, the dialog handles Esc as "keep playing".
  const dialog = main.querySelector<HTMLDialogElement>('.exit-dialog');
  if (event.key === 'Escape' && route.view === 'play' && dialog && !dialog.open) {
    // Otherwise this same keypress becomes a close request and cancels the new dialog.
    event.preventDefault();
    dialog.showModal();
  }
});
reducedMotion.addEventListener('change', () => stage?.update(stageState(parseRoute())));
// rAF timing in background tabs is up to the browser; pausing ends the frame loop explicitly.
document.addEventListener('visibilitychange', () => {
  stage?.update(stageState(parseRoute()));
  updateMusicBlocking();
});
window.addEventListener('pagehide', (event) => {
  pageSuspended = true;
  music.setBlocked(true);
  if (!event.persisted) void music.destroy();
});
window.addEventListener('pageshow', () => {
  pageSuspended = false;
  updateMusicBlocking();
});
window.addEventListener('focus', () => stage?.update(stageState(parseRoute())));
window.addEventListener('blur', () => stage?.update(stageState(parseRoute())));
window.addEventListener('pointermove', (event) => {
  if (!reducedMotion.matches) stage?.setPointer((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
});
// Feeds the cursor position to the card and panel glow (--mx/--my in style.css).
document.addEventListener('pointermove', (event) => {
  if (reducedMotion.matches || event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
  const target = event.target.closest<HTMLElement>('.game-card, .panel');
  if (!target) return;
  const box = target.getBoundingClientRect();
  target.style.setProperty('--mx', `${event.clientX - box.left}px`);
  target.style.setProperty('--my', `${event.clientY - box.top}px`);
});
document.addEventListener('pointerdown', (event) => {
  if (reducedMotion.matches || !event.isPrimary || event.button !== 0 || document.querySelector('.view-play')) return;
  const ping = h('span', { class: 'pointer-ping', 'aria-hidden': 'true' });
  ping.style.left = `${event.clientX}px`;
  ping.style.top = `${event.clientY}px`;
  ping.addEventListener('animationend', () => ping.remove(), { once: true });
  document.body.append(ping);
});

void startLoading();

// The engine loads as a separate chunk so the DOM UI never waits on it; without
// WebGPU/WebGL2 the CSS background stays in place.
void import('./stage')
  .then(({ createStage }) => createStage(stageCanvas, stageState(parseRoute())))
  .then((created) => {
    stage = created;
    if (!created) {
      stageCanvas.remove();
      return;
    }
    document.documentElement.classList.add('has-stage');
    // The catalog, focus or route may have changed while the engine was starting.
    created.update(stageState(parseRoute()));
  })
  .catch((error: unknown) => {
    console.warn('3D stage failed to load:', error);
    stageCanvas.remove();
  });

// Production only: on the dev server a worker would serve stale modules past HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${BASE}sw.js?catalog=${encodeURIComponent(CATALOG_BASE.href)}`).catch((error: unknown) => console.warn('Service worker registration failed:', error));
}
