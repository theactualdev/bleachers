import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentOrgId } from '../orgs/org.decorators.js';
import { MembershipService } from '../orgs/membership.service.js';
import { MediaService, MAX_UPLOAD_BYTES } from './media.service.js';

@Controller('media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly members: MembershipService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @CurrentOrgId() orgId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('A "file" upload field is required');
    await this.members.assertMember(user.id, orgId, 'SCORER');
    return this.media.upload(orgId, file);
  }
}
