import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
export class GoogleStateInvalidException extends UnauthorizedException {}
export class GoogleEmailNotVerifiedException extends UnauthorizedException {}
export class GoogleAccountNotRegisteredException extends UnauthorizedException {}
export class GoogleAccountInactiveException extends UnauthorizedException {}
export class GoogleAccountLockedException extends ForbiddenException {}
