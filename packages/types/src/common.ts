import { z } from 'zod';

/** Canonical id type. We use UUIDs everywhere so ids can be generated client-side (offline). */
export const IdSchema = z.string().uuid();
export type Id = z.infer<typeof IdSchema>;

export const IsoDateTimeSchema = z.string().datetime({ offset: true });

/** A hex colour like #1E90FF. Teams carry a primary/secondary pair. */
export const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex colour, e.g. #1E90FF');

export const TeamColorsSchema = z.object({
  primary: HexColorSchema,
  secondary: HexColorSchema.optional(),
});
export type TeamColors = z.infer<typeof TeamColorsSchema>;

/** Jersey numbers are strings so "00" and "007" survive round-trips. */
export const JerseyNumberSchema = z
  .string()
  .regex(/^\d{1,3}$/, 'Jersey number must be 1–3 digits')
  .nullable();

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
