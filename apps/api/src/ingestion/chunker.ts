/**
 * Markdown-aware recursive chunker.
 *
 * 1. Headings split the document into sections; chunks never cross a heading, because the author already
 *    drew a topical boundary there. Each chunk remembers its heading path ("Setup › Database").
 * 2. A section splits into blocks: paragraphs, with fenced code kept whole.
 * 3. A block larger than the budget falls back to sentences (prose) or lines (code), then to word windows.
 * 4. Units are packed greedily up to `maxTokens`, repeating a small tail of the previous chunk (overlap).
 *
 * What gets embedded is "title › heading path" + the chunk text, so a chunk that says "it supports X"
 * still carries what "it" is.
 */

export interface ChunkerOptions {
  /** Upper bound per chunk, in estimated tokens. */
  maxTokens: number;
  /** Budget for text repeated from the end of the previous chunk within the same section. */
  overlapTokens: number;
}

/**
 * 350 estimated tokens: the smallest-context embedding models we support (BGE, E5, LFM2.5-Embedding:
 * 512 tokens) must fit the chunk plus its title/heading header, with margin for code and non-English
 * text, where the 4-characters-per-token estimate is optimistic. ~15% overlap keeps a fact that
 * straddles a boundary whole in at least one chunk.
 */
export const DEFAULT_CHUNKER_OPTIONS: ChunkerOptions = { maxTokens: 350, overlapTokens: 50 };

export interface Chunk {
  index: number;
  /** Heading path of the section, or null for text before the first heading. */
  heading: string | null;
  /** The chunk as written in the document; shown as the citation snippet. */
  content: string;
  /** What is sent to the embedding model: title and heading path, then the content. */
  embeddingText: string;
  tokenCount: number;
}

/** The smallest piece the packer never splits, plus the separator that joins it to the previous unit. */
export interface Unit {
  text: string;
  tokens: number;
  separator: string;
}

const CHARS_PER_TOKEN = 4;

/**
 * Tokenizer-free estimate. Every provider tokenizes differently and we don't know which model is behind
 * the configured base URL, so a conservative heuristic beats a precise-but-wrong tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function chunkDocument(
  doc: { title: string; content: string },
  options: ChunkerOptions = DEFAULT_CHUNKER_OPTIONS,
): Chunk[] {
  const chunks: Omit<Chunk, 'index'>[] = [];
  for (const section of splitSections(doc.content)) {
    const units = section.blocks.flatMap((block) => splitBlock(block, options.maxTokens));
    for (const content of packUnits(units, options)) {
      const header = section.heading ? `${doc.title} › ${section.heading}` : doc.title;
      const embeddingText = `${header}\n\n${content}`;
      chunks.push({
        heading: section.heading,
        content,
        embeddingText,
        tokenCount: estimateTokens(embeddingText),
      });
    }
  }
  return chunks.map((chunk, index) => ({ index, ...chunk }));
}

/**
 * Picks the tail of the chunk that was just emitted, to repeat at the start of the next chunk.
 *
 * @param units the units of the emitted chunk, in document order
 * @param budget the maximum total `tokens` of the returned units
 * @returns the units to carry over, in document order
 */
export function takeOverlap(units: Unit[], budget: number): Unit[] {
  const overlap: Unit[] = [];
  let tokens = 0;
  // Walk back from the end and stop at the first unit that doesn't fit: the overlap stays one
  // contiguous tail, and a unit is never cut, so the next chunk never starts mid-sentence.
  for (const unit of units.toReversed()) {
    if (tokens + unit.tokens > budget) break;
    tokens += unit.tokens;
    overlap.unshift(unit);
  }
  return overlap;
}

function packUnits(units: Unit[], options: ChunkerOptions): string[] {
  const chunks: string[] = [];
  let current: Unit[] = [];
  let tokens = 0;

  for (const unit of units) {
    if (current.length > 0 && tokens + unit.tokens > options.maxTokens) {
      chunks.push(joinUnits(current));
      current = takeOverlap(current, options.overlapTokens);
      tokens = current.reduce((sum, u) => sum + u.tokens, 0);
      // A large next unit wins over the overlap: the budget is a hard limit.
      if (tokens + unit.tokens > options.maxTokens) {
        current = [];
        tokens = 0;
      }
    }
    current.push(unit);
    tokens += unit.tokens;
  }
  if (current.length > 0) chunks.push(joinUnits(current));
  return chunks;
}

function joinUnits(units: Unit[]): string {
  return units.map((unit, i) => (i === 0 ? unit.text : unit.separator + unit.text)).join('');
}

interface Block {
  text: string;
  kind: 'prose' | 'code';
}

interface Section {
  heading: string | null;
  blocks: Block[];
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const headingPath: string[] = [];
  let section: Section = { heading: null, blocks: [] };
  let paragraph: string[] = [];
  let fence: string[] | null = null;

  const flushParagraph = () => {
    const text = paragraph.join('\n').trim();
    if (text) section.blocks.push({ text, kind: 'prose' });
    paragraph = [];
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      fence.push(line);
      if (FENCE.test(line)) {
        section.blocks.push({ text: fence.join('\n'), kind: 'code' });
        fence = null;
      }
      continue;
    }
    if (FENCE.test(line)) {
      flushParagraph();
      fence = [line];
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading?.[1] && heading[2]) {
      flushParagraph();
      if (section.blocks.length > 0) sections.push(section);
      const level = heading[1].length;
      // A level-2 heading ends any deeper subsection; sparse slots (skipped levels) are filtered out.
      headingPath.length = level - 1;
      headingPath[level - 1] = heading[2];
      section = { heading: headingPath.filter(Boolean).join(' › '), blocks: [] };
      continue;
    }
    if (line.trim() === '') flushParagraph();
    else paragraph.push(line);
  }

  if (fence) section.blocks.push({ text: fence.join('\n'), kind: 'code' });
  flushParagraph();
  if (section.blocks.length > 0) sections.push(section);
  return sections;
}

// Sentence ends, or the start of a list item on the next line.
const PROSE_BREAK = /(?<=[.!?…])\s+|\n(?=\s*(?:[-*+]|\d+[.)])\s)/;

function splitBlock(block: Block, maxTokens: number): Unit[] {
  const tokens = estimateTokens(block.text);
  if (tokens <= maxTokens) return [{ text: block.text, tokens, separator: '\n\n' }];

  const [pieces, innerSeparator] =
    block.kind === 'code' ? [block.text.split('\n'), '\n'] : [block.text.split(PROSE_BREAK), ' '];

  return pieces
    .filter((piece) => piece.trim() !== '')
    .flatMap((piece) => hardWrap(piece, maxTokens))
    .map((text, i) => ({
      text,
      tokens: estimateTokens(text),
      separator: i === 0 ? '\n\n' : innerSeparator,
    }));
}

/** Last resort for a single sentence or line over budget: word windows, then raw slices of huge "words". */
function hardWrap(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return [text];

  const windows: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    for (const piece of word.match(new RegExp(`.{1,${maxChars}}`, 'gs')) ?? []) {
      if (current && current.length + 1 + piece.length > maxChars) {
        windows.push(current);
        current = piece;
      } else {
        current = current ? `${current} ${piece}` : piece;
      }
    }
  }
  if (current) windows.push(current);
  return windows;
}
