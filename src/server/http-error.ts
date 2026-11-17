export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  static notFound(what: string) {
    return new HttpError(404, 'not_found', `${what} not found`);
  }

  static conflict(message: string) {
    return new HttpError(409, 'conflict', message);
  }

  static badRequest(message: string) {
    return new HttpError(400, 'bad_request', message);
  }
}
