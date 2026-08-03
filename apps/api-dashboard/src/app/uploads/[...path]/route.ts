import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { readFileSync, existsSync } from "fs";

// The actual uploads folder is in the workspace root, not inside apps/api-dashboard
const UPLOADS_DIR = join(process.cwd(), '../../uploads');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const filePathArray = resolvedParams.path;
  
  if (!filePathArray || filePathArray.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Go up to the workspace root: 
  // src/app/uploads/[...path]/route.ts -> apps/api-dashboard/src/app/uploads/[...path]/route.ts
  // root is at ../../../../../../../uploads
  const workspaceUploads = join(process.cwd(), '../../uploads', ...filePathArray);
  const intelligenceUploads = join(process.cwd(), '../intelligence-service/uploads', ...filePathArray);

  let filePath = workspaceUploads;
  if (!existsSync(filePath)) {
    filePath = intelligenceUploads;
  }

  if (!existsSync(filePath)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const fileBuffer = readFileSync(filePath);
    
    let contentType = "image/jpeg";
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'png') contentType = "image/png";
    if (ext === 'webp') contentType = "image/webp";
    if (ext === 'svg') contentType = "image/svg+xml";
    if (ext === 'gif') contentType = "image/gif";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving local upload:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
