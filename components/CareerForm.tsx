/**
 * CareerForm - 职业规划信息收集表单（嵌入聊天气泡中）
 * 问题逐个流式出现，每题间隔 600ms，给用户渐进式的交互体验
 */

import React, { useState, useEffect } from 'react';

interface CareerFormProps {
  onSubmit: (answers: string) => void;
}

const QUESTIONS = [
  {
    id: 'overtime',
    label: '你对加班的容忍度？',
    options: ['完全接受，收入优先', '适度加班可以，别太离谱', '准时下班是底线', '没想过这个问题'],
  },
  {
    id: 'financial',
    label: '家庭经济状况对你的就业选择影响大吗？',
    options: ['需要尽快赚钱养家', '有一定压力但不至于急', '没有经济压力，可以慢慢选', '不想考虑这个因素'],
  },
  {
    id: 'city',
    label: '你对工作城市节奏的偏好？',
    options: ['深圳：快节奏、高强度、高回报', '广州：相对温和、生活气息重', '上海：注重职场形象、国际化', '北京：互联网氛围浓、机会多', '没有偏好 / 有其他城市'],
  },
  {
    id: 'company',
    label: '你更偏好什么类型的工作环境？',
    options: ['大厂：体系成熟、资源多、但螺丝钉感强', '创业公司：成长快、自由度高、但不稳定', '国企/央企：稳定、节奏慢、天花板明确', '外企：work-life balance、但近年机会在收缩', '没有概念，想听分析'],
  },
  {
    id: 'ai',
    label: '你平时使用 AI 工具的程度？',
    options: ['重度使用，日常工作学习离不开', '偶尔用，知道基本操作', '听说过但基本没用', '完全没接触过'],
  },
];

const LABELS: Record<string, string> = {
  overtime: '加班容忍度',
  financial: '经济压力',
  city: '城市偏好',
  company: '工作环境',
  ai: 'AI使用',
};

export const CareerForm: React.FC<CareerFormProps> = ({ onSubmit }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  // 逐个显示问题，每隔 600ms 出现一个
  useEffect(() => {
    if (visibleCount >= QUESTIONS.length) return;
    const timer = setTimeout(() => {
      setVisibleCount(prev => prev + 1);
    }, 600);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  const allAnswered = QUESTIONS.every(q => answers[q.id]);

  const handleSubmit = () => {
    if (!allAnswered) return;
    setSubmitted(true);
    const text = QUESTIONS.map(q => `${LABELS[q.id]}：${answers[q.id]}`).join('｜');
    onSubmit(text);
  };

  if (submitted) {
    return (
      <div className="text-xs text-gray-400 mt-2">已提交，正在分析中...</div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {QUESTIONS.slice(0, visibleCount).map((q, idx) => (
        <div
          key={q.id}
          className="animate-[fadeIn_0.4s_ease-out]"
        >
          <p className="text-sm font-semibold text-gray-700 mb-2">{q.label}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt) => (
              <button
                key={opt}
                onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.split('：')[0] }))}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  answers[q.id] === opt.split('：')[0]
                    ? 'bg-[#0A66C2] text-white border-[#0A66C2]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#0A66C2] hover:text-[#0A66C2]'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
      {visibleCount >= QUESTIONS.length && (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors animate-[fadeIn_0.4s_ease-out] ${
            allAnswered
              ? 'bg-[#0A66C2] text-white hover:bg-[#084e96]'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          开始分析
        </button>
      )}
    </div>
  );
};
