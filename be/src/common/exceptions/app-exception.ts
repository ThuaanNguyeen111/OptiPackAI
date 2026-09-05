import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * ===================================================================
 * 1. APP EXCEPTION — MỌI LỖI NGHIỆP VỤ TRONG PROJECT PHẢI DÙNG CÁI NÀY
 * ===================================================================
 * KHÔNG ném `throw new Error('...')` hay `throw new UnauthorizedException('...')`
 * trần trụi trong Service — cả 2 cách đó đều KHÔNG có `error_code`, khiến
 * FE không thể phân biệt bằng code (chỉ phân biệt được bằng message tiếng
 * Việt — dễ vỡ nếu sau này đổi câu chữ hiển thị).
 *
 * `errorCode` là HỢP ĐỒNG ổn định giữa BE-FE, `message` chỉ để hiển thị
 * cho người dùng — 2 thứ tách biệt có chủ đích.
 * ===================================================================
 */
export class AppException extends HttpException {
  constructor(
    public readonly errorCode: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ error_code: errorCode, message, details: details ?? null }, status);
  }
}
