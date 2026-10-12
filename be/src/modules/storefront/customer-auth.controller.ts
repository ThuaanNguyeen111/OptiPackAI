import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Response } from 'express';
import { CustomerAuthService } from './customer-auth.service';
import { LoginCustomerDto, RegisterCustomerDto } from './dto/storefront.dto';
import { CustomerJwtGuard } from './customer-jwt.guard';

type CustomerRequest = Request & { user: { customerId: string } };

@ApiTags('Customer Auth')
@Controller('customer-auth')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}
  @Post('register') async register(@Body() dto: RegisterCustomerDto, @Res({ passthrough: true }) response: Response) { const result = await this.auth.register(dto); this.setCookie(response, result.access_token); return { customer: result.customer }; }
  @Post('login') async login(@Body() dto: LoginCustomerDto, @Res({ passthrough: true }) response: Response) { const result = await this.auth.login(dto); this.setCookie(response, result.access_token); return { customer: result.customer }; }
  @Get('me') @UseGuards(CustomerJwtGuard) async me(@Req() request: CustomerRequest) { return { customer: await this.auth.profileById(request.user.customerId) }; }
  @Post('logout') logout(@Res({ passthrough: true }) response: Response) { response.clearCookie('storefront_access_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }); return { message: 'Đã đăng xuất' }; }
  private setCookie(response: Response, token: string) { response.cookie('storefront_access_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' }); }
}
