import { api } from './client';
import type { ThemesResponse } from '../../entity/api/types';

export const themesApi = {
  list: () => api.get<ThemesResponse>('/themes'),
  /** `null` follows the instance's default. */
  select: (themeId: string | null) => api.put<ThemesResponse>('/themes/selection', { themeId })
};
