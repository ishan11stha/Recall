export interface ClozeWordToken {
  raw: string;
  clean: string;
  isWord: boolean;
  isBlank: boolean;
  priority: number;
}

export interface ClozeCardDraft {
  id: string;
  tokens: ClozeWordToken[];
}

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'also', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between',
  'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'even', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he',
  'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'however', 'i', 'if',
  'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'like', 'make', 'many', 'may', 'me',
  'might', 'more', 'most', 'much', 'must', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'out', 'over', 'own', 'same',
  'she', 'should', 'since', 'so', 'some', 'still', 'such', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'well', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'within', 'without', 'would', 'you', 'your', 'yours',
]);

function cleanMarkdownForProse(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*>\s*(\[![a-zA-Z]+\]\s*)?/gm, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

/**
 * Splits a paragraph or note into individual sentences so every sentence
 * (2+ words) produces a fill-in-the-blank card.
 */
export function splitIntoSentences(paragraph: string): string[] {
  const cleaned = cleanMarkdownForProse(paragraph);
  if (!cleaned) return [];

  return cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 2);
}

/**
 * Tokenizes a sentence and automatically marks up to `blanksPerSentence`
 * high-value keywords as blanks. Prioritizes explicitly emphasized terms
 * (**bold**, ==highlight==, [[wikilink]], {{cloze}}), numbers, capitalized terms,
 * and longer non-stopword content words.
 */
export function tokenizeSentenceWithAutoBlanks(
  sentence: string,
  blanksPerSentence: 1 | 2 = 1
): ClozeWordToken[] {
  const rawParts = sentence.split(/\s+/).filter(Boolean);

  const tokens: ClozeWordToken[] = rawParts.map((part, index) => {
    const isExplicit =
      (part.includes('{{') && part.includes('}}')) ||
      (part.includes('**') && part.length > 4) ||
      (part.includes('==') && part.length > 4) ||
      (part.includes('[[') && part.includes(']]'));

    const displayRaw = part
      .replace(/\{\{|\}\}|\*\*|==|\[\[|\]\]/g, '')
      .replace(/~~|`/g, '');
    const clean = displayRaw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9%]+$/g, '');
    const lower = clean.toLowerCase();
    const isWord = clean.length >= 2 && /[a-zA-Z0-9]/.test(clean);

    let priority = 0;
    if (isWord && !STOPWORDS.has(lower)) {
      priority = clean.length;
      if (isExplicit) priority += 50;
      if (/\d/.test(clean)) priority += 12;
      if (index > 0 && /^[A-Z]/.test(clean)) priority += 8;
      if (clean.length >= 7) priority += 4;
    } else if (isExplicit && isWord) {
      priority = 50;
    }

    return {
      raw: displayRaw,
      clean,
      isWord,
      isBlank: false,
      priority,
    };
  });

  // Pick top-scoring non-adjacent indices
  const ranked = tokens
    .map((t, idx) => ({ idx, priority: t.priority }))
    .filter((x) => x.priority > 0)
    .sort((a, b) => b.priority - a.priority);

  let chosen = 0;
  const chosenIndices = new Set<number>();
  for (const cand of ranked) {
    if (chosen >= blanksPerSentence) break;
    // Prefer spacing blanks apart when choosing 2 blanks
    if (chosenIndices.has(cand.idx - 1) || chosenIndices.has(cand.idx + 1)) {
      continue;
    }
    tokens[cand.idx].isBlank = true;
    chosenIndices.add(cand.idx);
    chosen += 1;
  }

  // Fallback: guarantee at least one blank per sentence (longest word)
  if (chosen === 0 && ranked.length > 0) {
    tokens[ranked[0].idx].isBlank = true;
  } else if (chosen === 0) {
    let bestIdx = -1;
    let bestLen = 0;
    tokens.forEach((t, i) => {
      if (t.isWord && t.clean.length > bestLen) {
        bestLen = t.clean.length;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) tokens[bestIdx].isBlank = true;
  }

  return tokens;
}

export function generateClozeDraftsFromParagraph(
  paragraph: string,
  blanksPerSentence: 1 | 2 = 1
): ClozeCardDraft[] {
  const sentences = splitIntoSentences(paragraph);
  return sentences.map((sentence, idx) => ({
    id: `draft-${idx}-${sentence.slice(0, 12)}`,
    tokens: tokenizeSentenceWithAutoBlanks(sentence, blanksPerSentence),
  }));
}

export function toggleDraftTokenBlank(
  draft: ClozeCardDraft,
  tokenIndex: number
): ClozeCardDraft {
  return {
    ...draft,
    tokens: draft.tokens.map((tok, i) =>
      i === tokenIndex && tok.isWord ? { ...tok, isBlank: !tok.isBlank } : tok
    ),
  };
}

/**
 * Converts a ClozeCardDraft into `{ front, back }` suitable for saving to SQLite.
 * Preserves leading/trailing punctuation outside `{{...}}`.
 */
export function serializeClozeDraft(
  draft: ClozeCardDraft
): { front: string; back: string } | null {
  const answers: string[] = [];
  const frontParts = draft.tokens.map((tok) => {
    if (!tok.isBlank || !tok.clean) return tok.raw;
    answers.push(tok.clean);
    const escaped = tok.clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return tok.raw.replace(new RegExp(escaped), `{{${tok.clean}}}`);
  });

  if (answers.length === 0) return null;
  return {
    front: frontParts.join(' '),
    back: answers.join(' · '),
  };
}
