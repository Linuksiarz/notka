import { api } from './client';
import type { Label, LabelsResponse } from '../../entity/api/types';

export const labelsApi = {
  list: () => api.get<LabelsResponse>('/labels'),

  create: (name: string) => api.post<Label>('/labels', { name }),

  rename: (id: number, name: string) => api.patch<Label>(`/labels/${id}`, { name }),

  remove: (id: number) => api.delete<void>(`/labels/${id}`)
};
