import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  BatchUploadSchema,
  RecordEventSchema,
  VoidEventSchema,
  type BatchUploadInput,
  type RecordEventInput,
  type VoidEventInput,
} from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { EventsService } from './events.service.js';

@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('matches/:matchId/events')
  list(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Query('includeVoided') includeVoided?: string,
  ) {
    return this.events.list(matchId, includeVoided === 'true');
  }

  @Post('matches/:matchId/events')
  async record(
    @CurrentUser() user: AuthUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body(new ZodValidationPipe(RecordEventSchema)) body: RecordEventInput,
  ) {
    await this.events.assertCanScore(user.id, matchId);
    return this.events.record(user.id, { ...body, matchId });
  }

  @Post('matches/:matchId/events/undo')
  async undo(@CurrentUser() user: AuthUser, @Param('matchId', ParseUUIDPipe) matchId: string) {
    await this.events.assertCanScore(user.id, matchId);
    return this.events.undoLast(user.id, matchId);
  }

  @Post('matches/:matchId/events/:eventId/void')
  async void(
    @CurrentUser() user: AuthUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(VoidEventSchema)) body: VoidEventInput,
  ) {
    await this.events.assertCanScore(user.id, matchId);
    return this.events.void(user.id, matchId, eventId, body);
  }

  /** Offline sync: batch upload queued events (idempotent). */
  @Post('sync/events')
  async batch(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(BatchUploadSchema)) body: BatchUploadInput,
  ) {
    await this.events.assertCanScore(user.id, body.matchId);
    return this.events.batchUpload(user.id, body);
  }
}
