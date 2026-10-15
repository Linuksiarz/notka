/**
 * The locales Notka ships in.
 *
 * Locale codes are domain-level constants: the UI catalogs, the `Intl` formatters, and the
 * `Accept-Language` header all derive from them.
 */

export const LOCALES = ['en-US', 'en-GB', 'pl'] as const;

export type LocaleCode = (typeof LOCALES)[number];

/** The locale used when nothing else matches. */
export const DEFAULT_LOCALE: LocaleCode = 'en-US';

export function isLocaleCode(value: string | null | undefined): value is LocaleCode {
  return value !== null && value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/**
 * Maps an arbitrary `Accept-Language`/`navigator.language` value onto a supported locale.
 * Regional variants that we do not ship fall back to the closest supported language.
 */
export function matchLocale(candidate: string | null | undefined): LocaleCode | null {
  if (!candidate) return null;

  const normalized = candidate.trim();
  const exact = LOCALES.find((locale) => locale.toLowerCase() === normalized.toLowerCase());
  if (exact) return exact;

  const language = normalized.split('-')[0]?.toLowerCase();
  if (!language) return null;
  if (language === 'pl') return 'pl';
  if (language === 'en') return normalized.toLowerCase() === 'en-gb' ? 'en-GB' : DEFAULT_LOCALE;

  return null;
}
