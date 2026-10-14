// Errors the API is allowed to show. Anything else becomes a generic 500 and is only logged,
// so internal details (SQL, stack traces, file paths) never reach the browser.

export class AppError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code; // short, stable, translated by the frontend: "seat_taken", "not_found"...
  }
}

export function notFound(req, res) {
  res.status(404).json({ error: 'not_found' });
}

// Express 5 forwards errors from async handlers here automatically (no asyncHandler wrapper).
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code });
  }
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(err.status ?? 400).json({ error: 'bad_request' });
  }
  console.error('[api]', req.method, req.path, err);
  return res.status(500).json({ error: 'internal_error' });
}
