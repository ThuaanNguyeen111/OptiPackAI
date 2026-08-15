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
        secret: requireEnv(configService.get<string>('jwt.secret'), 'JWT_SECRET'),
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
