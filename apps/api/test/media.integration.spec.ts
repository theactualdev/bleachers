import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MediaService } from '../src/media/media.service';
import { createTestUser, deleteTestUser, getPersonalOrg } from './helpers/auth';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Media (integration)', () => {
  const media = new MediaService();

  let userId = '';
  let orgId = '';

  beforeAll(async () => {
    userId = await createTestUser();
    orgId = await getPersonalOrg(userId);
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it('rejects disallowed mimetypes', async () => {
    await expect(
      media.upload(orgId, {
        mimetype: 'text/plain',
        size: 10,
        buffer: Buffer.from('hello'),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects files larger than 2 MB', async () => {
    await expect(
      media.upload(orgId, {
        mimetype: 'image/png',
        size: 3 * 1024 * 1024,
        buffer: Buffer.from('small-buffer-but-size-field-lies'),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('uploads a real image to the live bucket and serves it publicly', async () => {
    const buffer = Buffer.from(PNG_BASE64, 'base64');
    const { url } = await media.upload(orgId, {
      mimetype: 'image/png',
      size: buffer.byteLength,
      buffer,
    });

    expect(url).toContain(`/media/${orgId}/`);

    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');

    await media.removeByUrl(url);
    // Cache-bust: the storage CDN caches the object for `max-age=3600`, so an
    // identical URL can still 200 from cache right after deletion.
    const res2 = await fetch(`${url}?cb=${Date.now()}`);
    expect(res2.status).not.toBe(200);
  });
});
