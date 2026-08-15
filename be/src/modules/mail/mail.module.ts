import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService], // module khác (auth, users) import module này để gửi mail
})
export class MailModule {}
