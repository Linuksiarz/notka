import { describe, expect, it } from 'vitest';
import { choicesFor } from './labelSuggestion';

const labels = [
  { id: 1, name: 'Work' },
  { id: 2, name: 'Homework' },
  { id: 3, name: 'Travel' },
  { id: 4, name: 'Wakacje' }
];

describe('choicesFor', () => {
  it('offers the labels containing what was typed, those starting with it first, and a new one', () => {
    // given: the reader typed "#wo"

    // when
    const choices = choicesFor('wo', labels);

    // then
    expect(choices).toEqual([
      { kind: 'label', label: { id: 1, name: 'Work' } },
      { kind: 'label', label: { id: 2, name: 'Homework' } },
      { kind: 'create', name: 'wo' }
    ]);
  });

  it('offers no new label when one is called exactly that, whatever its case', () => {
    // given: the reader typed "#travel"

    // when
    const choices = choicesFor('travel', labels);

    // then
    expect(choices).toEqual([{ kind: 'label', label: { id: 3, name: 'Travel' } }]);
  });

  it('offers every label, and nothing to create, for a bare "#"', () => {
    // given: nothing typed after the "#"

    // when
    const choices = choicesFor('', labels);

    // then
    expect(choices.map((choice) => (choice.kind === 'label' ? choice.label.name : choice.name))).toEqual([
      'Homework',
      'Travel',
      'Wakacje',
      'Work'
    ]);
  });
});
