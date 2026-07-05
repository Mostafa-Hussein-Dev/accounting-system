import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

type ErrorBody = {
  code: string;
  message: string;
  field: string | null;
};

const DEFAULT_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response
      .status(status)
      .json({ data: null, error: this.buildErrorBody(exception, status) });
  }

  private buildErrorBody(exception: unknown, status: number): ErrorBody {
    if (!(exception instanceof HttpException)) {
      return {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        field: null,
      };
    }

    const payload = exception.getResponse();
    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      const candidate = payload as Partial<ErrorBody>;
      return {
        code:
          typeof candidate.code === 'string'
            ? candidate.code
            : (DEFAULT_CODES[status] ?? 'ERROR'),
        message:
          typeof candidate.message === 'string'
            ? candidate.message
            : exception.message,
        field: typeof candidate.field === 'string' ? candidate.field : null,
      };
    }

    return {
      code: DEFAULT_CODES[status] ?? 'ERROR',
      message: typeof payload === 'string' ? payload : exception.message,
      field: null,
    };
  }
}
