

const BRAND_COLOR = '#6E56CF';
const BRAND_NAME = 'OptiPackAI';
const LOGO_BASE64 =
  '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';

interface LayoutOptions {
  previewText: string;
  bodyHtml: string;
}

function renderLayout({ previewText, bodyHtml }: LayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <span style="display:none;font-size:1px;color:#f6f6f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${previewText}
  </span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6f7;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;">

          <tr>
            <td style="padding:0 8px 24px;border-bottom:1px solid #e8e8ea;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:8px;vertical-align:middle;">
                    <img src="data:image/png;base64,${LOGO_BASE64}" width="22" height="22" alt="" style="display:block;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:600;color:#18181b;letter-spacing:-0.2px;">${BRAND_NAME}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 8px;color:#3f3f46;font-size:14px;line-height:1.65;">
              ${bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 8px 0;border-top:1px solid #e8e8ea;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.5;">
                Email tự động, vui lòng không trả lời. Không phải bạn thực hiện? Liên hệ Quản trị viên.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buttonHtml(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
    <tr>
      <td style="border-radius:6px;background-color:${BRAND_COLOR};">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:10px 20px;color:#ffffff;text-decoration:none;
                  font-size:14px;font-weight:600;border-radius:6px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

//!=============================================
// 1. WELCOME — gửi khi Admin tạo tài khoản mới, kèm mật khẩu tạm.
//!=============================================
export function welcomeTempPasswordTemplate(params: {
  name: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const html = renderLayout({
    previewText: `Tài khoản của bạn đã sẵn sàng — ${params.email}`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Chào ${params.name},</p>
      <p style="margin:0 0 20px;">Quản trị viên vừa tạo tài khoản OptiPackAI cho bạn.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8ea;border-radius:8px;margin-bottom:20px;">
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #f0f0f1;">
            <div style="font-size:12px;color:#a1a1aa;margin-bottom:2px;">Email</div>
            <div style="font-size:14px;color:#18181b;">${params.email}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-size:12px;color:#a1a1aa;margin-bottom:2px;">Mật khẩu tạm</div>
            <div style="font-size:14px;color:#18181b;font-family:ui-monospace,Menlo,monospace;">${params.temporaryPassword}</div>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 4px;color:#b91c1c;font-size:13px;">Đổi mật khẩu trong 72 giờ, nếu không tài khoản sẽ bị khóa.</p>
      ${buttonHtml(params.loginUrl, 'Đăng nhập')}
    `,
  });
  return { subject: `Tài khoản ${BRAND_NAME} của bạn đã sẵn sàng`, html };
}

//!=============================================
// 2. FORGOT PASSWORD
//!=============================================
export function passwordResetTemplate(params: {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): { subject: string; html: string } {
  const html = renderLayout({
    previewText: 'Yêu cầu đặt lại mật khẩu',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Chào ${params.name},</p>
      <p style="margin:0 0 4px;">Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
      <p style="margin:0;color:#a1a1aa;font-size:13px;">Không phải bạn? Bỏ qua email này.</p>
      ${buttonHtml(params.resetUrl, 'Đặt lại mật khẩu')}
      <p style="margin:8px 0 0;color:#a1a1aa;font-size:13px;">Liên kết hết hạn sau ${String(params.expiresInMinutes)} phút.</p>
    `,
  });
  return { subject: `Đặt lại mật khẩu ${BRAND_NAME}`, html };
}

//!=============================================
// 3. ACCOUNT LOCKED
//!=============================================
export function accountLockedTemplate(params: { name: string }): {
  subject: string;
  html: string;
} {
  const html = renderLayout({
    previewText: 'Tài khoản của bạn đã bị tạm khóa',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Chào ${params.name},</p>
      <p style="margin:0 0 8px;">Tài khoản của bạn đã bị khóa do chưa đổi mật khẩu trong 72 giờ.</p>
      <p style="margin:0;">Liên hệ Quản trị viên để được mở khóa.</p>
    `,
  });
  return { subject: `Tài khoản ${BRAND_NAME} đã bị khóa`, html };
}


export function mfaEnabledTemplate(params: { name: string }): { subject: string; html: string } {
  const html = renderLayout({
    previewText: 'Xác thực 2 lớp đã được kích hoạt',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Chào ${params.name},</p>
      <p style="margin:0 0 8px;">Xác thực 2 lớp (MFA) vừa được bật cho tài khoản của bạn.</p>
      <p style="margin:0;color:#b91c1c;font-size:13px;">Không phải bạn? Liên hệ Quản trị viên ngay.</p>
    `,
  });
  return { subject: `MFA đã được kích hoạt — ${BRAND_NAME}`, html };
}

//!=============================================
// 5. MFA DISABLED (Admin tắt hộ)
//!=============================================
export function mfaDisabledTemplate(params: { name: string }): { subject: string; html: string } {
  const html = renderLayout({
    previewText: 'Xác thực 2 lớp đã được tắt',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Chào ${params.name},</p>
      <p style="margin:0 0 8px;">Quản trị viên vừa tắt xác thực 2 lớp (MFA) trên tài khoản của bạn. Lần đăng nhập tiếp theo sẽ không yêu cầu mã xác thực.</p>
      <p style="margin:0 0 8px;">Bạn có thể vào hồ sơ để thiết lập lại MFA bất cứ lúc nào.</p>
      <p style="margin:0;color:#b91c1c;font-size:13px;">Không phải bạn yêu cầu? Liên hệ Quản trị viên ngay.</p>
    `,
  });
  return { subject: `MFA đã được tắt — ${BRAND_NAME}`, html };
}
