import type { Request } from 'express';
import type { UserRole } from '../../../common/enums/user-role.enum';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  //!=============================================
  // FIX: đổi `user` từ bắt buộc sang OPTIONAL — phản ánh đúng thực tế:
  // field này chỉ được Passport gán SAU KHI JwtAuthGuard chạy thành công.
  // Nếu 1 Guard khác (RolesGuard, ForcePasswordChangeGuard) vô tình được
  // gắn vào route mà QUÊN đặt JwtAuthGuard trước, `user` sẽ THỰC SỰ
  // undefined lúc runtime — khai bắt buộc trước đây khiến TypeScript tin
  // nhầm là luôn có giá trị, che mất rủi ro cấu hình sai thứ tự Guard.
  //!=============================================
  user?: AuthenticatedUser;
}
