import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { getSportConfig, hasSportConfig, listSupportedSports } from '@bleachers/sport-engine';
import { SportSchema } from '@bleachers/types';
import { Public } from '../auth/auth.decorators.js';

/** Exposes sport configurations so the UI can render scoring layouts generically. */
@Public()
@Controller('sports')
export class SportController {
  @Get()
  list() {
    return listSupportedSports();
  }

  @Get(':sport/config')
  config(@Param('sport') sport: string) {
    const parsed = SportSchema.safeParse(sport?.toUpperCase());
    if (!parsed.success || !hasSportConfig(parsed.data)) {
      throw new NotFoundException(`No configuration for sport "${sport}"`);
    }
    return getSportConfig(parsed.data);
  }
}
