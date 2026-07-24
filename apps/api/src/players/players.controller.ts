import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreatePlayerSchema,
  UpdatePlayerSchema,
  type CreatePlayerInput,
  type UpdatePlayerInput,
} from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PlayersService } from './players.service.js';

@Controller('players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.players.list(user.id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.players.get(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreatePlayerSchema)) body: CreatePlayerInput,
  ) {
    return this.players.create(user.id, body);
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
