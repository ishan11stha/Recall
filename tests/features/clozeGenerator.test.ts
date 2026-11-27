import {
  generateClozeDraftsFromParagraph,
  serializeClozeDraft,
  splitIntoSentences,
  toggleDraftTokenBlank,
} from '../../src/features/flashcards/clozeGenerator';

describe('Paragraph to Fill-in-the-Blank (Cloze) Flashcard Generator', () => {
  it('splits a paragraph into sentences and auto-blanks meaningful terms', () => {
    const paragraph =
      'Photosynthesis converts sunlight into chemical energy inside chloroplasts. ' +
      'The **mitochondria** produces ATP for cellular respiration. ' +
      'Atoms form molecules.';

    const sentences = splitIntoSentences(paragraph);
    expect(sentences.length).toBe(3);

    const drafts = generateClozeDraftsFromParagraph(paragraph, 1);
    expect(drafts.length).toBe(3);

    const card1 = serializeClozeDraft(drafts[0]);
    expect(card1).not.toBeNull();
    expect(card1?.front).toMatch(/\{\{[^}]+\}\}/);

    // Explicit **bold** term should be prioritized as the blank
    const card2 = serializeClozeDraft(drafts[1]);
    expect(card2?.front).toContain('{{mitochondria}}');
    expect(card2?.back).toBe('mitochondria');

    // Short 3-word sentence also gets a blank
    const card3 = serializeClozeDraft(drafts[2]);
    expect(card3).not.toBeNull();
    expect(card3?.front).toMatch(/\{\{[^}]+\}\}/);
  });

  it('allows toggling individual word blanks interactively', () => {
    const [draft] = generateClozeDraftsFromParagraph(
      'Inflation reduces the purchasing power of currency.',
      1
    );
    const currencyIdx = draft.tokens.findIndex((t) => t.clean === 'currency');
    expect(currencyIdx).toBeGreaterThan(-1);

    const toggled = toggleDraftTokenBlank(draft, currencyIdx);
    const serialized = serializeClozeDraft(toggled);
    expect(serialized?.front).toContain('{{currency}}.');
    expect(serialized?.back).toContain('currency');
  });
});
