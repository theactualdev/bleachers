import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePlayerInput, UpdatePlayerInput } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { toPlayer } from '../common/serialize.js';

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const players = await this.prisma.player.findMany({
      where: { createdById: userId },
      orderBy: { name: 'asc' },
    });
    return players.map(toPlayer);
  }

  async get(id: string) {
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) throw new NotFoundException('Player not found');
    return toPlayer(player);
  }

  async create(userId: string, input: CreatePlayerInput) {
    const player = await this.prisma.player.create({
      data: {
        name: input.name,
        dateOfBirth: input.dateOfBirth ?? null,
        photo: input.photo ?? null,
        createdById: userId,
      },
    });
    return toPlayer(player);
  }

  async update(id: string, input: UpdatePlayerInput) {
    await this.get(id);
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
