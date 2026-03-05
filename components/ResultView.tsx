import React, { useMemo } from 'react';
import { AssessmentResult, AssessmentInput, AbilityItem } from '../types';
import {
  TrendingUp, Target, Users,
  Lightbulb, Brain, Handshake, PenTool
} from 'lucide-react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell
} from 'recharts';
import { ChatWidget } from './ChatWidget';

interface ResultViewProps {
  result: AssessmentResult;
  inputData: AssessmentInput;
  assessmentType: 'CV';
  onReset: () => void;
}

const ABILITY_TAGS: Record<string, Record<string, string>> = {
  专业力: { high: '实力出众', medium: '稳扎稳打', low: '积蓄力量' },
  管理力: { high: '统筹大局', medium: '团队骨干', low: '初出茅庐' },
  合作力: { high: '团队粘合', medium: '默契搭档', low: '配合协作' },
  思辨力: { high: '洞察先机', medium: '逻辑清晰', low: '按部就班' },
  创新力: { high: '开拓先锋', medium: '持续改进', low: '学习成长' },
};

const ABILITY_ICONS: Record<string, React.ReactNode> = {
  专业力: <PenTool size={20} />,
  管理力: <Target size={20} />,
  合作力: <Handshake size={20} />,
  思辨力: <Brain size={20} />,
  创新力: <Lightbulb size={20} />,
};

// 环形进度组件（recharts PieChart）
const CircularProgress: React.FC<{
  score: number;
  label: string;
  description: string;
  color: string;
}> = ({ score, label, description, color }) => {
  const data = [
    { name: 'Score', value: score },
    { name: 'Remaining', value: 100 - score },
  ];
  const colors = [color, '#f3f4f6'];

  return (
    <div className="bg-white rounded-3xl p-5 flex items-center gap-4 border border-gray-100">
      <div className="relative w-20 h-20 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={28}
              outerRadius={38}
              paddingAngle={0}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index]} stroke="none" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-bold text-gray-900 mb-0.5">{label}</h3>
        <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
};

// 根据百分位生成薪酬竞争力描述
function getSalaryCompDesc(val: number): string {
  if (val >= 50) return `你超过了${val}%的同届候选人，继续加油！`;
  return `你超过了${val}%的同届候选人，继续努力！`;
}

// 根据分数生成简历健康度描述
function getResumeHealthDesc(val: number): string {
  if (val >= 50) return '您的简历健康度不错，继续保持！';
  return '您的简历健康度有待提升，继续努力！';
}

