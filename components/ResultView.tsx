import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { AssessmentResult, AssessmentInput, AbilityItem, ResumeSection, PendingEdit, ResumeExpression, JobComparison, ParsedJd, JdMatchItem, ResumeVersion } from '../types';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, Target, Users, FileText, BarChart3, Bell,
  Lightbulb, Brain, Handshake, PenTool, Shield, Award
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Tooltip
} from 'recharts';
import { ChatWidget, ChatMessage } from './ChatWidget';
import { CanvasView } from './CanvasView';
import { authHeaders } from '../services/authService';


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

const API_BASE = import.meta.env.VITE_API_URL || 'https://student-value-backend.onrender.com';

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
      headers: authHeaders(),
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
  const dbCreateFailed = useRef(false); // 403/RLS 失败后停止重试

  // 新对话时重置持久化状态
  useEffect(() => {
    if (!sessionId) {
      savedMsgCount.current = 0;
      dbSessionId.current = null;
      dbCreateFailed.current = false;
    }
  }, [sessionId]);

  // 将新消息持久化到 Supabase（失败后退避，不无限重试）
  useEffect(() => {
    if (!userId || !sessionId || dbCreateFailed.current) return;
    if (messages.length <= savedMsgCount.current) return;

    const newMessages = messages.slice(savedMsgCount.current);
    const createSessionAndSave = async () => {
      // 首次保存时创建 chat_sessions 记录
      if (!dbSessionId.current) {
        const { data, error } = await supabase
          .from('chat_sessions')
          .insert({ user_id: userId, phase: 'opening' })
          .select('id')
          .single();
        if (error) {
          console.warn('[Supabase] chat_sessions insert failed, stopping retries:', error.message);
          dbCreateFailed.current = true;
          return;
        }
        if (data) dbSessionId.current = data.id;
      }

      if (!dbSessionId.current) return;

      const rows = newMessages.map(m => ({
        session_id: dbSessionId.current!,
        role: m.role,
        content: m.content,
      }));
      const { error } = await supabase.from('chat_messages').insert(rows);
      if (error) {
        console.warn('[Supabase] chat_messages insert failed:', error.message);
        return;
      }
      savedMsgCount.current = messages.length;
    };
    createSessionAndSave().catch(console.error);
  }, [messages, userId, sessionId]);

  // ===== Canvas 状态 =====
  const [viewMode, setViewMode] = useState<'report' | 'canvas'>('report');
  const [chatForceExpanded, setChatForceExpanded] = useState(false);
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
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [parsedJd, setParsedJd] = useState<ParsedJd | null>(null);
  const [jdChecklist, setJdChecklist] = useState<JdMatchItem[]>([]);
  // ref 追踪最新 pendingEdits，避免 handleEditSuggestion 闭包捕获旧值
  const pendingEditsRef = useRef<PendingEdit[]>([]);
  pendingEditsRef.current = pendingEdits;

  // 润色选中文本：前端存储用户选中的文本和 sectionId，替换时用它定位而不是 GPT 的 original
  const [pendingSelection, setPendingSelection] = useState<{ text: string; sectionId: string } | null>(null);
  const pendingSelectionRef = useRef(pendingSelection);
  pendingSelectionRef.current = pendingSelection;

  // ===== 版本管理 =====
  const versionStorageKey = `resume_versions_${userId || 'anonymous'}`;
  const [versions, setVersions] = useState<ResumeVersion[]>(() => {
    try {
      const saved = localStorage.getItem(versionStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  // 持久化到 localStorage
  useEffect(() => {
    localStorage.setItem(versionStorageKey, JSON.stringify(versions));
  }, [versions, versionStorageKey]);

  // Refs 追踪最新值（避免闭包陈旧问题）
  const versionsRef = useRef(versions);
  versionsRef.current = versions;
  const resumeSectionsRef = useRef(resumeSections);
  resumeSectionsRef.current = resumeSections;
  // pendingEditsRef 已在上方定义
  const activeVersionIdRef = useRef(activeVersionId);
  activeVersionIdRef.current = activeVersionId;
  const skipAutoSaveRef = useRef(false);

  // 自动保存：当前编辑内容同步到活跃版本（原始简历除外）
  useEffect(() => {
    if (skipAutoSaveRef.current) return;
    if (!activeVersionId) return;
    const active = versions.find(v => v.id === activeVersionId);
    if (active?.versionType === 'original') return; // 原始简历只读
    setVersions(prev => prev.map(v =>
      v.id === activeVersionId
        ? { ...v, sections: resumeSections.map(s => ({ ...s, highlightRanges: undefined })), pendingEdits: [...pendingEdits], updatedAt: Date.now() }
        : v
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSections, pendingEdits, activeVersionId]);

  const handleSwitchVersion = useCallback((versionId: string) => {
    const target = versions.find(v => v.id === versionId);
    if (!target) return;
    setActiveVersionId(versionId);
    setResumeSections(target.sections.map(s => ({ ...s, highlightRanges: undefined })));
    setPendingEdits(target.pendingEdits.map(e => ({ ...e })));
  }, [versions]);

  const handleDeleteVersion = useCallback((versionId: string) => {
    const target = versions.find(v => v.id === versionId);
    // 只有 JD 版本可删除
    if (target?.versionType !== 'jd') return;
    setVersions(prev => prev.filter(v => v.id !== versionId));
    if (activeVersionId === versionId) {
      // 删除当前版本后切回通用版
      const general = versions.find(v => v.versionType === 'general');
      if (general) {
        setActiveVersionId(general.id);
        setResumeSections(general.sections.map(s => ({ ...s })));
        setPendingEdits(general.pendingEdits.map(e => ({ ...e })));
      }
    }
  }, [activeVersionId, versions]);

  function extractJdName(jdContent: string): string {
    const firstLine = jdContent.trim().split('\n')[0].trim();
    const titleLineMatch = firstLine.match(/^(.{2,15})\s*[·\-|]\s*(.{2,20})$/);
    if (titleLineMatch) return `${titleLineMatch[1].trim()} · ${titleLineMatch[2].trim()}`;
    // 2. 尝试匹配"公司：xxx"格式
    const companyMatch = jdContent.match(/(?:公司|企业|集团|单位)[：:名]\s*(.{2,15})/);
    const titleMatch = jdContent.match(/(?:岗位|职位|招聘)[：:名]\s*(.{2,20})/);
    const company = companyMatch?.[1]?.replace(/[,，。.、\s]+$/, '') || '';
    const title = titleMatch?.[1]?.replace(/[,，。.、\s]+$/, '') || '';
    if (company && title) return `${company} · ${title}`;
    if (company || title) return company || title;
    // 3. 首行不超过 25 字就当标题用
    if (firstLine.length <= 25 && firstLine.length >= 4) return firstLine;
    return 'JD 版本';
  }

  // JD 优化开始前：基于通用版 fork JD 版本，返回版本 id
  const handleJdVersionCreate = useCallback((jdContent: string): string | null => {
    const curVersions = versionsRef.current;
    const jdCount = curVersions.filter(v => v.versionType === 'jd').length;
    if (jdCount >= 5) return null;

    const now = new Date();
    const ts = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const jdName = `${extractJdName(jdContent)} (${ts})`;

    // 始终基于通用版 fork（不是当前屏幕内容）
    const general = curVersions.find(v => v.versionType === 'general');
    if (!general) return null;

    // 如果当前在通用版上编辑，先把最新 resumeSections 同步到通用版
    let baseSections: ResumeSection[];
    let baseEdits: PendingEdit[];
    if (activeVersionIdRef.current === general.id) {
      baseSections = resumeSectionsRef.current.map(s => ({ ...s }));
      baseEdits = pendingEditsRef.current.map(e => ({ ...e }));
    } else {
      baseSections = general.sections.map(s => ({ ...s }));
      baseEdits = general.pendingEdits.map(e => ({ ...e }));
    }

    // 每次上传 JD 都创建新版本（同名也允许，用户可能多次优化同一个 JD）
    const targetId = crypto.randomUUID();
    const newVersion: ResumeVersion = {
      id: targetId,
      name: jdName,
      sections: baseSections.map(s => ({ ...s })),
      pendingEdits: baseEdits.map(e => ({ ...e })),
      jdContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      versionType: 'jd',
    };
    setVersions(prev => prev.map(v =>
      v.versionType === 'general'
        ? { ...v, sections: baseSections, pendingEdits: baseEdits, updatedAt: Date.now() }
        : v
    ).concat(newVersion));

    // 不改 resumeSections — edit 循环需要在当前内容上匹配
    // 切换和保存由 onJdEditComplete 完成
    return targetId;
  }, []);

  // JD 编辑完成后：把最终 resumeSections 写入 JD 版本，并切换过去
  const handleJdEditComplete = useCallback((jdVersionId: string) => {
    const finalSections = resumeSectionsRef.current.map(s => ({ ...s, highlightRanges: undefined }));
    setVersions(prev => prev.map(v =>
      v.id === jdVersionId
        ? { ...v, sections: resumeSectionsRef.current.map(s => ({ ...s })), updatedAt: Date.now() }
        : v
    ));
    setActiveVersionId(jdVersionId);
  }, []);

  // 首次进入画布时，自动创建"原始简历"和"通用版"
  const versionInitRef = useRef(false);
  useEffect(() => {
    if (versionInitRef.current) return;
    if (resumeSections.length === 0) return;
    const hasGeneral = versions.some(v => v.versionType === 'general');
    if (hasGeneral) {
      // 已有版本，激活通用版
      versionInitRef.current = true;
      if (!activeVersionId) {
        const general = versions.find(v => v.versionType === 'general');
        if (general) setActiveVersionId(general.id);
      }
      return;
    }
    versionInitRef.current = true;
    const now = Date.now();
    const originalVersion: ResumeVersion = {
      id: crypto.randomUUID(),
      name: '原始简历',
      sections: resumeSections.map(s => ({ ...s })),
      pendingEdits: [],
      jdContent: null,
      createdAt: now,
      updatedAt: now,
      isProtected: true,
      versionType: 'original',
    };
    const generalVersion: ResumeVersion = {
      id: crypto.randomUUID(),
      name: '通用版',
      sections: resumeSections.map(s => ({ ...s })),
      pendingEdits: [],
      jdContent: null,
      createdAt: now,
      updatedAt: now,
      isProtected: true,
      versionType: 'general',
    };
    setVersions(prev => [...prev, generalVersion, originalVersion]);
    setActiveVersionId(generalVersion.id);
  }, [resumeSections, versions, activeVersionId]);

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

  // AI 编辑建议：不替换 content，只存 pendingEdits（content 在接受时才改）
  // 每个 edit 都有 editId，同 section 可有多个 edit（JD 优化场景）
  const handleEditSuggestion = useCallback((edit: Omit<PendingEdit, 'status' | 'editId'>) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const sel = pendingSelectionRef.current;
    const matchTarget = sel?.text || edit.original;
    const targetSectionId = sel?.sectionId || edit.sectionId;

    // 同 section + 同 original 的 edit 直接替换（再优化场景），否则追加
    const newEdit = { ...edit, editId: crypto.randomUUID(), sectionId: targetSectionId, original: matchTarget, status: 'pending' as const };
    setPendingEdits(prev => {
      const existingIdx = prev.findIndex(
        e => e.sectionId === targetSectionId && e.original === matchTarget && e.status === 'pending'
      );
      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx] = newEdit;
        return updated;
      }
      return [...prev, newEdit];
    });

    setPendingSelection(null);
  }, []);

  // 接受 AI 改写：此时才真正替换 content（精确匹配 → normalize fallback）
  // 接受单个 edit（按 editId 定位），替换 content 后移除该 edit
  const handleAcceptEdit = useCallback((editId: string) => {
    const edit = pendingEditsRef.current.find(e => e.editId === editId);
    if (edit) {
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
      setResumeSections(prev => {
        const idx = prev.findIndex(s => s.id === edit.sectionId);
        if (idx === -1) return prev;
        const sec = prev[idx];
        const updated = [...prev];

        // 精确匹配
        if (sec.content.includes(edit.original)) {
          updated[idx] = { ...sec, content: sec.content.replace(edit.original, edit.suggested) };
          return updated;
        }

        // normalize fallback
        const normContent = normalize(sec.content);
        const normOriginal = normalize(edit.original);
        if (normContent.includes(normOriginal)) {
          let ci = 0;
          const normIdx = normContent.indexOf(normOriginal);
          let normPos = 0;
          while (normPos < normIdx && ci < sec.content.length) {
            if (/\s/.test(sec.content[ci]) && ci > 0 && /\s/.test(sec.content[ci - 1])) { ci++; continue; }
            ci++; normPos++;
          }
          const matchStart = ci;
          let matchLen = 0, normMatchLen = 0;
          while (normMatchLen < normOriginal.length && ci < sec.content.length) {
            if (/\s/.test(sec.content[ci]) && ci > matchStart && /\s/.test(sec.content[ci - 1])) { ci++; matchLen++; continue; }
            ci++; matchLen++; normMatchLen++;
          }
          if (matchLen > 0) {
            updated[idx] = { ...sec, content: sec.content.slice(0, matchStart) + edit.suggested + sec.content.slice(matchStart + matchLen) };
            return updated;
          }
        }

        console.warn('[AcceptEdit] original not found', edit.sectionId);
        return prev;
      });

      // 通知后端
      if (sessionId) {
        fetch(`${API_BASE}/api/chat/edit-action`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            sessionId,
            sectionId: edit.sectionId,
            action: 'accept',
            suggestedText: edit.suggested,
            originalText: edit.original,
          }),
        }).catch(err => console.error('Failed to notify edit:', err));
      }
    }
    // 清除已接受的 edit，同时清理同 section 同 original 的残留（再优化遗留）
    setPendingEdits(prev => prev.filter(e =>
      e.editId !== editId &&
      !(e.sectionId === edit.sectionId && e.original === edit.original && e.status === 'pending')
    ));
  }, [sessionId]);

  // JD 优化：直接替换 content + 添加高亮区间（不走 pendingEdits）
  const handleDirectReplace = useCallback((sectionId: string, original: string, suggested: string): boolean => {
    // 多级容错：精确 → 空白规范化 → 去标点/符号模糊匹配
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    const fuzzy = (s: string) => s.replace(/[\s·•\-–—,，;；。.、：:""''「」【】（）()]/g, '').trim();
    let success = false;

    console.log(`[DirectReplace] sectionId=${sectionId}`);
    console.log(`[DirectReplace] original (${original.length} chars): "${original.slice(0, 80)}..."`);
    console.log(`[DirectReplace] suggested (${suggested.length} chars): "${suggested.slice(0, 80)}..."`);
    const sec = resumeSections.find(s => s.id === sectionId);
    if (sec) {
      console.log(`[DirectReplace] section content (${sec.content.length} chars): "${sec.content.slice(0, 80)}..."`);
      console.log(`[DirectReplace] indexOf result: ${sec.content.indexOf(original)}`);
    } else {
      console.log(`[DirectReplace] section NOT FOUND! available ids: ${resumeSections.map(s => s.id).join(', ')}`);
    }

    setResumeSections(prev => {
      const idx = prev.findIndex(s => s.id === sectionId);
      if (idx === -1) return prev;
      const sec = prev[idx];
      const updated = [...prev];

      const applyReplace = (start: number, len: number) => {
        const newContent = sec.content.slice(0, start) + suggested + sec.content.slice(start + len);
        updated[idx] = {
          ...sec,
          content: newContent,
          highlightRanges: [...(sec.highlightRanges || []), { start, end: start + suggested.length }],
        };
        success = true;
      };

      // 1. 精确匹配
      const pos = sec.content.indexOf(original);
      if (pos !== -1) {
        applyReplace(pos, original.length);
        return updated;
      }

      // 2. 空白规范化匹配
      const normContent = normalize(sec.content);
      const normOriginal = normalize(original);
      const normIdx = normContent.indexOf(normOriginal);
      if (normIdx !== -1) {
        // 从规范化位置映射回原始位置
        let ci = 0, normPos = 0;
        while (normPos < normIdx && ci < sec.content.length) {
          if (/\s/.test(sec.content[ci]) && ci > 0 && /\s/.test(sec.content[ci - 1])) { ci++; continue; }
          ci++; normPos++;
        }
        const matchStart = ci;
        let matchLen = 0, normMatchLen = 0;
        while (normMatchLen < normOriginal.length && ci < sec.content.length) {
          if (/\s/.test(sec.content[ci]) && ci > matchStart && /\s/.test(sec.content[ci - 1])) { ci++; matchLen++; continue; }
          ci++; matchLen++; normMatchLen++;
        }
        if (matchLen > 0) {
          applyReplace(matchStart, matchLen);
          return updated;
        }
      }

      // 3. 去标点模糊匹配（LLM 可能丢失或改变标点/bullet 符号）
      const fuzzyOriginal = fuzzy(original);
      if (fuzzyOriginal.length >= 10) {
        // 用滑动窗口在内容中找最佳匹配
        const contentChars = sec.content;
        let bestStart = -1, bestEnd = -1, bestScore = 0;

        for (let start = 0; start < contentChars.length; start++) {
          // 从 start 开始，尝试匹配 fuzzyOriginal
          let fi = 0, ci2 = start;
          while (fi < fuzzyOriginal.length && ci2 < contentChars.length) {
            const fc = fuzzyOriginal[fi];
            const cc = contentChars[ci2];
            if (fuzzy(cc) === '') { ci2++; continue; } // 跳过标点
            if (fc === fuzzy(cc)) { fi++; ci2++; } else { break; }
          }
          if (fi === fuzzyOriginal.length && fi > bestScore) {
            bestScore = fi;
            bestStart = start;
            bestEnd = ci2;
          }
        }

        if (bestStart !== -1 && bestScore >= fuzzyOriginal.length) {
          applyReplace(bestStart, bestEnd - bestStart);
          return updated;
        }
      }

      console.warn('[DirectReplace] original not found', sectionId);
      return prev;
    });

    return success;
  }, []);

  // 清除所有高亮
  const clearHighlights = useCallback(() => {
    setResumeSections(prev => prev.map(sec => ({ ...sec, highlightRanges: undefined })));
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
          headers: authHeaders(),
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
    }
  }, [resumeSections.length]);

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
        pendingEdits={pendingEdits}
        onEditSuggestion={handleEditSuggestion}
        onAcceptEdit={handleAcceptEdit}
        onSectionContentChange={handleSectionContentChange}
        onExitCanvas={() => { setViewMode('report'); setChatForceExpanded(true); }}
        versions={versions}
        activeVersionId={activeVersionId}
        onSwitchVersion={handleSwitchVersion}
        onDeleteVersion={handleDeleteVersion}
        onJdVersionCreate={handleJdVersionCreate}
        skipAutoSaveRef={skipAutoSaveRef}
        onJdEditComplete={handleJdEditComplete}
        onSetPendingSelection={setPendingSelection}
        onDirectReplace={handleDirectReplace}
        clearHighlights={clearHighlights}
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
              <span className="text-xl font-bold tracking-tight text-gray-800">Job Accelerator</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
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
            <span className="text-[11px] font-bold text-[#0A66C2] tracking-[0.15em] uppercase mb-1 block">COMPETITIVENESS ANALYSIS REPORT</span>
            <h1 className="text-4xl font-bold text-gray-900">人才竞争力分析报告</h1>
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
              {filteredComparisons.map((job, idx) => {
                const isTarget = job.jobFunction === inputData.jobFunction;
                return (
                <div key={idx} className={`px-5 py-3 rounded-2xl border ${isTarget ? 'border-[#0A66C2]/30 bg-blue-50/30' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex items-center">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-bold text-gray-800">{job.jobFunction}</span>
                        {isTarget && <span className="text-xs bg-[#0A66C2] text-white px-2 py-0.5 rounded-full">目标方向</span>}
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
                );
              })}
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
            <p className="text-xs text-gray-400 mt-4 leading-relaxed">说明：简历表达力评分衡量的是简历写作质量，不代表个人能力水平，想要了解每个维度的具体含义和提升方向，可在右侧对话框里咨询Sparky。</p>
          </div>
        )}


      </div>

      {/* 右侧 Chat - 固定不滚动 */}
      <div data-no-print>
      <ChatWidget
        {...chatProps}
        onEnterCanvas={handleEnterCanvas}
        forceExpanded={chatForceExpanded}
        onForceExpandedConsumed={() => setChatForceExpanded(false)}
      />
      </div>
      </div>
    </div>
  );
};
