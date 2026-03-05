/**
 * Mock for k6/metrics (Trend, Rate, Counter) - used when running HTTP client tests in Node.
 * No-op .add() so trackMetrics() and createHttpMetrics() do not throw.
 */

function noOpAdd() {}

function createMetric() {
  return { add: noOpAdd };
}

export function Trend() {
  return createMetric();
}

export function Rate() {
  return createMetric();
}

export function Counter() {
  return createMetric();
}