export const ResultView: React.FC<ResultViewProps> = ({ result, inputData, onReset }) => {
  const radarData = useMemo(() => {
    if (result.radarData) {
      return Object.entries(result.radarData).map(([key, val]) => ({
        subject: key, A: +(val / 10).toFixed(1)
      }));
    }
    return [
      { subject: '专业力', A: 5.0 }, { subject: '管理力', A: 5.0 },
      { subject: '合作力', A: 5.0 }, { subject: '思辨力', A: 5.0 },
      { subject: '创新力', A: 5.0 }
    ];
  }, [result.radarData]);

  const competencyDetails = useMemo(() => {
    if (!result.abilities) return [];
    return Object.entries(result.abilities).map(([name, val]) => {
      const info = val as AbilityItem;
      return {
        label: name,
        score: (info.score / 10).toFixed(1),
        rawScore: info.score / 10,
        tag: ABILITY_TAGS[name]?.[info.level] || info.level,
        desc: info.explanation,
        icon: ABILITY_ICONS[name] || <PenTool size={20} />,
      };
    });
  }, [result.abilities]);

  // 解析薪酬数字（如 "256k-301k" → [256, 301]）
  const salaryNumbers = useMemo(() => {
    const match = result.personValue?.match(/(\d+)\s*k?\s*[-～~]\s*(\d+)/);
    if (match) return [parseInt(match[1]), parseInt(match[2])];
    return [0, 0];
  }, [result.personValue]);

  const salaryCompetitiveness = result.salaryCompetitiveness ?? 50;
  const resumeHealthScore = result.resumeHealthScore ?? 50;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col relative pb-16 overflow-x-hidden max-w-2xl mx-auto">
      {/* 页面头部 */}
      <div className="px-6 pt-10 pb-2">
        <span className="text-xs font-bold text-[#0A66C2] tracking-widest uppercase block mb-1">CAMPUS REPORT</span>
        <h1 className="text-3xl font-black text-gray-900">校招身价报告</h1>
      </div>

      <div className="px-5 mt-6 space-y-5">
        {/* 估值卡片 */}
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-3xl p-8 border border-blue-100/50 relative overflow-hidden">
          <div className="relative z-10">
            {/* levelTag */}
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A66C2]/10 rounded-full">
                <TrendingUp className="w-4 h-4 text-[#0A66C2]" />
                <span className="text-sm font-bold text-[#0A66C2]">{result.levelTag}</span>
              </div>
            </div>

            {/* 薪酬数字 */}
            <div className="mb-4 flex items-baseline whitespace-nowrap">
              <span className="text-2xl font-bold text-gray-900 mr-1">¥</span>
              <div className="text-4xl font-black tracking-wide tabular-nums text-gray-900 flex items-baseline">
                <span>{salaryNumbers[0]}</span>
                <span className="text-2xl ml-0.5">k</span>
                <span className="text-gray-300 mx-1">～</span>
                <span>{salaryNumbers[1]}</span>
                <span className="text-2xl ml-0.5">k</span>
              </div>
            </div>

            {/* 百分位徽章 */}
            <div className="bg-[#0A66C2] rounded-2xl px-5 py-4 text-white text-center inline-block mb-5">
              <p className="text-xs font-medium opacity-90 mb-0.5">超越全国毕业生</p>
              <div className="flex items-baseline justify-center gap-0.5">
                <span className="text-3xl font-black">{salaryCompetitiveness}</span>
                <span className="text-lg font-bold">%</span>
              </div>
            </div>

            {/* levelDesc */}
            <p className="text-sm text-gray-500 leading-relaxed">{result.levelDesc}</p>
          </div>

          {/* 背景装饰 */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-blue-200/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        </div>

        {/* 环形进度卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CircularProgress
            score={salaryCompetitiveness}
            label="薪酬竞争力"
            description={getSalaryCompDesc(salaryCompetitiveness)}
            color="#0A66C2"
          />
          <CircularProgress
            score={resumeHealthScore}
            label="简历健康度"
            description={getResumeHealthDesc(resumeHealthScore)}
            color="#10b981"
          />
        </div>

        {/* 说明 */}
        <p className="text-[11px] text-gray-400 font-medium leading-relaxed px-1">说明：以上为应届校招预估年度总薪酬包（单位：千元），由模型评估而成，仅供参考。</p>

        {/* 核心能力画像 - 雷达图 + 进度条 */}
        <div className="bg-white rounded-3xl px-6 pt-6 pb-5 border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users className="text-[#0A66C2] w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg leading-tight">核心能力画像</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">CORE COMPETENCY PROFILE</p>
            </div>
          </div>

          <div className="h-[260px] w-full flex items-center justify-center relative [&_*]:!outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius={90} data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 13, fontWeight: 600 }} />
                <Radar name="能力值" dataKey="A" stroke="#3b82f6" strokeWidth={2} fill="#3b82f6" fillOpacity={0.15} dot={false} activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
                <Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="bg-[#3b82f6] text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow">{payload[0].payload.subject}: {Number(payload[0].value).toFixed(1)}分</div> : null} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* 进度条 */}
          <div className="mt-4 space-y-3">
            {competencyDetails.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                  <span className="text-sm font-bold text-[#0A66C2]">{item.score}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(item.rawScore * 10, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 font-medium mt-4">
            说明：雷达图显示了您的能力得分，分值越高代表在该领域的竞争力越强。
          </p>
        </div>

        {/* 各能力得分释义 */}
        <div className="bg-white rounded-3xl px-6 pt-6 pb-6 border border-gray-100">
          <div className="flex flex-col mb-4">
            <h3 className="font-bold text-gray-900 text-lg leading-tight">各能力得分释义</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">SCORE DEFINITIONS</p>
          </div>

          <div className="space-y-5">
            {competencyDetails.map((item, idx) => (
              <div key={idx}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-bold text-gray-900 text-base">{item.label}</span>
                    <span className="text-gray-500 text-xs font-semibold">{item.score}分</span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium leading-relaxed"><span className="text-gray-500">{item.tag}:</span> {item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 底部留白（给浮窗按钮让出空间） */}
      <div className="pb-16" />

      {/* 简历优化助手浮窗 */}
      <ChatWidget
        assessmentContext={{
          factors: result.factors || {},
          abilities: result.abilities || {},
          grade: result.level,
          salaryRange: result.personValue || '',
          jobTitle: inputData.jobTitle,
          jobFunction: inputData.jobFunction,
        }}
        resumeText={result.resumeText || inputData.resumeText}
        apiBase="https://student-value-backend.onrender.com"
      />
    </div>
  );
};
