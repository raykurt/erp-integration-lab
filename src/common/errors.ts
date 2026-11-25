import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Business-rule error with a stable, machine-readable code.
 * Clients (and tests) assert on `code`, not on the human-readable message.
 */
export class BusinessError extends HttpException {
  constructor(status: HttpStatus, public readonly code: string, message: string) {
    super({ statusCode: status, code, message }, status);
  }
}
