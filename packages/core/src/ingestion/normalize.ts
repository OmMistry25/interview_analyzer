const UNICODE_QUOTES: Record<string, string> = {
  "\u2018": "'",  // left single
  "\u2019": "'",  // right single
  "\u201C": '"',  // left double
  "\u201D": '"',  // right double
  "\u2013": "-",  // en dash
  "\u2014": "-",  // em dash
};

const QUOTE_REGEX = new RegExp(Object.keys(UNICODE_QUOTES).join("|"), "g");

export function normalizeText(raw: string): string {
  let text = raw.trim();
  text = text.replace(/\s+/g, " ");
  text = text.replace(QUOTE_REGEX, (ch) => UNICODE_QUOTES[ch] ?? ch);
  return text;
}
