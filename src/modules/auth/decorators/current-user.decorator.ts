import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: unknown }>();
    return request.user;
  },
);
