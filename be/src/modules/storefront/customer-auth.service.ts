import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { requireEnv } from '../../common/utils/env.util';
import { Customer, CustomerDocument } from './schemas/storefront.schema';
import { LoginCustomerDto, RegisterCustomerDto } from './dto/storefront.dto';

@Injectable()
export class CustomerAuthService {
  constructor(@InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>, private readonly jwt: JwtService, private readonly config: ConfigService) {}
  private profile(customer: CustomerDocument) { return { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone }; }
  private token(customer: CustomerDocument) { return this.jwt.sign({ sub: customer.id, email: customer.email, type: 'customer' }, { secret: requireEnv(this.config.get<string>('jwt.accessSecret'), 'JWT_ACCESS_SECRET'), expiresIn: '7d' }); }
  async register(dto: RegisterCustomerDto) { const email = dto.email.toLowerCase().trim(); if (await this.customerModel.exists({ email })) throw new ConflictException('Email đã được đăng ký'); const customer = await this.customerModel.create({ name: dto.name.trim(), email, password_hash: await bcrypt.hash(dto.password, 12), phone: dto.phone ?? '' }); return { customer: this.profile(customer), access_token: this.token(customer) }; }
  async login(dto: LoginCustomerDto) { const customer = await this.customerModel.findOne({ email: dto.email.toLowerCase().trim(), is_active: true }); if (!customer || !(await bcrypt.compare(dto.password, customer.password_hash))) throw new UnauthorizedException('Email hoặc mật khẩu không đúng'); customer.last_login_at = new Date(); await customer.save(); return { customer: this.profile(customer), access_token: this.token(customer) }; }
  async profileById(id: string) { return this.profile(await this.findById(id)); }
  async findById(id: string) { const customer = await this.customerModel.findOne({ _id: id, is_active: true }); if (!customer) throw new UnauthorizedException('Tài khoản không còn hoạt động'); return customer; }
}
