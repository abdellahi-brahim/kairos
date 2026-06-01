// Helpers for turning rich-text HTML (TipTap stores notes as HTML) into a safe,
// compact plain-text preview. We never render the HTML itself in list rows; we
// strip it to text so a snippet can be line-clamped under the title.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

// Decode the handful of named entities TipTap emits, plus numeric ones.
function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

// Strip HTML tags to plain text: drop script/style content, turn block-level
// boundaries into spaces so words do not run together, decode basic entities,
// and collapse runs of whitespace. Returns "" for empty/whitespace-only input.
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  const withoutScripts = html.replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " "
  );
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim();
}
