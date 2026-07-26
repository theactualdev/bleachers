import { Controller, Get } from '@nestjs/common';
import type { MembershipInfo } from '@bleachers/types';
import { CurrentUser } from './auth.decorators.js';
import type { AuthUser } from './auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller()
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  /** The authenticated user plus their org memberships (drives the org switcher). */
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<AuthUser & { memberships: MembershipInfo[] }> {
    const rows = await this.prisma.orgMembership.findMany({
      where: { userId: user.id },
      include: { org: { select: { id: true, name: true, slug: true, isPersonal: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...user,
      memberships: rows.map((m) => ({
        orgId: m.org.id,
        orgName: m.org.name,
        slug: m.org.slug,
        role: m.role as MembershipInfo['role'],
        isPersonal: m.org.isPersonal,
      })),
    };
  }
}
