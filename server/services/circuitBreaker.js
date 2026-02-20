import logger from '../utils/logger.js';
import { CIRCUIT_BREAKER } from '../config/constants.js';

/**
 * Circuit Breaker implementation for FlowTask API calls.
 *
 * States:
 *   CLOSED  → normal operation, track failures
 *   OPEN    → reject all calls for cooldown period
 *   HALF_OPEN → allow single probe request to test recovery
 *
 * Thresholds (from constants):
 *   - Open after 5 consecutive failures or >50% failure rate in 60s
 *   - Cooldown: 30 seconds
 *   - Close after 2 consecutive successful probes
 */

const STATES = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = STATES.CLOSED;

    this.failureThreshold = options.failureThreshold || CIRCUIT_BREAKER.FAILURE_THRESHOLD;
    this.failureRateThreshold = options.failureRateThreshold || CIRCUIT_BREAKER.FAILURE_RATE_THRESHOLD;
    this.failureRateWindowMs = options.failureRateWindowMs || CIRCUIT_BREAKER.FAILURE_RATE_WINDOW_MS;
    this.cooldownMs = options.cooldownMs || CIRCUIT_BREAKER.COOLDOWN_MS;
    this.probeSuccessThreshold = options.probeSuccessThreshold || CIRCUIT_BREAKER.PROBE_SUCCESS_THRESHOLD;

    // Tracking
    this._consecutiveFailures = 0;
    this._recentCalls = []; // { timestamp: number, success: boolean }
    this._lastFailureTime = null;
    this._openedAt = null;
    this._probeSuccesses = 0;
  }

  /**
   * Execute a function through the circuit breaker.
   * @param {Function} fn - async function to execute
   * @returns {Promise<any>} Result of fn
   * @throws {Error} If circuit is open or fn fails
   */
  async execute(fn) {
    if (this.state === STATES.OPEN) {
      if (this._shouldAttemptReset()) {
        this._transitionTo(STATES.HALF_OPEN);
      } else {
        throw new CircuitOpenError(
          `Circuit breaker [${this.name}] is OPEN. Retry after cooldown.`,
        );
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  _onSuccess() {
    this._recordCall(true);
    this._consecutiveFailures = 0;

    if (this.state === STATES.HALF_OPEN) {
      this._probeSuccesses += 1;
      if (this._probeSuccesses >= this.probeSuccessThreshold) {
        this._transitionTo(STATES.CLOSED);
        this._probeSuccesses = 0;
      }
    }
  }

  _onFailure(error) {
    this._recordCall(false);
    this._consecutiveFailures += 1;
    this._lastFailureTime = Date.now();

    logger.warn(`Circuit breaker [${this.name}] failure`, {
      consecutiveFailures: this._consecutiveFailures,
      error: error.message,
      state: this.state,
    });

    if (this.state === STATES.HALF_OPEN) {
      // Probe failed — reopen
      this._transitionTo(STATES.OPEN);
      this._probeSuccesses = 0;
      return;
    }

    // Check thresholds
    if (this._consecutiveFailures >= this.failureThreshold) {
      this._transitionTo(STATES.OPEN);
      return;
    }

    const failureRate = this._getFailureRate();
    if (failureRate > this.failureRateThreshold) {
      this._transitionTo(STATES.OPEN);
    }
  }

  _recordCall(success) {
    const now = Date.now();
    this._recentCalls.push({ timestamp: now, success });

    // Prune calls outside the tracking window
    const cutoff = now - this.failureRateWindowMs;
    this._recentCalls = this._recentCalls.filter((c) => c.timestamp >= cutoff);
  }

  _getFailureRate() {
    if (this._recentCalls.length < 5) return 0; // Need minimum sample size
    const failures = this._recentCalls.filter((c) => !c.success).length;
    return failures / this._recentCalls.length;
  }

  _shouldAttemptReset() {
    return this._openedAt && (Date.now() - this._openedAt >= this.cooldownMs);
  }

  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;

    if (newState === STATES.OPEN) {
      this._openedAt = Date.now();
    }

    logger.info(`Circuit breaker [${this.name}] state change: ${oldState} → ${newState}`);
  }

  /**
   * Get circuit breaker health status.
   * @returns {object}
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      consecutiveFailures: this._consecutiveFailures,
      failureRate: this._getFailureRate(),
      recentCallCount: this._recentCalls.length,
      lastFailureTime: this._lastFailureTime,
      openedAt: this._openedAt,
    };
  }
}

class CircuitOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitOpenError';
    this.statusCode = 503;
    this.code = 'CIRCUIT_OPEN';
  }
}

export { CircuitBreaker, CircuitOpenError, STATES };
