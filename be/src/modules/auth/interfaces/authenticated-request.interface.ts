import type { Request } from 'express';
import type { UserRole } from '../../../common/enums/user-role.enum';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
