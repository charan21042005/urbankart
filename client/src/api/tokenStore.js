// The backend issues bearer tokens but has no refresh/current-user endpoint.
// Keep the token in memory so a page refresh starts unauthenticated.
let accessToken = null;
let revision = 0;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = typeof token === 'string' && token.length ? token : null;
  revision += 1;
  return revision;
}

export function clearAccessToken(expectedRevision) {
  if (expectedRevision !== undefined && revision !== expectedRevision) return false;
  accessToken = null;
  revision += 1;
  return true;
}

export function getTokenRevision() {
  return revision;
}
