/**
 * ChatWidget - 简历优化助手（桌面端右侧边栏）
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, MoreHorizontal, Cpu } from 'lucide-react';

// Types
interface ChatMessage {
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
  };
  resumeText: string;
  apiBase?: string;
}

// Markdown 渲染
const formatContent = (text: string) => {
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
      prefix = <span className="text-blue-600 mr-1.5">•</span>;
    } else if (olMatch) {
      content = olMatch[2];
      prefix = <span className="text-blue-600 mr-1.5 font-bold">{olMatch[1]}.</span>;
    } else {
      content = line;
    }

    const parts = content.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/);
    const rendered = parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <span key={i} className="font-bold text-blue-600">{part.slice(2, -2)}</span>;
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{linkMatch[1]}</a>;
      }
      return part;
    });

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
const QUICK_CHIPS = ['模拟面试', '修改自我介绍', '润色项目背景'];

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  assessmentContext,
  resumeText,
  apiBase = '',
}) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-initialize on mount
  const initSession = useCallback(async () => {
    if (sessionId) return;
    setIsInitializing(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/api/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentContext, resumeText }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to start chat');
      setSessionId(data.data.sessionId);
      setMessages([{ role: 'assistant', content: data.data.greeting }]);
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
        body: JSON.stringify({ assessmentContext, resumeText }),
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

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || inputValue).trim().slice(0, MAX_INPUT_LENGTH);
    if (!text || isLoading || !sessionId) return;

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInputValue('');
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${apiBase}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, stream: true }),
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

      const reader = res.body!.getReader();
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
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: fullText };
                return updated;
              });
            }
          } catch { /* Skip invalid JSON */ }
        }
      }
    } catch (err: any) {
      console.error('Send failed:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: '抱歉，获取回复失败，请重试。' };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, inputValue, isLoading, sessionId, recoverSession]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  return (
    <aside className="w-[420px] h-full shrink-0 p-4 pl-0">
    <div className="bg-white border border-gray-200 rounded-3xl h-full flex flex-col overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-gray-50">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Cpu className="text-white w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">简历优化助手</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-xs font-medium text-green-600">
                  {isInitializing ? '正在分析你的简历...' : 'AI 正在提供建议'}
                </span>
              </div>
            </div>
          </div>
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
              className="text-blue-600 text-sm font-medium underline"
            >
              重试
            </button>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 bg-blue-100 rounded-full flex-shrink-0 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-blue-600" />
              </div>
            )}
            <div
              className={`max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === 'user'
                  ? 'bg-blue-600 rounded-2xl p-4 text-white shadow-md'
                  : 'bg-gray-50 rounded-2xl p-4 text-gray-700 border border-gray-100'
              }`}
            >
              {msg.role === 'assistant' ? (
                msg.content ? (
                  formatContent(msg.content)
                ) : (
                  <span className="flex items-center gap-1 text-gray-400">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
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
        <div className="relative mb-4">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value.slice(0, MAX_INPUT_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder="询问 AI 如何提升简历身价..."
            disabled={isLoading || isInitializing}
            className="w-full bg-gray-50 border-none rounded-2xl pl-5 pr-14 py-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:bg-gray-100 disabled:text-gray-400"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isLoading || isInitializing}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 disabled:bg-gray-300 disabled:shadow-none transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => sendMessage(chip)}
              disabled={isLoading || isInitializing || !sessionId}
              className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-semibold text-gray-600 disabled:opacity-50 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
    </aside>
  );
};
