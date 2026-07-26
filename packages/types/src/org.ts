import { z } from 'zod';
import { IdSchema } from './common.js';

export const OrgRoleSchema = z.enum(['OWNER', 'SCORER', 'VIEWER']);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const OrganizationSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60),
  logo: z.string().url().nullable().or(z.string().startsWith('data:').nullable()),
  isPublic: z.boolean(),
  isPersonal: z.boolean(),
  createdById: IdSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Organization = z.infer<typeof OrganizationSchema>;

/** Compact membership row embedded in GET /api/me. */
export const MembershipInfoSchema = z.object({
  orgId: IdSchema,
  orgName: z.string(),
  slug: z.string(),
  role: OrgRoleSchema,
  isPersonal: z.boolean(),
});
export type MembershipInfo = z.infer<typeof MembershipInfoSchema>;

export const CreateOrgSchema = z.object({ name: z.string().min(1).max(120) });
export type CreateOrgInput = z.infer<typeof CreateOrgSchema>;

export const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  logo: z.string().url().nullable().or(z.string().startsWith('data:').nullable()).optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>;

export const CreateInviteSchema = z.object({ role: OrgRoleSchema });
export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;

export const UpdateMemberRoleSchema = z.object({ role: OrgRoleSchema });
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;
