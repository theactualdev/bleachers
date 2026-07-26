import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

const BUCKET = 'media';
const ALLOWED: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');
  private readonly storage: SupabaseClient;
  private bucketReady = false;

  constructor() {
    this.storage = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /** Idempotently ensure the public bucket exists (first upload wins the race). */
  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    const { error } = await this.storage.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_UPLOAD_BYTES,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
    this.bucketReady = true;
  }

  async upload(orgId: string, file: { mimetype: string; size: number; buffer: Buffer }) {
    const ext = ALLOWED[file.mimetype];
    if (!ext) throw new BadRequestException('Only WebP, JPEG, or PNG images are allowed');
    if (file.size > MAX_UPLOAD_BYTES)
      throw new BadRequestException('Image must be 2 MB or smaller');

    await this.ensureBucket();
    const key = `${orgId}/${randomUUID()}.${ext}`;
    const { error } = await this.storage.storage
      .from(BUCKET)
      .upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) {
      this.logger.error(`upload failed: ${error.message}`);
      throw new BadRequestException('Upload failed — try again');
    }
    const { data } = this.storage.storage.from(BUCKET).getPublicUrl(key);
    return { url: data.publicUrl };
  }

  /** Test helper surface: delete an object by its public URL path. */
  async removeByUrl(url: string): Promise<void> {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    await this.storage.storage.from(BUCKET).remove([url.slice(idx + marker.length)]);
  }
}
