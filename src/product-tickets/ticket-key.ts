/** Ticket key shown to people, e.g. formatTicketKey('cf', 12) → "CF-12". */
export function formatTicketKey(code: string, number: number): string {
  if (!code || !code.trim()) throw new Error('Product code is required for a ticket key.');
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('Ticket number must be a positive integer.');
  }
  return `${code.trim().toUpperCase()}-${number}`;
}
