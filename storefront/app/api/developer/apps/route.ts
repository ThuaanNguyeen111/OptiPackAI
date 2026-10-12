import { NextResponse } from 'next/server';
import { serverCreateApp, serverListApps } from '@/lib/developer-server';
import type { CreateAppInput } from '@/types/developer';

export async function GET() {
  try {
    const apps = await serverListApps();
    return NextResponse.json(apps);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi lấy danh sách ứng dụng';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateAppInput;
    if (!body.name || body.name.trim().length < 2 || body.name.trim().length > 80) {
      return NextResponse.json(
        { message: 'Tên ứng dụng phải có từ 2 đến 80 ký tự.' },
        { status: 400 },
      );
    }
    if (!body.redirect_uri || !body.redirect_uri.trim()) {
      return NextResponse.json(
        { message: 'Callback URL (Redirect URI) là bắt buộc.' },
        { status: 400 },
      );
    }
    const app = await serverCreateApp(body);
    return NextResponse.json(app, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không tạo được ứng dụng';
    return NextResponse.json({ message }, { status: 400 });
  }
}
