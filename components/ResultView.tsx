import React, { useMemo } from 'react';
import { AssessmentResult, AssessmentInput, AbilityItem } from '../types';
import {
  TrendingUp, Target, Users, FileText, BarChart3, Bell, Search,
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

// 环形进度组件
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
    <div className="bg-white rounded-3xl p-6 flex items-center gap-6 border border-gray-100 shadow-sm">
      <div className="relative w-24 h-24 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={45} paddingAngle={0} dataKey="value" startAngle={90} endAngle={-270}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index]} stroke="none" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-gray-800">{score}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-bold text-gray-900 mb-1">{label}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
};

function getSalaryCompDesc(val: number): string {
  if (val >= 50) return `你超过了${val}%的同届候选人，继续加油！`;
  return `你超过了${val}%的同届候选人，继续努力！`;
}

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

  const salaryNumbers = useMemo(() => {
    const match = result.personValue?.match(/(\d+)\s*k?\s*[-～~]\s*(\d+)/);
    if (match) return [parseInt(match[1]), parseInt(match[2])];
    return [0, 0];
  }, [result.personValue]);

  const salaryCompetitiveness = result.salaryCompetitiveness ?? 50;
  const resumeHealthScore = result.resumeHealthScore ?? 50;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8fafc]">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-100 flex-shrink-0 z-50">
        <div className="px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-800">Campus Talent Valuation</span>
            </div>
            <nav className="flex items-center gap-8">
              {['Dashboard', 'Reports', 'Career Path', 'Community'].map((item) => (
                <button
                  key={item}
                  className={`text-sm font-medium relative py-5 ${item === 'Dashboard' ? 'text-blue-600' : 'text-gray-500'}`}
                >
                  {item}
                  {item === 'Dashboard' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search reports..." className="bg-gray-100 border-none rounded-full pl-10 pr-4 py-2 text-sm w-64 outline-none" />
            </div>
            <button className="relative p-2 text-gray-500 rounded-full">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-gray-100">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden border border-orange-200">
                <span className="text-xs font-bold text-orange-600">U</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
      {/* 左侧内容 - 可滚动 */}
      <div className="flex-1 overflow-y-auto p-8 pr-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <span className="text-xs font-bold text-blue-600 tracking-widest uppercase mb-1 block">CAMPUS REPORT</span>
            <h1 className="text-4xl font-bold text-gray-900">校招身价报告</h1>
          </div>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm">
            <FileText className="w-4 h-4" />
            导出 PDF
          </button>
        </div>

        {/* Valuation Card */}
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-[40px] p-10 mb-8 border border-blue-100/50 shadow-sm relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-gray-500 font-medium mb-3">预计年薪估值</p>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-6xl font-black text-blue-600">
                  ¥ {salaryNumbers[0]}k ~ {salaryNumbers[1]}k
                </span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100/50 rounded-full text-blue-700 text-sm font-bold">
                <TrendingUp className="w-4 h-4" />
                等级：{result.levelTag}
              </div>
            </div>

            <div className="bg-blue-600 rounded-3xl p-8 text-white text-center shadow-xl shadow-blue-200/50">
              <p className="text-sm font-medium opacity-90 mb-1">超越全国毕业生</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-black">{salaryCompetitiveness}</span>
                <span className="text-2xl font-bold">%</span>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-200/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-100/30 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl"></div>
        </div>

        {/* levelDesc */}
        {result.levelDesc && (
          <p className="text-sm text-gray-500 leading-relaxed mb-8 max-w-3xl">{result.levelDesc}</p>
        )}

        {/* Circular Progress */}
        <div className="grid grid-cols-2 gap-6 mb-8">
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

        <p className="text-xs text-gray-400 font-medium leading-relaxed mb-8">说明：以上为应届校招预估年度总薪酬包（单位：千元），由模型评估而成，仅供参考。</p>

        {/* Competency Section */}
        <div className="bg-white rounded-[40px] p-10 border border-gray-100 shadow-sm mb-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users className="text-blue-600 w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">核心胜任力画像</h2>
          </div>

          <div className="grid grid-cols-2 gap-16">
            <div className="relative h-[350px] [&_*]:!outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }} />
                  <Radar name="能力值" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} dot={false} activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
                  <Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="bg-[#3b82f6] text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow">{payload[0].payload.subject}: {Number(payload[0].value).toFixed(1)}分</div> : null} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-gray-400 font-medium italic">
                数据基于 AI 综合评估生成
              </div>
            </div>

            <div className="flex flex-col justify-center gap-6">
              {competencyDetails.map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                    <span className="text-sm font-bold text-blue-600">{item.score}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(item.rawScore * 10, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 各能力得分释义 */}
        <div className="bg-white rounded-[40px] p-10 border border-gray-100 shadow-sm mb-8">
          <div className="flex flex-col mb-6">
            <h2 className="text-2xl font-bold text-gray-900">各能力得分释义</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">SCORE DEFINITIONS</p>
          </div>

          <div className="space-y-6">
            {competencyDetails.map((item, idx) => (
              <div key={idx}>
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="font-bold text-gray-900 text-base">{item.label}</span>
                  <span className="text-gray-500 text-sm font-semibold">{item.score}分</span>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed"><span className="font-medium">{item.tag}:</span> {item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧 Chat - 固定不滚动 */}
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
    </div>
  );
};
