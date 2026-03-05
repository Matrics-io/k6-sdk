/**
 * Mock for k6 runtime (check, fail) - used when running HTTP client tests in Node.
 */

/**
 * Run checks against a response; returns true if all pass.
 * @param {Object} response - HTTP response object
 * @param {Object} checks - Map of check name to predicate (r) => boolean
 * @returns {boolean}
 */
export function check(response, checks) {
  for (const [name, fn] of Object.entries(checks)) {
    if (!fn(response)) return false;
  }
  return true;
}

/**
 * Fail the current iteration (throws in Node).
 * @param {string} message - Failure message
 */
export function fail(message) {
  throw new Error(message);
}
