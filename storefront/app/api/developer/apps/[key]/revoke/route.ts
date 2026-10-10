import { NextResponse } from 'next/server';
import { serverRevokeKey } from '@/lib/developer-server';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const updated = await serverRevokeKey(key);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thu hồi được khóa';
    return NextResponse.json({ message }, { status: 400 });
  }
}
