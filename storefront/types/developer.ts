export type AppStatus = 'active' | 'revoked';

export interface DeveloperAppItem {
  app_key: string;
  app_secret?: string; // Chỉ trả về khi vừa tạo mới hoặc vừa cấp lại Secret
  name: string;
  redirect_uri: string;
  status: AppStatus;
  created_at: string;
  updated_at?: string;
  revoked_at?: string | null;
}

export interface CreateAppInput {
  name: string;
  redirect_uri: string;
}

export interface UpdateAppInput {
  name?: string;
  redirect_uri?: string;
}
