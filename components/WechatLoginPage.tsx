import React, { useState, useEffect } from 'react';
import { Sparkles, Diamond, Loader2, QrCode } from 'lucide-react';
import { getWechatQrUrl } from '../services/authService';

interface WechatLoginPageProps {
  onLoginSuccess: () => void;
}

export const WechatLoginPage: React.FC<WechatLoginPageProps> = ({ onLoginSuccess }) => {
  const [authUrl, setAuthUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadQrUrl();
  }, []);

  // 监听微信回调（微信会重定向到前端 /auth/wechat/callback?code=xxx）
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'wechat_login_success') {
        onLoginSuccess();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onLoginSuccess]);

  const loadQrUrl = async () => {
    setLoading(true);
    setError('');
    try {
      const url = await getWechatQrUrl();
      setAuthUrl(url);
    } catch (e) {
      setError('获取登录二维码失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWechat = () => {
    if (authUrl) {
      // 在新窗口打开微信授权页
      window.open(authUrl, 'wechat_login', 'width=800,height=600');
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-white font-sans text-slate-900">
      {/* Left Sidebar - 复用 AuthPage 的设计风格 */}
      <aside className="w-full md:w-[400px] bg-[#0A66C2] p-8 md:p-12 flex flex-col relative overflow-hidden shrink-0">
        <div className="flex items-center gap-3 text-white mb-8 md:mb-16 z-10">
          <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
            <Sparkles className="w-6 h-6 text-[#f8ea1a]" />
          </div>
          <span className="text-xl font-bold tracking-tight">Selarin</span>
        </div>

        <div className="bg-white/10 rounded-3xl md:rounded-[40px] p-6 md:p-10 border border-white/20 backdrop-blur-md flex-1 flex flex-col z-10">
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-4 md:mb-6 leading-tight">
            求职加速器
          </h1>
          <p className="text-white/80 text-sm md:text-lg mb-6 md:mb-12 leading-relaxed">
            融合500强企业标配的价值评估体系与行业头部最新的薪酬数据库，精准核算您的市场价值。
          </p>

          <div className="space-y-4 md:space-y-6 mt-auto hidden md:block">
            <div className="flex items-center gap-3 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm">AI 驱动的简历诊断</span>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm">精准薪酬估值</span>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm">多维度能力画像</span>
            </div>
          </div>
        </div>

        <div className="mt-6 md:mt-12 text-white/40 text-sm z-10 hidden md:block">
          &copy; {new Date().getFullYear()} 铭曦管理咨询. 版权所有。
        </div>

        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl hidden md:block"></div>
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl hidden md:block"></div>
        <Diamond className="absolute top-[15%] right-[12%] w-10 h-10 text-white/[0.07] animate-float hidden md:block" />
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#F8FAFC] flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">微信扫码登录</h2>
          <p className="text-slate-500 mb-8">使用微信扫描二维码，快速登录</p>

          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            {loading ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                <p className="text-slate-400">加载中...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-rose-500">{error}</p>
                <button
                  onClick={loadQrUrl}
                  className="text-blue-500 hover:underline"
                >
                  点击重试
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6">
                {/* 微信登录内嵌iframe（微信官方JS SDK方式） */}
                <div className="w-[300px] h-[340px] bg-slate-50 rounded-2xl overflow-hidden relative">
                  <iframe
                    src={authUrl}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation"
                  />
                </div>

                <p className="text-slate-400 text-sm">
                  打开微信，扫一扫上方二维码
                </p>

                <button
                  onClick={handleOpenWechat}
                  className="text-blue-500 hover:underline text-sm"
                >
                  二维码加载不出来？点击在新窗口打开
                </button>
              </div>
            )}
          </div>

          <p className="text-slate-400 text-xs mt-6">
            登录即表示您同意我们的服务条款和隐私政策
          </p>
        </div>
      </main>
    </div>
  );
};
