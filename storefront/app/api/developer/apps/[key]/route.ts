import { NextResponse } from 'next/server';
import { serverDeleteApp, serverUpdateApp } from '@/lib/developer-server';
import type { UpdateAppInput } from '@/types/developer';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const body = (await req.json()) as UpdateAppInput;
    if (body.name !== undefined && (body.name.trim().length < 2 || body.name.trim().length > 80)) {
      return NextResponse.json(
        { message: 'Tên ứng dụng phải có từ 2 đến 80 ký tự.' },
        { status: 400 },
      );
    }
    const updated = await serverUpdateApp(key, body);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không cập nhật được ứng dụng';
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const result = await serverDeleteApp(key);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không xóa được ứng dụng';
    return NextResponse.json({ message }, { status: 400 });
  }
}
