/**
 * Lightweight HTML processing utilities.
 * Use these instead of cheerio.load() for simple HTML stripping in hot loops.
 */

/**
 * Strip HTML tags from a string using regex.
 * Much faster than cheerio.load() for simple text extraction.
 * 
 * @param html - HTML string to process
 * @returns Plain text with HTML tags removed
 */
export function stripHtmlTags(html: string): string {
  if (!html) return "";
  
  return html
    // Remove script and style tags with their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // Remove all HTML tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract text content from HTML, preserving paragraph breaks.
 * Converts common block elements to newlines.
 * 
 * @param html - HTML string to process
 * @returns Plain text with paragraph breaks preserved
 */
export function extractTextFromHtml(html: string): string {
  if (!html) return "";
  
  return html
    // Remove script and style tags with their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // Convert block elements to newlines
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    // Remove remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalize whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    // Trim each line
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join("\n")
    .trim();
}
