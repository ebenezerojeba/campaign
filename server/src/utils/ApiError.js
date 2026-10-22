export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) { return new ApiError(400, 'BAD_REQUEST', message, details); }
  static unauthorized(message = 'Sign in to continue') { return new ApiError(401, 'UNAUTHORIZED', message); }
  static forbidden(message = 'You do not have permission to do this') { return new ApiError(403, 'FORBIDDEN', message); }
  static notFound(message = 'Not found') { return new ApiError(404, 'NOT_FOUND', message); }
  static conflict(message, code = 'CONFLICT') { return new ApiError(409, code, message); }
  static unavailable(message, code = 'SERVICE_UNAVAILABLE') { return new ApiError(503, code, message); }
}

// Consistent success envelope: { ok: true, data, meta? }
export const send = (res, data, meta, status = 200) =>
  res.status(status).json(meta ? { ok: true, data, meta } : { ok: true, data });
