/**
 * ChatWidget - 简历优化助手（桌面端右侧边栏）
 * 受控组件：核心状态由 ResultView 管理，通过 props 传入
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, MoreHorizontal, Menu, Maximize2, Minimize2, PenLine, Square, Plus, MessageSquare, SquarePen, Pin, Pencil, Trash2, Mic, Compass } from 'lucide-react';
import { authHeaders } from '../services/authService';
import { CareerForm } from './CareerForm';

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
  sources?: SearchSource[];
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
  onSectionsReady?: (sections: { id: string; type: string; title: string; content: string }[]) => void;
  userId?: string;
  preloadedGreeting?: string;
  forceExpanded?: boolean;
  onForceExpandedConsumed?: () => void;
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

// 清理隐藏标签（[RESUME_INSIGHT:...] 等系统标签不渲染给用户）
const cleanSystemTags = (text: string) => text.replace(/\[RESUME_INSIGHT:.*?\]/g, '').trim();

// Markdown 渲染
// 气泡底部按钮配置：keyword → { label, action 标识 }
const ACTION_BUTTON_CONFIG: Record<string, { label: string; action: string }> = {
  '解读报告': { label: '解读报告 →', action: 'send:解读报告' },
  '报告解读': { label: '解读报告 →', action: 'send:报告解读' },
  '进入简历画布': { label: '进入简历画布 →', action: 'canvas' },
};
const ACTION_KEYWORDS = new Set(Object.keys(ACTION_BUTTON_CONFIG));

/** 从消息文本中提取出现的 action 关键词（去重，保持出现顺序） */
export const extractActions = (text: string): string[] => {
  const found: string[] = [];
  for (const kw of ACTION_KEYWORDS) {
    if (text.includes(kw) && !found.some(f => ACTION_BUTTON_CONFIG[f]?.label === ACTION_BUTTON_CONFIG[kw]?.label)) {
      found.push(kw);
    }
  }
  // 解读报告的回复：加"进入简历画布"按钮（含优化策略 / 竞争力分析等特征词）
  if (text.length > 200 && (text.includes('优化策略') || text.includes('竞争力分析')) && !found.includes('进入简历画布')) {
    found.push('进入简历画布');
  }
  return found;
};

