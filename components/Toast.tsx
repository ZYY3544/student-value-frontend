import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  visible: boolean;
  onClose: () => void;
  duration?: number;
  type?: 'success' | 'error';
}

export const Toast: React.FC<ToastProps> = ({ message, visible, onClose, duration = 4000, type = 'success' }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      // 触发入场动画
      requestAnimationFrame(() => setShow(true));
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(onClose, 300); // 等退场动画结束再卸载
      }, duration);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [visible, duration, onClose]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-6 left-1/2 z-[200] transition-all duration-300 ease-out"
      style={{
        transform: show ? 'translate(-50%, 0)' : 'translate(-50%, -20px)',
        opacity: show ? 1 : 0,
      }}
    >
      <div className={`flex items-center gap-3 text-white px-6 py-3.5 rounded-2xl shadow-lg ${type === 'error' ? 'bg-rose-500 shadow-rose-200' : 'bg-emerald-500 shadow-emerald-200'}`}>
        {type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle className="w-5 h-5 shrink-0" />}
        <span className="text-sm font-semibold whitespace-nowrap">{message}</span>
        <button
          onClick={() => { setShow(false); setTimeout(onClose, 300); }}
          className="ml-2 p-0.5 rounded-full hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
