import React, { useState } from 'react';
import { Sparkles, Diamond, Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess: () => void;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<any>;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess, signIn, signUp }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim()) { setError('请输入邮箱地址'); return; }
    if (!password) { setError('请输入密码'); return; }
    if (password.length < 6) { setError('密码至少6位'); return; }

    if (mode === 'register' && password !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        onAuthSuccess();
      } else {
        const data = await signUp(email, password);
        // Supabase 默认需要邮箱验证
        if (data.user && !data.session) {
          setSuccessMsg('注册成功！请查收验证邮件后登录。');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        } else {
          onAuthSuccess();
        }
      }
    } catch (err: any) {
      const msg = err?.message || '操作失败';
      if (msg.includes('Invalid login credentials')) setError('邮箱或密码错误');
      else if (msg.includes('User already registered')) setError('该邮箱已注册');
      else if (msg.includes('Email not confirmed')) setError('请先验证邮箱');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-white border border-slate-200 text-sm text-slate-900 rounded-2xl py-4 pl-12 pr-5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-300";

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      {/* Left Sidebar - 与表单页一致 */}
      <aside className="w-[400px] bg-[#0A66C2] p-12 flex flex-col relative overflow-hidden shrink-0">
        <div className="flex items-center gap-3 text-white mb-16 z-10">
          <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
            <Sparkles className="w-6 h-6 text-[#f8ea1a]" />
          </div>
          <span className="text-xl font-bold tracking-tight">校园人才估值平台</span>
        </div>

        <div className="bg-white/10 rounded-[40px] p-10 border border-white/20 backdrop-blur-md flex-1 flex flex-col z-10">
          <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
            {mode === 'login' ? '欢迎回来' : '加入我们'}
          </h1>
          <p className="text-white/80 text-lg mb-12 leading-relaxed">
            融合500强企业标配的价值评估体系与行业头部最新的薪酬数据库，精准核算您的市场价值。
          </p>

          <div className="space-y-6 mt-auto">
            <div className="flex items-center gap-3 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm">评估记录云端保存，随时查看</span>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm">AI 对话历史自动同步</span>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm">多设备登录，数据不丢失</span>
            </div>
          </div>
        </div>

        <div className="mt-12 text-white/40 text-sm z-10">
          &copy; 2025 校园人才估值平台. 版权所有。
        </div>

        {/* Background Decoration */}
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl"></div>
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl"></div>
        <Diamond className="absolute top-[15%] right-[12%] w-10 h-10 text-white/[0.07] animate-float" />
        <Diamond className="absolute top-[40%] left-[8%] w-7 h-7 text-white/[0.05] animate-float-soft" style={{ animationDelay: '1s' }} />
        <Diamond className="absolute bottom-[25%] right-[25%] w-14 h-14 text-white/[0.06] animate-float" style={{ animationDelay: '2s' }} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#F8FAFC] flex items-center justify-center p-12">
        <div className="w-full max-w-md">
          {/* Tab 切换 */}
          <div className="relative flex bg-slate-100 rounded-xl p-1 mb-10">
            <div
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-[#0A66C2] rounded-[10px] transition-transform duration-300 ease-out"
              style={{ transform: mode === 'register' ? 'translateX(calc(100% + 4px))' : 'translateX(0)' }}
            />
            <button
              onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
              className={`relative z-10 flex-1 py-3 text-sm font-semibold rounded-[10px] transition-colors duration-200 ${mode === 'login' ? 'text-white' : 'text-slate-400'}`}
            >
              登录
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
              className={`relative z-10 flex-1 py-3 text-sm font-semibold rounded-[10px] transition-colors duration-200 ${mode === 'register' ? 'text-white' : 'text-slate-400'}`}
            >
              注册
            </button>
          </div>

          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            {mode === 'login' ? '登录账号' : '创建账号'}
          </h2>
          <p className="text-slate-500 mb-8">
            {mode === 'login' ? '登录后查看历史评估记录和对话' : '注册后即可使用完整功能'}
          </p>

          {successMsg && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 mb-6">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="email"
                placeholder="邮箱地址"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                className={inputClass}
                autoFocus
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="密码（至少6位）"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className={inputClass + ' pr-12'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {mode === 'register' && (
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="确认密码"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  className={inputClass}
                />
              </div>
            )}

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
                  {mode === 'login' ? '登录中...' : '注册中...'}
                </>
              ) : (
                mode === 'login' ? '登录' : '注册'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
