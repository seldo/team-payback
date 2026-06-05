// x402 payment gate moved to app/api/paid-data/route.ts via withX402.
import { NextResponse, type NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = { matcher: [] };
