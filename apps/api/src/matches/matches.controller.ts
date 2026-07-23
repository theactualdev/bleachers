import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreateMatchSchema,
  UpdateMatchSchema,
  type CreateMatchInput,
  type UpdateMatchInput,
} from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MatchesService } from './matches.service.js';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.matches.list(user.id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.matches.get(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateMatchSchema)) body: CreateMatchInput,
  ) {
    return this.matches.create(user.id, body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateMatchSchema)) body: UpdateMatchInput,
  ) {
    return this.matches.update(id, body);
  }
}
