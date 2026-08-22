import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  CheckCircle2,
  Copy,
  Globe,
  Key,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Plus,
  Shield,
  ShieldCheck,
  Store,
  Trash2,
  User,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import {
  PLATFORM_META,
  type ShopPlatform,
} from '../context/portal-context-value'
import { usePortal } from '../context/use-portal'
import { useAuth } from '../context/use-auth'
import { changePassword, setupMfa, verifyMfaSetup } from '../api/auth.api'
import { fetchMyProfile, updateMyProfile } from '../api/users.api'
import { formatApiError } from '../lib/api'
import { validateNewPassword } from '../lib/password'
import { USER_ROLE_LABELS } from '../types/auth'

type ProfileTab = 'personal' | 'marketplaces' | 'preferences'

const inputClass =
  'w-full rounded-md border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink caret-ink placeholder:text-ink-tertiary transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40'

const readOnlyInputClass = `${inputClass} cursor-not-allowed opacity-80`

const optionClass = 'bg-surface-2 text-ink'

function profileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

function isLikelyImageUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function mfaQrImageUrl(otpauthUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpauthUrl)}`
}

function formatJoinedDate(iso: string | undefined, vi: boolean): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(vi ? 'vi-VN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function Toast({
  message,
  onClose,
}: {
  message: string
  onClose: () => void
}) {
  return (
    <div className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-success/30 bg-surface-1 px-4 py-3 shadow-lg shadow-black/30">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-ink-subtle hover:text-ink"
      >
        ✕
      </button>
    </div>
  )
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="mb-1 block text-xs font-medium text-ink-subtle">
      {children}
    </label>
  )
}

export function ProfilePage() {
  const navigate = useNavigate()
  const {
    locale,
    setLocale,
    shops,
    addShop,
    removeShop,
    activeShopIds,
    isShopActive,
    toggleShopActive,
    activateAllShops,
  } = usePortal()
  const { logout } = useAuth()
  const vi = locale === 'vi'
  const [tab, setTab] = useState<ProfileTab>('personal')
  const [loggingOut, setLoggingOut] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [avatar, setAvatar] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [department, setDepartment] = useState('')
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [roleLabel, setRoleLabel] = useState('')
  const [userId, setUserId] = useState('')
  const [joinedAt, setJoinedAt] = useState<string | undefined>()
  const [loadingProfile, setLoadingProfile] = useState(true)

  const [mfaSetupUrl, setMfaSetupUrl] = useState<string | null>(null)
  const [mfaVerifyToken, setMfaVerifyToken] = useState('')
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([])
  const [settingUpMfa, setSettingUpMfa] = useState(false)
  const [verifyingMfa, setVerifyingMfa] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [notifyConsolidation, setNotifyConsolidation] = useState(true)
  const [notifyWebhookFail, setNotifyWebhookFail] = useState(true)
  const [notifyDailyReport, setNotifyDailyReport] = useState(false)

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [refreshingOAuth, setRefreshingOAuth] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [addingShop, setAddingShop] = useState(false)
  const [showAddShop, setShowAddShop] = useState(false)
  const [newPlatform, setNewPlatform] = useState<ShopPlatform>('shopee')
  const [newAccount, setNewAccount] = useState('')
  const [newStoreLabel, setNewStoreLabel] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const activeShops = shops.filter((s) => activeShopIds.includes(s.id))
  const connectedPlatforms = [
    ...new Set(activeShops.map((s) => s.platform)),
  ]
  const storeBannerLabel =
    activeShops[0]?.store_label ?? shops[0]?.store_label ?? 'Anh Minh Store'
  const platformBanner =
    connectedPlatforms.map((p) => PLATFORM_META[p].label).join(' + ') ||
    '—'
  const activeCountLabel = `${activeShopIds.length}/${shops.length}`

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  useEffect(() => {
    let cancelled = false
    setLoadingProfile(true)
    void fetchMyProfile()
      .then((profile) => {
        if (cancelled) return
        setFullName(profile.name)
        setEmail(profile.email)
        setPhone(profile.phone ?? '')
        setAddress(profile.address ?? '')
        setAvatar(profile.avatar ?? '')
        setEmployeeCode(profile.employeeCode ?? '')
        setDepartment(profile.department ?? '')
        setMfaEnabled(profile.mfaEnabled)
        setRoleLabel(
          vi
            ? USER_ROLE_LABELS[profile.role].vi
            : USER_ROLE_LABELS[profile.role].en,
        )
        setUserId(profile.id)
        setJoinedAt(profile.createdAt)
      })
      .catch((err: unknown) => {
        if (!cancelled) showToast(formatApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false)
      })
    return () => {
      cancelled = true
    }
  }, [vi])

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
    setLoggingOut(false)
    navigate('/login', { replace: true })
  }

  async function simulateSave(
    setLoading: (v: boolean) => void,
    successMessage: string,
  ) {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 900))
    setLoading(false)
    showToast(successMessage)
  }

  function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    void updateMyProfile({
      phone: phone.trim(),
      address: address.trim(),
      avatar: avatar.trim(),
    })
      .then((profile) => {
        setPhone(profile.phone ?? '')
        setAddress(profile.address ?? '')
        setAvatar(profile.avatar ?? '')
        showToast(vi ? 'Đã cập nhật hồ sơ cá nhân' : 'Profile details saved')
      })
      .catch((err: unknown) => {
        showToast(formatApiError(err))
      })
      .finally(() => {
        setSavingProfile(false)
      })
  }

  async function handleStartMfaSetup() {
    setSettingUpMfa(true)
    setMfaBackupCodes([])
    try {
      const res = await setupMfa()
      setMfaSetupUrl(res.otpauthUrl)
      setMfaVerifyToken('')
    } catch (err: unknown) {
      showToast(formatApiError(err))
    } finally {
      setSettingUpMfa(false)
    }
  }

  async function handleVerifyMfaSetup(e: FormEvent) {
    e.preventDefault()
    const token = mfaVerifyToken.trim()
    if (!/^\d{6}$/.test(token)) {
      showToast(vi ? 'Nhập mã xác thực 6 số' : 'Enter a 6-digit verification code')
      return
    }
    setVerifyingMfa(true)
    try {
      const res = await verifyMfaSetup(token)
      setMfaEnabled(true)
      setMfaSetupUrl(null)
      setMfaVerifyToken('')
      setMfaBackupCodes(res.backup_codes)
      showToast(res.message)
    } catch (err: unknown) {
      showToast(formatApiError(err))
    } finally {
      setVerifyingMfa(false)
    }
  }

  async function copyBackupCodes() {
    if (mfaBackupCodes.length === 0) return
    try {
      await navigator.clipboard.writeText(mfaBackupCodes.join('\n'))
      showToast(vi ? 'Đã sao chép mã dự phòng' : 'Backup codes copied')
    } catch {
      showToast(vi ? 'Không thể sao chép' : 'Could not copy')
    }
  }

  function handleUpdatePassword(e: FormEvent) {
    e.preventDefault()
    if (!currentPassword || !newPassword) {
      showToast(vi ? 'Vui lòng nhập đủ mật khẩu' : 'Please fill password fields')
      return
    }
    if (newPassword !== confirmPassword) {
      showToast(
        vi ? 'Mật khẩu xác nhận không khớp' : 'Passwords do not match',
      )
      return
    }
    const policy = validateNewPassword(newPassword)
    if (policy) {
      showToast(policy)
      return
    }
    setSavingPassword(true)
    void changePassword(currentPassword, newPassword)
      .then(async () => {
        showToast(vi ? 'Đã đổi mật khẩu' : 'Password updated')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        await logout()
        navigate('/login', { replace: true })
      })
      .catch((err: unknown) => {
        showToast(formatApiError(err))
      })
      .finally(() => {
        setSavingPassword(false)
      })
  }

  async function handleAddShop(e: FormEvent) {
    e.preventDefault()
    const account = newAccount.trim()
    const label = newStoreLabel.trim() || storeBannerLabel
    if (!account) {
      showToast(
        vi ? 'Nhập tên tài khoản shop' : 'Enter shop account name',
      )
      return
    }
    if (
      shops.some(
        (s) =>
          s.platform === newPlatform &&
          s.account_name.toLowerCase() === account.toLowerCase(),
      )
    ) {
      showToast(
        vi ? 'Shop này đã được kết nối' : 'This shop is already connected',
      )
      return
    }
    setAddingShop(true)
    await new Promise((r) => setTimeout(r, 700))
    addShop({
      platform: newPlatform,
      account_name: account,
      store_label: label,
    })
    setAddingShop(false)
    setNewAccount('')
    setNewStoreLabel('')
    setShowAddShop(false)
    showToast(
      vi
        ? `Đã thêm shop ${PLATFORM_META[newPlatform].label}`
        : `Added ${PLATFORM_META[newPlatform].label} shop`,
    )
  }

  const tabs: Array<{ key: ProfileTab; label: string; icon: typeof User }> = [
    {
      key: 'personal',
      label: vi ? 'Personal Info & Security' : 'Personal Info & Security',
      icon: Shield,
    },
    {
      key: 'marketplaces',
      label: vi ? 'Connected Marketplaces' : 'Connected Marketplaces',
      icon: Store,
    },
    {
      key: 'preferences',
      label: vi ? 'System Preferences' : 'System Preferences',
      icon: Bell,
    },
  ]

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Hồ sơ & Cài đặt' : 'Profile & Settings' },
        ]}
      />
      <main className="flex min-h-0 flex-1 overflow-auto bg-canvas p-3 sm:p-4">
        <div className="mx-auto w-full max-w-4xl space-y-3">
          {/* Banner */}
          <section className="rounded-xl border border-hairline bg-surface-1 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative shrink-0">
                {isLikelyImageUrl(avatar) ? (
                  <img
                    src={avatar.trim()}
                    alt=""
                    className="h-12 w-12 rounded-full border-2 border-primary object-cover shadow-[0_0_20px_rgba(99,102,241,0.25)]"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-primary/15 text-sm font-semibold text-primary-hover shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                    {loadingProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      profileInitials(fullName || '?')
                    )}
                  </div>
                )}
                <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface-1 bg-success" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-ink">
                    {fullName}
                  </h1>
                  <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary-hover">
                    {roleLabel || '—'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    Active
                  </span>
                  {mfaEnabled ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary-hover">
                      <ShieldCheck className="h-3 w-3" strokeWidth={2} />
                      MFA
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                  <Store className="h-3.5 w-3.5 text-ink-subtle" strokeWidth={1.75} />
                  {storeBannerLabel} · {activeCountLabel}{' '}
                  {vi ? 'shop active' : 'shops active'} ({platformBanner})
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-tertiary">
                  {vi ? 'Tham gia' : 'Joined'}: {formatJoinedDate(joinedAt, vi)}
                  {userId ? ` · ID ${userId}` : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-9 min-h-9 shrink-0 border-error/30 text-error hover:bg-error/10 hover:text-error"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
              >
                {loggingOut ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-1.5 h-4 w-4" />
                )}
                {vi ? 'Đăng xuất' : 'Log out'}
              </Button>
            </div>
          </section>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface-1 p-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:justify-start ${
                  tab === key
                    ? 'bg-primary/15 text-primary-hover'
                    : 'text-ink-subtle hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {/* Tab 1 */}
          {tab === 'personal' ? (
            <div className="space-y-3">
              <form
                onSubmit={handleSaveProfile}
                className="rounded-xl border border-hairline bg-surface-1 p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <User className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
                  {vi ? 'Thông tin hồ sơ' : 'Profile Details'}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <FieldLabel>{vi ? 'Họ và tên' : 'Full Name'}</FieldLabel>
                    <input
                      className={readOnlyInputClass}
                      value={fullName}
                      readOnly
                    />
                  </div>
                  <div>
                    <FieldLabel>{vi ? 'Email công việc' : 'Work Email'}</FieldLabel>
                    <div className="relative">
                      <input
                        className={`${inputClass} pr-24`}
                        value={email}
                        readOnly
                      />
                      <span className="absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-1 rounded-full border border-success/20 bg-success-bg px-2 py-0.5 text-[10px] font-medium text-success">
                        <Check className="h-3 w-3" strokeWidth={2.5} />
                        Verified
                      </span>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>{vi ? 'Số điện thoại' : 'Phone Number'}</FieldLabel>
                    <input
                      className={`${inputClass} font-mono`}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      maxLength={20}
                      placeholder={vi ? '0912345678' : '0912345678'}
                      disabled={loadingProfile}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>{vi ? 'Địa chỉ' : 'Address'}</FieldLabel>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-subtle" strokeWidth={1.75} />
                      <input
                        className={`${inputClass} pl-9`}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        maxLength={255}
                        placeholder={
                          vi
                            ? '123 Nguyễn Văn Cừ, Q5, TP.HCM'
                            : '123 Example Street, District 5'
                        }
                        disabled={loadingProfile}
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>{vi ? 'Ảnh đại diện (URL)' : 'Avatar URL'}</FieldLabel>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <input
                        className={`${inputClass} flex-1 font-mono text-xs sm:text-sm`}
                        value={avatar}
                        onChange={(e) => setAvatar(e.target.value)}
                        placeholder="https://..."
                        disabled={loadingProfile}
                      />
                      {isLikelyImageUrl(avatar) ? (
                        <img
                          src={avatar.trim()}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg border border-hairline object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-2 text-[10px] text-ink-subtle">
                          {profileInitials(fullName || '?')}
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-tertiary">
                      {vi
                        ? 'Dán URL ảnh đã upload sẵn (BE chưa hỗ trợ upload file trực tiếp).'
                        : 'Paste a hosted image URL (direct file upload is not supported yet).'}
                    </p>
                  </div>
                  {employeeCode ? (
                    <div>
                      <FieldLabel>{vi ? 'Mã nhân viên' : 'Employee Code'}</FieldLabel>
                      <input
                        className={`${readOnlyInputClass} font-mono`}
                        value={employeeCode}
                        readOnly
                      />
                    </div>
                  ) : null}
                  {department ? (
                    <div>
                      <FieldLabel>{vi ? 'Phòng ban' : 'Department'}</FieldLabel>
                      <input
                        className={readOnlyInputClass}
                        value={department}
                        readOnly
                      />
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <FieldLabel>{vi ? 'Vai trò hệ thống' : 'System Role'}</FieldLabel>
                    <input
                      className={readOnlyInputClass}
                      value={roleLabel}
                      readOnly
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  className="mt-3 h-9 min-h-9"
                  disabled={savingProfile || loadingProfile}
                >
                  {savingProfile ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-4 w-4" />
                  )}
                  {vi ? 'Lưu hồ sơ' : 'Save Profile'}
                </Button>
              </form>

              <form
                onSubmit={handleUpdatePassword}
                className="rounded-xl border border-hairline bg-surface-1 p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Lock className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
                  {vi ? 'Đổi mật khẩu' : 'Password Change'}
                </div>
                <div className="grid gap-3">
                  <div>
                    <FieldLabel>
                      {vi ? 'Mật khẩu hiện tại' : 'Current Password'}
                    </FieldLabel>
                    <input
                      type="password"
                      className={inputClass}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder={vi ? 'Nhập mật khẩu hiện tại' : 'Enter current password'}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>
                        {vi ? 'Mật khẩu mới' : 'New Password'}
                      </FieldLabel>
                      <input
                        type="password"
                        className={inputClass}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder={vi ? 'Mật khẩu mới' : 'New password'}
                      />
                    </div>
                    <div>
                      <FieldLabel>
                        {vi ? 'Xác nhận mật khẩu mới' : 'Confirm New Password'}
                      </FieldLabel>
                      <input
                        type="password"
                        className={inputClass}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder={vi ? 'Nhập lại mật khẩu' : 'Confirm password'}
                      />
                    </div>
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  className="mt-3 h-9 min-h-9"
                  disabled={savingPassword}
                >
                  {savingPassword ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Key className="mr-1.5 h-4 w-4" />
                  )}
                  {vi ? 'Cập nhật mật khẩu' : 'Update Password'}
                </Button>
              </form>

              <section className="rounded-xl border border-hairline bg-surface-1 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <ShieldCheck className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
                  {vi ? 'Xác thực 2 lớp (MFA)' : 'Two-Factor Authentication (MFA)'}
                </div>

                {mfaEnabled ? (
                  <div className="rounded-lg border border-success/20 bg-success-bg/40 px-3 py-2.5">
                    <p className="text-sm text-ink">
                      {vi
                        ? 'MFA đang bật cho tài khoản này.'
                        : 'MFA is enabled on this account.'}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-subtle">
                      {vi
                        ? 'Dùng mã từ ứng dụng Authenticator hoặc mã dự phòng khi đăng nhập. Liên hệ Admin nếu cần tắt MFA.'
                        : 'Use your authenticator app or backup codes at login. Contact an Admin to disable MFA.'}
                    </p>
                  </div>
                ) : mfaBackupCodes.length > 0 ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-success/20 bg-success-bg/40 px-3 py-2.5">
                      <p className="text-sm font-medium text-ink">
                        {vi ? 'MFA đã được kích hoạt' : 'MFA activated successfully'}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-subtle">
                        {vi
                          ? 'Lưu các mã dự phòng dưới đây — chỉ hiển thị một lần.'
                          : 'Save these backup codes — shown only once.'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                      <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-ink sm:grid-cols-3">
                        {mfaBackupCodes.map((code) => (
                          <span key={code} className="rounded bg-canvas px-2 py-1">
                            {code}
                          </span>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="mt-3 h-8 min-h-8 text-xs"
                        onClick={() => void copyBackupCodes()}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        {vi ? 'Sao chép mã' : 'Copy codes'}
                      </Button>
                    </div>
                  </div>
                ) : mfaSetupUrl ? (
                  <form onSubmit={handleVerifyMfaSetup} className="space-y-3">
                    <p className="text-xs text-ink-subtle">
                      {vi
                        ? 'Quét QR bằng Google Authenticator (hoặc app tương tự), rồi nhập mã 6 số.'
                        : 'Scan the QR with Google Authenticator (or similar), then enter the 6-digit code.'}
                    </p>
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-surface-2 p-4 sm:flex-row sm:items-start">
                      <img
                        src={mfaQrImageUrl(mfaSetupUrl)}
                        alt={vi ? 'Mã QR MFA' : 'MFA QR code'}
                        className="h-[180px] w-[180px] rounded-md border border-hairline bg-white p-1"
                      />
                      <div className="min-w-0 flex-1">
                        <FieldLabel>{vi ? 'Mã xác thực' : 'Verification code'}</FieldLabel>
                        <input
                          className={`${inputClass} font-mono`}
                          value={mfaVerifyToken}
                          onChange={(e) => setMfaVerifyToken(e.target.value)}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          placeholder="000000"
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="submit"
                            variant="primary"
                            className="h-9 min-h-9"
                            disabled={verifyingMfa}
                          >
                            {verifyingMfa ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="mr-1.5 h-4 w-4" />
                            )}
                            {vi ? 'Kích hoạt MFA' : 'Enable MFA'}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-9 min-h-9"
                            onClick={() => {
                              setMfaSetupUrl(null)
                              setMfaVerifyToken('')
                            }}
                          >
                            {vi ? 'Hủy' : 'Cancel'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2 px-3 py-2.5">
                    <div>
                      <p className="text-sm text-ink">
                        {vi ? 'MFA chưa được bật' : 'MFA is not enabled'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-subtle">
                        {vi
                          ? 'Tùy chọn — tăng bảo mật khi đăng nhập.'
                          : 'Optional — adds an extra layer of sign-in security.'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      className="h-9 min-h-9 shrink-0"
                      disabled={settingUpMfa || loadingProfile}
                      onClick={() => void handleStartMfaSetup()}
                    >
                      {settingUpMfa ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Shield className="mr-1.5 h-4 w-4" />
                      )}
                      {vi ? 'Thiết lập MFA' : 'Set up MFA'}
                    </Button>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {/* Tab 2 */}
          {tab === 'marketplaces' ? (
            <section className="rounded-xl border border-hairline bg-surface-1 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Store className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
                    {vi ? 'Shop đã kết nối' : 'Connected shops'}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-subtle">
                    {vi
                      ? `Có thể bật nhiều shop cùng lúc · đang active ${activeCountLabel}`
                      : `Multi-shop sync · ${activeCountLabel} active`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="h-9 min-h-9 text-xs"
                    onClick={() => {
                      activateAllShops()
                      showToast(
                        vi
                          ? 'Đã active tất cả shop'
                          : 'All shops activated',
                      )
                    }}
                  >
                    {vi ? 'Active tất cả' : 'Activate all'}
                  </Button>
                  <Button
                    variant="primary"
                    className="h-9 min-h-9 text-xs"
                    onClick={() => setShowAddShop((v) => !v)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {vi ? 'Thêm shop' : 'Add shop'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-9 min-h-9 text-xs"
                    disabled={refreshingOAuth}
                    onClick={() =>
                      void simulateSave(
                        setRefreshingOAuth,
                        vi
                          ? 'Đã làm mới OAuth keys'
                          : 'Marketplace OAuth keys refreshed',
                      )
                    }
                  >
                    {refreshingOAuth ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Key className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Refresh OAuth
                  </Button>
                </div>
              </div>

              {showAddShop ? (
                <form
                  onSubmit={handleAddShop}
                  className="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
                >
                  <p className="mb-3 text-sm font-medium text-ink">
                    {vi ? 'Kết nối shop mới' : 'Connect a new shop'}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <FieldLabel>{vi ? 'Sàn' : 'Platform'}</FieldLabel>
                      <select
                        className={inputClass}
                        value={newPlatform}
                        onChange={(e) =>
                          setNewPlatform(e.target.value as ShopPlatform)
                        }
                      >
                        <option value="shopee" className={optionClass}>
                          Shopee
                        </option>
                        <option value="tiktok" className={optionClass}>
                          TikTok Shop
                        </option>
                      </select>
                    </div>
                    <div>
                      <FieldLabel>
                        {vi ? 'Tên tài khoản shop' : 'Shop account name'}
                      </FieldLabel>
                      <input
                        className={inputClass}
                        value={newAccount}
                        onChange={(e) => setNewAccount(e.target.value)}
                        placeholder={
                          newPlatform === 'shopee'
                            ? 'e.g. AnhMinh_Outlet'
                            : 'e.g. AnhMinh_Live'
                        }
                      />
                    </div>
                    <div>
                      <FieldLabel>
                        {vi ? 'Nhãn cửa hàng' : 'Store label'}
                      </FieldLabel>
                      <input
                        className={inputClass}
                        value={newStoreLabel}
                        onChange={(e) => setNewStoreLabel(e.target.value)}
                        placeholder={storeBannerLabel}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      className="h-9 min-h-9 text-xs"
                      disabled={addingShop}
                    >
                      {addingShop ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {vi ? 'Xác nhận kết nối' : 'Confirm connect'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 min-h-9 text-xs"
                      onClick={() => setShowAddShop(false)}
                    >
                      {vi ? 'Hủy' : 'Cancel'}
                    </Button>
                  </div>
                </form>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-1">
                {shops.map((shop) => {
                  const meta = PLATFORM_META[shop.platform]
                  const isActive = isShopActive(shop.id)
                  return (
                    <div
                      key={shop.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-canvas px-4 py-3.5 ${
                        isActive
                          ? 'border-primary/40 ring-1 ring-primary/20'
                          : 'border-hairline opacity-80'
                      }`}
                      style={{
                        borderLeftWidth: 3,
                        borderLeftColor: meta.accent,
                      }}
                    >
                      <div className="min-w-0">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: meta.accent }}
                        >
                          {meta.label}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-ink-muted">
                          {shop.account_name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-subtle">
                          {shop.store_label} ·{' '}
                          <span className="text-success">
                            Connected (Token valid)
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isActive}
                          onClick={() => {
                            const wasActive = isActive
                            toggleShopActive(shop.id)
                            if (wasActive && activeShopIds.length <= 1) {
                              showToast(
                                vi
                                  ? 'Phải giữ ít nhất 1 shop active'
                                  : 'Keep at least 1 shop active',
                              )
                              return
                            }
                            showToast(
                              wasActive
                                ? vi
                                  ? `Đã tắt ${shop.account_name}`
                                  : `Deactivated ${shop.account_name}`
                                : vi
                                  ? `Đã bật ${shop.account_name}`
                                  : `Activated ${shop.account_name}`,
                            )
                          }}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                            isActive ? 'bg-primary' : 'bg-surface-3'
                          }`}
                          title={isActive ? 'Deactivate' : 'Activate'}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                              isActive ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span
                          className={`inline-flex h-8 items-center rounded-md border px-2 text-[11px] font-medium ${
                            isActive
                              ? 'border-primary/20 bg-primary/10 text-primary-hover'
                              : 'border-hairline text-ink-subtle'
                          }`}
                        >
                          {isActive ? 'Active' : 'Off'}
                        </span>
                        <Button
                          variant="ghost"
                          className="h-8 min-h-8 text-xs text-error hover:text-error"
                          disabled={shops.length <= 1}
                          onClick={() => {
                            removeShop(shop.id)
                            showToast(
                              vi
                                ? `Đã gỡ ${shop.account_name}`
                                : `Removed ${shop.account_name}`,
                            )
                          }}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {vi ? 'Gỡ' : 'Remove'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {/* Tab 3 */}
          {tab === 'preferences' ? (
            <div className="space-y-3">
              <section className="rounded-xl border border-hairline bg-surface-1 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Globe className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
                  {vi ? 'Ngôn ngữ' : 'Language Selection'}
                </div>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      { id: 'vi' as const, label: 'Tiếng Việt' },
                      { id: 'en' as const, label: 'English' },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                        locale === opt.id
                          ? 'border-primary/40 bg-primary/10 text-primary-hover'
                          : 'border-hairline bg-canvas text-ink-muted hover:border-primary/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="locale"
                        className="accent-[#6366F1]"
                        checked={locale === opt.id}
                        onChange={() => setLocale(opt.id)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-hairline bg-surface-1 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Bell className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
                  {vi ? 'Thông báo' : 'Notifications'}
                </div>
                <ul className="space-y-2">
                  {(
                    [
                      {
                        key: 'consolidation',
                        checked: notifyConsolidation,
                        set: setNotifyConsolidation,
                        label:
                          'Email alert when AI suggests order consolidation',
                      },
                      {
                        key: 'webhook',
                        checked: notifyWebhookFail,
                        set: setNotifyWebhookFail,
                        label: 'Alert on Webhook sync failures',
                      },
                      {
                        key: 'daily',
                        checked: notifyDailyReport,
                        set: setNotifyDailyReport,
                        label: 'Daily fulfillment summary report',
                      },
                    ] as const
                  ).map((item) => (
                    <li
                      key={item.key}
                      className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas px-4 py-3"
                    >
                      <span className="text-sm text-ink">{item.label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.checked}
                        onClick={() => item.set(!item.checked)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                          item.checked ? 'bg-primary' : 'bg-surface-3'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                            item.checked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="primary"
                  className="mt-3 h-9 min-h-9"
                  disabled={savingPrefs}
                  onClick={() =>
                    void simulateSave(
                      setSavingPrefs,
                      vi ? 'Đã lưu preferences' : 'Preferences saved',
                    )
                  }
                >
                  {savingPrefs ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-4 w-4" />
                  )}
                  {vi ? 'Lưu preferences' : 'Save preferences'}
                </Button>
              </section>
            </div>
          ) : null}
        </div>
      </main>

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  )
}
