import type { SharedContent } from '../../entity/sharedNote';

/**
 * The share inbox the service worker fills when another app shares into Notka (`public/sw.js`,
 * `receiveShare`): Cache Storage, because the worker answers the share's `POST /share` before the
 * page exists and the page reads it back after it has started. Its name and keys are the worker's.
 */
const SHARE_CACHE = 'notka-v1-share';
const CONTENT_KEY = '/share-inbox/content';
const imageKey = (index: number) => `/share-inbox/image/${index}`;

export interface SharedItem extends SharedContent {
  images: Blob[];
}

/** Takes the waiting share out of the inbox, or `null` when there is none. */
export async function takeShared(): Promise<SharedItem | null> {
  if (typeof caches === 'undefined') return null;
  const inbox = await caches.open(SHARE_CACHE);
  const content = await inbox.match(CONTENT_KEY);
  if (!content) return null;
  const shared = (await content.json()) as SharedContent & { images: number };
  const images: Blob[] = [];
  for (let index = 0; index < shared.images; index += 1) {
    const image = await inbox.match(imageKey(index));
    if (image) images.push(await image.blob());
  }
  await caches.delete(SHARE_CACHE);
  return { title: shared.title, text: shared.text, url: shared.url, images };
}
