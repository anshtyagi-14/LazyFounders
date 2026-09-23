import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Immutable raw snapshot storage, content-addressed by sha256. Writes are
 * create-only: an existing object is never overwritten.
 */
export interface SnapshotStorage {
  put(sha256: string, body: Buffer, contentType: string | null): Promise<string>;
}

export function snapshotKey(sha256: string): string {
  return `raw/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`;
}

export class FsSnapshotStorage implements SnapshotStorage {
  private readonly root: string;
  constructor(root = process.env.SNAPSHOT_DIR || './data/snapshots') {
    this.root = resolve(root);
  }
  async put(sha256: string, body: Buffer): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('invalid snapshot hash');
    const key = snapshotKey(sha256);
    const path = join(this.root, key);
    try {
      await stat(path);
      return key;
    } catch {
      /* not present yet */
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' }).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'EEXIST') throw err;
    });
    return key;
  }
}

export class S3SnapshotStorage implements SnapshotStorage {
  private readonly client: S3Client;
  constructor(private readonly bucket: string, region = process.env.AWS_REGION) {
    this.client = new S3Client({ region });
  }
  async put(sha256: string, body: Buffer, contentType: string | null): Promise<string> {
    const key = snapshotKey(sha256);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType ?? 'application/octet-stream',
          // Conditional write: fails with 412 if the object already exists (immutability).
          IfNoneMatch: '*',
        }),
      );
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 412 && status !== 409) throw err;
    }
    return key;
  }
}

export function createSnapshotStorage(env: NodeJS.ProcessEnv = process.env): SnapshotStorage {
  if ((env.SNAPSHOT_STORAGE ?? 'fs') === 's3') {
    if (!env.SNAPSHOT_BUCKET) throw new Error('SNAPSHOT_BUCKET is required when SNAPSHOT_STORAGE=s3');
    return new S3SnapshotStorage(env.SNAPSHOT_BUCKET);
  }
  return new FsSnapshotStorage(env.SNAPSHOT_DIR);
}
