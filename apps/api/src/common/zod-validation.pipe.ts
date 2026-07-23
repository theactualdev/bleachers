import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';

/**
 * Validates and parses input against a shared Zod schema from `@bleachers/types`.
 * One contract, enforced identically on the client and the server.
 *
 * Usage: `@Body(new ZodValidationPipe(CreatePlayerSchema)) body: CreatePlayerInput`
 */
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): ZodInfer<T> {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      throw err;
    }
  }
}
