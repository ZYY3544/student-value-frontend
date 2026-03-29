import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { wechatLogin } from '../services/authService';

/**
 * 微信 OAuth 回调页
 * 微信授权后重定向到 /auth/wechat/callback?code=xxx&state=xxx
 * 这个组件拿到 code 后调用后端换 JWT
 */
interface WechatCallbackProps {
  onSuccess: () => void;
}

export const WechatCallback: React.FC<WechatCallbackProps> = ({ onSuccess }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      setStatus('error');
      setError('未获取到授权码');
      return;
    }

    handleLogin(code);
  }, []);

  const handleLogin = async (code: string) => {
    try {
      await wechatLogin(code);
      setStatus('success');

      // 如果是从弹窗打开的，通知父窗口
      if (window.opener) {
        window.opener.postMessage({ type: 'wechat_login_success' }, '*');
        window.close();
      } else {
        // 直接跳转的情况
        onSuccess();
      }
    } catch (e: any) {
      setStatus('error');
      setError(e.message || '登录失败');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-center">
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
            <p className="text-slate-600 text-lg">正在登录...</p>
          </div>
        )}
        {status === 'success' && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-slate-600 text-lg">登录成功，正在跳转...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="w-12 h-12 text-rose-500" />
            <p className="text-slate-600 text-lg">{error}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="text-blue-500 hover:underline"
            >
              返回首页
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
