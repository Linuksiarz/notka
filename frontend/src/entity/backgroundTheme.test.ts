import { describe, expect, it } from 'vitest';
import { activeThemeId, BUILT_IN_THEME_ID } from './backgroundTheme';
import type { Theme, ThemesResponse } from './api/types';

const watercolour: Theme = { id: 'watercolour', name: 'Watercolour', author: null, license: null, backgrounds: {}, logo: null, highlight: null, highlightDark: null };

function choice(overrides: Partial<ThemesResponse>): ThemesResponse {
  return { themes: [watercolour], defaultThemeId: BUILT_IN_THEME_ID, selectedThemeId: null, ...overrides };
}

describe('activeThemeId', () => {
  it('follows the instance default until the account picks one', () => {
    // given
    const following = choice({ defaultThemeId: 'watercolour' });
    const picked = choice({ defaultThemeId: 'watercolour', selectedThemeId: BUILT_IN_THEME_ID });

    // when
    const ids = [activeThemeId(following), activeThemeId(picked)];

    // then
    expect(ids).toEqual(['watercolour', BUILT_IN_THEME_ID]);
  });

  it('falls back to the built-in theme when what was chosen is gone', () => {
    // given: both the pick and the default name a theme that was removed
    const stale = choice({ themes: [], defaultThemeId: 'watercolour', selectedThemeId: 'watercolour' });

    // when
    const id = activeThemeId(stale);

    // then
    expect(id).toBe(BUILT_IN_THEME_ID);
  });
});
