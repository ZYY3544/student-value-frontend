import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { AssessmentResult, AssessmentInput, AbilityItem, ResumeSection, PendingEdit } from '../types';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, Target, Users, FileText, BarChart3, Bell, Search,
  Lightbulb, Brain, Handshake, PenTool, Shield, Globe2, Star, Compass
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { ChatWidget, ChatMessage } from './ChatWidget';
import { CanvasView } from './CanvasView';

interface ResultViewProps {
  result: AssessmentResult;
  inputData: AssessmentInput;
  assessmentType: 'CV';
  onReset: () => void;
  userId?: string;
}

const ABILITY_TAGS: Record<string, Record<string, string>> = {
  知识深度: { high: '博学多才', medium: '稳扎稳打', low: '积蓄力量' },
  统筹能力: { high: '统筹大局', medium: '团队骨干', low: '初出茅庐' },
  沟通影响: { high: '团队粘合', medium: '默契搭档', low: '配合协作' },
  问题复杂度: { high: '迎难而上', medium: '条理清晰', low: '按部就班' },
  创新思维: { high: '开拓先锋', medium: '持续改进', low: '学习成长' },
  决策自主性: { high: '独当一面', medium: '有章有法', low: '稳步前行' },
  影响规模: { high: '影响深远', medium: '局部影响', low: '个人贡献' },
  贡献类型: { high: '核心产出', medium: '协同贡献', low: '辅助支持' },
};

const ABILITY_ICONS: Record<string, React.ReactNode> = {
  知识深度: <PenTool size={20} />,
  统筹能力: <Target size={20} />,
  沟通影响: <Handshake size={20} />,
  问题复杂度: <Brain size={20} />,
  创新思维: <Lightbulb size={20} />,
  决策自主性: <Compass size={20} />,
  影响规模: <Globe2 size={20} />,
  贡献类型: <Star size={20} />,
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
    <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2.5 border border-gray-100 shadow-sm">
      <div className="relative w-10 h-10 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={15} outerRadius={19} paddingAngle={0} dataKey="value" startAngle={90} endAngle={-270} isAnimationActive={false}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index]} stroke="none" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-gray-800">{score}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-xs font-bold text-gray-900">{label}</h3>
        <p className="text-[10px] text-gray-500 leading-snug">{description}</p>
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

export const ResultView: React.FC<ResultViewProps> = ({ result, inputData, onReset, userId }) => {
  // ===== 提升的聊天状态 =====
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const savedMsgCount = useRef(0);
  const dbSessionId = useRef<string | null>(null);

  // 将新消息持久化到 Supabase
  useEffect(() => {
    if (!userId || !sessionId || messages.length <= savedMsgCount.current) return;

    const newMessages = messages.slice(savedMsgCount.current);
    const createSessionAndSave = async () => {
      // 首次保存时创建 chat_sessions 记录
      if (!dbSessionId.current) {
        const { data } = await supabase
          .from('chat_sessions')
          .insert({ user_id: userId, phase: 'opening' })
          .select('id')
          .single();
        if (data) dbSessionId.current = data.id;
      }

      if (!dbSessionId.current) return;

      const rows = newMessages.map(m => ({
        session_id: dbSessionId.current!,
        role: m.role,
        content: m.content,
      }));
      await supabase.from('chat_messages').insert(rows);
      savedMsgCount.current = messages.length;
    };
    createSessionAndSave().catch(console.error);
  }, [messages, userId, sessionId]);

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

  const salaryCompetitiveness = result.abilityCompetitiveness ?? result.salaryCompetitiveness ?? 50;
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
    userId,
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
            <span className="text-xs font-bold text-[#0A66C2] tracking-widest uppercase mb-1 block">ASSESSMENT REPORT</span>
            <h1 className="text-4xl font-bold text-gray-900">评估报告</h1>
          </div>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm">
            <FileText className="w-4 h-4" />
            导出 PDF
          </button>
        </div>

        {/* 1. 个人能力评级 */}
        <div className="bg-white rounded-[40px] p-10 mb-8 border border-gray-100 shadow-sm relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Shield className="text-[#0A66C2] w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">能力等级</h2>
                  <p className="text-xs text-gray-400 mt-0.5">基于简历的个人能力评估</p>
                </div>
              </div>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-5xl font-black text-[#0A66C2]">Lv.{result.level}</span>
                <span className="text-3xl font-bold text-gray-800">{result.levelTag}</span>
              </div>
              {result.levelDesc && (
                <p className="text-sm text-gray-500 leading-relaxed mt-2 whitespace-nowrap">{result.levelDesc} 加油，你离马斯克就差{30 - (result.level || 0)}个级别了！</p>
              )}
            </div>

          </div>
          {/* 分隔线 */}
          <div className="relative z-10 border-t border-gray-200 mt-8 pt-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Users className="text-[#0A66C2] w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">评估标准</h3>
                <p className="text-xs text-gray-400 mt-0.5">对标世界500强企业价值评估方法论</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {[
                { title: '知识技能', subtitle: '输入', color: '#0A66C2', keys: ['知识深度', '统筹能力', '沟通影响'] },
                { title: '问题解决', subtitle: '过程', color: '#7c3aed', keys: ['问题复杂度', '创新思维'] },
                { title: '产出贡献', subtitle: '输出', color: '#059669', keys: ['决策自主性', '影响规模', '贡献类型'] },
              ].map((group) => {
                const items = group.keys.map(k => competencyDetails.find(d => d.label === k)).filter(Boolean) as typeof competencyDetails;
                return (
                  <div key={group.title} className="bg-gray-50/80 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-0.5 text-center">{group.title}</h3>
                    <p className="text-xs text-gray-400 mb-6 text-center">{group.subtitle}</p>
                    <div className="flex items-end justify-center gap-4 h-40 mb-4">
                      {items.map((item) => (
                        <div key={item.label} className="flex flex-col items-center gap-1 flex-1">
                          <span className="text-sm font-bold" style={{ color: group.color }}>{item.score}</span>
                          <div className="w-full bg-gray-200 rounded-t-lg relative" style={{ height: '120px' }}>
                            <div
                              className="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-700"
                              style={{ height: `${Math.min(item.rawScore * 10, 100)}%`, backgroundColor: group.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-center gap-4">
                      {items.map((item) => {
                        const displayName: Record<string, string> = { '知识深度': '知识经验', '统筹能力': '管理规划', '沟通影响': '沟通协作', '问题复杂度': '挑战难度' };
                        return <span key={item.label} className="text-[11px] text-gray-500 font-medium flex-1 text-center">{displayName[item.label] || item.label}</span>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="relative z-10 text-xs text-gray-400 mt-6 leading-relaxed">以上等级与各评估因子分数，是AI基于你的简历内容所进行的分析，并与价值评估标准进行匹配得出的结果，仅供参考。</p>

          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-200/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-100/30 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl"></div>
        </div>

        {/* 3. 市场薪酬 */}
        <div className="bg-white rounded-[40px] p-10 border border-gray-100 shadow-sm mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="text-green-600 w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">市场薪酬</h2>
              <p className="text-xs text-gray-400 mt-0.5">基于{inputData.city} · {inputData.industry} · {inputData.jobFunction}的市场行情</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-8">
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-black text-[#0A66C2]">
                ¥ {salaryNumbers[0]}k ~ {salaryNumbers[1]}k
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-400 font-medium leading-relaxed">说明：以上为应届校招预估月度基本工资（单位：千元），由模型评估而成，仅供参考。薪酬受城市、行业、企业性质等市场因素影响。</p>
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
