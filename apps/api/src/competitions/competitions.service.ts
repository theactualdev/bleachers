import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCompetitionInput, UpdateCompetitionInput } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from '../orgs/membership.service.js';
import { toCompetition } from '../common/serialize.js';

@Injectable()
export class CompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  /** The competition's org, for authorising by id alone. */
  private async orgOf(id: string): Promise<string> {
    const c = await this.prisma.competition.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!c) throw new NotFoundException('Competition not found');
    return c.organizationId;
  }

  async list(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'VIEWER');
    const rows = await this.prisma.competition.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toCompetition);
  }

  async get(userId: string, id: string) {
    await this.members.assertMember(userId, await this.orgOf(id), 'VIEWER');
    const c = await this.prisma.competition.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Competition not found');
    return toCompetition(c);
  }

  async create(userId: string, orgId: string, input: CreateCompetitionInput) {
    await this.members.assertMember(userId, orgId, 'SCORER');
    const c = await this.prisma.competition.create({
      data: {
        name: input.name,
        sport: input.sport,
        format: input.format,
        createdById: userId,
        organizationId: orgId,
      },
    });
    return toCompetition(c);
  }

  async update(userId: string, id: string, input: UpdateCompetitionInput) {
    await this.members.assertMember(userId, await this.orgOf(id), 'SCORER');
    const c = await this.prisma.competition.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.format !== undefined ? { format: input.format } : {}),
      },
    });
    return toCompetition(c);
  }
}
