import { NextResponse } from 'next/server';
import { serverRotateSecret } from '@/lib/developer-server';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const updated = await serverRotateSecret(key);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không cấp lại được secret';
    return NextResponse.json({ message }, { status: 400 });
  }
}
