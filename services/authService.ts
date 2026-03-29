/**
 * 认证 & 支付 & 订阅 服务
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://student-value-backend.onrender.com';

// ============================================
// Token 管理
// ============================================

const TOKEN_KEY = 'wj_token';
const USER_KEY = 'wj_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredUser(): WjUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: WjUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** 给所有 API 请求加 Authorization 头 */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ============================================
// 类型
// ============================================

export interface WjUser {
  id: string;
  nickname?: string;
  avatar_url?: string;
}

export interface SubscriptionStatus {
  active: boolean;
  plan_type: string | null;
  expires_at: string | null;
  remaining_days: number;
}

export interface OrderInfo {
  order_no: string;
  code_url: string;
  amount: string;
  plan_name: string;
}

// ============================================
// 微信登录
// ============================================

/** 获取微信扫码登录的授权 URL */
export async function getWechatQrUrl(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/wechat/qrcode`);
  const data = await res.json();
  if (!data.success) throw new Error('获取微信登录链接失败');
  return data.data.auth_url;
}

/** 用微信回调 code 换取 JWT + 用户信息 */
export async function wechatLogin(code: string): Promise<{
  user: WjUser;
  token: string;
  subscription: SubscriptionStatus;
}> {
  const res = await fetch(`${API_BASE}/api/auth/wechat/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '微信登录失败');

  // 持久化
  setToken(data.data.token);
  setStoredUser(data.data.user);

  return data.data;
}

/** 获取当前用户信息 + 订阅状态（用已有 token） */
export async function fetchMe(): Promise<{
  user: WjUser;
  subscription: SubscriptionStatus;
} | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearAuth();
        return null;
      }
      return null;
    }

    const data = await res.json();
    if (!data.success) return null;

    setStoredUser(data.data.user);
    return data.data;
  } catch {
    return null;
  }
}

// ============================================
// 支付
// ============================================

/** 创建支付订单 */
export async function createOrder(planType: string = 'weekly'): Promise<OrderInfo> {
  const res = await fetch(`${API_BASE}/api/pay/create-order`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ plan_type: planType }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '创建订单失败');
  return data.data;
}

/** 查询订单状态 */
export async function checkOrderStatus(orderNo: string): Promise<{
  status: string;
  subscription?: SubscriptionStatus;
}> {
  const res = await fetch(`${API_BASE}/api/pay/order/${orderNo}`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '查询订单失败');
  return data.data;
}

// ============================================
// 订阅
// ============================================

/** 查询订阅状态 */
export async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  const res = await fetch(`${API_BASE}/api/subscription/status`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '查询订阅失败');
  return data.data;
}
