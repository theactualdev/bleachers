import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { SharingService } from './sharing.service.js';

/** Public, unauthenticated read-only endpoints for sharing. */
@Public()
@Controller('public')
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get('matches/:id')
  match(@Param('id', ParseUUIDPipe) id: string) {
    return this.sharing.publicMatch(id);
  }

  @Get('matches/:id/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="match-events.csv"')
  csv(@Param('id', ParseUUIDPipe) id: string) {
    return this.sharing.matchCsv(id);
  }

  @Get('players/:id')
  player(@Param('id', ParseUUIDPipe) id: string) {
    return this.sharing.publicPlayer(id);
  }
}
