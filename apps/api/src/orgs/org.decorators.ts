import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The active organization id from the X-Organization-Id header (400 if absent/malformed). */
export const CurrentOrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const id = request.headers['x-organization-id'];
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      throw new BadRequestException('X-Organization-Id header is required');
    }
    return id;
  },
);
