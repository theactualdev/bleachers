import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdatePlayerInput } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from '../orgs/membership.service.js';
import { toPlayer } from '../common/serialize.js';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  async list(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'VIEWER');
    const players = await this.prisma.player.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
    return players.map(toPlayer);
  }

  async get(userId: string, id: string) {
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) throw new NotFoundException('Player not found');
    await this.members.assertMember(userId, player.organizationId, 'VIEWER');
    return toPlayer(player);
  }

  async update(userId: string, id: string, input: UpdatePlayerInput) {
    const existing = await this.prisma.player.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Player not found');
    await this.members.assertMember(userId, existing.organizationId, 'SCORER');
    const player = await this.prisma.player.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
        ...(input.photo !== undefined ? { photo: input.photo } : {}),
      },
    });
    return toPlayer(player);
  }
}
