import { labelsApi } from '../api/labels';
import { ApiError } from '../api/client';
import { localStore } from '../api/localStore';
import type { Label } from '../../entity/api/types';

const LABELS_KEY = 'labels';

class LabelsState {
  labels = $state<Label[]>([]);
  loaded = $state(false);

  /** The account's labels — this device's copy of them while the server cannot be reached. */
  async load(): Promise<void> {
    try {
      const { labels } = await labelsApi.list();
      this.labels = labels;
      void localStore.set(LABELS_KEY, labels);
    } catch (error) {
      const kept = error instanceof ApiError && error.transient ? await localStore.get<Label[]>(LABELS_KEY) : undefined;
      if (!kept) throw error;
      this.labels = kept;
    }
    this.loaded = true;
  }

  byId(id: number): Label | undefined {
    return this.labels.find((label) => label.id === id);
  }

  async create(name: string): Promise<Label> {
    const label = await labelsApi.create(name);
    this.labels = [...this.labels, label].sort(byName);
    return label;
  }

  async rename(id: number, name: string): Promise<void> {
    const updated = await labelsApi.rename(id, name);
    this.labels = this.labels.map((label) => (label.id === id ? updated : label)).sort(byName);
  }

  async remove(id: number): Promise<void> {
    await labelsApi.remove(id);
    this.labels = this.labels.filter((label) => label.id !== id);
  }

  reset(): void {
    this.labels = [];
    this.loaded = false;
  }
}

function byName(a: Label, b: Label): number {
  return a.name.localeCompare(b.name);
}

export const labels = new LabelsState();
