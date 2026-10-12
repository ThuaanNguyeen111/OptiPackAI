import { NextResponse } from 'next/server';
import { serverReactivateKey } from '@/lib/developer-server';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const updated = await serverReactivateKey(key);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không kích hoạt lại được khóa';
    return NextResponse.json({ message }, { status: 400 });
  }
}
