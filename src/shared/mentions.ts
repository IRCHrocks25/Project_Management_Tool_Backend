/**
 * Mentions are stored inline in text as `@Name[[USER_ID:<uuid>]]`, the format the
 * frontend mention inputs produce. Returns the unique user IDs in order of appearance.
 */
export function extractMentionIds(text: string | null | undefined): string[] {
  if (!text || typeof text !== 'string') return [];
  const regex = /\[\[USER_ID:([a-fA-F0-9-]{36})\]\]/g;
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m[1] && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** Plain-text version of a message for notification titles and emails. */
export function stripMentionMarkup(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\[\[USER_ID:[a-fA-F0-9-]{36}\]\]/g, '');
}
