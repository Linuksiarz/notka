import type { ThemesResponse } from './api/types';

/**
 * Background themes (`docs/THEMES.md`). A note stores only a background **id**; which picture that
 * id shows is the reader's theme — the built-in one, whose pictures ship with the app, or one the
 * administrator uploaded. A theme replaces as many of the nine as it provides; the rest stay the
 * built-in ones.
 */

/** The id of the theme that ships with the app. */
export const BUILT_IN_THEME_ID = 'notka';

/**
 * The theme an account sees: its own pick while that theme still exists, otherwise the instance's
 * default, otherwise the built-in one.
 */
export function activeThemeId(choice: ThemesResponse): string {
  const exists = (id: string) => id === BUILT_IN_THEME_ID || choice.themes.some((theme) => theme.id === id);
  if (choice.selectedThemeId !== null && exists(choice.selectedThemeId)) return choice.selectedThemeId;
  return exists(choice.defaultThemeId) ? choice.defaultThemeId : BUILT_IN_THEME_ID;
}
