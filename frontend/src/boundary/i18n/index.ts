import { ui } from '../../control/state/ui.svelte';
import type { ApiError } from '../../control/api/client';
import { LOCALES, type LocaleCode } from '../../entity/locales';
import { isMessageKey, translate, type MessageKey } from './translate';

/**
 * Reactive translation entry point.
 *
 * `t()` reads the reactive `ui.locale` value, so any component that calls it inside its template
 * re-renders when the language changes. The pure machinery lives in `translate.ts`.
 */

export {
  CATALOGUES,
  detectLocale,
  isMessageKey,
  localeLabel,
  translate
} from './translate';
export type { MessageKey } from './locales/en-US';
export { LOCALES };
export type { LocaleCode };

/** Translates a key using the active locale. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(ui.locale, key, params);
}

/**
 * Localizes an API failure.
 *
 * The backend answers with a stable machine-readable `key`; the catalogues own the wording. The
 * server's English `message` is only used when the key is unknown to this build.
 */
export function tError(error: ApiError | Error | null | undefined): string {
  if (!error) return t('common.somethingWentWrong');

  const candidate = error as ApiError;
  if (typeof candidate.key === 'string' && candidate.key.length > 0) {
    const messageKey = `errors.${candidate.key}`;
    if (isMessageKey(messageKey)) {
      return t(messageKey, candidate.params as Record<string, string> | undefined);
    }
  }

  return error.message || t('common.somethingWentWrong');
}
