/**
 * ChatWidget - 简历优化助手（桌面端右侧边栏）
 * 受控组件：核心状态由 ResultView 管理，通过 props 传入
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, MoreHorizontal, Menu, Maximize2, Minimize2, PenLine, Square, Plus, MessageSquare, SquarePen, Pin, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

// 像素小猫 Logo
export const PixelCat: React.FC<{ size?: number }> = ({ size = 40 }) => {
  const P = '#CA7C5E';   // 主色
  const D = '#a8604a';   // 深色（耳内、鼻、嘴）
  const W = '#FFFFFF';   // 白色（眼白）
  const E = '#3d2c24';   // 眼珠
  const _ = 'transparent';

  // 14 行 × 12 列像素矩阵
  const pixels = [
    [_,_,P,_,_,_,_,_,_,P,_,_],
    [_,P,D,P,_,_,_,_,P,D,P,_],
    [_,P,P,P,P,P,P,P,P,P,P,_],
    [P,P,P,P,P,P,P,P,P,P,P,P],
    [P,P,W,W,P,P,P,P,W,W,P,P],
    [P,P,W,E,P,P,P,P,W,E,P,P],
    [P,P,P,P,P,D,D,P,P,P,P,P],
    [P,P,P,P,D,P,P,D,P,P,P,P],
    [P,P,P,P,P,P,P,P,P,P,P,P],
    [_,P,P,P,P,P,P,P,P,P,P,_],
    [_,_,P,P,P,P,P,P,P,P,_,_],
    [_,_,P,P,_,_,_,_,P,P,_,_],
    [_,_,P,P,_,_,_,_,P,P,_,_],
    [_,_,D,D,_,_,_,_,D,D,_,_],
  ];

  const cols = 12;
  const rows = 14;
  const cellSize = size / Math.max(cols, rows);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
      {pixels.map((row, r) =>
        row.map((color, c) =>
          color !== _ ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize + (size - cols * cellSize) / 2}
              y={r * cellSize + (size - rows * cellSize) / 2}
              width={cellSize}
              height={cellSize}
              fill={color}
            />
          ) : null
        )
      )}
    </svg>
  );
};

// Types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatWidgetProps {
  assessmentContext: {
    factors: Record<string, string>;
    abilities: Record<string, any>;
    grade: number | null;
    salaryRange: string;
    jobTitle: string;
    jobFunction: string;
    educationLevel: string;
    major: string;
    city: string;
    industry: string;
    companyType: string;
    targetCompany: string;
  };
  resumeText: string;
  resumeSections?: { type: string; title: string; content: string }[];
  apiBase?: string;
  // 受控状态
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  onEnterCanvas?: () => void;
  userId?: string;
}

// 跳动省略号动画组件
const BouncingDots: React.FC = () => (
  <span className="inline-flex items-center gap-[2px] ml-[1px]">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="inline-block w-[4px] h-[4px] rounded-full bg-current animate-[bounceDot_1.2s_ease-in-out_infinite]"
        style={{ animationDelay: `${i * 0.2}s` }}
      />
    ))}
    <style>{`
      @keyframes bounceDot {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-4px); opacity: 1; }
      }
    `}</style>
  </span>
);

// 检测是否是状态提示行（以 emoji 开头，以"..."结尾）
function isStatusLine(line: string): boolean {
  const trimmed = line.trim();
  return /\.{3}$/.test(trimmed) && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(trimmed);
}

// Markdown 渲染
export const formatContent = (text: string) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (!line.trim()) {
      elements.push(<br key={`br-${lineIdx}`} />);
      return;
    }

    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    const olMatch = line.match(/^[\s]*(\d+)[.)]\s+(.+)/);

    let content: string;
    let prefix: React.ReactNode = null;

    if (ulMatch) {
      content = ulMatch[1];
      prefix = <span className="text-[#CA7C5E] mr-1.5">•</span>;
    } else if (olMatch) {
      content = olMatch[2];
      prefix = <span className="text-[#CA7C5E] mr-1.5 font-bold">{olMatch[1]}.</span>;
    } else {
      content = line;
    }

    const parts = content.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/);
    const rendered = parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <span key={i} className="font-bold text-[#CA7C5E]">{part.slice(2, -2)}</span>;
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-[#CA7C5E] underline break-all">{linkMatch[1]}</a>;
      }
      return part;
    });

    // 状态提示行：把末尾 "..." 替换为跳动动画
    if (isStatusLine(line)) {
      const textWithoutDots = content.replace(/\.{3}$/, '');
      const partsNoDots = textWithoutDots.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/);
      const renderedNoDots = partsNoDots.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <span key={i} className="font-bold text-[#CA7C5E]">{part.slice(2, -2)}</span>;
        }
        return part;
      });
      elements.push(
        <span key={`line-${lineIdx}`} className={prefix ? 'flex items-start pl-1' : undefined}>
          {prefix}
          <span>{renderedNoDots}<BouncingDots /></span>
        </span>
      );
      return;
    }

    elements.push(
      <span key={`line-${lineIdx}`} className={prefix ? 'flex items-start pl-1' : undefined}>
        {prefix}
        <span>{rendered}</span>
      </span>
    );
  });

  return elements;
};

const MAX_INPUT_LENGTH = 2000;
const QUICK_CHIPS = ['解读报告', '润色简历', '模拟面试', '职业规划'];

// 每个快捷按钮的固定引导语（本地展示，不走后端）
// chip 对应后端的 ACTION 前缀
const CHIP_ACTIONS: Record<string, string> = {
  '解读报告': '[ACTION:解读报告] 请开始',
  '润色简历': '[ACTION:润色简历] 请开始',
  '模拟面试': '[ACTION:模拟面试] 请开始',
  '职业规划': '[ACTION:职业规划] 请开始',
};

// SSE 流解析工具函数（供 ChatWidget 和 CanvasChat 复用）
export async function parseSseStream(
  response: Response,
  onText: (fullText: string) => void,
  onEdit?: (edit: { sectionId: string; original: string; suggested: string; rationale: string }) => void,
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'text') {
          fullText += event.content;
          onText(fullText);
        } else if (event.type === 'edit' && onEdit) {
          onEdit({
            sectionId: event.sectionId,
            original: event.original,
            suggested: event.suggested,
            rationale: event.rationale,
          });
        }
      } catch { /* Skip invalid JSON */ }
    }
  }
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  assessmentContext,
  resumeText,
  resumeSections: preloadedSections,
  apiBase = '',
  sessionId,
  setSessionId,
  messages,
  setMessages,
  isLoading,
  setIsLoading,
  onEnterCanvas,
  userId,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ id: string; created_at: string; firstMessage: string; pinned: boolean; title: string | null }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 点击面板外关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setActionMenuId(null);
        setRenamingId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // 打开菜单时加载历史记录
  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('chat_sessions')
        .select('id, created_at, pinned, title, chat_messages(content, role)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        // 只保留有用户消息的 session
        const withUserMsg = data.filter((s: any) => s.chat_messages?.some((m: any) => m.role === 'user'));
        const mapped = withUserMsg.map((s: any) => {
          const userMsg = s.chat_messages?.find((m: any) => m.role === 'user');
          const firstMessage = userMsg?.content?.slice(0, 30) || '新对话';
          return { id: s.id, created_at: s.created_at, firstMessage, pinned: !!s.pinned, title: s.title || null };
        });
        // pinned 优先，再按 created_at 降序
        mapped.sort((a: any, b: any) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setChatHistory(mapped);
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [userId]);

  const toggleMenu = useCallback(() => {
    setMenuOpen(prev => {
      const next = !prev;
      if (next) loadHistory();
      return next;
    });
  }, [loadHistory]);

  const handlePin = useCallback(async (id: string, currentPinned: boolean) => {
    const { error } = await supabase.from('chat_sessions').update({ pinned: !currentPinned }).eq('id', id);
    if (error) console.error('[handlePin] Supabase error:', error);
    setActionMenuId(null);
    loadHistory();
  }, [loadHistory]);

  const handleRename = useCallback(async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const { error } = await supabase.from('chat_sessions').update({ title: renameValue.trim() }).eq('id', id);
    if (error) console.error('[handleRename] Supabase error:', error);
    setRenamingId(null);
    setRenameValue('');
    setActionMenuId(null);
    loadHistory();
  }, [renameValue, loadHistory]);

  const handleDelete = useCallback(async (id: string) => {
    // 先删关联的消息，再删 session
    await supabase.from('chat_messages').delete().eq('session_id', id);
    const { error } = await supabase.from('chat_sessions').delete().eq('id', id);
    if (error) console.error('[handleDelete] Supabase error:', error);
    setActionMenuId(null);
    if (sessionId === id) {
      setSessionId(null);
      setMessages([]);
      setInputValue('');
      setError(null);
    }
    loadHistory();
  }, [loadHistory, sessionId]);

  // Auto-initialize on mount
  const initSession = useCallback(async () => {
    if (sessionId) return;
    setIsInitializing(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/api/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentContext, resumeText, userId, resumeSections: preloadedSections }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to start chat');
      setSessionId(data.data.sessionId);
      if (skipGreetingRef.current) {
        // 非首次：跳过欢迎语，直接空白对话
        skipGreetingRef.current = false;
        setMessages([]);
      } else {
        // 首次进入：打字机效果逐字显示开场白
        const greeting = data.data.greeting;
        setMessages([]);
        typewriterEffect(greeting);
      }
    } catch (err: any) {
      console.error('Chat init failed:', err);
      setError(err.message || 'Failed to connect');
    } finally {
      setIsInitializing(false);
    }
  }, [apiBase, assessmentContext, resumeText, sessionId]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  const recoverSession = useCallback(async () => {
    setSessionId(null);
    setMessages([]);
    setError(null);
    setIsInitializing(true);

    try {
      const res = await fetch(`${apiBase}/api/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentContext, resumeText, userId, resumeSections: preloadedSections }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Recovery failed');
      setSessionId(data.data.sessionId);
      setMessages([
        { role: 'assistant', content: '之前的会话已过期，已为你重新开启对话。\n\n' + data.data.greeting },
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to recover');
    } finally {
      setIsInitializing(false);
    }
  }, [apiBase, assessmentContext, resumeText]);

  // 通用打字机效果：在 messages 末尾逐字显示文本
  const typewriterEffect = useCallback((text: string, onDone?: () => void) => {
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    setIsTyping(true);
    typingRef.current = true;
    let i = 0;
    const typeNext = () => {
      if (i < text.length && typingRef.current) {
        i++;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: text.slice(0, i) };
          return updated;
        });
        setTimeout(typeNext, 30);
      } else {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: text };
          return updated;
        });
        setIsTyping(false);
        typingRef.current = false;
        onDone?.();
      }
    };
    typeNext();
  }, []);

  const sendMessage = useCallback(async (overrideText?: string, displayText?: string) => {
    const text = (overrideText || inputValue).trim().slice(0, MAX_INPUT_LENGTH);
    if (!text || isLoading || isTyping || !sessionId) return;

    // 画布切换意图拦截：匹配到关键词直接切换到简历画布
    const CANVAS_KEYWORDS = ['切换到画布', '打开画布', '简历画布', '进入画布', '切换画布', '看看画布'];
    // 改简历意图关键词：用户想修改/优化简历内容时自动跳转画布
    const EDIT_RESUME_KEYWORDS = [
      '改一下', '改改', '改写', '改起来', '改简历', '改一改',
      '优化一下', '优化这段', '优化简历', '帮我优化', '优化下',
      '润色', '重写', '修改简历', '修改一下',
      '开始改', '帮我改', '帮改', '改下',
      '写一下', '写一版', '帮我写',
    ];
    const userDisplay = displayText || text;
    if (onEnterCanvas && (
      CANVAS_KEYWORDS.some(kw => text.includes(kw)) ||
      EDIT_RESUME_KEYWORDS.some(kw => text.includes(kw))
    )) {
      setMessages(prev => [...prev, { role: 'user', content: userDisplay }]);
      setInputValue('');
      // 根据用户简历和评测信息生成个性化建议
      const { jobTitle, targetCompany } = assessmentContext;
      // 从简历中提取经历段落标题作为建议起点
      const expMatch = resumeText.match(/(?:实习|项目|工作|经历|经验)[：:]\s*(.{2,20})/);
      const expHint = expMatch ? expMatch[1].replace(/[,，。.、\s]+$/, '') : '';
      let suggestion = '好的，正在为你打开简历画布模式';
      if (expHint && jobTitle) {
        suggestion += `，我建议先从「${expHint}」这段经历开始优化，重点突出和${jobTitle}相关的部分，你觉得呢？`;
      } else if (jobTitle && targetCompany) {
        suggestion += `，我建议先从和${targetCompany}${jobTitle}岗位最相关的经历开始优化，你觉得呢？`;
      } else if (jobTitle) {
        suggestion += `，我建议先从和${jobTitle}最相关的经历开始优化，你觉得呢？`;
      } else {
        suggestion += '，我们从第一段经历开始逐段优化吧～';
      }
      // 先显示思考气泡（三个点）
      setIsLoading(true);
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      // 短暂思考后，在已有的空消息上逐字填充（不追加新消息）
      setTimeout(() => {
        setIsLoading(false);
        setIsTyping(true);
        typingRef.current = true;
        let i = 0;
        const typeNext = () => {
          if (i < suggestion.length && typingRef.current) {
            i++;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: suggestion.slice(0, i) };
              return updated;
            });
            setTimeout(typeNext, 30);
          } else {
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: suggestion };
              return updated;
            });
            setIsTyping(false);
            typingRef.current = false;
            setTimeout(() => { onEnterCanvas(); }, 1500);
          }
        };
        typeNext();
      }, 800);
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: userDisplay }]);
    setInputValue('');
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${apiBase}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, stream: true }),
        signal: controller.signal,
      });

      if (res.status === 404) {
        setMessages(prev => prev.slice(0, -2));
        setIsLoading(false);
        await recoverSession();
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      await parseSseStream(res, (fullText) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullText };
          return updated;
        });
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // 用户主动中断，保留已接收的内容
        return;
      }
      console.error('Send failed:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: '抱歉，获取回复失败，请重试。' };
        return updated;
      });
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }, [apiBase, inputValue, isLoading, isTyping, sessionId, recoverSession, onEnterCanvas, typewriterEffect]);

  // 快捷按钮点击：直接发送到后端，让 Agent 回答
  const handleChipClick = useCallback((chip: string) => {
    if (isLoading || isTyping || !sessionId) return;

    // "润色简历" 直接跳转画布模式
    if (chip === '润色简历' && onEnterCanvas) {
      sendMessage(chip);
      return;
    }

    const action = CHIP_ACTIONS[chip];
    if (!action) return;
    // 发送 ACTION 前缀给后端，但用户界面只显示 chip 名称
    sendMessage(action, chip);
  }, [isLoading, isTyping, sessionId, sendMessage, onEnterCanvas]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const skipGreetingRef = useRef(false);

  const handleNewChat = useCallback(async () => {
    if (isInitializing) return;
    // 中断正在进行的请求
    if (abortRef.current) abortRef.current.abort();
    setIsLoading(false);
    skipGreetingRef.current = true;  // 标记跳过欢迎语
    setSessionId(null);
    setMessages([]);
    setInputValue('');
    setError(null);
    // initSession 会在 sessionId 变为 null 后被 useEffect 触发
  }, [isInitializing]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 输入法正在组字时不发送（解决中文/日文/韩文输入法 Enter 冲突）
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const chatContent = (
    <div className={`bg-white border border-gray-200 rounded-3xl flex flex-col overflow-hidden shadow-sm ${isExpanded ? 'h-full' : 'h-full'}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-50">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMenu}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors"
              title="菜单"
            >
              <Menu className="w-6 h-6 text-[#CA7C5E]" />
            </button>
            <div>
              <h3 className="font-bold text-lg">求职小帮手</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-xs font-medium text-green-600">
                  {isInitializing ? '正在分析你的简历...' : 'Sparky 正在工作'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title={isExpanded ? '收起' : '展开'}
            >
              {isExpanded ? <Minimize2 className="w-[18px] h-[18px]" /> : <Maximize2 className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>
      </div>

      {/* Menu Panel */}
      {menuOpen && (
        <div className="relative">
          <div
            ref={menuRef}
            className="absolute inset-x-0 top-0 z-10 bg-white border-b border-gray-200 shadow-lg rounded-b-2xl mx-2 max-h-80 overflow-y-auto"
          >
            {/* 新对话按钮 */}
            <button
              onClick={() => { handleNewChat(); setMenuOpen(false); }}
              disabled={isInitializing || isLoading}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-[#CA7C5E] hover:bg-[#CA7C5E]/5 transition-colors disabled:opacity-40"
            >
              <SquarePen className="w-4 h-4" />
              开启新对话
            </button>
            <div className="border-t border-gray-100" />
            {/* 历史对话列表 */}
            <div className="px-5 py-3">
              <p className="text-xs font-semibold text-gray-400 mb-2">历史对话</p>
              {historyLoading ? (
                <div className="flex items-center justify-center py-4 text-gray-400 text-xs">
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  加载中...
                </div>
              ) : chatHistory.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">暂无历史对话</p>
              ) : (
                <div className="space-y-1">
                  {chatHistory.map((item) => (
                    <div
                      key={item.id}
                      className="group relative flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-default"
                    >
                      {item.pinned && <span className="absolute left-1 top-1 text-[10px]">📌</span>}
                      <MessageSquare className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-400">
                          {new Date(item.created_at).toLocaleString('zh-CN', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                        {renamingId === item.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRename(item.id); }}
                            onBlur={() => handleRename(item.id)}
                            className="text-sm text-gray-600 w-full border border-gray-300 rounded px-1 py-0.5 outline-none focus:border-[#CA7C5E]"
                          />
                        ) : (
                          <p className="text-sm text-gray-600 truncate">{item.title || item.firstMessage}</p>
                        )}
                      </div>
                      {/* 三点按钮 */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (actionMenuId === item.id) {
                            setActionMenuId(null);
                          } else {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setActionMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            setActionMenuId(item.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-200 transition-all shrink-0 mt-0.5"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isInitializing && (
          <div className="flex items-center gap-2 text-gray-400 text-sm justify-center py-8">
            <Loader2 size={16} className="animate-spin" />
            <span>正在分析你的简历...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-red-500 text-sm mb-2">{error}</p>
            <button
              onClick={() => { setError(null); setSessionId(null); initSession(); }}
              className="text-[#CA7C5E] text-sm font-medium underline"
            >
              重试
            </button>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                <PixelCat size={24} />
              </div>
            )}
            <div
              className={`max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === 'user'
                  ? 'bg-[#CA7C5E] rounded-2xl p-4 text-white shadow-md'
                  : 'bg-gray-50 rounded-2xl p-4 text-gray-700 border border-gray-100'
              }`}
            >
              {msg.role === 'assistant' ? (
                msg.content ? (
                  formatContent(msg.content)
                ) : (
                  <span className="flex items-center gap-1 text-gray-400">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#CA7C5E] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#CA7C5E] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#CA7C5E] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-gray-50">
        {/* 输入框容器 */}
        <div className="bg-gray-50 rounded-2xl mb-4 focus-within:ring-2 focus-within:ring-[#CA7C5E]/20 transition-all">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => {
              setInputValue(e.target.value.slice(0, MAX_INPUT_LENGTH));
              // 自动调整高度
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="询问 Sparky 如何提升简历身价..."
            disabled={isLoading || isInitializing || isTyping}
            rows={1}
            className="w-full bg-transparent border-none pl-5 pr-5 pt-3.5 pb-1 text-sm outline-none disabled:text-gray-400 resize-none overflow-hidden"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            {onEnterCanvas ? (
              <button
                onClick={onEnterCanvas}
                disabled={isLoading || isInitializing || isTyping || !sessionId}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#CA7C5E] hover:bg-[#CA7C5E]/10 disabled:opacity-40 transition-colors"
              >
                <PenLine className="w-3 h-3" />
                简历画布
              </button>
            ) : <span />}
            {isLoading ? (
              <button
                onClick={handleStop}
                className="w-9 h-9 bg-gray-500 rounded-xl flex items-center justify-center text-white hover:bg-gray-600 transition-colors"
                title="停止生成"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => sendMessage()}
                disabled={!inputValue.trim() || isInitializing}
                className="w-9 h-9 bg-[#CA7C5E] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#CA7C5E]/30 disabled:bg-gray-300 disabled:shadow-none transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {/* 快捷按钮 */}
        <div className="flex flex-wrap gap-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              disabled={isLoading || isInitializing || isTyping || !sessionId}
              className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-semibold text-gray-600 disabled:opacity-50 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* 历史对话操作浮窗（fixed 定位，避免被 overflow 裁剪） */}
      {actionMenuId && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setActionMenuId(null)} />
          <div
            className="fixed z-[200] bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[120px]"
            style={{ top: actionMenuPos.top, right: actionMenuPos.right }}
          >
            {chatHistory.filter(h => h.id === actionMenuId).map(item => (
              <div key={item.id}>
                <button
                  onClick={() => handlePin(item.id, item.pinned)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <Pin className="w-3.5 h-3.5" />
                  {item.pinned ? '取消置顶' : '置顶'}
                </button>
                <button
                  onClick={() => { setRenamingId(item.id); setRenameValue(item.title || item.firstMessage); setActionMenuId(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  重命名
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  if (isExpanded) {
    return (
      <>
        {/* 遮罩层 */}
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100]"
          onClick={() => setIsExpanded(false)}
        />
        {/* 居中悬浮对话框 */}
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-8 pointer-events-none">
          <div className="w-full max-w-5xl h-[90vh] pointer-events-auto">
            {chatContent}
          </div>
        </div>
      </>
    );
  }

  return (
    <aside className="w-[420px] h-full shrink-0 p-4 pl-0">
      {chatContent}
    </aside>
  );
};
