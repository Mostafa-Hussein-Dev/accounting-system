import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Paginated } from '../types/paginated.type';

const HTTP_NO_CONTENT = 204;

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((result: unknown) => {
        if (response.statusCode === HTTP_NO_CONTENT) {
          return undefined;
        }
        if (result instanceof Paginated) {
          return { data: result.data, meta: result.meta };
        }
        return { data: result ?? null, meta: null };
      }),
    );
  }
}
