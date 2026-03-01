
import React, { useState, useRef, useEffect } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';

const API_BASE_URL = 'https://student-value-backend.onrender.com';

interface InviteCodeViewProps {
  onSuccess: (code: string) => void;
  onCancel?: () => void;
}

export const InviteCodeView: React.FC<InviteCodeViewProps> = ({ onSuccess, onCancel }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('请输入邀请码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/mini/verify-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: trimmed }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onSuccess(trimmed.toUpperCase());
      } else {
        setError(data.error || '验证失败，请重试');
      }
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center animate-fade-in pb-24 sm:items-center sm:pb-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel ? onCancel : undefined}></div>

      <div className="bg-white w-[90%] max-w-sm rounded-[30px] p-6 relative z-10 shadow-2xl animate-slide-up flex flex-col">
        <div className="w-10 h-1 bg-slate-100 rounded-full mx-auto mb-6"></div>

        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full bg-[#0A66C2]/10 flex items-center justify-center mb-4">
            <KeyRound size={28} className="text-[#0A66C2]" />
          </div>
          <h2 className="text-lg font-black text-slate-800 mb-1">内测邀请码</h2>
          <p className="text-xs text-slate-400 text-center">请输入邀请码以继续使用</p>
        </div>

        <div className="space-y-4">
          <div>
            <input
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
              placeholder="请输入邀请码"
              maxLength={20}
              className={`w-full bg-white border ${error ? 'border-rose-500' : 'border-[#0A66C2]/20'} text-sm font-bold text-[#110e0c] rounded-2xl py-3.5 px-4 outline-none focus:border-[#0A66C2] transition-all placeholder:text-[#110e0c]/20 text-center tracking-[0.15em] uppercase`}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
              ref={inputRef}
              autoFocus
            />
            {error && (
              <p className="text-[11px] text-rose-500 font-bold text-center mt-2 animate-pulse">{error}</p>
            )}
          </div>

          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full bg-[#0A66C2] hover:bg-[#084d94] text-white font-bold text-base py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-[#0A66C2]/20 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                验证中...
              </>
            ) : (
              '确认'
            )}
          </button>
        </div>

        {onCancel && (
          <div className="mt-5 text-center">
            <button onClick={onCancel} className="text-slate-300 text-xs font-medium hover:text-slate-500 transition-colors">
              返回
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
