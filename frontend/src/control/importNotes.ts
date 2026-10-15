import { notesApi } from './api/notes';
import { labels } from './state/labels.svelte';
import { notes } from './state/notes.svelte';
import { noteFromFile } from '../entity/noteFile';
import type { UpdateNoteRequest } from '../entity/api/types';

/** How an import went: how many notes were created, and which files could not be. */
export interface ImportResult {
  imported: number;
  failed: Array<{ name: string; error: unknown }>;
}

/**
 * Creates one note per file through the same REST calls the editor uses — there is no import
 * endpoint, so an import is checked exactly like typing the notes in by hand.
 *
 * A file's tags become the importer's own labels, created when they do not exist yet (matched
 * without regard to case, the way the server compares label names). Its metadata — colour,
 * background, pin, archive, reminder — is a second, unguarded write, as it would be from the editor.
 */
export async function importNoteFiles(files: ReadonlyArray<{ name: string; text: string }>): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, failed: [] };
  if (!labels.loaded) await labels.load();

  const labelIdFor = async (name: string): Promise<number> => {
    const known = labels.labels.find((label) => label.name.toLowerCase() === name.toLowerCase());
    return known ? known.id : (await labels.create(name)).id;
  };

  for (const file of files) {
    try {
      const note = noteFromFile(file.text);
      const labelIds: number[] = [];
      for (const tag of note.tags) labelIds.push(await labelIdFor(tag));

      const created = await notesApi.create({
        kind: note.kind,
        title: note.title,
        content: note.content,
        labels: labelIds
      });

      const metadata: UpdateNoteRequest = {};
      if (note.color !== 'default') metadata.color = note.color;
      if (note.background !== null) metadata.background = note.background;
      if (note.pinned) metadata.pinned = true;
      if (note.archived) metadata.archived = true;
      if (note.reminderAt !== null) {
        metadata.reminderAt = note.reminderAt;
        metadata.reminderRepeat = note.reminderRepeat;
      }
      if (Object.keys(metadata).length > 0) await notesApi.update(created.id, metadata);

      result.imported += 1;
    } catch (error) {
      result.failed.push({ name: file.name, error });
    }
  }

  await notes.refresh();
  return result;
}
