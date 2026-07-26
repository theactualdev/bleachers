import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { UpdatePlayerSchema, type UpdatePlayerInput } from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentOrgId } from '../orgs/org.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PlayersService } from './players.service.js';

@Controller('players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @CurrentOrgId() orgId: string) {
    return this.players.list(user.id, orgId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.players.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePlayerSchema)) body: UpdatePlayerInput,
  ) {
    return this.players.update(user.id, id, body);
  }
}
