import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from '../exceptions/app-exception';

interface ErrorResponseBody {
  success: false;
  error_code: string;
  message: string;
  details: Record<string, unknown> | null;
  timestamp: string;
  path: string;
}

/**
 * ===================================================================
 * 2. GLOBAL EXCEPTION FILTER — MỌI RESPONSE LỖI ĐI QUA ĐÂY
 * ===================================================================
 * Đăng ký 1 lần duy nhất trong main.ts:
 *   app.useGlobalFilters(new GlobalExceptionFilter());
 *
 * Xử lý ĐỦ 3 LOẠI lỗi, không bỏ sót loại nào:
 *   (a) AppException — lỗi nghiệp vụ có chủ đích, đã có error_code sẵn
 *   (b) HttpException khác (vd từ ValidationPipe của class-validator,
 *       hoặc NestJS tự ném) — GÁN error_code mặc định theo loại
 *   (c) Lỗi KHÔNG LƯỜNG TRƯỚC (bug, lỗi kết nối DB...) — LUÔN trả 500
 *       với error_code cố định "INTERNAL_ERROR", KHÔNG BAO GIỜ để lộ
 *       stack trace hay message gốc ra ngoài (rủi ro bảo mật), nhưng
 *       PHẢI log đầy đủ chi tiết ở server để debug được.
 * ===================================================================
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.buildErrorBody(exception, request.url);
    const status = this.resolveHttpStatus(exception);

    // Log đủ để debug: lỗi 5xx log full stack (lỗi hệ thống thật sự cần
    // biết), lỗi 4xx chỉ log ngắn gọn (thường do người dùng, không cần
    // làm ồn log server với những thứ như "sai mật khẩu").
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${body.error_code}] ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${body.error_code}] ${request.method} ${request.url} — ${body.message}`);
    }

    response.status(status).json(body);
  }

  private resolveHttpStatus(exception: unknown): HttpStatus {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildErrorBody(exception: unknown, path: string): ErrorResponseBody {
    const timestamp = new Date().toISOString();

    // (a) AppException — đã có error_code chuẩn sẵn từ nơi ném lỗi
    if (exception instanceof AppException) {
      return {
        success: false,
        error_code: exception.errorCode,
        message: exception.message,
        details: exception.details ?? null,
        timestamp,
        path,
      };
    }

    // (b) HttpException khác — ví dụ lỗi từ ValidationPipe (class-validator)
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : Array.isArray((res as { message?: string[] }).message)
            ? (res as { message: string[] }).message.join('; ')
            : ((res as { message?: string }).message ?? exception.message);

      return {
        success: false,
        error_code: this.mapHttpStatusToErrorCode(exception.getStatus()),
        message,
        details: null,
        timestamp,
        path,
      };
    }

    // (c) Lỗi không lường trước — KHÔNG lộ chi tiết thật ra response
    return {
      success: false,
      error_code: 'INTERNAL_ERROR',
      message: 'Đã có lỗi xảy ra ở hệ thống. Vui lòng thử lại sau hoặc liên hệ quản trị viên.',
      details: null,
      timestamp,
      path,
    };
  }

  private mapHttpStatusToErrorCode(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'HTTP_ERROR';
    }
  }
}
