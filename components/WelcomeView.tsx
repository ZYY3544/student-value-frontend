
import React from 'react';
import { Sparkles } from 'lucide-react';
import { InviteCodeView } from './InviteCodeView';

interface WelcomeViewProps {
  onStart: () => void;
  inviteCode: string;
  onInviteSuccess: (code: string) => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ onStart, inviteCode, onInviteSuccess }) => {
  // 模拟真实用户头像
  const avatars = [
    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80",
    "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=100&q=80"
  ];

  return (
    <div className="h-screen flex flex-col items-center px-8 pt-32 pb-12 overflow-hidden relative" style={{ background: "linear-gradient(to bottom, transparent 0%, #f5f5f5 80%), linear-gradient(to right, #d0e1f5, #f5f0d0)" }}>

        {/* 标题区域 */}
        <div className="text-center mb-6 shrink-0 animate-slide-up-custom relative z-10">
            <div className="inline-block relative">
                <h1
                    className="text-[48px] leading-tight relative z-10 px-1 whitespace-nowrap tracking-wider"
                    style={{
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Segoe UI, Arial, Roboto, 'PingFang SC', 'miui', 'Hiragino Sans GB', 'Microsoft Yahei', sans-serif",
                        color: "#1a1a1a",
                        fontWeight: 700,
                    }}
                >
                    校招身价测评
                </h1>
                {/* 装饰波浪线 */}
                <div className="absolute -bottom-5 left-0 w-full h-6 -z-10">
                    <svg viewBox="0 0 320 30" preserveAspectRatio="none" className="w-full h-full">
                        <path
                            d="M10 15C40 28 70 2 100 15C130 28 160 2 190 15C220 28 250 2 280 15C300 20 310 18 310 18"
                            stroke="#0A66C2"
                            strokeWidth="8"
                            strokeLinecap="round"
                            fill="none"
                        />
                    </svg>
                </div>
            </div>

            {/* 动态滚动文案容器 */}
            <div className="mt-12 -mb-4 h-6 overflow-hidden relative">
                <div className="animate-text-scroll">
                    <p className="h-6 flex items-center justify-center text-[#0e0805]/40 text-sm font-bold tracking-[0.1em]">
                        同届都在测，你的起薪在第几档？
                    </p>
                    <p className="h-6 flex items-center justify-center text-[#0e0805]/40 text-sm font-bold tracking-[0.1em]">
                        校招季必备，测出你的真实竞争力！
                    </p>
                    <p className="h-6 flex items-center justify-center text-[#0e0805]/40 text-sm font-bold tracking-[0.1em]">
                        同届都在测，你的起薪在第几档？
                    </p>
                    <p className="h-6 flex items-center justify-center text-[#0e0805]/40 text-sm font-bold tracking-[0.1em]">
                        985/211加成有多大？测了才知道！
                    </p>
                </div>
            </div>
        </div>

        {/* 功能卡片区域 */}
        <div className="w-full space-y-6 mb-8 mt-8 animate-slide-up-custom relative z-10" style={{ animationDelay: '0.1s' }}>
            {/* 卡片 1 */}
            <div className="rounded-[32px] px-4 py-3 flex items-center gap-3 transition-all">
                <div className="w-10 h-10 flex items-center justify-center shrink-0 text-[#0A66C2]">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9"><path d="M19.3788 15.1057C20.9258 11.4421 19.5373 7.11431 16.0042 5.0745C13.4511 3.60046 10.4232 3.69365 8.03452 5.0556L7.04216 3.31879C10.028 1.61639 13.8128 1.4999 17.0042 3.34245C21.4949 5.93513 23.2139 11.4848 21.1217 16.112L22.4635 16.8867L18.2984 19.1008L18.1334 14.3867L19.3788 15.1057ZM4.62961 8.89968C3.08263 12.5633 4.47116 16.8911 8.00421 18.9309C10.5573 20.4049 13.5851 20.3118 15.9737 18.9499L16.9661 20.6867C13.9803 22.389 10.1956 22.5055 7.00421 20.663C2.51357 18.0703 0.794565 12.5206 2.88672 7.89342L1.54492 7.11873L5.70999 4.90463L5.87505 9.61873L4.62961 8.89968ZM13.0042 13.5382H16.0042V15.5382H13.0042V17.5382H11.0042V15.5382H8.00421V13.5382H11.0042V12.5382H8.00421V10.5382H10.59L8.46868 8.41692L9.88289 7.00271L12.0042 9.12403L14.1255 7.00271L15.5397 8.41692L13.4184 10.5382H16.0042V12.5382H13.0042V13.5382Z"></path></svg>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-[#2a2725] font-[700] text-[20px]">校招薪酬预测</h3>
                        <span className="text-[#1a1a1a] text-[13px] font-black leading-none tracking-wider bg-[#f8ea1a] rounded-full px-2 py-0.5">HOT</span>
                    </div>
                    <p className="text-[#0e0805]/40 text-[14px] font-bold leading-relaxed">
                        院校+学历双重加成，精准预估起薪！
                    </p>
                </div>
            </div>

            {/* 卡片 2 */}
            <div className="rounded-[32px] px-4 py-3 flex items-center gap-3 transition-all">
                <div className="w-10 h-10 flex items-center justify-center shrink-0 text-[#0A66C2]">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9"><path d="M20 2C20.5523 2 21 2.44772 21 3V6.757L19 8.757V4H5V20H19V17.242L21 15.242V21C21 21.5523 20.5523 22 20 22H4C3.44772 22 3 21.5523 3 21V3C3 2.44772 3.44772 2 4 2H20ZM21.7782 8.80761L23.1924 10.2218L15.4142 18L13.9979 17.9979L14 16.5858L21.7782 8.80761ZM13 12V14H8V12H13ZM16 8V10H8V8H16Z"></path></svg>
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-[#2a2725] font-[700] text-[20px] mb-0.5">能力画像解码</h3>
                    <p className="text-[#0e0805]/40 text-[14px] font-bold leading-relaxed">
                        五维能力分析，找到你的核心竞争力！
                    </p>
                </div>
            </div>
        </div>

        {/* 操作按钮 */}
        <div className="w-full flex justify-center shrink-0 animate-slide-up-custom relative z-10 mt-6 mb-6" style={{ animationDelay: '0.2s' }}>
            <button
                onClick={onStart}
                className="w-[220px] h-[58px] bg-[#f8ea1a] text-[#1a1a1a] text-2xl tracking-widest rounded-[14px] flex items-center justify-center active:scale-95 transition-all group animate-cta-breathe btn-cta-shimmer shadow-none"
                style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 700 }}
            >
                开始测试
            </button>
        </div>

        {/* 社交证明 */}
        <div className="flex flex-col items-center gap-4 mt-4 shrink-0 animate-slide-up-custom relative z-10" style={{ animationDelay: '0.3s' }}>
            <div className="flex -space-x-2 items-center">
                {avatars.map((url, i) => (
                    <div key={i} className="w-7 h-7 rounded-full border-2 border-gray-100 bg-white shadow-sm overflow-hidden">
                        <img src={url} alt={`user-${i}`} className="w-full h-full object-cover" />
                    </div>
                ))}
                <div className="w-9 h-7 rounded-full border-2 border-gray-100 bg-[#0e0805] flex items-center justify-center text-[8px] text-white font-black shadow-md z-10">
                    +5K
                </div>
            </div>
            <p className="text-[#0e0805]/30 text-[11px] font-black tracking-widest uppercase">已有超过 5,000 名同学完成测评</p>
        </div>

        {/* 邀请码弹窗：没有有效邀请码时显示 */}
        {!inviteCode && (
            <InviteCodeView onSuccess={onInviteSuccess} />
        )}
    </div>
  );
};
