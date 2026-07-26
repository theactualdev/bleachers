import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreateMatchSchema,
  UpdateMatchSchema,
  type CreateMatchInput,
  type UpdateMatchInput,
} from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentOrgId } from '../orgs/org.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MatchesService } from './matches.service.js';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @CurrentOrgId() orgId: string) {
    return this.matches.list(user.id, orgId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.matches.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @CurrentOrgId() orgId: string,
    @Body(new ZodValidationPipe(CreateMatchSchema)) body: CreateMatchInput,
  ) {
    return this.matches.create(user.id, orgId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateMatchSchema)) body: UpdateMatchInput,
  ) {
    return this.matches.update(user.id, id, body);
  }
}
