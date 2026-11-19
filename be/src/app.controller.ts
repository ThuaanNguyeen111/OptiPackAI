import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { NoFeatureGate } from './modules/role-permissions/feature-scope';

@NoFeatureGate('Trang chào / ping công khai')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
