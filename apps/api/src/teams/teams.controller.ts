import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  AddRosterEntrySchema,
  CreateTeamSchema,
  UpdateTeamSchema,
  type AddRosterEntryInput,
  type CreateTeamInput,
  type UpdateTeamInput,
} from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TeamsService } from './teams.service.js';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.teams.list(user.id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.teams.get(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateTeamSchema)) body: CreateTeamInput,
  ) {
    return this.teams.create(user.id, body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTeamSchema)) body: UpdateTeamInput,
  ) {
    return this.teams.update(id, body);
  }

  @Get(':id/roster')
  roster(@Param('id', ParseUUIDPipe) id: string) {
    return this.teams.getRoster(id);
  }

  @Post(':id/roster')
  addToRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddRosterEntrySchema)) body: AddRosterEntryInput,
  ) {
    return this.teams.addToRoster(id, body);
  }

  @Delete(':id/roster/:playerId')
  removeFromRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('playerId', ParseUUIDPipe) playerId: string,
  ) {
    return this.teams.removeFromRoster(id, playerId);
  }
}
