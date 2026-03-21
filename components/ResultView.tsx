import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { AssessmentResult, AssessmentInput, AbilityItem, ResumeSection, PendingEdit, ResumeExpression, JobComparison, ParsedJd, JdMatchItem } from '../types';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, Target, Users, FileText, BarChart3, Bell, Search,
  Lightbulb, Brain, Handshake, PenTool, Shield, Award
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Tooltip
} from 'recharts';
import { ChatWidget, ChatMessage } from './ChatWidget';
import { CanvasView } from './CanvasView';
import { cleanResumeContent } from './ResumePanel';

interface ResultViewProps {
  result: AssessmentResult;
  inputData: AssessmentInput;
  assessmentType: 'CV';
  onReset: () => void;
  userId?: string;
}

const ABILITY_TAGS: Record<string, Record<string, string>> = {
  专业力: { high: '博学多才', medium: '稳扎稳打', low: '积蓄力量' },
  管理力: { high: '统筹大局', medium: '团队骨干', low: '初出茅庐' },
  合作力: { high: '团队粘合', medium: '默契搭档', low: '配合协作' },
  思辨力: { high: '迎难而上', medium: '条理清晰', low: '按部就班' },
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

const CITIES = ["北京", "上海", "深圳", "广州", "杭州", "南京", "成都", "武汉", "苏州", "西安", "其他"];
const INDUSTRIES = ["互联网", "高科技", "金融", "大健康", "汽车", "消费品", "新零售", "地产", "泛娱乐", "教育", "农业", "通用行业"];

export const ResultView: React.FC<ResultViewProps> = ({ result, inputData, onReset, userId }) => {
  // ===== 岗位对比筛选状态 =====
  const [filterCity, setFilterCity] = useState(inputData.city);
  const [filterIndustry, setFilterIndustry] = useState(inputData.industry);
  const [filteredComparisons, setFilteredComparisons] = useState(result.jobComparisons || []);
  const [salaryLoading, setSalaryLoading] = useState(false);

  // 城市/行业变化时重新查询薪酬
  useEffect(() => {
    if (filterCity === inputData.city && filterIndustry === inputData.industry) {
      setFilteredComparisons(result.jobComparisons || []);
      return;
    }
    const functions = (result.jobComparisons || []).map(j => j.jobFunction);
    if (!functions.length) return;

    setSalaryLoading(true);
    fetch(`${API_BASE}/api/mini/salary-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grade: result.level,
        functions,
        city: filterCity,
        industry: filterIndustry,
        schoolTier: result.schoolTier || '普通本科',
        educationLevel: inputData.educationLevel,
      }),
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setFilteredComparisons((result.jobComparisons || []).map(job => ({
            ...job,
            salaryRange: res.data[job.jobFunction] || job.salaryRange,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setSalaryLoading(false));
  }, [filterCity, filterIndustry]);

  // ===== 提升的聊天状态 =====
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const savedMsgCount = useRef(0);
  const dbSessionId = useRef<string | null>(null);

  // 新对话时重置持久化状态
  useEffect(() => {
    if (!sessionId) {
      savedMsgCount.current = 0;
      dbSessionId.current = null;
    }
  }, [sessionId]);

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
  const [resumeSections, setResumeSections] = useState<ResumeSection[]>(() => {
    // 从评测结果预加载简历段落
    if (result.resumeSections?.length) {
      return result.resumeSections.map((sec, i) => ({
        id: `section-${i}`,
        type: sec.type,
        title: sec.title,
        content: sec.content,
      }));
    }
    return [];
  });
  // 简历原文快照（冻结，不随编辑变化，用于三栏对比）
  const [originalSections, setOriginalSections] = useState<ResumeSection[]>(() => {
    if (result.resumeSections?.length) {
      return result.resumeSections.map((sec, i) => ({
        id: `section-${i}`,
        type: sec.type,
        title: sec.title,
        content: sec.content,
      }));
    }
    return [];
  });
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [parsedJd, setParsedJd] = useState<ParsedJd | null>(null);
  const [jdChecklist, setJdChecklist] = useState<JdMatchItem[]>([]);
  // ref 追踪最新 pendingEdits，避免 handleEditSuggestion 闭包捕获旧值
  const pendingEditsRef = useRef<PendingEdit[]>([]);
  pendingEditsRef.current = pendingEdits;

  // 兜底：当 resumeSections 首次有数据时，同步冻结为原文快照
  useEffect(() => {
    if (originalSections.length === 0 && resumeSections.length > 0) {
      setOriginalSections(resumeSections.map(s => ({ ...s })));
    }
  }, [resumeSections, originalSections.length]);

  const assessmentContext = useMemo(() => {
    const dims = result.resumeExpression?.dimensions || {};
    const dimScore = (name: string) => (dims as any)[name]?.score ?? '未知';
    return {
      factors: result.factors || {},
      abilities: result.abilities || {},
      grade: result.level,
      salaryRange: result.salaryRange || result.personValue || '',
      jobTitle: inputData.jobTitle,
      jobFunction: inputData.jobFunction,
      educationLevel: inputData.educationLevel,
      major: inputData.major,
      city: inputData.city,
      industry: inputData.industry,
      companyType: inputData.companyType,
      targetCompany: inputData.targetCompany || '',
      levelTitle: result.levelTag || '',
      levelDescription: result.levelDesc || '',
      expressionScore: result.resumeExpression?.overallScore ?? '未知',
      starScore: dimScore('STAR规范度'),
      keywordScore: dimScore('关键词覆盖'),
      quantifyScore: dimScore('量化程度'),
      completenessScore: dimScore('信息完整度'),
      structureScore: dimScore('结构规范度'),
      powerScore: dimScore('表达力度'),
      jobComparisons: (result.jobComparisons || []).map(j => ({
        jobFunction: j.jobFunction,
        salaryRange: j.salaryRange,
        matchScore: j.matchScore,
      })),
    };
  }, [result, inputData]);

  const resumeText = result.resumeText || inputData.resumeText;

  // 进入画布模式
  const handleEnterCanvas = useCallback(async () => {
    if (!sessionId) return;
    setViewMode('canvas');

    // 如果 sections 已经从后端预拆分拿到了，直接用
    if (resumeSections.length > 0) return;

    // 拉取简历段落数据
    const fetchSections = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/sections?sessionId=${sessionId}`);
        const data = await res.json();
        if (data.success) {
          if (data.data.status === 'ready') {
            setResumeSections(data.data.sections);
            // 首次拿到时同步冻结为原文快照
            if (originalSections.length === 0) {
              setOriginalSections(data.data.sections.map((s: any) => ({ ...s })));
            }
          } else {
            setTimeout(fetchSections, 1500);
          }
        }
      } catch (err) {
        console.error('Failed to fetch sections:', err);
      }
    };
    fetchSections();
  }, [sessionId, resumeSections.length]);

  // AI 编辑建议：自动应用到内容 + 存储 diff 元数据
  const handleEditSuggestion = useCallback((edit: Omit<PendingEdit, 'status'>) => {
    // 取消 pending auto-save，避免覆盖
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    // 归一化函数：去 bullet 符号、合并空白，用于模糊匹配
    const normalize = (s: string) => s.replace(/^[\s•·\-*●○]+/gm, '').replace(/\s+/g, ' ').trim();

    // 再优化场景：同 section 已有 pending edit，内容已被替换为旧 suggested，
    // 用旧 suggested 作为匹配目标来替换为新 suggested
    const existingEdit = pendingEditsRef.current.find(e => e.sectionId === edit.sectionId);
    const matchTarget = existingEdit ? existingEdit.suggested : edit.original;

    // 立即应用编辑到 section 内容
    console.log('[EditSuggestion]', { sectionId: edit.sectionId, matchTarget: matchTarget.slice(0, 60), suggested: edit.suggested.slice(0, 60), isReopt: !!existingEdit });
    setResumeSections(prev => prev.map(sec => {
      if (sec.id === edit.sectionId) {
        // 1. 精确匹配（再优化时 matchTarget = 旧 suggested）
        if (sec.content.includes(matchTarget)) {
          console.log('[EditSuggestion] hit: exact');
          return { ...sec, content: sec.content.replace(matchTarget, edit.suggested) };
        }
        // 1.5. 用户从渲染后面板选取文本（经过 cleanResumeContent 合并断行/去 bullet），
        //      原始 content 含断行对不上 → 用滑动窗口找到对应的原始行范围再替换
        const cleaned = cleanResumeContent(sec.content);
        if (cleaned.includes(matchTarget)) {
          const lines = sec.content.split('\n');
          for (let start = 0; start < lines.length; start++) {
            for (let end = start; end < Math.min(start + 15, lines.length); end++) {
              const chunk = lines.slice(start, end + 1).join('\n');
              if (cleanResumeContent(chunk).includes(matchTarget)) {
                console.log('[EditSuggestion] hit: clean (lines ' + start + '-' + end + ')');
                const pos = sec.content.indexOf(chunk);
                if (pos !== -1) {
                  return { ...sec, content: sec.content.slice(0, pos) + edit.suggested + sec.content.slice(pos + chunk.length) };
                }
              }
            }
          }
        }
        // 2. 模糊匹配：忽略空白差异
        const normContent = normalize(sec.content);
        const normTarget = normalize(matchTarget);
        if (normContent.includes(normTarget)) {
          console.log('[EditSuggestion] hit: fuzzy');
          const lines = sec.content.split('\n');
          for (let start = 0; start < lines.length; start++) {
            for (let end = start; end < Math.min(start + 15, lines.length); end++) {
              const candidate = lines.slice(start, end + 1).join('\n');
              if (normalize(candidate) === normTarget) {
                const pos = sec.content.indexOf(candidate);
                if (pos !== -1) {
                  return { ...sec, content: sec.content.slice(0, pos) + edit.suggested + sec.content.slice(pos + candidate.length) };
                }
              }
            }
          }
        }
        console.warn('[EditSuggestion] MISS: no match found', { sectionId: edit.sectionId, matchTarget: matchTarget.slice(0, 80), contentHead: sec.content.slice(0, 80) });
        return sec;
      }
      return sec;
    }));

    // 兜底：全局匹配（首次按 sectionId 替换失败时）
    // 再优化场景已在上面处理，跳过兜底
    if (!existingEdit) {
      setResumeSections(prev => {
        const normOriginal = normalize(edit.original);
        const stillContains = prev.some(s =>
          s.content.includes(edit.original) || normalize(s.content).includes(normOriginal)
        );
        if (!stillContains) return prev;
        return prev.map(sec => {
          if (sec.content.includes(edit.original)) {
            return { ...sec, content: sec.content.replace(edit.original, edit.suggested) };
          }
          const cleanedSec = cleanResumeContent(sec.content);
          if (cleanedSec.includes(edit.original)) {
            const fallbackLines = sec.content.split('\n');
            for (let s = 0; s < fallbackLines.length; s++) {
              for (let e = s; e < Math.min(s + 15, fallbackLines.length); e++) {
                const chunk = fallbackLines.slice(s, e + 1).join('\n');
                if (cleanResumeContent(chunk).includes(edit.original)) {
                  const pos = sec.content.indexOf(chunk);
                  if (pos !== -1) {
                    return { ...sec, content: sec.content.slice(0, pos) + edit.suggested + sec.content.slice(pos + chunk.length) };
                  }
                }
              }
            }
          }
          if (normalize(sec.content).includes(normOriginal)) {
            const lines = sec.content.split('\n');
            for (let start = 0; start < lines.length; start++) {
              for (let end = start; end < Math.min(start + 15, lines.length); end++) {
                const candidate = lines.slice(start, end + 1).join('\n');
                if (normalize(candidate) === normOriginal) {
                  const pos = sec.content.indexOf(candidate);
                  if (pos !== -1) {
                    return { ...sec, content: sec.content.slice(0, pos) + edit.suggested + sec.content.slice(pos + candidate.length) };
                  }
                }
              }
            }
          }
          return sec;
        });
      });
    }

    // 存储 diff 元数据：同 section 已有 edit 时更新而非追加
    if (existingEdit) {
      setPendingEdits(prev => prev.map(e =>
        e.sectionId === edit.sectionId ? { ...edit, status: 'pending' as const } : e
      ));
    } else {
      setPendingEdits(prev => [...prev, { ...edit, status: 'pending' }]);
    }

    // 通知后端
    if (sessionId) {
      fetch(`${API_BASE}/api/chat/edit-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          sectionId: edit.sectionId,
          action: 'accept',
          suggestedText: edit.suggested,
          originalText: edit.original,
        }),
      }).catch(err => console.error('Failed to notify edit:', err));
    }
  }, [sessionId]);

  // 接受 AI 改写：标记为 accepted（保留高亮显示修改部分）
  const handleAcceptEdit = useCallback((sectionId: string) => {
    setPendingEdits(prev => prev.map(e =>
      e.sectionId === sectionId ? { ...e, status: 'accepted' as const } : e
    ));
  }, []);

  // 手动编辑简历段落 + 自动保存
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSectionContentChange = useCallback((sectionId: string, newContent: string) => {
    // 立即更新本地状态
    setResumeSections(prev => prev.map(sec =>
      sec.id === sectionId ? { ...sec, content: newContent } : sec
    ));

    // 去抖保存到后端（1.5秒）
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!sessionId) return;
      try {
        await fetch(`${API_BASE}/api/chat/section-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, sectionId, content: newContent }),
        });
      } catch (err) {
        console.error('Auto-save section failed:', err);
      }
    }, 1500);
  }, [sessionId]);

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

  const radarData = useMemo(() => {
    return competencyDetails.map(item => ({
      subject: item.label,
      A: item.rawScore,
      tag: item.tag,
    }));
  }, [competencyDetails]);

  const salaryNumbers = useMemo(() => {
    const salaryStr = result.salaryRange || result.personValue || '';
    const match = salaryStr.match(/(\d+\.?\d*)\s*k?\s*[-～~]\s*(\d+\.?\d*)/);
    if (match) return [parseFloat(match[1]), parseFloat(match[2])];
    return [0, 0];
  }, [result.salaryRange, result.personValue]);

  const salaryCompetitiveness = result.abilityCompetitiveness ?? result.salaryCompetitiveness ?? 50;
  const resumeHealthScore = result.resumeHealthScore ?? 50;

  // 当 /chat/start 返回 sections 时，直接更新状态（无需轮询）
  const handleSectionsReady = useCallback((sections: { id: string; type: string; title: string; content: string }[]) => {
    if (sections.length > 0 && resumeSections.length === 0) {
      const mapped = sections.map((s, i) => ({
        id: s.id || `section-${i}`,
        type: s.type,
        title: s.title,
        content: s.content,
      }));
      setResumeSections(mapped);
      if (originalSections.length === 0) {
        setOriginalSections(mapped.map(s => ({ ...s })));
      }
    }
  }, [resumeSections.length, originalSections.length]);

  // 共享的 chat props
  const chatProps = {
    assessmentContext,
    resumeText,
    resumeSections: result.resumeSections,
    apiBase: API_BASE,
    sessionId,
    setSessionId,
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    userId,
    preloadedGreeting: result.greeting,
    onSectionsReady: handleSectionsReady,
  };

  // ===== Canvas 模式 =====
  if (viewMode === 'canvas') {
    return (
      <CanvasView
        {...chatProps}
        resumeSections={resumeSections}
        originalSections={originalSections}
        pendingEdits={pendingEdits}
        onEditSuggestion={handleEditSuggestion}
        onAcceptEdit={handleAcceptEdit}
        onSectionContentChange={handleSectionContentChange}
        onExitCanvas={() => setViewMode('report')}
        parsedJd={parsedJd}
        setParsedJd={setParsedJd}
      />
    );
  }

  // ===== Report 模式（默认） =====
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8fafc] print-area">
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
      <div className="flex-1 overflow-y-auto p-8 pr-4 print-area">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <span className="text-xs font-bold text-[#0A66C2] tracking-widest uppercase mb-1 block">ASSESSMENT REPORT</span>
            <h1 className="text-4xl font-bold text-gray-900">评估报告</h1>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors no-print"
          >
            <FileText className="w-4 h-4" />
            导出 PDF
          </button>
        </div>

        {/* 1. 你的能力底子 */}
        <div className="bg-white rounded-[40px] p-10 mb-8 border border-gray-100 shadow-sm">
          {/* 标题区 */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Shield className="text-[#0A66C2] w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">能力测评</h2>
              <p className="text-xs text-gray-400 mt-0.5">基于简历内容的能力结构评估，衡量的是你当前展现出的能力水平</p>
            </div>
          </div>

          {/* 核心定位灰色卡片 */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Award className="text-[#0A66C2] w-5 h-5" />
              <span className="text-lg font-bold text-gray-900">能力等级：{result.levelTag}</span>
            </div>
            {result.levelDesc && (
              <p className="text-sm text-gray-500 leading-relaxed">{result.levelDesc}</p>
            )}
          </div>

          {/* 分隔线 */}
          <div className="border-t border-gray-200 mt-6 pt-6">
            <div className="grid grid-cols-2 gap-4">
              {/* 左：雷达图灰色卡片 */}
              <div className="bg-gray-50 rounded-xl p-6">
                <p className="text-base font-bold text-gray-600 mb-2">核心能力雷达图</p>
                <div className="w-full h-[320px] [&_*]:!outline-none">
                  <ResponsiveContainer width="100%" height={320}>
                    <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }} />
                      <Radar name="能力值" dataKey="A" stroke="#0A66C2" fill="#0A66C2" fillOpacity={0.15} dot={{ r: 4, fill: '#0A66C2', stroke: '#fff', strokeWidth: 2 }} />
                      <Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="bg-[#0A66C2] text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow">{Number(payload[0].value).toFixed(1)}分：{payload[0].payload.tag}</div> : null} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 右：能力层级定义灰色卡片 */}
              <div className="bg-gray-50 rounded-xl p-6">
                <p className="text-base font-bold text-gray-600 mb-3">能力层级定义</p>
                <div className="flex flex-col justify-center gap-3">
                  {competencyDetails.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <span className="inline-block text-sm font-bold text-[#0A66C2] bg-blue-50 px-2.5 py-1 rounded-lg">{item.label}</span>
                      <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-6 leading-relaxed">说明：以上信息是模型基于简历内容进行深度挖掘，衡量的是当前简历展现出的实际能力水平。</p>
        </div>

        {/* 2. 薪酬对标 */}
        {result.jobComparisons && result.jobComparisons.length > 0 && (
          <div className="bg-white rounded-[40px] p-10 mb-8 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                  <Target className="text-purple-600 w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">薪酬对标</h2>
                  <p className="text-xs text-gray-400 mt-0.5">同一份简历，不同赛道、不同城市，市场给出的定薪完全不同——选对方向很重要</p>
                </div>
              </div>
            </div>

            <div className={`space-y-4 ${salaryLoading ? 'opacity-50 transition-opacity' : ''}`}>
              {filteredComparisons.map((job, idx) => (
                <div key={idx} className={`px-5 py-3 rounded-2xl border ${idx === 0 ? 'border-[#0A66C2]/30 bg-blue-50/30' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex items-center">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-bold text-gray-800">{job.jobFunction}</span>
                        {idx === 0 && <span className="text-xs bg-[#0A66C2] text-white px-2 py-0.5 rounded-full">目标方向</span>}
                      </div>
                      {job.coreDuties && (
                        <p className="text-xs text-gray-400"><span className="text-gray-500 font-medium">岗位核心职责：</span>{job.coreDuties}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 pl-6">
                      <span className="text-2xl font-black text-[#0A66C2]">{job.salaryRange}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400 mt-4 leading-relaxed">说明：以上薪酬数据为月度基本工资（税前现金性收入），薪酬范围仅供参考。</p>
          </div>
        )}

        {/* 3. 简历诊断 */}
        {result.resumeExpression && (
          <div className="bg-white rounded-[40px] p-10 mb-8 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <FileText className="text-amber-600 w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">简历诊断</h2>
                <p className="text-xs text-gray-400 mt-0.5">能力是底子，简历是包装——同样的经历不同的写法，HR看到的是完全不同的人</p>
              </div>
            </div>

            <div className="flex gap-6">
              {/* 左侧：综合表达力 */}
              <div className="flex-shrink-0 bg-gray-50 rounded-2xl p-6 flex flex-col items-center justify-center w-48">
                <span className="text-sm font-semibold text-gray-500 mb-2">综合表达力</span>
                <div className="flex items-baseline">
                  <span className="text-5xl font-black text-gray-800">{result.resumeExpression.overallScore}</span>
                  <span className="text-sm text-gray-400 ml-1">/ 100</span>
                </div>
                <p className="text-xs text-gray-400 mt-3 text-center leading-relaxed">你的能力比简历展现出来的要好，改写后可以显著提升匹配度</p>
              </div>

              {/* 右侧：6维卡片 3x2 */}
              <div className="flex-1 grid grid-cols-3 gap-3">
                {Object.entries(result.resumeExpression.dimensions).map(([name, dim]: [string, { score: number; level: string; tip: string }]) => (
                  <div key={name} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-2xl font-black ${
                        dim.level === 'high' ? 'text-green-500' :
                        dim.level === 'medium' ? 'text-amber-500' :
                        'text-red-500'
                      }`}>{dim.score}</span>
                      <span className="text-sm font-bold text-gray-700">{name}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{dim.tip}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4 leading-relaxed">说明：简历表达力评分衡量的是简历写作质量，不代表个人能力水平，想要了解每个维度的具体含义和提升方向，在右侧对话框里问问Sparky吧～</p>
          </div>
        )}


      </div>

      {/* 右侧 Chat - 固定不滚动 */}
      <div data-no-print>
      <ChatWidget
        {...chatProps}
        onEnterCanvas={handleEnterCanvas}
      />
      </div>
      </div>
    </div>
  );
};
