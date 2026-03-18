/**
 * CanvasChat - 画布模式左侧对话面板
 * 复用 ChatWidget 的消息渲染，增加 canvasMode 和 edit 事件处理
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Check, RefreshCw } from 'lucide-react';
import { ChatMessage, formatContent, parseSseStream, PixelCat } from './ChatWidget';
import { PendingEdit, ResumeSection } from '../types';

interface CanvasChatProps {
  sessionId: string | null;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  apiBase: string;
  onEditSuggestion: (edit: Omit<PendingEdit, 'status'>) => void;
  externalMessage?: string | null;
  onExternalMessageConsumed?: () => void;
  autoStartPrompt?: string;
  pendingEdits?: PendingEdit[];
  onAcceptEdit?: (sectionId: string) => void;
  resumeSections?: ResumeSection[];
}

const MAX_INPUT_LENGTH = 2000;

export const CanvasChat: React.FC<CanvasChatProps> = ({
  sessionId,
  messages,
  setMessages,
  isLoading,
  setIsLoading,
  apiBase,
  onEditSuggestion,
  externalMessage,
  onExternalMessageConsumed,
  autoStartPrompt,
  pendingEdits = [],
  onAcceptEdit,
  resumeSections = [],
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 追踪当前流式输出是否产生了编辑建议
  const streamHasEditRef = useRef(false);
  const [lastStreamHadEdit, setLastStreamHadEdit] = useState(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || inputValue).trim().slice(0, MAX_INPUT_LENGTH);
    if (!text || isLoading || !sessionId) return;

    // 隐藏 [CANVAS_AUTO_START] 指令，不显示为用户消息
    if (!text.startsWith('[CANVAS_AUTO_START]')) {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
    }
    if (!overrideText) setInputValue('');
    setIsLoading(true);
    streamHasEditRef.current = false;
    setLastStreamHadEdit(false);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${apiBase}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: text,
          stream: true,
          canvasMode: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      await parseSseStream(
        res,
        (fullText) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: fullText };
            return updated;
          });
        },
        (edit) => {
          streamHasEditRef.current = true;
          onEditSuggestion({
            sectionId: edit.sectionId,
            original: edit.original,
            suggested: edit.suggested,
            rationale: edit.rationale,
          });
        }
      );
    } catch (err: any) {
      console.error('Canvas send failed:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: '抱歉，获取回复失败，请重试。' };
        return updated;
      });
    } finally {
      setIsLoading(false);
      if (streamHasEditRef.current) setLastStreamHadEdit(true);
    }
  }, [apiBase, inputValue, isLoading, sessionId, onEditSuggestion]);

  // 外部消息注入（选中文本快捷操作）
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    if (externalMessage) {
      sendMessageRef.current(externalMessage);
      onExternalMessageConsumed?.();
    }
  }, [externalMessage, onExternalMessageConsumed]);

  // 进入画布时自动触发第一条改写（Sparky 先动，不显示用户消息）
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStartPrompt && sessionId && !autoStarted.current && messages.length === 0) {
      autoStarted.current = true;
      setTimeout(async () => {
        setIsLoading(true);
        streamHasEditRef.current = false;
        setMessages([{ role: 'assistant', content: '' }]);
        try {
          const res = await fetch(`${apiBase}/api/chat/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              message: autoStartPrompt,
              stream: true,
              canvasMode: true,
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await parseSseStream(
            res,
            (fullText) => {
              setMessages([{ role: 'assistant', content: fullText }]);
            },
            (edit) => {
              streamHasEditRef.current = true;
              onEditSuggestion({
                sectionId: edit.sectionId,
                original: edit.original,
                suggested: edit.suggested,
                rationale: edit.rationale,
              });
            }
          );
        } catch (err) {
          console.error('Canvas auto-start failed:', err);
          setMessages([{ role: 'assistant', content: '你好，我来帮你优化简历。你想从哪段开始？' }]);
        } finally {
          setIsLoading(false);
          if (streamHasEditRef.current) setLastStreamHadEdit(true);
        }
      }, 300);
    }
  }, [autoStartPrompt, sessionId, messages.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // 接受改写：清除 diff + 自动发消息引导下一段
  const handleAccept = useCallback(() => {
    if (!pendingEdits.length || !onAcceptEdit) return;
    const latestEdit = pendingEdits[pendingEdits.length - 1];
    onAcceptEdit(latestEdit.sectionId);
    setLastStreamHadEdit(false);
    // 找到刚改完的段落名称和下一段建议
    const editedTitle = resumeSections.find(s => s.id === latestEdit.sectionId)?.title || '这段';
    const editedIdx = resumeSections.findIndex(s => s.id === latestEdit.sectionId);
    const nextSection = editedIdx >= 0 ? resumeSections.slice(editedIdx + 1).find(s => s.type !== 'skill' && s.type !== 'education') : null;
    const nextHint = nextSection ? `建议接下来改「${nextSection.title}」。` : '';
    sendMessage(`[CANVAS_AUTO_START] 用户接受了「${editedTitle}」的改写。${nextHint}请继续改写下一段，用 EDIT 指令格式输出。`);
  }, [pendingEdits, onAcceptEdit, resumeSections, sendMessage]);

  // 再优化：聚焦输入框让用户说明不满意的地方
  const handleReoptimize = useCallback(() => {
    setLastStreamHadEdit(false);
    inputRef.current?.focus();
  }, []);

  // 判断是否在最后一条 assistant 消息下方显示接受/再优化按钮
  const showEditActions = lastStreamHadEdit && !isLoading && pendingEdits.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {messages.map((msg, idx) => {
          const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1;
          return (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center">
                <PixelCat size={22} />
              </div>
            )}
            <div className="max-w-[85%]">
              <div
                className={`text-sm break-words ${
                  msg.role === 'user'
                    ? 'bg-[#CA7C5E] rounded-2xl px-5 py-4 text-white shadow-md leading-relaxed whitespace-pre-wrap'
                    : 'bg-gray-50 rounded-2xl px-5 py-4 text-gray-700 border border-gray-100 leading-[1.8]'
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
              {/* 接受 / 再优化 按钮 */}
              {isLastAssistant && showEditActions && (
                <div className="flex items-center gap-2 mt-2 ml-1">
                  <button
                    onClick={handleAccept}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#0A66C2] rounded-lg hover:bg-[#084e96] transition-colors shadow-sm"
                  >
                    <Check className="w-3 h-3" />
                    接受
                  </button>
                  <button
                    onClick={handleReoptimize}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-800 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    再优化
                  </button>
                </div>
              )}
            </div>
          </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value.slice(0, MAX_INPUT_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder="告诉 Sparky 你想优化哪段简历..."
            disabled={isLoading || !sessionId}
            className="w-full bg-gray-50 border-none rounded-2xl pl-5 pr-14 py-3.5 text-sm outline-none focus:ring-2 focus:ring-[#CA7C5E]/20 transition-all disabled:bg-gray-100 disabled:text-gray-400"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isLoading || !sessionId}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-[#CA7C5E] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#CA7C5E]/30 disabled:bg-gray-300 disabled:shadow-none transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
