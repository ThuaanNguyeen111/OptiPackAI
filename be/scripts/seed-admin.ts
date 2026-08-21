import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { UserRole } from '../src/common/enums/user-role.enum';
import { UserSchema } from '../src/modules/users/schemas/user.schema';

function loadMongoUri(): string {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key === 'MONGODB_URI' && value) return value;
    }
  }
  const fromEnv = process.env.MONGODB_URI;
  if (fromEnv) return fromEnv;
  return 'mongodb://localhost:27017/optipackai';
}

async function seedAdmin(): Promise<void> {
  const reset =
    process.argv.includes('--reset') || process.env.SEED_ADMIN_RESET === '1';
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@optipackai.com')
    .toLowerCase()
    .trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123@';

  await mongoose.connect(loadMongoUri());
  const userModel = mongoose.model('User', UserSchema, 'users');

  const existing = await userModel.findOne({ email: adminEmail }).lean();
  if (existing) {
    console.log('Tìm thấy admin trên DB:');
    console.log(`  email=${adminEmail}`);
    console.log(`  is_active=${String(existing.is_active)}`);
    console.log(`  must_change_password=${String(existing.must_change_password)}`);
    console.log(`  failed_login_attempts=${String(existing.failed_login_attempts ?? 0)}`);
    console.log(`  locked_until=${existing.locked_until ? String(existing.locked_until) : 'none'}`);
    console.log(`  has_password=${Boolean(existing.password)}`);

    if (!reset) {
      console.log(
        'Bỏ qua (đã tồn tại). Nếu không login được: npm run seed:admin -- --reset',
      );
      await mongoose.disconnect();
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    await userModel.updateOne(
      { email: adminEmail },
      {
        $set: {
          name: existing.name || 'System Admin',
          password: hashedPassword,
          role: UserRole.ADMIN,
          is_active: true,
          must_change_password: false,
          failed_login_attempts: 0,
          locked_until: null,
          must_change_password_by: null,
        },
      },
    );
    console.log('Đã reset mật khẩu admin (không bắt đổi lần đầu).');
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Mật khẩu: ${adminPassword}`);
    await mongoose.disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  await userModel.create({
    name: 'System Admin',
    email: adminEmail,
    password: hashedPassword,
    role: UserRole.ADMIN,
    must_change_password: false,
    is_active: true,
  });
  console.log('Đã tạo Admin đầu tiên:');
  console.log(`  Email: ${adminEmail}`);
  console.log(`  Mật khẩu: ${adminPassword}`);
  await mongoose.disconnect();
}

seedAdmin().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Lỗi khi seed Admin:', message);
  process.exit(1);
});
