/** Shared shapes for the message catalogues. */

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * A message is either a plain template or a set of `Intl.PluralRules` branches.
 * Placeholders are written `{name}` and substituted from the `params` argument of `t()`.
 */
export type MessageValue = string | Partial<Record<PluralCategory, string>>;
