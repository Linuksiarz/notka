import { DEFAULT_LOCALE, matchLocale, type LocaleCode } from '../../entity/locales';
import { enGB } from './locales/en-GB';
import { enUS, type MessageKey, type Messages } from './locales/en-US';

export type { MessageKey };
import { pl } from './locales/pl';
import type { MessageValue, PluralCategory } from './types';

/**
 * Pure translation core.
 *
 * Kept free of Svelte and of the UI store so it can be unit tested directly; the reactive `t()`
 * lives in `index.ts`.
 */

export const CATALOGUES: Record<LocaleCode, Messages> = {
  'en-US': enUS,
  'en-GB': enGB,
  pl
};

const pluralRulesCache = new Map<LocaleCode, Intl.PluralRules>();

function pluralRulesFor(locale: LocaleCode): Intl.PluralRules {
  const cached = pluralRulesCache.get(locale);
  if (cached) return cached;
  const created = new Intl.PluralRules(locale);
  pluralRulesCache.set(locale, created);
  return created;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function selectBranch(
  value: MessageValue,
  locale: LocaleCode,
  params?: Record<string, string | number>
): string {
  if (typeof value === 'string') return value;

  const count = typeof params?.count === 'number' ? params.count : 0;
  const category = pluralRulesFor(locale).select(count) as PluralCategory;
  return value[category] ?? value.other ?? Object.values(value)[0] ?? '';
}

/** Translates a key in an explicit locale. Prefer {@link t} inside components. */
export function translate(
  locale: LocaleCode,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const catalogue = CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
  const fallback = CATALOGUES[DEFAULT_LOCALE];
  const value = catalogue[key] ?? fallback[key];
  return interpolate(selectBranch(value, locale, params), params);
}

/** True when `key` names a message in the source-of-truth catalogue. */
export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(enUS, value);
}

/** Picks the best supported locale for a browser `navigator.language` value. */
export function detectLocale(candidate: string | null | undefined): LocaleCode {
  return matchLocale(candidate) ?? DEFAULT_LOCALE;
}

/** Localized display name of a locale, always shown in that locale's own language. */
export function localeLabel(locale: LocaleCode): string {
  return translate(locale, `locale.${locale}` as MessageKey);
}
