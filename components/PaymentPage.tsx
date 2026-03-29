import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2, CheckCircle, Shield, Zap, BarChart3, MessageSquare, RefreshCw } from 'lucide-react';
import { createOrder, checkOrderStatus, type SubscriptionStatus, type OrderInfo } from '../services/authService';

interface PaymentPageProps {
  onPaymentSuccess: (subscription: SubscriptionStatus) => void;
  onLogout: () => void;
  nickname?: string;
}

export const PaymentPage: React.FC<PaymentPageProps> = ({ onPaymentSuccess, onLogout, nickname }) => {
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'waiting' | 'success'>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleCreateOrder = async () => {
    setLoading(true);
    setError('');
    try {
      const orderInfo = await createOrder('weekly');
      setOrder(orderInfo);
      setPaymentStatus('waiting');

      // 开始轮询订单状态（每2秒查一次）
      pollRef.current = setInterval(async () => {
        try {
          const result = await checkOrderStatus(orderInfo.order_no);
          if (result.status === 'paid' && result.subscription) {
            if (pollRef.current) clearInterval(pollRef.current);
            setPaymentStatus('success');
            // 短暂展示成功状态后跳转
            setTimeout(() => onPaymentSuccess(result.subscription!), 1500);
          }
        } catch {
          // 轮询失败不中断，继续重试
        }
      }, 2000);

      // 5分钟后停止轮询
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 5 * 60 * 1000);
    } catch (e: any) {
      setError(e.message || '创建订单失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Sparkles className="w-4 h-4" />
            {nickname ? `${nickname}，欢迎使用` : '欢迎使用'}
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">开通服务</h1>
          <p className="text-slate-500">解锁全部功能，开启求职加速之旅</p>
        </div>

        {/* Plan Card */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900">周卡</h3>
              <p className="text-slate-400 text-sm">7天全功能畅享</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-[#0A66C2]">
                <span className="text-lg">&#165;</span>28.9
              </div>
              <p className="text-slate-400 text-xs">约 &#165;4.1/天</p>
            </div>
          </div>

          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-3 text-slate-600">
              <BarChart3 className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="text-sm">无限次 AI 简历评估 + 薪酬估值</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600">
              <MessageSquare className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="text-sm">AI 简历优化对话 + JD 匹配分析</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600">
              <Zap className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="text-sm">多岗位对比 + 能力画像</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600">
              <Shield className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="text-sm">到期后评估记录永久保留</span>
            </div>
          </div>

          {/* Payment Area */}
          {paymentStatus === 'success' ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle className="w-16 h-16 text-green-500" />
              <p className="text-lg font-bold text-green-600">支付成功</p>
              <p className="text-slate-400 text-sm">正在跳转...</p>
            </div>
          ) : paymentStatus === 'waiting' && order ? (
            <div className="flex flex-col items-center gap-4">
              {/* QR Code - 用 code_url 生成二维码 */}
              <div className="bg-white p-4 rounded-2xl border-2 border-dashed border-slate-200">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(order.code_url)}`}
                  alt="微信支付二维码"
                  className="w-[200px] h-[200px]"
                />
              </div>
              <div className="text-center">
                <p className="text-slate-700 font-medium">请用微信扫码支付</p>
                <p className="text-slate-400 text-sm mt-1">金额：&#165;{order.amount}</p>
              </div>
              <div className="flex items-center gap-2 text-blue-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                等待支付确认...
              </div>
              <button
                onClick={() => {
                  if (pollRef.current) clearInterval(pollRef.current);
                  setPaymentStatus('idle');
                  setOrder(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-sm flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                重新下单
              </button>
            </div>
          ) : (
            <div>
              {error && (
                <p className="text-sm text-rose-500 text-center mb-4">{error}</p>
              )}
              <button
                onClick={handleCreateOrder}
                disabled={loading}
                className="w-full bg-[#07C160] hover:bg-[#06AD56] text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    创建订单中...
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05a6.066 6.066 0 01-.253-1.727c0-3.65 3.387-6.61 7.565-6.61.146 0 .292.012.436.02C16.339 4.97 12.834 2.188 8.691 2.188zm-2.9 4.22c.63 0 1.14.51 1.14 1.14s-.51 1.14-1.14 1.14a1.14 1.14 0 010-2.28zm5.4 0c.63 0 1.14.51 1.14 1.14s-.51 1.14-1.14 1.14-1.14-.51-1.14-1.14.51-1.14 1.14-1.14zm4.523 4.1c-3.648 0-6.607 2.602-6.607 5.81 0 3.21 2.96 5.812 6.607 5.812a7.97 7.97 0 002.172-.306.63.63 0 01.525.072l1.395.817a.236.236 0 00.122.04.214.214 0 00.213-.217c0-.053-.021-.105-.035-.156l-.286-1.084a.431.431 0 01.156-.487c1.343-.99 2.203-2.449 2.203-4.076 0-3.207-2.959-5.81-6.665-5.81v-.415zm-2.375 3.372c.463 0 .839.376.839.839s-.376.839-.839.839a.839.839 0 010-1.678zm4.75 0c.463 0 .839.376.839.839s-.376.839-.839.839a.839.839 0 010-1.678z"/>
                    </svg>
                    微信支付 &#165;28.9
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="text-center">
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-slate-600 text-sm"
          >
            切换账号
          </button>
        </div>
      </div>
    </div>
  );
};
