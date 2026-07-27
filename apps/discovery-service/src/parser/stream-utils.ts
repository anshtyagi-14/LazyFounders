import * as zlib from 'zlib';
import { Readable } from 'stream';

/**
 * Returns a decompressed stream based on the provided content encoding.
 * Supports gzip, deflate, and br (brotli).
 * @param stream The input readable stream.
 * @param contentEncoding The content encoding string (e.g., 'gzip', 'deflate', 'br').
 * @returns A decompressed readable stream.
 */
export function getDecompressedStream(stream: Readable, contentEncoding: string): Readable {
  const normalizedEncoding = contentEncoding.toLowerCase().trim();

  switch (normalizedEncoding) {
    case 'gzip':
    case 'x-gzip':
      return stream.pipe(zlib.createGunzip());
    case 'deflate':
      return stream.pipe(zlib.createInflate());
    case 'br':
      return stream.pipe(zlib.createBrotliDecompress());
    case 'identity':
    case '':
    default:
      return stream;
  }
}
