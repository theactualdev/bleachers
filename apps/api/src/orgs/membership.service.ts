import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrgRole } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';

const ROLE_ORDER: Record<OrgRole, number> = { VIEWER: 0, SCORER: 1, OWNER: 2 };

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async roleOf(userId: string, orgId: string): Promise<OrgRole | null> {
    const m = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { role: true },
    });
    return (m?.role as OrgRole) ?? null;
  }

  /** Throws 404 if the org doesn't exist, 403 if the user's role is below `minRole`. */
  async assertMember(userId: string, orgId: string, minRole: OrgRole): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const role = await this.roleOf(userId, orgId);
    if (!role || ROLE_ORDER[role] < ROLE_ORDER[minRole]) {
      throw new ForbiddenException('You do not have permission in this organization');
    }
  }
}
