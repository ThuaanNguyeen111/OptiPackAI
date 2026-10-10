import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Injectable()
export class CustomerJwtGuard extends AuthGuard('customer-jwt') {}
