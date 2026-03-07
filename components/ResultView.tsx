import React, { useMemo, useState, useCallback } from 'react';
import { AssessmentResult, AssessmentInput, AbilityItem, ResumeSection, PendingEdit } from '../types';
import {
  TrendingUp, Target, Users, FileText, BarChart3, Bell, Search,
  Lightbulb, Brain, Handshake, PenTool
} from 'lucide-react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell
} from 'recharts';
import { ChatWidget, ChatMessage } from './ChatWidget';
import { CanvasView } from './CanvasView';

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

function getJobMatchDesc(val: number): string {
  if (val >= 70) return '你的简历与目标岗位高度匹配，优势明显！';
  if (val >= 50) return '你的简历与目标岗位基本匹配，仍有提升空间。';
  return '你的简历与目标岗位匹配度偏低，建议针对性优化。';
}

function getResumeHealthDesc(val: number): string {
  if (val >= 50) return '您的简历健康度不错，继续保持！';
  return '您的简历健康度有待提升，继续努力！';
}

const API_BASE = 'https://student-value-backend.onrender.com';

export const ResultView: React.FC<ResultViewProps> = ({ result, inputData, onReset }) => {
  // ===== 提升的聊天状态 =====
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ===== Canvas 状态 =====
  const [viewMode, setViewMode] = useState<'report' | 'canvas'>('report');
  const [resumeSections, setResumeSections] = useState<ResumeSection[]>([]);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);

  const assessmentContext = useMemo(() => ({
    factors: result.factors || {},
    abilities: result.abilities || {},
    grade: result.level,
    salaryRange: result.personValue || '',
    jobTitle: inputData.jobTitle,
    jobFunction: inputData.jobFunction,
    educationLevel: inputData.educationLevel,
    major: inputData.major,
    city: inputData.city,
    industry: inputData.industry,
    companyType: inputData.companyType,
    targetCompany: inputData.targetCompany || '',
  }), [result, inputData]);

  const resumeText = result.resumeText || inputData.resumeText;

  // 进入画布模式
  const handleEnterCanvas = useCallback(async () => {
    if (!sessionId) return;
    setViewMode('canvas');

    // 拉取简历段落数据
    const fetchSections = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/sections?sessionId=${sessionId}`);
        const data = await res.json();
        if (data.success) {
          if (data.data.status === 'ready') {
            setResumeSections(data.data.sections);
          } else {
            // 还在解析中，轮询
            setTimeout(fetchSections, 1500);
          }
        }
      } catch (err) {
        console.error('Failed to fetch sections:', err);
      }
    };
    fetchSections();
  }, [sessionId]);

  // 处理采纳编辑
  const handleAcceptEdit = useCallback(async (editIndex: number) => {
    const edit = pendingEdits[editIndex];
    if (!edit || !sessionId) return;

    // 更新本地状态
    setPendingEdits(prev => prev.map((e, i) =>
      i === editIndex ? { ...e, status: 'accepted' as const } : e
    ));

    // 更新对应 section 的内容
    setResumeSections(prev => prev.map(sec => {
      if (sec.id === edit.sectionId) {
        return { ...sec, content: sec.content.replace(edit.original, edit.suggested) };
      }
      return sec;
    }));

    // 通知后端
    try {
      await fetch(`${API_BASE}/api/chat/edit-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          sectionId: edit.sectionId,
          action: 'accept',
          suggestedText: edit.suggested,
        }),
      });
    } catch (err) {
      console.error('Failed to accept edit:', err);
    }

    // 短暂延迟后移除已处理的编辑
    setTimeout(() => {
      setPendingEdits(prev => prev.filter((_, i) => i !== editIndex));
    }, 500);
  }, [pendingEdits, sessionId]);

  // 处理拒绝编辑
  const handleRejectEdit = useCallback(async (editIndex: number) => {
    const edit = pendingEdits[editIndex];
    if (!edit || !sessionId) return;

    setPendingEdits(prev => prev.map((e, i) =>
      i === editIndex ? { ...e, status: 'rejected' as const } : e
    ));

    try {
      await fetch(`${API_BASE}/api/chat/edit-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          sectionId: edit.sectionId,
          action: 'reject',
          suggestedText: edit.suggested,
        }),
      });
    } catch (err) {
      console.error('Failed to reject edit:', err);
    }

    setTimeout(() => {
      setPendingEdits(prev => prev.filter((_, i) => i !== editIndex));
    }, 500);
  }, [pendingEdits, sessionId]);

  const radarData = useMemo(() => {
    if (result.radarData) {
      return Object.entries(result.radarData).map(([key, val]) => ({
        subject: key, A: +(Number(val) / 10).toFixed(1)
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
    const match = result.personValue?.match(/(\d+\.?\d*)\s*k?\s*[-～~]\s*(\d+\.?\d*)/);
    if (match) return [parseFloat(match[1]), parseFloat(match[2])];
    return [0, 0];
  }, [result.personValue]);

  const salaryCompetitiveness = result.salaryCompetitiveness ?? 50;
  const resumeHealthScore = result.resumeHealthScore ?? 50;

  // 共享的 chat props
  const chatProps = {
    assessmentContext,
    resumeText,
    apiBase: API_BASE,
    sessionId,
    setSessionId,
    messages,
    setMessages,
    isLoading,
    setIsLoading,
  };

  // ===== Canvas 模式 =====
  if (viewMode === 'canvas') {
    return (
      <CanvasView
        {...chatProps}
        resumeSections={resumeSections}
        pendingEdits={pendingEdits}
        setPendingEdits={setPendingEdits}
        onAcceptEdit={handleAcceptEdit}
        onRejectEdit={handleRejectEdit}
        onExitCanvas={() => setViewMode('report')}
      />
    );
  }

  // ===== Report 模式（默认） =====
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8fafc]">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-100 flex-shrink-0 z-50">
        <div className="px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#0A66C2] rounded-lg flex items-center justify-center">
                <BarChart3 className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-800">Campus Talent Valuation</span>
            </div>
            <nav className="flex items-center gap-8">
              {['Dashboard', 'Reports', 'Career Path', 'Community'].map((item) => (
                <button
                  key={item}
                  className={`text-sm font-medium relative py-5 ${item === 'Dashboard' ? 'text-[#0A66C2]' : 'text-gray-500'}`}
                >
                  {item}
                  {item === 'Dashboard' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0A66C2]" />}
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
            <span className="text-xs font-bold text-[#0A66C2] tracking-widest uppercase mb-1 block">CAMPUS REPORT</span>
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
              <p className="text-gray-500 font-medium mb-3">预计月薪估值</p>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-6xl font-black text-[#0A66C2]">
                  ¥ {salaryNumbers[0]}k ~ {salaryNumbers[1]}k
                </span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100/50 rounded-full text-[#0A66C2] text-sm font-bold">
                <TrendingUp className="w-4 h-4" />
                等级：{result.levelTag}
              </div>
              {result.levelDesc && (
                <p className="text-sm text-gray-500 leading-relaxed mt-4 max-w-lg">{result.levelDesc}</p>
              )}
            </div>

            <div className="bg-[#0A66C2] rounded-3xl p-8 text-white text-center shadow-xl shadow-blue-200/50">
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

        {/* Circular Progress */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <CircularProgress
            score={salaryCompetitiveness}
            label="岗位匹配度"
            description={getJobMatchDesc(salaryCompetitiveness)}
            color="#0A66C2"
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
              <Users className="text-[#0A66C2] w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">核心胜任力画像</h2>
          </div>

          <div className="grid grid-cols-2 gap-16">
            <div className="relative h-[350px] [&_*]:!outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }} />
                  <Radar name="能力值" dataKey="A" stroke="#0A66C2" fill="#0A66C2" fillOpacity={0.15} dot={false} activeDot={{ r: 5, fill: '#0A66C2', stroke: '#fff', strokeWidth: 2 }} />
                  <Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="bg-[#0A66C2] text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow">{payload[0].payload.subject}: {Number(payload[0].value).toFixed(1)}分</div> : null} />
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
                    <span className="text-sm font-bold text-[#0A66C2]">{item.score}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#0A66C2]" style={{ width: `${Math.min(item.rawScore * 10, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* 右侧 Chat - 固定不滚动 */}
      <ChatWidget
        {...chatProps}
        onEnterCanvas={handleEnterCanvas}
      />
      </div>
    </div>
  );
};
