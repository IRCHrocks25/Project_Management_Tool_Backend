/**
 * Request-path logging that is silent outside development.
 *
 * console.log is synchronous and blocks the event loop, so logging on endpoints
 * that run per project or per notification is a real cost under load. Errors are
 * still reported through console.error and are unaffected by this.
 */
export function debugLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
}
