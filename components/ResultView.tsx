import React, { useMemo } from 'react';
import { AssessmentResult, AssessmentInput, AbilityItem } from '../types';
import {
  TrendingUp, Target, Users, FileText,
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

// 环形进度组件（紧凑版）
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
    <div className="bg-white rounded-2xl p-3 flex items-center gap-3 border border-gray-100 shadow-sm">
      <div className="relative w-16 h-16 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={22} outerRadius={30} paddingAngle={0} dataKey="value" startAngle={90} endAngle={-270}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index]} stroke="none" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-bold text-gray-800">{score}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-gray-900">{label}</h3>
        <p className="text-xs text-gray-500 leading-snug">{description}</p>
      </div>
    </div>
  );
};

function getSalaryCompDesc(val: number): string {
  if (val >= 50) return `超过${val}%同届候选人`;
  return `超过${val}%同届候选人`;
}

function getResumeHealthDesc(val: number): string {
  if (val >= 50) return '简历健康度不错，继续保持';
  return '简历健康度有待提升';
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
      };
    });
  }, [result.abilities]);

  const salaryNumbers = useMemo(() => {
    const match = result.personValue?.match(/(\d+)\s*k?\s*[-～~]\s*(\d+)/);
    if (match) return [parseInt(match[1]), parseInt(match[2])];
    return [0, 0];
  }, [result.personValue]);

  const salaryCompetitiveness = result.salaryCompetitiveness ?? 50;
  const resumeHealthScore = result.resumeHealthScore ?? 50;

  return (
    <div className="h-screen bg-[#f8fafc] flex overflow-hidden">
      {/* Left Content - 不滚动 */}
      <div className="flex-1 flex flex-col p-5 gap-4 overflow-hidden">
        {/* Row 1: Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <span className="text-[10px] font-bold text-blue-600 tracking-widest uppercase block">CAMPUS REPORT</span>
            <h1 className="text-2xl font-bold text-gray-900">校招身价报告</h1>
          </div>
          <button className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 shadow-sm">
            <FileText className="w-3.5 h-3.5" />
            导出 PDF
          </button>
        </div>

        {/* Row 2: Valuation Card + Circular Progress */}
        <div className="flex gap-4 flex-shrink-0">
          {/* Valuation */}
          <div className="flex-1 bg-gradient-to-br from-blue-50 to-white rounded-2xl p-5 border border-blue-100/50 shadow-sm relative overflow-hidden">
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium mb-1">预计年薪估值</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-black text-blue-600">
                    ¥ {salaryNumbers[0]}k ~ {salaryNumbers[1]}k
                  </span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100/50 rounded-full text-blue-700 text-xs font-bold">
                  <TrendingUp className="w-3 h-3" />
                  {result.levelTag}
                </div>
                {result.levelDesc && (
                  <p className="text-xs text-gray-400 mt-2 leading-snug max-w-md">{result.levelDesc}</p>
                )}
              </div>
              <div className="bg-blue-600 rounded-2xl px-5 py-4 text-white text-center shadow-lg shadow-blue-200/50 flex-shrink-0">
                <p className="text-[10px] font-medium opacity-90 mb-0.5">超越全国毕业生</p>
                <div className="flex items-baseline justify-center gap-0.5">
                  <span className="text-3xl font-black">{salaryCompetitiveness}</span>
                  <span className="text-lg font-bold">%</span>
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-200/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
          </div>

          {/* Circular Progress - 竖排 */}
          <div className="w-[280px] flex flex-col gap-3 flex-shrink-0">
            <CircularProgress
              score={salaryCompetitiveness}
              label="薪酬竞争力"
              description={getSalaryCompDesc(salaryCompetitiveness)}
              color="#3b82f6"
            />
            <CircularProgress
              score={resumeHealthScore}
              label="简历健康度"
              description={getResumeHealthDesc(resumeHealthScore)}
              color="#10b981"
            />
          </div>
        </div>

        {/* Row 3: Competency - 雷达图 + 进度条 + 得分释义 */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex overflow-hidden min-h-0">
          {/* Radar Chart */}
          <div className="w-[280px] flex-shrink-0 flex flex-col items-center justify-center p-4 [&_*]:!outline-none">
            <div className="flex items-center gap-2 mb-2 self-start pl-2">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                <Users className="text-blue-600 w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-gray-900">核心胜任力</h2>
            </div>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 500 }} />
                  <Radar name="能力值" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} dot={false} />
                  <Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="bg-[#3b82f6] text-white text-xs font-bold px-2 py-1 rounded-lg shadow">{payload[0].payload.subject}: {Number(payload[0].value).toFixed(1)}</div> : null} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="w-[220px] flex-shrink-0 flex flex-col justify-center gap-4 py-4 pr-4 border-r border-gray-50">
            {competencyDetails.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                  <span className="text-xs font-bold text-blue-600">{item.score}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(item.rawScore * 10, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Score Definitions */}
          <div className="flex-1 py-4 px-5 overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-900 mb-3">能力释义</h3>
            <div className="space-y-3">
              {competencyDetails.map((item, idx) => (
                <div key={idx}>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="font-bold text-gray-900 text-xs">{item.label}</span>
                    <span className="text-gray-400 text-[10px] font-semibold">{item.score}分 · {item.tag}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-[10px] text-gray-400 font-medium flex-shrink-0">说明：以上为应届校招预估年度总薪酬包（单位：千元），由模型评估而成，仅供参考。</p>
      </div>

      {/* Right Sidebar - Chat */}
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
