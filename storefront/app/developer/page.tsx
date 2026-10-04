'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import './developer.css';
import {
  createDeveloperApp,
  deleteDeveloperApp,
  fetchDeveloperApps,
  reactivateDeveloperKey,
  revokeDeveloperKey,
  rotateDeveloperSecret,
  updateDeveloperApp,
} from '@/lib/developer-api';
import type { DeveloperAppItem } from '@/types/developer';

export default function DeveloperPortalPage() {
  const [apps, setApps] = useState<DeveloperAppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<DeveloperAppItem | null>(null);
  const [deletingApp, setDeletingApp] = useState<DeveloperAppItem | null>(null);
  const [revokingApp, setRevokingApp] = useState<DeveloperAppItem | null>(null);
  const [rotatingApp, setRotatingApp] = useState<DeveloperAppItem | null>(null);
  const [credentialsApp, setCredentialsApp] = useState<DeveloperAppItem | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [redirectUri, setRedirectUri] = useState('http://localhost:3000/marketplace/aurelle/callback');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  function notify(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
  }

  async function copyToClipboard(text: string, label = 'nội dung') {
    try {
      await navigator.clipboard.writeText(text);
      notify(`Đã sao chép ${label} vào clipboard`);
    } catch {
      notify('Không thể tự động sao chép. Vui lòng chọn và sao chép thủ công.');
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const data = await fetchDeveloperApps();
      setApps(data);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không tải được danh sách ứng dụng.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreateModal() {
    setName('');
    setRedirectUri('http://localhost:3000/marketplace/aurelle/callback');
    setFormError(null);
    setIsCreateOpen(true);
  }

  function openEditModal(app: DeveloperAppItem) {
    setEditingApp(app);
    setName(app.name);
    setRedirectUri(app.redirect_uri);
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (name.trim().length < 2 || name.trim().length > 80) {
      setFormError('Tên ứng dụng phải có từ 2 đến 80 ký tự.');
      return;
    }
    try {
      setSubmitting(true);
      const created = await createDeveloperApp({
        name: name.trim(),
        redirect_uri: redirectUri.trim(),
      });
      setIsCreateOpen(false);
      setShowSecret(false);
      setCredentialsApp(created);
      notify('Tạo ứng dụng thành công!');
      await loadData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không tạo được ứng dụng.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingApp) return;
    setFormError(null);
    if (name.trim().length < 2 || name.trim().length > 80) {
      setFormError('Tên ứng dụng phải có từ 2 đến 80 ký tự.');
      return;
    }
    try {
      setSubmitting(true);
      await updateDeveloperApp(editingApp.app_key, {
        name: name.trim(),
        redirect_uri: redirectUri.trim(),
      });
      setEditingApp(null);
      notify('Cập nhật thông tin ứng dụng thành công!');
      await loadData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không cập nhật được ứng dụng.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingApp) return;
    try {
      setSubmitting(true);
      await deleteDeveloperApp(deletingApp.app_key);
      setDeletingApp(null);
      notify('Đã xóa ứng dụng thành công.');
      await loadData();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Lỗi xóa ứng dụng.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeConfirm() {
    if (!revokingApp) return;
    try {
      setSubmitting(true);
      await revokeDeveloperKey(revokingApp.app_key);
      setRevokingApp(null);
      notify(`Đã thu hồi khóa API của ứng dụng ${revokingApp.name}.`);
      await loadData();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Lỗi thu hồi khóa.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReactivate(app: DeveloperAppItem) {
    try {
      setSubmitting(true);
      await reactivateDeveloperKey(app.app_key);
      notify(`Đã kích hoạt lại khóa API cho ứng dụng ${app.name}.`);
      await loadData();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Lỗi kích hoạt lại.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRotateConfirm() {
    if (!rotatingApp) return;
    try {
      setSubmitting(true);
      const updated = await rotateDeveloperSecret(rotatingApp.app_key);
      setRotatingApp(null);
      setShowSecret(false);
      setCredentialsApp(updated);
      notify(`Đã cấp lại App Secret mới cho ứng dụng ${updated.name}.`);
      await loadData();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Lỗi cấp lại Secret.');
    } finally {
      setSubmitting(false);
    }
  }

  function getEnvSnippet(app: DeveloperAppItem) {
    return [
      '# Cấu hình AURELLE Marketplace cho file be/.env',
      'PORT=3000',
      `AURELLE_APP_KEY=${app.app_key}`,
      `AURELLE_APP_SECRET=${app.app_secret || '<secret_vua_cap>'}`,
      `AURELLE_REDIRECT_URI=${app.redirect_uri}`,
      'AURELLE_SANDBOX=true',
      'AURELLE_AUTH_PAGE_BASE_URL=http://localhost:4000',
      'AURELLE_AUTH_API_BASE_URL=http://localhost:4000/rest',
      'AURELLE_API_BASE_URL=http://localhost:4000/rest',
    ].join('\n');
  }

  const activeAppsCount = apps.filter((a) => a.status === 'active').length;
  const revokedAppsCount = apps.filter((a) => a.status === 'revoked').length;

  return (
    <div className="dev-shell">
      {/* Top Header */}
      <header className="dev-nav-header">
        <div className="dev-brand-group">
          <Link href="/developer" className="dev-brand">
            aurelle<span>DEVELOPERS</span>
          </Link>
          <div className="dev-sandbox-badge">
            <span className="dev-pulse-dot" />
            <span>SANDBOX CỤC BỘ</span>
          </div>
        </div>
        <div className="dev-nav-links">
          <a
            href="http://localhost:3000/api/docs"
            target="_blank"
            rel="noreferrer"
            className="dev-back-link"
          >
            Tài liệu Swagger ↗
          </a>
          <Link href="/" className="dev-back-link">
            ← Quay lại Cửa hàng
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="dev-main">
        <div className="dev-eyebrow">CỔNG NHÀ PHÁT TRIỂN & TÍCH HỢP HỆ THỐNG</div>
        <div className="dev-heading-row">
          <div>
            <h1>Quản lý Ứng dụng & Khóa kết nối API</h1>
            <p>
              Tạo và quản lý các ứng dụng kết nối giữa <strong>OptiPackAI</strong> với sàn
              thương mại điện tử <strong>Aurelle</strong> thông qua chuẩn Open API tương thích
              Lazada. Hỗ trợ đầy đủ thêm, sửa, xóa, thu hồi khóa (revoke) và cấp lại secret (rotate).
            </p>
          </div>
          <button
            type="button"
            className="dev-btn-primary"
            onClick={openCreateModal}
          >
            ＋ Tạo ứng dụng mới
          </button>
        </div>

        {/* Stats Bar */}
        <div className="dev-stats-bar">
          <div className="dev-stat-card">
            <span>Tổng ứng dụng</span>
            <strong>{apps.length}</strong>
          </div>
          <div className="dev-stat-card">
            <span>Đang hoạt động</span>
            <strong style={{ color: '#1b7a4c' }}>{activeAppsCount}</strong>
          </div>
          <div className="dev-stat-card">
            <span>Đã thu hồi (Revoked)</span>
            <strong style={{ color: revokedAppsCount > 0 ? '#c93b2b' : '#6a8177' }}>
              {revokedAppsCount}
            </strong>
          </div>
        </div>

        {/* App List */}
        {loading ? (
          <div className="dev-empty-state">
            <div className="dev-empty-symbol">◈</div>
            <h3>Đang tải danh sách ứng dụng...</h3>
          </div>
        ) : apps.length === 0 ? (
          <div className="dev-empty-state">
            <div className="dev-empty-symbol">◈</div>
            <h3>Chưa có ứng dụng nào được tạo</h3>
            <p>
              Bắt đầu tạo ứng dụng đầu tiên để kết nối OptiPackAI với sàn Aurelle và nhận bộ khóa API
              (App Key & App Secret).
            </p>
            <button
              type="button"
              className="dev-btn-primary"
              onClick={openCreateModal}
            >
              ＋ Tạo ứng dụng đầu tiên
            </button>
          </div>
        ) : (
          <div>
            {apps.map((app) => (
              <article
                key={app.app_key}
                className={`dev-app-card ${app.status === 'revoked' ? 'revoked-card' : ''}`}
              >
                <div className="dev-card-header">
                  <div className="dev-card-title-group">
                    <h3>{app.name}</h3>
                    <span className={`dev-status-badge ${app.status}`}>
                      {app.status === 'active' ? '● Đang hoạt động' : '✕ Đã thu hồi khóa'}
                    </span>
                  </div>
                  <div className="dev-field-actions">
                    <button
                      type="button"
                      className="dev-btn-secondary"
                      onClick={() => openEditModal(app)}
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      type="button"
                      className="dev-btn-warning"
                      onClick={() => setRotatingApp(app)}
                      title="Sinh App Secret mới và vô hiệu hóa Secret cũ"
                    >
                      🔄 Cấp lại Secret
                    </button>
                    {app.status === 'active' ? (
                      <button
                        type="button"
                        className="dev-btn-danger"
                        onClick={() => setRevokingApp(app)}
                        title="Vô hiệu hóa tạm thời App Key này"
                      >
                        🚫 Thu hồi khóa
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="dev-btn-secondary"
                        onClick={() => handleReactivate(app)}
                        title="Mở khóa lại cho ứng dụng"
                        style={{ color: '#1b7a4c', borderColor: '#b8dec8' }}
                      >
                        ❇️ Kích hoạt lại
                      </button>
                    )}
                    <button
                      type="button"
                      className="dev-btn-danger"
                      onClick={() => setDeletingApp(app)}
                      title="Xóa vĩnh viễn ứng dụng"
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </div>

                <div className="dev-field-grid">
                  <div className="dev-field-row">
                    <span className="dev-field-label">APP KEY</span>
                    <span className="dev-field-value">{app.app_key}</span>
                    <button
                      type="button"
                      className="dev-btn-copy"
                      onClick={() => copyToClipboard(app.app_key, 'App Key')}
                    >
                      Sao chép
                    </button>
                  </div>

                  <div className="dev-field-row">
                    <span className="dev-field-label">APP SECRET</span>
                    <span className="dev-field-value" style={{ color: '#889990' }}>
                      ••••••••••••••••••••••••••••••••
                    </span>
                    <button
                      type="button"
                      className="dev-btn-copy"
                      onClick={() => setRotatingApp(app)}
                      title="App Secret được mã hóa an toàn. Bấm để cấp lại nếu cần."
                    >
                      Cấp lại Secret
                    </button>
                  </div>

                  <div className="dev-field-row">
                    <span className="dev-field-label">REDIRECT URI</span>
                    <span className="dev-field-value">{app.redirect_uri}</span>
                    <button
                      type="button"
                      className="dev-btn-copy"
                      onClick={() => copyToClipboard(app.redirect_uri, 'Redirect URI')}
                    >
                      Sao chép
                    </button>
                  </div>
                </div>

                <div className="dev-card-footer">
                  <span>
                    Tạo ngày: {new Date(app.created_at).toLocaleString('vi-VN')}
                    {app.updated_at && ` · Cập nhật: ${new Date(app.updated_at).toLocaleString('vi-VN')}`}
                    {app.revoked_at && ` · Thu hồi lúc: ${new Date(app.revoked_at).toLocaleString('vi-VN')}`}
                  </span>
                  <span>Sandbox Protocol: Lazada HMAC-SHA256 Compatible</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Modal: Tạo ứng dụng mới */}
      {isCreateOpen && (
        <div className="dev-modal-backdrop" onClick={() => !submitting && setIsCreateOpen(false)}>
          <div className="dev-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dev-modal-header">
              <div>
                <div className="dev-eyebrow">ỨNG DỤNG MỚI</div>
                <h2>Tạo Ứng Dụng Tích Hợp</h2>
              </div>
              <button
                type="button"
                className="dev-btn-close"
                onClick={() => setIsCreateOpen(false)}
                disabled={submitting}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="dev-form-group">
                <label htmlFor="create-app-name">Tên ứng dụng *</label>
                <input
                  id="create-app-name"
                  type="text"
                  placeholder="Ví dụ: OptiPackAI Connect"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  autoFocus
                />
                <small>Tên dùng để nhận diện ứng dụng trong hệ thống và trang ủy quyền OAuth.</small>
              </div>

              <div className="dev-form-group">
                <label htmlFor="create-app-redirect">Redirect URI (Callback URL) *</label>
                <input
                  id="create-app-redirect"
                  type="url"
                  placeholder="http://localhost:3000/marketplace/aurelle/callback"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  required
                />
                <small>
                  Địa chỉ backend tiếp nhận mã ủy quyền sau khi người bán phê duyệt (phải dùng HTTP
                  trên localhost hoặc HTTPS).
                </small>
              </div>

              {formError && <div className="dev-notice-box" style={{ background: '#fdf0ee', color: '#c93b2b', borderColor: '#fad2ce' }}>{formError}</div>}

              <div className="dev-modal-actions">
                <button
                  type="button"
                  className="dev-btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={submitting}
                >
                  Hủy
                </button>
                <button type="submit" className="dev-btn-primary" disabled={submitting}>
                  {submitting ? 'Đang tạo...' : 'Tạo ứng dụng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Chỉnh sửa ứng dụng */}
      {editingApp && (
        <div className="dev-modal-backdrop" onClick={() => !submitting && setEditingApp(null)}>
          <div className="dev-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dev-modal-header">
              <div>
                <div className="dev-eyebrow">CHỈNH SỬA</div>
                <h2>Cập Nhật Ứng Dụng</h2>
              </div>
              <button
                type="button"
                className="dev-btn-close"
                onClick={() => setEditingApp(null)}
                disabled={submitting}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="dev-form-group">
                <label htmlFor="edit-app-key">App Key (Không thể thay đổi)</label>
                <input
                  id="edit-app-key"
                  type="text"
                  value={editingApp.app_key}
                  disabled
                  style={{ background: '#f4f7f5', color: '#688277' }}
                />
              </div>

              <div className="dev-form-group">
                <label htmlFor="edit-app-name">Tên ứng dụng *</label>
                <input
                  id="edit-app-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  autoFocus
                />
              </div>

              <div className="dev-form-group">
                <label htmlFor="edit-app-redirect">Redirect URI (Callback URL) *</label>
                <input
                  id="edit-app-redirect"
                  type="url"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  required
                />
              </div>

              {formError && <div className="dev-notice-box" style={{ background: '#fdf0ee', color: '#c93b2b', borderColor: '#fad2ce' }}>{formError}</div>}

              <div className="dev-modal-actions">
                <button
                  type="button"
                  className="dev-btn-secondary"
                  onClick={() => setEditingApp(null)}
                  disabled={submitting}
                >
                  Hủy
                </button>
                <button type="submit" className="dev-btn-primary" disabled={submitting}>
                  {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận Xóa */}
      {deletingApp && (
        <div className="dev-modal-backdrop" onClick={() => !submitting && setDeletingApp(null)}>
          <div className="dev-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dev-modal-header">
              <div>
                <div className="dev-eyebrow" style={{ color: '#c93b2b' }}>CẢNH BÁO</div>
                <h2>Xác Nhận Xóa Ứng Dụng</h2>
              </div>
              <button
                type="button"
                className="dev-btn-close"
                onClick={() => setDeletingApp(null)}
                disabled={submitting}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#445650' }}>
              Bạn có chắc chắn muốn xóa vĩnh viễn ứng dụng <strong>{deletingApp.name}</strong> (App Key:{' '}
              <code>{deletingApp.app_key}</code>)?
            </p>
            <div className="dev-notice-box" style={{ background: '#fff1f0', color: '#c93b2b', borderColor: '#f8d5d2' }}>
              Hành động này không thể hoàn tác. Mọi yêu cầu gọi API từ hệ thống sử dụng App Key này sẽ
              ngay lập tức bị từ chối.
            </div>
            <div className="dev-modal-actions">
              <button
                type="button"
                className="dev-btn-secondary"
                onClick={() => setDeletingApp(null)}
                disabled={submitting}
              >
                Hủy
              </button>
              <button
                type="button"
                className="dev-btn-danger"
                onClick={handleDeleteConfirm}
                disabled={submitting}
                style={{ padding: '10px 20px' }}
              >
                {submitting ? 'Đang xóa...' : 'Xác nhận xóa vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận Thu hồi khóa (Revoke) */}
      {revokingApp && (
        <div className="dev-modal-backdrop" onClick={() => !submitting && setRevokingApp(null)}>
          <div className="dev-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dev-modal-header">
              <div>
                <div className="dev-eyebrow" style={{ color: '#c93b2b' }}>REVOKE KEY</div>
                <h2>Thu Hồi Khóa API</h2>
              </div>
              <button
                type="button"
                className="dev-btn-close"
                onClick={() => setRevokingApp(null)}
                disabled={submitting}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#445650' }}>
              Bạn đang chuẩn bị thu hồi khóa API của ứng dụng <strong>{revokingApp.name}</strong>.
            </p>
            <div className="dev-notice-box" style={{ background: '#fff1f0', color: '#c93b2b', borderColor: '#f8d5d2' }}>
              Khi bị thu hồi:
              <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
                <li>Mọi yêu cầu ký HMAC-SHA256 từ OptiPackAI sẽ bị từ chối chữ ký.</li>
                <li>Trang cấp quyền OAuth sẽ chặn đăng nhập với mã 403 Forbidden.</li>
                <li>Bạn có thể bấm <strong>Kích hoạt lại</strong> bất cứ lúc nào để mở lại quyền.</li>
              </ul>
            </div>
            <div className="dev-modal-actions">
              <button
                type="button"
                className="dev-btn-secondary"
                onClick={() => setRevokingApp(null)}
                disabled={submitting}
              >
                Hủy
              </button>
              <button
                type="button"
                className="dev-btn-danger"
                onClick={handleRevokeConfirm}
                disabled={submitting}
                style={{ padding: '10px 20px' }}
              >
                {submitting ? 'Đang thu hồi...' : 'Xác nhận thu hồi khóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận Cấp lại Secret (Rotate) */}
      {rotatingApp && (
        <div className="dev-modal-backdrop" onClick={() => !submitting && setRotatingApp(null)}>
          <div className="dev-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dev-modal-header">
              <div>
                <div className="dev-eyebrow" style={{ color: '#b86e00' }}>ROTATE SECRET</div>
                <h2>Cấp Lại App Secret Mới</h2>
              </div>
              <button
                type="button"
                className="dev-btn-close"
                onClick={() => setRotatingApp(null)}
                disabled={submitting}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#445650' }}>
              Bạn có chắc chắn muốn cấp lại <strong>App Secret</strong> cho ứng dụng{' '}
              <strong>{rotatingApp.name}</strong>?
            </p>
            <div className="dev-notice-box">
              ⚠️ Secret cũ sẽ bị vô hiệu hóa ngay lập tức. Bạn sẽ nhận được Secret mới và cần cập
              nhật lại vào biến môi trường <code>AURELLE_APP_SECRET</code> trong file{' '}
              <code>be/.env</code>.
            </div>
            <div className="dev-modal-actions">
              <button
                type="button"
                className="dev-btn-secondary"
                onClick={() => setRotatingApp(null)}
                disabled={submitting}
              >
                Hủy
              </button>
              <button
                type="button"
                className="dev-btn-warning"
                onClick={handleRotateConfirm}
                disabled={submitting}
                style={{ padding: '10px 20px' }}
              >
                {submitting ? 'Đang cấp lại...' : 'Tiến hành cấp lại Secret'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Hiển thị thông tin kết nối mới (Credentials & .env) */}
      {credentialsApp && (
        <div className="dev-modal-backdrop" onClick={() => setCredentialsApp(null)}>
          <div className="dev-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dev-modal-header">
              <div>
                <div className="dev-eyebrow" style={{ color: '#175b46' }}>THÔNG TIN KẾT NỐI API</div>
                <h2>Khóa Kết Nối Mới Đã Được Cấp</h2>
              </div>
              <button
                type="button"
                className="dev-btn-close"
                onClick={() => setCredentialsApp(null)}
              >
                ✕
              </button>
            </div>

            <div className="dev-notice-box" style={{ background: '#edf8f2', borderColor: '#cbebd8', color: '#18593a' }}>
              🔒 <strong>Lưu ý quan trọng</strong>: App Secret chỉ được hiển thị đầy đủ ngay lúc này. Hãy sao chép và lưu trữ an toàn trước khi đóng hộp thoại này.
            </div>

            <div className="dev-field-grid" style={{ marginBottom: '18px' }}>
              <div className="dev-field-row">
                <span className="dev-field-label">APP KEY</span>
                <span className="dev-field-value">{credentialsApp.app_key}</span>
                <button
                  type="button"
                  className="dev-btn-copy"
                  onClick={() => copyToClipboard(credentialsApp.app_key, 'App Key')}
                >
                  Sao chép
                </button>
              </div>

              <div className="dev-field-row">
                <span className="dev-field-label">APP SECRET</span>
                <span className="dev-field-value">
                  {showSecret
                    ? credentialsApp.app_secret
                    : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                </span>
                <div className="dev-field-actions">
                  <button
                    type="button"
                    className="dev-btn-copy"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? 'Ẩn' : 'Hiện'}
                  </button>
                  {credentialsApp.app_secret && (
                    <button
                      type="button"
                      className="dev-btn-copy"
                      onClick={() =>
                        copyToClipboard(credentialsApp.app_secret || '', 'App Secret')
                      }
                    >
                      Sao chép
                    </button>
                  )}
                </div>
              </div>

              <div className="dev-field-row">
                <span className="dev-field-label">REDIRECT URI</span>
                <span className="dev-field-value">{credentialsApp.redirect_uri}</span>
                <button
                  type="button"
                  className="dev-btn-copy"
                  onClick={() => copyToClipboard(credentialsApp.redirect_uri, 'Redirect URI')}
                >
                  Sao chép
                </button>
              </div>
            </div>

            <div className="dev-form-group">
              <label>Đoạn cấu hình mẫu cho file be/.env của OptiPackAI:</label>
              <div className="dev-code-box">{getEnvSnippet(credentialsApp)}</div>
            </div>

            <div className="dev-modal-actions">
              <button
                type="button"
                className="dev-btn-secondary"
                onClick={() => copyToClipboard(getEnvSnippet(credentialsApp), 'cấu hình .env')}
              >
                📋 Sao chép cấu hình .env
              </button>
              <button
                type="button"
                className="dev-btn-primary"
                onClick={() => setCredentialsApp(null)}
              >
                Hoàn tất & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast popup */}
      {toastMessage && <div className="dev-toast">{toastMessage}</div>}
    </div>
  );
}
