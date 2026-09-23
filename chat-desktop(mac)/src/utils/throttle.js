/**
 * Throttle utility — limits function execution to once per delay period.
 * Avoids adding lodash as a dependency.
 *
 * @param {Function} fn - Function to throttle
 * @param {number} delay - Minimum time between calls in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(fn, delay) {
  let lastCall = 0;
  let timeoutId = null;

  const throttled = (...args) => {
    const now = Date.now();
    const elapsed = now - lastCall;

    if (elapsed >= delay) {
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      // Schedule a trailing call so the last invocation always fires
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, delay - elapsed);
    }
  };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}
