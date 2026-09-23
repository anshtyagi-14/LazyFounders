import { NextRequest, NextResponse } from "next/server";
import { join, resolve, sep } from "path";
import { readFileSync, existsSync, statSync } from "fs";

// Legacy local uploads live outside the dashboard (workspace root or the intelligence service).
const BASES = [resolve(process.cwd(), "../../uploads"), resolve(process.cwd(), "../intelligence-service/uploads")];
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  if (!parts?.length || parts.some((p) => p === ".." || p.includes("\\") || p.includes("\0"))) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const ext = parts[parts.length - 1].split(".").pop()?.toLowerCase() ?? "";
  // SVG is excluded: it can carry script.
  if (!TYPES[ext]) return new NextResponse("Not Found", { status: 404 });

  for (const base of BASES) {
    const filePath = resolve(join(base, ...parts));
    // Path traversal guard: the resolved file must stay inside its base directory.
    if (!filePath.startsWith(base + sep)) return new NextResponse("Not Found", { status: 404 });
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return new NextResponse(readFileSync(filePath), {
        headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
      });
    }
  }
  return new NextResponse("Not Found", { status: 404 });
}
