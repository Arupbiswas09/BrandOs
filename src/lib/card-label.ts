/** The longest card label the offer form allows. */
export const CARD_LABEL_MAX = 30;

/**
 * Where a positioning's first phrase ends: a full stop, comma, semicolon,
 * colon, ! or ? before a space (so "4.2x" and "10,000" stay whole), a dash
 * set off by spaces (an em dash with or without them), or a line break.
 */
const PHRASE_END = /[.,;:!?](?=\s|$)|\s*—\s*|\s[–-]\s|\n/;

/**
 * The line an offer card shows under the name: the card label when someone
 * wrote one, otherwise the first phrase of the positioning, cut on a word to
 * fit, otherwise nothing. Worked out on display, never saved.
 */
export function cardLabel(o: { short?: string | null; positioning?: string | null }): string {
  const typed = (o.short ?? "").trim();
  if (typed) return typed;
  const text = (o.positioning ?? "").trim();
  const m = PHRASE_END.exec(text);
  const phrase = (m ? text.slice(0, m.index) : text).replace(/\s+/g, " ").trim();
  if (phrase.length <= CARD_LABEL_MAX) return phrase;
  // Leave room for the ellipsis, and end on a whole word when there is one to end on.
  const room = phrase.slice(0, CARD_LABEL_MAX - 1);
  const space = phrase[CARD_LABEL_MAX - 1] === " " ? room.length : room.lastIndexOf(" ");
  const cut = space > 0 ? room.slice(0, space) : room;
  return cut.replace(/[\s,;:.—–-]+$/, "") + "…";
}
