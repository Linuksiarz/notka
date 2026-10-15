import { describe, expect, it } from 'vitest';
import { enUS, type MessageKey } from './locales/en-US';
import { enGB } from './locales/en-GB';
import { pl } from './locales/pl';
import { CATALOGUES, detectLocale, isMessageKey, localeLabel, translate } from './translate';

const OTHER_LOCALES = ['en-GB', 'pl'] as const;

describe('message catalogues', () => {
  it('declares exactly the same keys in every locale', () => {
    // given
    const sourceKeys = Object.keys(enUS).sort();

    for (const locale of OTHER_LOCALES) {
      // when
      const keys = Object.keys(CATALOGUES[locale]).sort();

      // then
      expect(keys, `locale ${locale}`).toEqual(sourceKeys);
    }
  });

  it('declares every plural branch used by the locale it belongs to', () => {
    // given
    const requiredCategories: Record<string, string[]> = {
      'en-US': ['one', 'other'],
      'en-GB': ['one', 'other'],
      // Polish distinguishes one / few / many.
      pl: ['one', 'few', 'many', 'other']
    };

    for (const [locale, categories] of Object.entries(requiredCategories)) {
      const catalogue = CATALOGUES[locale as keyof typeof CATALOGUES];

      for (const [key, value] of Object.entries(catalogue)) {
        if (typeof value === 'string') continue;

        // when / then
        for (const category of categories) {
          expect(Object.keys(value), `${locale}:${key}`).toContain(category);
        }
      }
    }
  });

  it('translates an interpolated message', () => {
    // given
    const key: MessageKey = 'labels.createNamed';

    // when
    const message = translate('en-US', key, { name: 'work' });

    // then
    expect(message).toBe('Create “work”');
  });

  it('selects the Polish plural branch from the count', () => {
    // given / when / then
    expect(translate('pl', 'card.daysLeft', { count: 1 })).toBe('Pozostał 1 dzień');
    expect(translate('pl', 'card.daysLeft', { count: 3 })).toBe('Pozostały 3 dni');
    expect(translate('pl', 'card.daysLeft', { count: 12 })).toBe('Pozostało 12 dni');
  });

  it('selects the English plural branch from the count', () => {
    // given / when / then
    expect(translate('en-US', 'card.daysLeft', { count: 1 })).toBe('1 day left');
    expect(translate('en-US', 'card.daysLeft', { count: 9 })).toBe('9 days left');
  });

  it('recognizes known and unknown message keys', () => {
    // given / when / then
    expect(isMessageKey('card.archive')).toBe(true);
    expect(isMessageKey('card.doesNotExist')).toBe(false);
  });
});

describe('locale detection', () => {
  it('maps browser language tags onto the supported locales', () => {
    // given / when / then
    expect(detectLocale('pl')).toBe('pl');
    expect(detectLocale('pl-PL')).toBe('pl');
    expect(detectLocale('en-GB')).toBe('en-GB');
    expect(detectLocale('en')).toBe('en-US');
    expect(detectLocale('en-AU')).toBe('en-US');
    expect(detectLocale('de-DE')).toBe('en-US');
    expect(detectLocale(null)).toBe('en-US');
  });

  it('renders every locale name in its own language', () => {
    // given / when / then
    expect(localeLabel('pl')).toBe('Polski');
    expect(localeLabel('en-GB')).toBe('English (United Kingdom)');
  });
});

describe('english variants', () => {
  it('uses British spelling only where intended', () => {
    // given / when / then
    expect(enGB['card.changeColor']).toBe('Change colour');
    expect(enUS['card.changeColor']).toBe('Change color');
    expect(enGB['search.colors']).toBe('Colours');
    expect(enUS['search.colors']).toBe('Colors');
    // The palette's names are the original's own (Chalk, not Gray/Grey), the same in both.
    expect(enGB['color.gray']).toBe(enUS['color.gray']);
  });
});
