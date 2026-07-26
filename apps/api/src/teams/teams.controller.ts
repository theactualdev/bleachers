import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  AddRosterEntrySchema,
  CreateTeamPlayerSchema,
  CreateTeamSchema,
  RegisterTeamSchema,
  UpdateTeamSchema,
  type AddRosterEntryInput,
  type CreateTeamInput,
  type CreateTeamPlayerInput,
  type RegisterTeamInput,
  type UpdateTeamInput,
} from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentOrgId } from '../orgs/org.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TeamsService } from './teams.service.js';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @CurrentOrgId() orgId: string) {
    return this.teams.list(user.id, orgId);
  }

  // Declared before the `:id`-style param routes below so this literal segment
  // is never swallowed by a param route matching 'register' as an id.
  @Post('register')
  register(
    @CurrentUser() user: AuthUser,
    @CurrentOrgId() orgId: string,
    @Body(new ZodValidationPipe(RegisterTeamSchema)) body: RegisterTeamInput,
  ) {
    return this.teams.register(user.id, orgId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.teams.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @CurrentOrgId() orgId: string,
    @Body(new ZodValidationPipe(CreateTeamSchema)) body: CreateTeamInput,
  ) {
    return this.teams.create(user.id, orgId, body);
  }

  @Post(':id/players')
  addPlayer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateTeamPlayerSchema)) body: CreateTeamPlayerInput,
  ) {
    return this.teams.addPlayer(user.id, id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTeamSchema)) body: UpdateTeamInput,
  ) {
    return this.teams.update(user.id, id, body);
  }

  @Get(':id/roster')
  roster(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.teams.getRoster(user.id, id);
  }

  @Post(':id/roster')
  addToRoster(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddRosterEntrySchema)) body: AddRosterEntryInput,
  ) {
    return this.teams.addToRoster(user.id, id, body);
  }

  @Delete(':id/roster/:playerId')
  removeFromRoster(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('playerId', ParseUUIDPipe) playerId: string,
  ) {
    return this.teams.removeFromRoster(user.id, id, playerId);
  }
}
