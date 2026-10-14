// Small fetch wrapper. The session lives in an HttpOnly cookie, so there is no token to attach:
// the browser sends the cookie to our own origin by itself.

export class ApiError extends Error {
  constructor(status, code, body = {}) {
    super(code);
    this.status = status;
    this.code = code; // "seat_taken", "invalid_credentials"... translated with t(`error.${code}`)
    this.body = body;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'internal_error', data);
  return data;
}
