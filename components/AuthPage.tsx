import React, { useState } from 'react';
import { Sparkles, Diamond, Loader2, KeyRound } from 'lucide-react';
import { verifyInviteCode, setInviteCode } from '../services/authService';

interface AuthPageProps {
  onAuthSuccess: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!code.trim()) { setError('请输入邀请码'); return; }

    setLoading(true);
    try {
      const result = await verifyInviteCode(code);
      if (!result.success) {
        setError(result.error || '邀请码无效');
        return;
      }

      // 验证通过，存到 localStorage
      setInviteCode(code.trim().toUpperCase());
      onAuthSuccess();
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-white font-sans text-slate-900">
      {/* Left Sidebar */}
      <aside className="w-full md:w-[400px] bg-[#0A66C2] p-8 md:p-12 flex flex-col relative overflow-hidden shrink-0">
        <div className="flex items-center gap-3 text-white mb-8 md:mb-16 z-10">
          <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
            <Sparkles className="w-6 h-6 text-[#f8ea1a]" />
          </div>
          <span className="text-xl font-bold tracking-tight">Selarin</span>
        </div>

        <div className="bg-white/10 rounded-3xl md:rounded-[40px] p-6 md:p-10 border border-white/20 backdrop-blur-md flex-1 flex flex-col z-10">
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-4 md:mb-6 leading-tight">
            开始估值
          </h1>
          <p className="text-white/80 text-sm md:text-lg mb-6 md:mb-12 leading-relaxed">
            融合500强企业标配的价值评估体系与行业头部最新的薪酬数据库，精准核算您的市场价值。
          </p>

          <div className="space-y-4 md:space-y-6 mt-auto hidden md:block">
            <div className="flex items-center gap-3 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm">输入邀请码即可使用</span>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm">邀请码有效期 14 天</span>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm">AI 简历诊断 + 薪酬估值</span>
            </div>
          </div>
        </div>

        <div className="mt-6 md:mt-12 text-white/40 text-sm z-10 hidden md:block">
          &copy; {new Date().getFullYear()} 铭曦管理咨询. 版权所有。
        </div>

        {/* Background Decoration */}
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl hidden md:block"></div>
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl hidden md:block"></div>
        <Diamond className="absolute top-[15%] right-[12%] w-10 h-10 text-white/[0.07] animate-float hidden md:block" />
        <Diamond className="absolute top-[40%] left-[8%] w-7 h-7 text-white/[0.05] animate-float-soft hidden md:block" style={{ animationDelay: '1s' }} />
        <Diamond className="absolute bottom-[25%] right-[25%] w-14 h-14 text-white/[0.06] animate-float hidden md:block" style={{ animationDelay: '2s' }} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#F8FAFC] flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">输入邀请码</h2>
          <p className="text-slate-500 mb-8">请输入您收到的邀请码以开始使用</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="text"
                placeholder="请输入邀请码"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                className="w-full bg-white border border-slate-200 text-sm text-slate-900 rounded-2xl py-4 pl-12 pr-5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-300 uppercase tracking-widest text-center text-lg font-mono"
                autoFocus
                autoComplete="off"
              />
            </div>

            {error && (
              <p className="text-sm text-rose-500 font-semibold text-center animate-pulse">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FFC12D] text-slate-900 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-amber-200 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  验证中...
                </>
              ) : (
                '开始使用'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
