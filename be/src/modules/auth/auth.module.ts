import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { ForcePasswordChangeGuard } from './guards/force-password-change.guard';
import { LoginAuditLog, LoginAuditLogSchema } from './schemas/login-audit-log.schema';
import { MfaService } from './services/mfa.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenModule } from './token.module';

@Module({
  imports: [
    UsersModule,
    TokenModule, // FIX #1,#4,#5,#8,#19,#20: TokenService tách riêng, xem token.module.ts
    MongooseModule.forFeature([{ name: LoginAuditLog.name, schema: LoginAuditLogSchema }]), // FIX #6
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MfaService, JwtStrategy, RolesGuard, ForcePasswordChangeGuard],
  exports: [AuthService, JwtStrategy, RolesGuard, ForcePasswordChangeGuard, PassportModule],
})
export class AuthModule {}
