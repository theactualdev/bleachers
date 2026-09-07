import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreateCompetitionSchema,
  UpdateCompetitionSchema,
  type CreateCompetitionInput,
  type UpdateCompetitionInput,
} from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentOrgId } from '../orgs/org.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CompetitionsService } from './competitions.service.js';

@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly competitions: CompetitionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @CurrentOrgId() orgId: string) {
    return this.competitions.list(user.id, orgId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.competitions.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @CurrentOrgId() orgId: string,
    @Body(new ZodValidationPipe(CreateCompetitionSchema)) body: CreateCompetitionInput,
  ) {
    return this.competitions.create(user.id, orgId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCompetitionSchema)) body: UpdateCompetitionInput,
  ) {
    return this.competitions.update(user.id, id, body);
  }
}
