/** Turns Firebase / network errors into something a human can act on. */
export function friendlyError(error: unknown, fallback = 'Something went wrong.'): string {
  const code: string | undefined = (error as any)?.code;
  const message: string | undefined = (error as any)?.message;

  switch (code) {
    case 'permission-denied':
      return "You don't have permission to do that.";
    case 'unavailable':
      return 'Could not reach the server. Check your connection and try again.';
    case 'resource-exhausted':
      return 'The database is busy (quota exceeded). Try again in a moment.';
    case 'invalid-argument':
      return 'The data was rejected — it may be too large (images are limited to ~1 MB each).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Wrong email or password.';
    case 'auth/email-already-in-use':
      return 'An account with that email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
  }
  if (message && message.length < 200 && !message.startsWith('{')) return message;
  return fallback;
}

export function logError(context: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[DnDocs] ${context}`, error);
}
