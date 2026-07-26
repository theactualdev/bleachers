import { Global, Module } from '@nestjs/common';
import { OrgsController } from './orgs.controller.js';
import { OrgsService } from './orgs.service.js';
import { MembershipService } from './membership.service.js';

@Global()
@Module({
  controllers: [OrgsController],
  providers: [OrgsService, MembershipService],
  exports: [MembershipService],
})
export class OrgsModule {}
