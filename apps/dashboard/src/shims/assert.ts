// Browser shim for Node's `assert`, which @kepler.gl/utils imports.
// Vite externalizes the builtin, leaving an empty module; this restores a
// working `assert(value, message)` so kepler's runtime checks don't crash.
export default function assert(value: unknown, message?: string): void {
  if (!value) throw new Error(message ?? 'Assertion failed');
}
