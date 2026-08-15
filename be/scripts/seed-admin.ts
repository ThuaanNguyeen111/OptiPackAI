import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums/user-role.enum';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@optipackai.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123@';

  const existing = await userModel.findOne({ email: adminEmail });
  if (existing) {
    console.log(`⚠️  Admin với email ${adminEmail} đã tồn tại, bỏ qua.`);
    await app.close();
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  await userModel.create({
    name: 'System Admin',
    email: adminEmail,
    password: hashedPassword,
    role: UserRole.ADMIN,
    must_change_password: true, // Bắt buộc đổi ngay lần đầu login
    is_active: true,
  });

  console.log('✅ Đã tạo Admin đầu tiên:');
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Mật khẩu tạm: ${adminPassword}`);
  console.log('   ⚠️  Đổi mật khẩu ngay sau khi đăng nhập lần đầu!');

  await app.close();
}

seedAdmin().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('❌ Lỗi khi seed Admin:', message);
  process.exit(1);
});
