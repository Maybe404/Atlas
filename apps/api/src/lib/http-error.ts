export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message: string, code = 'bad_request') {
  return new HttpError(400, code, message);
}

export function unauthorized(message = 'Please sign in first.') {
  return new HttpError(401, 'unauthorized', message);
}

export function forbidden(message = 'You do not have access to this resource.') {
  return new HttpError(403, 'forbidden', message);
}

export function notFound(message = 'Resource not found.') {
  return new HttpError(404, 'not_found', message);
}
