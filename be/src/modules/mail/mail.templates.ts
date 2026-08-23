/**
 * Transactional email — Linear / DESIGN.md (inverse light palette).
 * Logo BOX gửi kèm CID (Gmail chặn data:image base64).
 */

const BRAND_COLOR = '#5e6ad2';
const BRAND_NAME = 'OptiPackAI';
export const LOGO_CID = 'optipack-box-logo';

const C = {
  canvas: '#f5f6f6',
  surface: '#ffffff',
  surfaceMuted: '#f6f7f7',
  hairline: '#e8e8ea',
  ink: '#18181b',
  inkMuted: '#3f3f46',
  inkSubtle: '#8a8f98',
  inkTertiary: '#62666d',
  onPrimary: '#ffffff',
} as const;

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
<body style="margin:0;padding:0;background-color:${C.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <span style="display:none;font-size:1px;color:${C.canvas};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${previewText}
  </span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.canvas};padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:${C.surface};border:1px solid ${C.hairline};border-radius:12px;overflow:hidden;">

          <tr>
            <td style="height:3px;line-height:3px;font-size:0;background-color:${BRAND_COLOR};">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:24px 32px 20px;border-bottom:1px solid ${C.hairline};">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <img src="cid:${LOGO_CID}" width="36" height="36" alt="${BRAND_NAME}" style="display:block;border:0;outline:none;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:15px;font-weight:600;color:${C.ink};letter-spacing:-0.3px;">${BRAND_NAME}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px;color:${C.inkMuted};font-size:14px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid ${C.hairline};background-color:${C.surfaceMuted};">
              <p style="margin:0;color:${C.inkSubtle};font-size:12px;line-height:1.5;">
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
    <tr>
      <td style="border-radius:8px;background-color:${BRAND_COLOR};">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:10px 18px;color:${C.onPrimary};text-decoration:none;
                  font-size:14px;font-weight:500;letter-spacing:0;border-radius:8px;line-height:1.2;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

const ROLE_LABELS_EN: Record<number, string> = {
  0: 'Store Owner',
  1: 'Warehouse Staff',
  2: 'Packaging Staff',
  3: 'Shipping Coordinator',
  4: 'Admin',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function roleLabel(role: number): string {
  return ROLE_LABELS_EN[role] ?? `Role ${String(role)}`;
}

//!=============================================
// 1. WELCOME — Admin tạo tài khoản + mật khẩu tạm (layout riêng, nhấn bảo mật)
//!=============================================
export function welcomeTempPasswordTemplate(params: {
  name: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  role: number;
}): { subject: string; html: string } {
  const name = escapeHtml(params.name);
  const email = escapeHtml(params.email);
  const temporaryPassword = escapeHtml(params.temporaryPassword);
  const assignedRole = escapeHtml(roleLabel(params.role));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <span style="display:none;font-size:1px;color:#F1F5F9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Your OptiPackAI account is ready — change your password within 72 hours
  </span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">

          <!-- Brand header: indigo gradient -->
          <tr>
            <td style="padding:28px 32px;background-color:#4F46E5;background-image:linear-gradient(135deg,#4F46E5 0%,#312E81 100%);">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align:middle;width:48px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:#FFFFFF;border-radius:10px;padding:6px;">
                          <img src="cid:${LOGO_CID}" width="32" height="32" alt="${BRAND_NAME}" style="display:block;border:0;outline:none;" />
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <div style="font-size:18px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;line-height:1.2;">${BRAND_NAME}</div>
                    <div style="margin-top:4px;font-size:12px;font-weight:500;color:#C7D2FE;letter-spacing:0.01em;line-height:1.4;">
                      AI-Powered Warehouse &amp; Packaging Engine
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0F172A;letter-spacing:-0.2px;">Hello ${name},</p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
                An administrator has created your OptiPackAI account. Use the credentials below to sign in for the first time.
              </p>

              <!-- Account details card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px 18px;border-bottom:1px solid #E2E8F0;">
                    <div style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Email</div>
                    <div style="font-size:14px;color:#0F172A;word-break:break-all;">${email}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 18px;border-bottom:1px solid #E2E8F0;">
                    <div style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Role Assigned</div>
                    <div style="font-size:14px;font-weight:600;color:#0F172A;">${assignedRole}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Temporary Password</div>
                    <span style="display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#EEF2FF;color:#4338CA;padding:6px 12px;font-size:16px;font-weight:600;border-radius:6px;letter-spacing:0.02em;">${temporaryPassword}</span>
                  </td>
                </tr>
              </table>

              <!-- 72-hour urgent warning -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBEB;border-left:4px solid #F59E0B;border-radius:0 8px 8px 0;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 14px;font-size:13px;line-height:1.55;color:#92400E;">
                    <strong style="color:#B45309;">⚠️ IMPORTANT:</strong>
                    You must log in and change your password within <strong>72 hours</strong>. Failure to do so will freeze your account, requiring Admin reactivation.
                  </td>
                </tr>
              </table>

              <!-- Primary CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background-color:#4F46E5;">
                    <a href="${params.loginUrl}" target="_blank"
                       style="display:inline-block;background:#4F46E5;color:#FFFFFF;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;line-height:1.2;">
                      Log in
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px 24px;border-top:1px solid #E2E8F0;background-color:#F8FAFC;">
              <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.5;">
                Automated email — please do not reply. If this was not you, contact your Administrator.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: `Your ${BRAND_NAME} account is ready`, html };
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
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:${C.ink};letter-spacing:-0.2px;">Chào ${params.name},</p>
      <p style="margin:0 0 8px;color:${C.inkMuted};">Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
      <p style="margin:0;color:${C.inkSubtle};font-size:13px;">Không phải bạn? Bỏ qua email này.</p>
      ${buttonHtml(params.resetUrl, 'Đặt lại mật khẩu')}
      <p style="margin:16px 0 0;color:${C.inkSubtle};font-size:13px;">Liên kết hết hạn sau ${String(params.expiresInMinutes)} phút.</p>
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
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:${C.ink};letter-spacing:-0.2px;">Chào ${params.name},</p>
      <p style="margin:0 0 12px;color:${C.inkMuted};">Tài khoản của bạn đã bị khóa do chưa đổi mật khẩu trong 72 giờ.</p>
      <p style="margin:0;color:${C.inkMuted};">Liên hệ Quản trị viên để được mở khóa.</p>
    `,
  });
  return { subject: `Tài khoản ${BRAND_NAME} đã bị khóa`, html };
}

//!=============================================
// 4. MFA ENABLED
//!=============================================
export function mfaEnabledTemplate(params: { name: string }): { subject: string; html: string } {
  const html = renderLayout({
    previewText: 'Xác thực 2 lớp đã được kích hoạt',
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:${C.ink};letter-spacing:-0.2px;">Chào ${params.name},</p>
      <p style="margin:0 0 12px;color:${C.inkMuted};">Xác thực 2 lớp (MFA) vừa được bật cho tài khoản của bạn.</p>
      <p style="margin:0;font-size:13px;color:${C.inkTertiary};">Không phải bạn? Liên hệ Quản trị viên ngay.</p>
    `,
  });
  return { subject: `MFA đã được kích hoạt — ${BRAND_NAME}`, html };
}
