import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrgsService } from '../src/orgs/orgs.service';
import { MembershipService } from '../src/orgs/membership.service';
import { createTestUser, deleteTestUser, getPersonalOrg } from './helpers/auth';

describe('Organizations (integration)', () => {
  const prisma = new PrismaService();
  const members = new MembershipService(prisma);
  const orgs = new OrgsService(prisma, members);

  let ownerId = '';
  let joinerId = '';
  let orgId = '';

  beforeAll(async () => {
    await prisma.$connect();
    ownerId = await createTestUser();
    joinerId = await createTestUser();
    const org = await orgs.create(ownerId, { name: 'Test League' });
    orgId = org.id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
    await deleteTestUser(ownerId);
    await deleteTestUser(joinerId);
  });

  it('signup trigger provisioned a personal org for each new user', async () => {
    const personal = await getPersonalOrg(ownerId);
    expect(personal).toBeTruthy();
    const role = await members.roleOf(ownerId, personal);
    expect(role).toBe('OWNER');
  });

  it('non-members are rejected', async () => {
    await expect(members.assertMember(joinerId, orgId, 'VIEWER')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('invite accept creates membership with the invite role, idempotently', async () => {
    const invite = await orgs.createInvite(ownerId, orgId, 'SCORER');
    const first = await orgs.acceptInvite(joinerId, invite.token);
    expect(first).toMatchObject({ orgId, role: 'SCORER', alreadyMember: false });
    const second = await orgs.acceptInvite(joinerId, invite.token);
    expect(second.alreadyMember).toBe(true);
    await expect(members.assertMember(joinerId, orgId, 'SCORER')).resolves.toBeUndefined();
    await expect(members.assertMember(joinerId, orgId, 'OWNER')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('revoked invites stop working', async () => {
    const invite = await orgs.createInvite(ownerId, orgId, 'VIEWER');
    await orgs.revokeInvite(ownerId, orgId, invite.id);
    await expect(orgs.acceptInvite(joinerId, invite.token)).rejects.toThrow(ForbiddenException);
    expect(await orgs.invitePreview(invite.token)).toEqual({ valid: false });
  });

  it('the last owner cannot leave or be demoted', async () => {
    await expect(orgs.changeRole(ownerId, orgId, ownerId, 'SCORER')).rejects.toThrow(
      BadRequestException,
    );
    await expect(orgs.removeMember(ownerId, orgId, ownerId)).rejects.toThrow(BadRequestException);
  });

  it('public profile 404s while private and serves teams when public', async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    await expect(orgs.publicProfile(org.slug)).rejects.toThrow();
    await orgs.update(ownerId, orgId, { isPublic: true });
    const profile = await orgs.publicProfile(org.slug);
    expect(profile.org.name).toBe('Test League');
    expect(Array.isArray(profile.teams)).toBe(true);
  });
});
