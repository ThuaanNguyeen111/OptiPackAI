import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { requireEnv } from '../../common/utils/env.util';
import { RefreshToken, RefreshTokenSchema } from './schemas/refresh-token.schema';
import { TokenService } from './services/token.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RefreshToken.name, schema: RefreshTokenSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        //!=============================================
        // FIX #32: secret mặc định của module này CHỈ dùng cho access token
        // và OAuth state nonce (xem generateOAuthState/verifyOAuthState trong
        // auth.service.ts) - refresh token dùng secret RIÊNG, ghi đè tường
        // minh ngay lúc ký (xem TokenService.generateTokenPair).
        //!=============================================
        secret: requireEnv(configService.get<string>('jwt.accessSecret'), 'JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get<number>('jwt.expiresIn', 86400),
          algorithm: 'HS256' as const,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TokenService],
  exports: [TokenService, JwtModule],
})
export class TokenModule {}
