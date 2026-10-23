import { api } from './client';
import type {
  CreateNoteRequest,
  Note,
  NotesResponse,
  NoteVersion,
  NoteVersionsResponse,
  NoteView,
  ShareNoteRequest,
  SharePermission,
  SharesResponse,
  StepsRequest,
  StepsResponse,
  UpdateNoteRequest
} from '../../entity/api/types';

/** Where a dragged note goes: directly above one note, or directly below one. */
export type NoteMoveAnchor = { before: number } | { after: number };

export const notesApi = {
  list: (view: NoteView, labelId?: number | null) =>
    api.get<NotesResponse>('/notes', labelId == null ? { view } : { view, labelId }),

  /**
   * The reminders view: the notes carrying a reminder, **soonest first**.
   *
   * It is a request of its own rather than another `view`, because its order is by the reminder and
   * not by when the note was last written — and that order is the whole point of the view.
   */
  listReminders: () => api.get<NotesResponse>('/notes', { reminders: 'true' }),

  create: (body: CreateNoteRequest) => api.post<Note>('/notes', body),

  get: (id: number) => api.get<Note>(`/notes/${id}`),

  /**
   * On the wire a `null` field means "leave it alone", so taking the background away is the server's
   * empty-string sentinel; the request type keeps `null` for it, which is what the note itself holds.
   */
  update: (id: number, body: UpdateNoteRequest) =>
    api.patch<Note>(`/notes/${id}`, body.background === null ? { ...body, background: '' } : body),

  /** An editor's steps; `409 note.steps_behind` when somebody else's came first. */
  sendSteps: (id: number, body: StepsRequest) => api.post<Note>(`/notes/${id}/steps`, body),

  stepsSince: (id: number, since: number) => api.get<StepsResponse>(`/notes/${id}/steps`, { since }),

  /** Attaches a picture; the server recognises it from its bytes. Answers with the note. */
  uploadImage: (id: number, picture: Blob) => api.upload<Note>(`/notes/${id}/images`, picture),

  removeImage: (id: number, imageId: number) => api.delete<Note>(`/notes/${id}/images/${imageId}`),

  /** Moves the note to the trash. */
  trash: (id: number) => api.delete<Note>(`/notes/${id}`),

  /** Deletes the note permanently. */
  destroy: (id: number) => api.delete<void>(`/notes/${id}`, { permanent: true }),

  restore: (id: number) => api.post<Note>(`/notes/${id}/restore`),

  copy: (id: number) => api.post<Note>(`/notes/${id}/copy`),

  /** The reader opened the note: its "edited by" marker goes away, for them alone. */
  markSeen: (id: number) => api.post<Note>(`/notes/${id}/seen`),

  /** Puts a note directly above `before` or directly below `after` in the order its views show. */
  move: (id: number, anchor: NoteMoveAnchor) => api.post<Note>(`/notes/${id}/move`, anchor),

  listVersions: (noteId: number) =>
    api.get<NoteVersionsResponse>(`/notes/${noteId}/versions`).then((response) => response.versions),

  getVersion: (noteId: number, version: number) =>
    api.get<NoteVersion>(`/notes/${noteId}/versions/${version}`),

  removeLabel: (noteId: number, labelId: number) =>
    api.delete<Note>(`/notes/${noteId}/labels/${labelId}`),

  listShares: (noteId: number) => api.get<SharesResponse>(`/notes/${noteId}/shares`),

  addShare: (noteId: number, body: ShareNoteRequest) =>
    api.post<SharesResponse[`shares`][number]>(`/notes/${noteId}/shares`, body),

  updateShare: (noteId: number, userId: number, permission: SharePermission) =>
    api.patch<SharesResponse['shares'][number]>(`/notes/${noteId}/shares/${userId}`, { permission }),

  removeShare: (noteId: number, userId: number) =>
    api.delete<void>(`/notes/${noteId}/shares/${userId}`)
};

/** Where a note's picture is served; an `<img>` can load it with the session cookie. */
export function noteImageUrl(noteId: number, imageId: number): string {
  return `/api/notes/${noteId}/images/${imageId}`;
}
