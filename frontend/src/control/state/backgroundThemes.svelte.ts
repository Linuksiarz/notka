import { adminApi } from '../api/admin';
import { themesApi } from '../api/themes';
import { NOTE_BACKGROUNDS } from '../../entity/api/types';
import type { NoteBackground, Theme, ThemesResponse } from '../../entity/api/types';
import { activeThemeId, BUILT_IN_THEME_ID } from '../../entity/backgroundTheme';

/**
 * The background themes of this instance and the one this account sees.
 *
 * The administrator uploads themes and picks the instance's default; every account picks one of them
 * for itself or follows the default, and the server keeps that choice, so it follows the account to
 * every browser. A note only names its background, so two people with different themes see the same
 * note in their own pictures. Applying a theme is setting `--theme-art-<id>-<light|dark>` and
 * `--theme-tint(-dark)-<id>` on the root (`palette.css`), and `--theme-highlight(-dark)` for the
 * sidebar (`tokens.css`); the built-in theme sets none of them. A theme's logo is {@link logo}.
 */

/** What the theme lists show about a theme. */
export interface ThemeSummary {
  id: string;
  name: string;
  author?: string;
  license?: string;
  builtIn: boolean;
  /** A preview of each background it provides, light variant. */
  previews: Partial<Record<NoteBackground, string>>;
}

const BUILT_IN: ThemeSummary = {
  id: BUILT_IN_THEME_ID,
  name: 'Notka',
  author: 'Notka',
  license: 'CC0 1.0',
  builtIn: true,
  previews: Object.fromEntries(NOTE_BACKGROUNDS.map((id) => [id, `/backgrounds/${id}-light.svg`]))
};

function summary(theme: Theme): ThemeSummary {
  return {
    id: theme.id,
    name: theme.name,
    author: theme.author ?? undefined,
    license: theme.license ?? undefined,
    builtIn: false,
    previews: Object.fromEntries(Object.entries(theme.backgrounds).map(([id, images]) => [id, images?.light]))
  };
}

const EMPTY: ThemesResponse = { themes: [], defaultThemeId: BUILT_IN_THEME_ID, selectedThemeId: null };

class BackgroundThemesState {
  #choice = $state<ThemesResponse>(EMPTY);

  /** The built-in theme first, then the uploaded ones by name. */
  themes = $derived<ThemeSummary[]>([BUILT_IN, ...this.#choice.themes.map(summary)]);
  defaultId = $derived(this.#choice.defaultThemeId);
  /** This account's own pick; `null` follows {@link defaultId}. */
  selectedId = $derived(this.#choice.selectedThemeId);
  activeId = $derived(activeThemeId(this.#choice));
  /** The active theme's logo, or `null` for Notka's own mark. */
  logo = $derived(this.#choice.themes.find((theme) => theme.id === this.activeId)?.logo ?? null);

  /** Reads the instance's themes and this account's choice, and applies it. Fails quietly: the built-in theme is always there. */
  async load(): Promise<void> {
    try {
      this.#apply(await themesApi.list());
    } catch {
      this.#apply(EMPTY);
    }
  }

  /** Signing out goes back to the built-in pictures. */
  reset(): void {
    this.#apply(EMPTY);
  }

  /** `null` follows the instance's default. */
  async select(id: string | null): Promise<void> {
    this.#apply(await themesApi.select(id));
  }

  /** Administrator: adds or replaces a theme from its `.zip`. */
  async upload(archive: Blob): Promise<Theme> {
    const theme = await adminApi.uploadTheme(archive);
    await this.load();
    return theme;
  }

  /** Administrator: removes a theme; whoever used it goes back to the default. */
  async remove(id: string): Promise<void> {
    await adminApi.removeTheme(id);
    await this.load();
  }

  #apply(choice: ThemesResponse): void {
    this.#choice = choice;
    const root = document.documentElement.style;
    root.removeProperty('--theme-highlight');
    root.removeProperty('--theme-highlight-dark');
    for (const id of NOTE_BACKGROUNDS) {
      for (const name of [`--theme-art-${id}-light`, `--theme-art-${id}-dark`, `--theme-tint-${id}`, `--theme-tint-dark-${id}`]) {
        root.removeProperty(name);
      }
    }
    const active = choice.themes.find((theme) => theme.id === activeThemeId(choice));
    if (!active) return;
    if (active.highlight) root.setProperty('--theme-highlight', active.highlight);
    if (active.highlightDark) root.setProperty('--theme-highlight-dark', active.highlightDark);
    for (const [id, images] of Object.entries(active.backgrounds)) {
      if (!images) continue;
      root.setProperty(`--theme-art-${id}-light`, `url("${images.light}")`);
      root.setProperty(`--theme-art-${id}-dark`, `url("${images.dark}")`);
      if (images.tint) root.setProperty(`--theme-tint-${id}`, images.tint);
      if (images.tintDark) root.setProperty(`--theme-tint-dark-${id}`, images.tintDark);
    }
  }
}

export const backgroundThemes = new BackgroundThemesState();
