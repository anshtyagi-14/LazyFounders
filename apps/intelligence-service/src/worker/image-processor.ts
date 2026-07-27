import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { Logger } from 'pino';

export class ImageProcessor {
  private readonly uploadsDir: string;
  private readonly logoSvg: Buffer;

  constructor(private readonly logger: Logger) {
    // Create an uploads directory in the public folder to serve locally if needed
    // or just store them in a persistent volume. For now, we put it in apps/intelligence-service/uploads
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }

    // A simple, premium-looking Blogy logo in SVG format
    const svgString = `
      <svg width="200" height="60" viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="200" height="60" rx="8" fill="rgba(0,0,0,0.6)" />
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="32" fill="#ffffff">
          Blogy
        </text>
      </svg>
    `;
    this.logoSvg = Buffer.from(svgString);
  }

  /**
   * Downloads an image, adds the Blogy watermark, and saves it locally.
   * Returns the local file path (or URL if we are serving it).
   */
  async processAndWatermark(imageUrl: string, articleId: string): Promise<string | null> {
    try {
      this.logger.info({ imageUrl }, 'Downloading header image for watermarking');
      
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      const fileName = `header-${articleId}.jpg`;
      const outputPath = path.join(this.uploadsDir, fileName);

      // We resize the original image to a standard max width (e.g., 1200px) 
      // and overlay the SVG logo at the bottom right.
      await sharp(imageBuffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .composite([
          {
            input: this.logoSvg,
            gravity: 'southeast'
          }
        ])
        .jpeg({ quality: 85 })
        .toFile(outputPath);

      this.logger.info({ outputPath }, 'Successfully watermarked and saved header image');
      
      // For now, we return a local file URL or relative path so we know where it is.
      // In Stage 6, the publishing engine can upload this local file to Ghost/WordPress.
      return `/uploads/${fileName}`;

    } catch (error: any) {
      this.logger.error({ err: error.message, imageUrl }, 'Failed to process header image');
      return null;
    }
  }
}