export const formatContent = (text: string) => {
  text = cleanSystemTags(text);
  // 清理全角空格和连续多余空格（LLM 偶尔产生）
  text = text.replace(/\u3000/g, ' ').replace(/ {2,}/g, ' ');
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  // 判断是否为表格行（| col | col | 格式）
  const isTableRow = (l: string) => {
    const t = l.trim();
    return t.startsWith('|') && t.endsWith('|') && t.split('|').length >= 3;
  };
  // 判断是否为分隔行（| --- | --- | 格式）
  const isSeparatorRow = (l: string) => /^\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)+\|$/.test(l.trim());

  // 渲染行内 markdown（加粗 + 链接）
  const renderInline = (content: string, keyPrefix: string) => {
    // 将「解读报告」转为加粗；action 关键词的加粗标记还原为普通文本（底部已有按钮）
    content = content.replace(/「解读报告」/g, '**解读报告**');
    for (const kw of ACTION_KEYWORDS) {
      content = content.replaceAll(`**${kw}**`, kw);
    }
    const parts = content.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <span key={`${keyPrefix}-${i}`} className="font-bold text-[#CA7C5E]">{part.slice(2, -2)}</span>;
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return <a key={`${keyPrefix}-${i}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-[#CA7C5E] underline break-all">{linkMatch[1]}</a>;
      }
      return part;
    });
  };

  // 解析表格单元格
  const parseCells = (row: string) =>
    row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  let lineIdx = 0;
  while (lineIdx < lines.length) {
    const line = lines[lineIdx];

    // —— 表格块 ——
    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (lineIdx < lines.length && isTableRow(lines[lineIdx])) {
        tableLines.push(lines[lineIdx]);
        lineIdx++;
      }
      // 至少需要表头 + 分隔行
      if (tableLines.length >= 2 && isSeparatorRow(tableLines[1])) {
        const headers = parseCells(tableLines[0]);
        const bodyRows = tableLines.slice(2).filter(r => !isSeparatorRow(r));
        elements.push(
          <div key={`table-${lineIdx}`} className="overflow-x-auto my-2">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="border border-gray-200 bg-[#FDF5F0] px-3 py-1.5 text-left font-bold text-[#CA7C5E] whitespace-nowrap">
                      {renderInline(h, `th-${lineIdx}-${hi}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => {
                  const cells = parseCells(row);
                  return (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {headers.map((_, ci) => (
                        <td key={ci} className="border border-gray-200 px-3 py-1.5">
                          {renderInline(cells[ci] || '', `td-${lineIdx}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      } else {
        // 不是合法表格，当普通文本渲染
        tableLines.forEach((tl, ti) => {
          elements.push(<span key={`tl-${lineIdx}-${ti}`}>{renderInline(tl, `tl-${lineIdx}-${ti}`)}</span>);
        });
      }
      continue;
    }

    // —— 空行（连续空行压成一个，减少段间距） ——
    if (!line.trim()) {
      const prevIsBreak = elements.length > 0 && (elements[elements.length - 1] as any)?.type === 'br';
      if (!prevIsBreak) {
        elements.push(<br key={`br-${lineIdx}`} />);
      }
      lineIdx++;
      continue;
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

    const rendered = renderInline(content, `line-${lineIdx}`);

    // 状态提示行：把末尾 "..." 替换为跳动动画
    if (isStatusLine(line)) {
      const textWithoutDots = content.replace(/\.{3}$/, '');
      const renderedNoDots = renderInline(textWithoutDots, `status-${lineIdx}`);
      elements.push(
        <span key={`line-${lineIdx}`} className={prefix ? 'flex items-start pl-1' : undefined}>
          {prefix}
          <span>{renderedNoDots}<BouncingDots /></span>
        </span>
      );
      lineIdx++;
      continue;
    }

    // 独占一行的加粗标题（如 **岗位匹配总结**）渲染为 block + 上间距
    // 移除前方多余 <br>，由 mt 统一控制段间距（避免 block 元素后 <br> 产生双倍间距）
    const isBoldHeading = !prefix && /^\*\*[^*]+\*\*$/.test(line.trim());
    if (isBoldHeading) {
      if (elements.length > 0 && (elements[elements.length - 1] as any)?.type === 'br') {
        elements.pop();
      }
      elements.push(
        <div key={`line-${lineIdx}`} className="mt-5 mb-1 font-bold text-[#CA7C5E]">
          {line.trim().slice(2, -2)}
        </div>
      );
      lineIdx++;
      continue;
    }

    elements.push(
      <span key={`line-${lineIdx}`} className={prefix ? 'flex items-start pl-1' : undefined}>
        {prefix}
        <span>{rendered}</span>
      </span>
    );
    lineIdx++;
  }

  return elements;
};

const MAX_INPUT_LENGTH = 2000;
const QUICK_CHIPS = ['模拟面试', '职业规划'];

// 每个快捷按钮的固定引导语（本地展示，不走后端）
// chip 对应后端的 ACTION 前缀
const CHIP_ACTIONS: Record<string, string> = {
  '解读报告': '[ACTION:解读报告] 解读报告',
  '模拟面试': '[ACTION:模拟面试] 模拟面试',
  '职业规划': '[ACTION:职业规划] 职业规划',
};

// SSE 流解析工具函数（供 ChatWidget 和 CanvasChat 复用）
export interface SearchSource {
  title: string;
  link: string;
  snippet?: string;
  favicon?: string;
}

export async function parseSseStream(
  response: Response,
  onText: (fullText: string) => void,
  onEdit?: (edit: { sectionId: string; original: string; suggested: string; rationale: string }) => void,
  onSources?: (sources: SearchSource[]) => void,
  onPhase?: (phase: string) => void,
  onJdDiagnosis?: (data: any) => void,
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';      // LLM 已生成的完整文本
  let displayedLen = 0;   // 已渲染到屏幕的字符数
  let streamDone = false;

  // 逐段释放：每 50ms 渲染一批字符，模拟自然打字速度
  const RENDER_INTERVAL = 50;
  const CHARS_PER_TICK = 2; // 每次渲染 2 个字符（约 1 个中文字）
  let renderTimer: ReturnType<typeof setInterval> | null = null;

  const startRenderLoop = () => {
    if (renderTimer) return;
    renderTimer = setInterval(() => {
      if (displayedLen < fullText.length) {
        displayedLen = Math.min(displayedLen + CHARS_PER_TICK, fullText.length);
        onText(fullText.slice(0, displayedLen));
      } else if (streamDone) {
        // 全部渲染完毕
        if (renderTimer) { clearInterval(renderTimer); renderTimer = null; }
        onText(fullText); // 确保完整
      }
    }, RENDER_INTERVAL);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      streamDone = true;
      // 如果没启动过渲染循环（极短回复），直接输出
      if (!renderTimer) onText(fullText);
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'text') {
          fullText += event.content;
          startRenderLoop();
        } else if (event.type === 'edit' && onEdit) {
          onEdit({
            sectionId: event.sectionId,
            original: event.original,
            suggested: event.suggested,
            rationale: event.rationale,
          });
        } else if (event.type === 'sources' && onSources) {
          onSources(event.sources || []);
        } else if (event.type === 'phase' && onPhase) {
          onPhase(event.phase);
        } else if (event.type === 'jd_diagnosis' && onJdDiagnosis) {
          onJdDiagnosis(event.data);
        }
      } catch { /* Skip invalid JSON */ }
    }
  }

  // 等待渲染循环把剩余字符全部输出
  if (renderTimer) {
    await new Promise<void>(resolve => {
      const waitTimer = setInterval(() => {
        if (displayedLen >= fullText.length) {
          if (renderTimer) { clearInterval(renderTimer); renderTimer = null; }
          clearInterval(waitTimer);
          onText(fullText);
          resolve();
        }
      }, RENDER_INTERVAL);
    });
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
  onSectionsReady,
  userId,
  preloadedGreeting,
  forceExpanded,
  onForceExpandedConsumed,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ id: string; created_at: string; firstMessage: string; pinned: boolean; title: string | null }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef(false);
  // 画布介绍是否已触发过（整个会话只触发一次）
  const canvasIntroShownRef = useRef(false);
  // 用于等待 sessionId 就绪的 promise
  const sessionReadyRef = useRef<{ resolve: (id: string) => void } | null>(null);
  const sessionPromiseRef = useRef<Promise<string> | null>(null);

  // 外部触发展开（退出画布时）
  useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
      onForceExpandedConsumed?.();
    }
  }, [forceExpanded, onForceExpandedConsumed]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 加载历史记录（通过后端 API），静默刷新不显示 loading
  const loadHistory = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setHistoryLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/user/chat-history`, {
        headers: authHeaders(),
      });
      const json = await res.json();

      const serverData = (json.success && json.data?.length) ? json.data : [];

      const mapped = serverData.map((s: any) => ({
        id: s.id,
        created_at: s.created_at,
        firstMessage: s.firstMessage || '新对话',
        pinned: !!s.pinned,
        title: s.title || null,
      }));

      // 合并：保留本地乐观添加的但后端还没有的条目
      setChatHistory(prev => {
        const serverIds = new Set(mapped.map((m: any) => m.id));
        const localOnly = prev.filter(h => !serverIds.has(h.id));
        const merged = [...localOnly, ...mapped];
        merged.sort((a: any, b: any) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        return merged;
      });
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      if (!silent) setHistoryLoading(false);
    }
  }, [userId, apiBase]);

  // 组件挂载时预加载历史
  useEffect(() => {
    loadHistory(true);
  }, [loadHistory]);

  // session 变化时刷新历史列表（新建对话、恢复对话后自动出现在列表中）
  useEffect(() => {
    if (sessionId) {
      // 延迟一下等后端写入完成
      const timer = setTimeout(() => loadHistory(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [sessionId]);


  const handlePin = useCallback((id: string, currentPinned: boolean) => {
    // 乐观更新：立即切换置顶状态并重排
    setChatHistory(prev => {
      const updated = prev.map(h => h.id === id ? { ...h, pinned: !currentPinned } : h);
      updated.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return updated;
    });
    setActionMenuId(null);
    // 后端异步更新
    fetch(`${apiBase}/api/user/chat-history/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ pinned: !currentPinned }),
    }).catch(e => console.error('[handlePin] error:', e));
  }, [apiBase]);

  const handleRename = useCallback(async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    try {
      await fetch(`${apiBase}/api/user/chat-history/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ title: renameValue.trim() }),
      });
    } catch (e) { console.error('[handleRename] error:', e); }
    setRenamingId(null);
    setRenameValue('');
    setActionMenuId(null);
    loadHistory();
  }, [renameValue, loadHistory, apiBase]);

  const handleDelete = useCallback((id: string) => {
    // 乐观更新：立即从列表移除 + 清缓存
    setChatHistory(prev => prev.filter(h => h.id !== id));
    delete messagesCacheRef.current[id];
    setActionMenuId(null);
    if (sessionId === id) {
      setSessionId(null);
      setMessages([]);
      setInputValue('');
      setError(null);
    }
    // 后端异步删除
    fetch(`${apiBase}/api/user/chat-history/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).catch(e => console.error('[handleDelete] error:', e));
  }, [sessionId, apiBase]);

  // 点击历史对话恢复消息（带前端缓存）
  const restoringRef = useRef(false);
  const messagesCacheRef = useRef<Record<string, ChatMessage[]>>({});

  // 当前对话有新消息时更新缓存
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      messagesCacheRef.current[sessionId] = messages;
    }
  }, [sessionId, messages]);

  const handleRestoreSession = useCallback(async (id: string) => {
    if (isInitializing || isLoading) return;
    if (sessionId === id) return;
    setActionMenuId(null);
    setError(null);

    if (abortRef.current) abortRef.current.abort();
    setIsLoading(false);
    restoringRef.current = true;
    setSessionId(id);
    setInputValue('');

    // 有缓存 → 直接用，不请求后端
    const cached = messagesCacheRef.current[id];
    if (cached?.length > 0) {
      setMessages(cached);
      restoringRef.current = false;
      return;
    }

    // 无缓存 → 从后端拉
    setMessages([]);
    try {
      const res = await fetch(`${apiBase}/api/user/chat-history/${id}/messages`, {
        headers: authHeaders(),
      });
      const json = await res.json();

      if (json.success && json.data?.length > 0) {
        const msgs = json.data.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        setMessages(msgs);
        messagesCacheRef.current[id] = msgs;
      }
    } catch (err) {
      console.error('Failed to restore session:', err);
    } finally {
      restoringRef.current = false;
    }
  }, [isInitializing, isLoading, apiBase, sessionId]);

  // Auto-initialize on mount
  const initSession = useCallback(async () => {
    if (sessionId) return;
    if (restoringRef.current) return; // 正在恢复历史对话，不要抢跑
    setError(null);

    const isBlankChat = skipGreetingRef.current || !preloadedGreeting;

    // 有预生成开场白且非空白对话 → 立即显示，不显示 loading spinner
    if (preloadedGreeting && !isBlankChat) {
      setMessages([]);
      typewriterEffect(preloadedGreeting);
      // 创建 promise，让 sendMessage 可以等待 sessionId
      sessionPromiseRef.current = new Promise<string>((resolve) => {
        sessionReadyRef.current = { resolve };
      });
      // /chat/start 在后台静默完成，不阻塞 UI
      fetch(`${apiBase}/api/chat/start`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          assessmentContext, resumeText, userId,
          resumeSections: preloadedSections,
          greeting: preloadedGreeting,
        }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setSessionId(data.data.sessionId);
            sessionReadyRef.current?.resolve(data.data.sessionId);
            sessionReadyRef.current = null;
            if (data.data.sections?.length && onSectionsReady) {
              onSectionsReady(data.data.sections);
            }
            // 乐观更新：立即在历史列表里加一条
            setChatHistory(prev => {
              if (prev.some(h => h.id === data.data.sessionId)) return prev;
              return [{
                id: data.data.sessionId,
                created_at: new Date().toISOString(),
                firstMessage: (data.data.greeting || preloadedGreeting || '').slice(0, 30) || '新对话',
                pinned: false,
                title: null,
              }, ...prev];
            });
          } else {
            console.error('Chat init failed:', data.error);
          }
        })
        .catch(err => {
          console.error('Chat init failed:', err);
          setError('连接失败，请刷新重试');
        });
      return;
    }

    // 没有预生成开场白 → 不自动创建 session，等用户主动操作
    if (!preloadedGreeting && !skipGreetingRef.current) {
      return;
    }

    // skipGreetingRef 触发（新建对话/模拟面试/职业规划） → 创建空白 session
    setIsInitializing(true);
    try {
      const body: any = { userId, skipGreeting: true };
      if (assessmentContext && Object.keys(assessmentContext).length > 0) {
        body.assessmentContext = assessmentContext;
      }
      if (resumeText) body.resumeText = resumeText;
      if (preloadedSections) body.resumeSections = preloadedSections;

      const res = await fetch(`${apiBase}/api/chat/start`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to start chat');
      setSessionId(data.data.sessionId);
      if (data.data.sections?.length && onSectionsReady) {
        onSectionsReady(data.data.sections);
      }
      // 乐观更新：立即在历史列表里加一条
      const chipName = pendingChipRef.current;
      setChatHistory(prev => {
        if (prev.some(h => h.id === data.data.sessionId)) return prev;
        return [{
          id: data.data.sessionId,
          created_at: new Date().toISOString(),
          firstMessage: chipName || '新对话',
          pinned: false,
          title: null,
        }, ...prev];
      });
      skipGreetingRef.current = false;
      setMessages([]);
    } catch (err: any) {
      console.error('Chat init failed:', err);
      setError(err.message || 'Failed to connect');
    } finally {
      setIsInitializing(false);
    }
  }, [apiBase, assessmentContext, resumeText, sessionId, preloadedGreeting]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  const recoverSession = useCallback(async () => {
    setSessionId(null);
    setMessages([]);
    setError(null);
    setIsInitializing(true);

    try {
      const body: any = { userId, skipGreeting: true };
      if (assessmentContext && Object.keys(assessmentContext).length > 0) {
        body.assessmentContext = assessmentContext;
      }
      if (resumeText) body.resumeText = resumeText;
      if (preloadedSections) body.resumeSections = preloadedSections;

      const res = await fetch(`${apiBase}/api/chat/start`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Recovery failed');
      setSessionId(data.data.sessionId);
      setMessages([
        { role: 'assistant', content: '之前的会话已过期，已为你重新开启对话。有什么需要我帮你的？' },
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

  const sendMessage = useCallback(async (overrideText?: string, displayText?: string, hideUserMsg?: boolean) => {
    const text = (overrideText || inputValue).trim().slice(0, MAX_INPUT_LENGTH);
    if (!text || isLoading || isTyping) return;

    // 如果 sessionId 还没到，等待或按需创建
    let activeSessionId = sessionId;
    if (!activeSessionId && sessionPromiseRef.current) {
      try {
        activeSessionId = await Promise.race([
          sessionPromiseRef.current,
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
        ]);
      } catch {
        setError('会话初始化超时，请刷新重试');
        return;
      }
    }
    // 没有 session → 按需创建一个空白 session
    if (!activeSessionId) {
      try {
        const body: any = { userId, skipGreeting: true };
        if (assessmentContext && Object.keys(assessmentContext).length > 0) body.assessmentContext = assessmentContext;
        if (resumeText) body.resumeText = resumeText;
        const res = await fetch(`${apiBase}/api/chat/start`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed');
        activeSessionId = data.data.sessionId;
        setSessionId(activeSessionId);
      } catch (err: any) {
        setError('会话创建失败，请重试');
        return;
      }
    }

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

      // 首次进入：显示画布功能介绍；非首次：直接跳转
      if (canvasIntroShownRef.current) {
        onEnterCanvas();
        return;
      }
      canvasIntroShownRef.current = true;

      const suggestion = '正在为你打开简历画布，选中文字就能开始优化。';

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

    if (!hideUserMsg) {
      setMessages(prev => [...prev, { role: 'user', content: userDisplay }]);
    }
    setInputValue('');
    setIsLoading(true);

    // 根据场景显示"思考中"提示
    const thinkingHints: Record<string, string> = {
      '解读报告': 'Sparky 正在分析你的评测数据...',
      '模拟面试': 'Sparky 正在准备问题...',
      '职业规划': 'Sparky 正在分析你的情况...',
    };
    const actionMatch = text.match(/\[ACTION:([^\]]+)\]/);
    const thinkingText = actionMatch ? (thinkingHints[actionMatch[1]] || 'Sparky 正在思考...') : 'Sparky 正在思考...';
    setMessages(prev => [...prev, { role: 'assistant', content: thinkingText }]);
    const thinkingStartTime = Date.now();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${apiBase}/api/chat/message`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: activeSessionId, message: text, stream: true }),
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

      // 确保"思考中"提示至少显示 1.5 秒（fetch 期间提示已在显示，但要保证用户能看到）
      const MIN_THINKING_MS = 1500;
      const elapsed = Date.now() - thinkingStartTime;
      if (elapsed < MIN_THINKING_MS) {
        await new Promise(r => setTimeout(r, MIN_THINKING_MS - elapsed));
      }

      await parseSseStream(
        res,
        (fullText) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], role: 'assistant', content: fullText };
            return updated;
          });
        },
        undefined,
        (sources) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], sources };
            return updated;
          });
        },
      );
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // 用户主动中断，保留已接收的内容
        return;
      }
      console.error('Send failed:', err);
      // 429 等后端返回的错误信息直接展示，其余用通用文案
      const errorMsg = err.message?.includes('已用完') || err.message?.includes('次数')
        ? err.message
        : '抱歉，获取回复失败，请重试。';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: errorMsg };
        return updated;
      });
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }, [apiBase, inputValue, isLoading, isTyping, sessionId, recoverSession, onEnterCanvas, typewriterEffect]);

  // 快捷按钮点击：直接发送到后端，让 Agent 回答
  // 待 session 就绪后自动发送的 chip
  const pendingChipRef = useRef<string | null>(null);

  // session 就绪时检查是否有待发送的 chip
  useEffect(() => {
    if (sessionId && pendingChipRef.current && !isInitializing) {
      const chip = pendingChipRef.current;
      pendingChipRef.current = null;
      const action = CHIP_ACTIONS[chip];
      if (action) sendMessage(action, chip, true);
    }
  }, [sessionId, isInitializing, sendMessage]);

  const handleChipClick = useCallback(async (chip: string) => {
    if (isLoading || isTyping || isInitializing) return;

    // 中断当前请求
    if (abortRef.current) abortRef.current.abort();
    setIsLoading(false);
    restoringRef.current = true;
    setMessages([]);
    setInputValue('');
    setError(null);

    const action = CHIP_ACTIONS[chip];
    if (!action) return;

    try {
      // 1. 创建新 session
      const body: any = { userId, skipGreeting: true };
      if (assessmentContext && Object.keys(assessmentContext).length > 0) body.assessmentContext = assessmentContext;
      if (resumeText) body.resumeText = resumeText;

      const startRes = await fetch(`${apiBase}/api/chat/start`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const startData = await startRes.json();
      if (!startData.success) throw new Error(startData.error || 'Failed');

      const newSessionId = startData.data.sessionId;
      setSessionId(newSessionId);

      // 2. 乐观更新历史列表
      setChatHistory(prev => {
        if (prev.some(h => h.id === newSessionId)) return prev;
        return [{
          id: newSessionId,
          created_at: new Date().toISOString(),
          firstMessage: chip,
          pinned: false,
          title: null,
        }, ...prev];
      });

      // 3. 直接用 newSessionId 发送消息（不依赖 React state 更新）
      restoringRef.current = false;
      setIsLoading(true);
      setMessages([{ role: 'assistant', content: '' }]);

      const abortController = new AbortController();
      abortRef.current = abortController;

      const msgRes = await fetch(`${apiBase}/api/chat/message`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: newSessionId, message: action, stream: true }),
        signal: abortController.signal,
      });

      if (!msgRes.ok) throw new Error('消息发送失败');

      // SSE 流式读取
      const reader = msgRes.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'text' && parsed.content) {
                fullText += parsed.content;
                setMessages([{ role: 'assistant', content: fullText }]);
              } else if (parsed.type === 'done') {
                // 流结束
              }
            } catch {}
          }
        }
      }

      // 缓存消息
      messagesCacheRef.current[newSessionId] = [{ role: 'assistant', content: fullText }];

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[handleChipClick] error:', err);
      setError('创建对话失败，请重试');
    } finally {
      abortRef.current = null;
      setIsLoading(false);
      restoringRef.current = false;
    }
  }, [isLoading, isTyping, isInitializing, apiBase, assessmentContext, resumeText, userId]);

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

  // 侧边栏/下拉面板开关
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ===== 历史对话列表（共享内容，两种布局复用） =====
  const historyList = (
    <>
      {/* 新对话 + 快捷入口（固定区域） */}
      <div className="p-3 border-b border-gray-100 space-y-0.5">
        <button
          onClick={handleNewChat}
          disabled={isInitializing || isLoading}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#CA7C5E] rounded-xl hover:bg-[#CA7C5E]/10 transition-colors disabled:opacity-40"
        >
          <SquarePen className="w-4 h-4" />
          新对话
        </button>
        <button
          onClick={() => handleChipClick('模拟面试')}
          disabled={isLoading || isInitializing || isTyping}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#CA7C5E] rounded-xl hover:bg-[#CA7C5E]/10 transition-colors disabled:opacity-40"
        >
          <Mic className="w-4 h-4" />
          模拟面试
        </button>
        <button
          onClick={() => handleChipClick('职业规划')}
          disabled={isLoading || isInitializing || isTyping}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#CA7C5E] rounded-xl hover:bg-[#CA7C5E]/10 transition-colors disabled:opacity-40"
        >
          <Compass className="w-4 h-4" />
          职业规划
        </button>
      </div>
      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {chatHistory.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">暂无历史对话</p>
        ) : (
          <div className="space-y-0.5">
            {chatHistory.map((item) => (
              <div
                key={item.id}
                onClick={() => handleRestoreSession(item.id)}
                className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  sessionId === item.id ? 'bg-white shadow-sm border border-gray-100' : 'hover:bg-[#CA7C5E]/10'
                }`}
              >
                {item.pinned && <span className="absolute left-0.5 top-0.5 text-[8px]">📌</span>}
                <MessageSquare className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <div className="min-w-0 flex-1">
                  {renamingId === item.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(item.id); }}
                      onBlur={() => handleRename(item.id)}
                      className="text-xs text-gray-600 w-full border border-gray-300 rounded px-1 py-0.5 outline-none focus:border-[#CA7C5E]"
                    />
                  ) : (
                    <p className="text-xs text-gray-600 truncate">{item.title || item.firstMessage}</p>
                  )}
                </div>
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
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 transition-all shrink-0"
                >
                  <MoreHorizontal className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  // ===== 主聊天区 =====
  const mainChat = (mode: 'narrow' | 'wide') => (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="p-4 px-6 border-b border-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors"
              title={sidebarOpen ? '收起' : '展开'}
            >
              <Menu className="w-5 h-5 text-[#CA7C5E]" />
            </button>
            <div>
              <h3 className="font-bold text-base">求职小帮手</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-xs font-medium text-green-600">
                  {isInitializing ? '正在准备...' : 'Sparky 正在工作'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={isExpanded ? '收起' : '展开'}
          >
            {isExpanded ? <Minimize2 className="w-[18px] h-[18px]" /> : <Maximize2 className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </div>

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
                  msg.content.startsWith('Sparky 正在') ? (
                    <span className="flex items-center gap-2 text-gray-400 text-sm">
                      <Loader2 size={14} className="animate-spin text-[#CA7C5E]" />
                      {msg.content}
                    </span>
                  ) : (
                    <>
                      {formatContent(msg.content.replace('[CAREER_FORM]', ''))}
                      {msg.content.includes('[CAREER_FORM]') && (
                        <CareerForm onSubmit={(answers) => sendMessage(answers)} />
                      )}
                      {(() => {
                        const isStreamingThis = isLoading && idx === messages.length - 1;
                        if (isStreamingThis) return null;
                        const actions = extractActions(msg.content);
                        if (!actions.length) return null;
                        return (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {actions.map((kw) => {
                              const cfg = ACTION_BUTTON_CONFIG[kw];
                              return (
                                <button
                                  key={kw}
                                  onClick={() => cfg.action === 'canvas' ? onEnterCanvas?.() : sendMessage(cfg.action.replace('send:', ''))}
                                  className="px-4 py-2 bg-[#CA7C5E] text-white text-xs font-medium rounded-full hover:bg-[#b5694e] transition-colors"
                                >
                                  {cfg.label}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </>
                  )
                ) : (
                  <span className="flex items-center gap-2 text-gray-400 text-sm">
                    <Loader2 size={14} className="animate-spin text-[#CA7C5E]" />
                    Sparky 正在思考...
                  </span>
                )
              ) : (
                msg.content
              )}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                  <p className="text-[10px] text-gray-400 font-medium">来源</p>
                  {msg.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-gray-100 hover:border-[#0A66C2]/30 hover:bg-blue-50/30 transition-colors group"
                    >
                      {src.favicon && <img src={src.favicon} alt="" className="w-3.5 h-3.5 rounded-sm flex-shrink-0" />}
                      <span className="text-xs text-gray-600 group-hover:text-[#0A66C2] truncate">{src.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-gray-50">
        <div className="bg-gray-50 rounded-2xl mb-4 focus-within:ring-2 focus-within:ring-[#CA7C5E]/20 transition-all">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => {
              setInputValue(e.target.value.slice(0, MAX_INPUT_LENGTH));
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="进入简历画布，上传JD一键定制你的专属简历..."
            disabled={isLoading || isInitializing || isTyping}
            rows={1}
            className="w-full bg-transparent border-none pl-5 pr-5 pt-3.5 pb-1 text-sm outline-none disabled:text-gray-400 resize-none overflow-hidden"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            {onEnterCanvas ? (
              <button
                onClick={() => onEnterCanvas?.()}
                disabled={isLoading || isInitializing || isTyping}
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
      </div>
    </div>
  );

  // ===== 操作浮窗（共享） =====
  const actionMenu = actionMenuId && (
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
  );

  // ===== 展开模式：左右布局 =====
  if (isExpanded) {
    return (
      <>
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100]"
          onClick={() => setIsExpanded(false)}
        />
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-8 pointer-events-none">
          <div className="w-full max-w-7xl h-[95vh] pointer-events-auto">
            <div className="bg-white border border-gray-200 rounded-3xl flex overflow-hidden shadow-sm h-full">
              {/* 左侧侧边栏 */}
              <div
                className={`bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 transition-all duration-200 overflow-hidden ${
                  sidebarOpen ? 'w-[240px]' : 'w-0'
                }`}
              >
                {historyList}
              </div>
              {/* 右侧聊天区 */}
              {mainChat('wide')}
            </div>
          </div>
        </div>
        {actionMenu}
      </>
    );
  }

  // ===== 窄模式：上下布局（汉堡菜单下拉面板） =====
  return (
    <aside className="w-[420px] h-full shrink-0 p-4 pl-0">
      <div className="bg-white border border-gray-200 rounded-3xl flex flex-col overflow-hidden shadow-sm h-full relative">
        {/* Header */}
        <div className="p-4 px-6 border-b border-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors"
                title="历史对话"
              >
                <Menu className="w-5 h-5 text-[#CA7C5E]" />
              </button>
              <div>
                <h3 className="font-bold text-base">求职小帮手</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  <span className="text-xs font-medium text-green-600">
                    {isInitializing ? '正在准备...' : 'Sparky 正在工作'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => { setIsExpanded(true); setSidebarOpen(true); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="展开"
            >
              <Maximize2 className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {/* 下拉面板（上下布局） */}
        {sidebarOpen && (
          <div className="border-b border-gray-200 bg-gray-50 max-h-[50vh] flex flex-col overflow-hidden">
            {historyList}
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
                    msg.content.startsWith('Sparky 正在') ? (
                      <span className="flex items-center gap-2 text-gray-400 text-sm">
                        <Loader2 size={14} className="animate-spin text-[#CA7C5E]" />
                        {msg.content}
                      </span>
                    ) : (
                      <>
                        {formatContent(msg.content.replace('[CAREER_FORM]', ''))}
                        {msg.content.includes('[CAREER_FORM]') && (
                          <CareerForm onSubmit={(answers) => sendMessage(answers)} />
                        )}
                        {(() => {
                          const isStreamingThis = isLoading && idx === messages.length - 1;
                          if (isStreamingThis) return null;
                          const actions = extractActions(msg.content);
                          if (!actions.length) return null;
                          return (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {actions.map((kw) => {
                                const cfg = ACTION_BUTTON_CONFIG[kw];
                                return (
                                  <button
                                    key={kw}
                                    onClick={() => cfg.action === 'canvas' ? onEnterCanvas?.() : sendMessage(cfg.action.replace('send:', ''))}
                                    className="px-4 py-2 bg-[#CA7C5E] text-white text-xs font-medium rounded-full hover:bg-[#b5694e] transition-colors"
                                  >
                                    {cfg.label}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </>
                    )
                  ) : (
                    <span className="flex items-center gap-2 text-gray-400 text-sm">
                      <Loader2 size={14} className="animate-spin text-[#CA7C5E]" />
                      Sparky 正在思考...
                    </span>
                  )
                ) : (
                  msg.content
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                    <p className="text-[10px] text-gray-400 font-medium">来源</p>
                    {msg.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-gray-100 hover:border-[#0A66C2]/30 hover:bg-blue-50/30 transition-colors group"
                      >
                        {src.favicon && <img src={src.favicon} alt="" className="w-3.5 h-3.5 rounded-sm flex-shrink-0" />}
                        <span className="text-xs text-gray-600 group-hover:text-[#0A66C2] truncate">{src.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white border-t border-gray-50">
          <div className="bg-gray-50 rounded-2xl mb-4 focus-within:ring-2 focus-within:ring-[#CA7C5E]/20 transition-all">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => {
                setInputValue(e.target.value.slice(0, MAX_INPUT_LENGTH));
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="进入简历画布，上传JD一键定制你的专属简历..."
              disabled={isLoading || isInitializing || isTyping}
              rows={1}
              className="w-full bg-transparent border-none pl-5 pr-5 pt-3.5 pb-1 text-sm outline-none disabled:text-gray-400 resize-none overflow-hidden"
            />
            <div className="flex items-center justify-between px-2 pb-2">
              {onEnterCanvas ? (
                <button
                  onClick={() => onEnterCanvas?.()}
                  disabled={isLoading || isInitializing || isTyping}
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
        </div>

      </div>
      {actionMenu}
    </aside>
  );
};
