import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreateInviteSchema,
  CreateOrgSchema,
  UpdateMemberRoleSchema,
  UpdateOrgSchema,
  type CreateInviteInput,
  type CreateOrgInput,
  type UpdateMemberRoleInput,
  type UpdateOrgInput,
} from '@bleachers/types';
import { CurrentUser, Public } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrgsService } from './orgs.service.js';

@Controller()
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post('orgs')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateOrgSchema)) body: CreateOrgInput,
  ) {
    return this.orgs.create(user.id, body);
  }

  @Patch('orgs/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateOrgSchema)) body: UpdateOrgInput,
  ) {
    return this.orgs.update(user.id, id, body);
  }

  @Get('orgs/:id/members')
  members(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.listMembers(user.id, id);
  }

  @Patch('orgs/:id/members/:userId')
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body(new ZodValidationPipe(UpdateMemberRoleSchema)) body: UpdateMemberRoleInput,
  ) {
    return this.orgs.changeRole(user.id, id, targetUserId, body.role);
  }

  @Delete('orgs/:id/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.orgs.removeMember(user.id, id, targetUserId);
  }

  @Post('orgs/:id/invites')
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateInviteSchema)) body: CreateInviteInput,
  ) {
    return this.orgs.createInvite(user.id, id, body.role);
  }

  @Get('orgs/:id/invites')
  listInvites(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.listInvites(user.id, id);
  }

  @Post('orgs/:id/invites/:inviteId/revoke')
  revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.orgs.revokeInvite(user.id, id, inviteId);
  }

  @Public()
  @Get('invites/:token')
  invitePreview(@Param('token') token: string) {
    return this.orgs.invitePreview(token);
  }

  @Post('invites/:token/accept')
  acceptInvite(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.orgs.acceptInvite(user.id, token);
  }

  @Public()
  @Get('public/orgs/:slug')
  publicProfile(@Param('slug') slug: string) {
    return this.orgs.publicProfile(slug);
  }
}
