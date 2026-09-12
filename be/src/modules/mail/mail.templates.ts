

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
