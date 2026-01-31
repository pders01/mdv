/**
 * Text transformation utilities
 * Handles subscript, superscript, and HTML entity decoding
 */

// =============================================================================
// Unicode Character Mappings
// =============================================================================

/**
 * Unicode subscript character mappings
 */
export const subscriptMap: Record<string, string> = {
  "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084",
  "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089",
  "+": "\u208A", "-": "\u208B", "=": "\u208C", "(": "\u208D", ")": "\u208E",
  "a": "\u2090", "e": "\u2091", "o": "\u2092", "x": "\u2093", "h": "\u2095",
  "k": "\u2096", "l": "\u2097", "m": "\u2098", "n": "\u2099", "p": "\u209A",
  "s": "\u209B", "t": "\u209C",
};

/**
 * Unicode superscript character mappings
 */
export const superscriptMap: Record<string, string> = {
  "0": "\u2070", "1": "\u00B9", "2": "\u00B2", "3": "\u00B3", "4": "\u2074",
  "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
  "+": "\u207A", "-": "\u207B", "=": "\u207C", "(": "\u207D", ")": "\u207E",
  "a": "\u1D43", "b": "\u1D47", "c": "\u1D9C", "d": "\u1D48", "e": "\u1D49",
  "f": "\u1DA0", "g": "\u1D4D", "h": "\u02B0", "i": "\u2071", "j": "\u02B2",
  "k": "\u1D4F", "l": "\u02E1", "m": "\u1D50", "n": "\u207F", "o": "\u1D52",
  "p": "\u1D56", "r": "\u02B3", "s": "\u02E2", "t": "\u1D57", "u": "\u1D58",
  "v": "\u1D5B", "w": "\u02B7", "x": "\u02E3", "y": "\u02B8", "z": "\u1DBB",
};

// =============================================================================
// Text Transformation Functions
// =============================================================================

/**
 * Convert text to subscript using Unicode characters
 */
export function toSubscript(text: string): string {
  return text.split("").map(c => subscriptMap[c] || c).join("");
}

/**
 * Convert text to superscript using Unicode characters
 */
export function toSuperscript(text: string): string {
  return text.split("").map(c => superscriptMap[c] || c).join("");
}

/**
 * Decode common HTML entities to their character equivalents
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
