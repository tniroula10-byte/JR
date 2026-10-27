/**
 * Private Storage & Upload Validation (`lib/storage.ts`)
 * Architecture Rule 7: Store files in private buckets and serve them through short-lived signed URLs.
 * Validate MIME type and size on the server before issuing an upload URL.
 */

import { UploadSignRequestSchema } from '@/lib/validation/schemas';

export const PRIVATE_BUCKETS = ['product-media', 'story-media', 'avatars'] as const;
export type PrivateBucketName = (typeof PRIVATE_BUCKETS)[number];

export interface ValidatedUploadUrl {
  bucket: PrivateBucketName;
  objectPath: string;
  signedUploadUrl: string;
  expiresInSeconds: number;
}

export function validateAndCreateSignedUploadUrl(params: {
  userId: string;
  bucket: PrivateBucketName;
  fileName: string;
  mimeType: string;
  byteSize: number;
}): ValidatedUploadUrl {
  const parsed = UploadSignRequestSchema.safeParse({
    bucket: params.bucket,
    fileName: params.fileName,
    mimeType: params.mimeType,
    byteSize: params.byteSize
  });

  if (!parsed.success) {
    throw new Error(
      `UPLOAD_VALIDATION_FAILED: ${parsed.error.issues[0]?.message ?? 'Invalid upload parameters.'}`
    );
  }

  // Sanitize filename to prevent path traversal
  const safeBaseName = parsed.data.fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_');

  const objectPath = `${params.userId}/${Date.now()}-${safeBaseName}`;
  const expiresInSeconds = 300; // Short-lived 5-minute upload token

  return {
    bucket: parsed.data.bucket,
    objectPath,
    signedUploadUrl: `/api/storage/upload?bucket=${parsed.data.bucket}&path=${encodeURIComponent(
      objectPath
    )}&expires=${Date.now() + expiresInSeconds * 1000}`,
    expiresInSeconds
  };
}
