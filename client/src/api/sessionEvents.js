const listeners = new Set();

export function subscribeToSessionInvalidation(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySessionInvalidated(event) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A UI subscriber must not prevent the HTTP layer from rejecting the original request.
    }
  }
}
