import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { CreateOrgInput, OrgRole, UpdateOrgInput } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from './membership.service.js';
import { makeSlug } from './slug.js';

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  async create(userId: string, input: CreateOrgInput) {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.name, slug: makeSlug(input.name), createdById: userId },
      });
      await tx.orgMembership.create({ data: { orgId: org.id, userId, role: 'OWNER' } });
      return org;
    });
  }

  async update(userId: string, orgId: string, input: UpdateOrgInput) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    return this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.logo !== undefined ? { logo: input.logo } : {}),
        ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      },
    });
  }

  async listMembers(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'VIEWER');
    return this.prisma.orgMembership.findMany({
      where: { orgId },
      include: { user: { select: { id: true, email: true, name: true, image: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertNotLastOwner(orgId: string, targetUserId: string): Promise<void> {
    const target = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Membership not found');
    if (target.role !== 'OWNER') return;
    const owners = await this.prisma.orgMembership.count({ where: { orgId, role: 'OWNER' } });
    if (owners <= 1) throw new BadRequestException('An organization must keep at least one owner');
  }

  async changeRole(userId: string, orgId: string, targetUserId: string, role: OrgRole) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    if (role !== 'OWNER') await this.assertNotLastOwner(orgId, targetUserId);
    return this.prisma.orgMembership.update({
      where: { orgId_userId: { orgId, userId: targetUserId } },
      data: { role },
    });
  }

  async removeMember(userId: string, orgId: string, targetUserId: string) {
    // Owners can remove anyone; anyone can remove themselves (leave).
    if (userId !== targetUserId) await this.members.assertMember(userId, orgId, 'OWNER');
    else await this.members.assertMember(userId, orgId, 'VIEWER');
    await this.assertNotLastOwner(orgId, targetUserId);
    await this.prisma.orgMembership.delete({
      where: { orgId_userId: { orgId, userId: targetUserId } },
    });
    return { removed: true };
  }

  async createInvite(userId: string, orgId: string, role: OrgRole) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    const invite = await this.prisma.orgInvite.create({
      data: {
        orgId,
        role,
        token: randomBytes(18).toString('base64url'),
        createdById: userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return invite;
  }

  async listInvites(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    return this.prisma.orgInvite.findMany({
      where: { orgId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(userId: string, orgId: string, inviteId: string) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    await this.prisma.orgInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  private async validInvite(token: string) {
    const invite = await this.prisma.orgInvite.findUnique({
      where: { token },
      include: { org: { select: { id: true, name: true } } },
    });
    if (!invite || invite.revokedAt || invite.expiresAt < new Date()) return null;
    return invite;
  }

  /** Public preview for the join page. */
  async invitePreview(token: string) {
    const invite = await this.validInvite(token);
    if (!invite) return { valid: false as const };
    return { valid: true as const, orgName: invite.org.name, role: invite.role };
  }

  async acceptInvite(userId: string, token: string) {
    const invite = await this.validInvite(token);
    if (!invite) throw new ForbiddenException('This invite link is no longer valid');
    const existing = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId: invite.orgId, userId } },
    });
    if (existing) return { orgId: invite.orgId, role: existing.role, alreadyMember: true };
    const m = await this.prisma.orgMembership.create({
      data: { orgId: invite.orgId, userId, role: invite.role },
    });
    return { orgId: m.orgId, role: m.role, alreadyMember: false };
  }

  /** Public org profile: 404 unless isPublic. */
  async publicProfile(slug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org || !org.isPublic) throw new NotFoundException('Organization not found');
    const teams = await this.prisma.team.findMany({
      where: { organizationId: org.id },
      orderBy: { name: 'asc' },
    });
    const recentMatches = await this.prisma.match.findMany({
      where: { organizationId: org.id, status: { in: ['LIVE', 'COMPLETED'] } },
      orderBy: { scheduledAt: 'desc' },
      take: 20,
      include: { homeTeam: true, awayTeam: true },
    });
    return { org: { name: org.name, slug: org.slug, logo: org.logo }, teams, recentMatches };
  }
}
