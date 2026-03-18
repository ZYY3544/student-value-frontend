/**
 * CanvasChat - 画布模式左侧对话面板
 * 复用 ChatWidget 的消息渲染，增加 canvasMode 和 edit 事件处理
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Check, RefreshCw, FileEdit } from 'lucide-react';
import { ChatMessage, formatContent, parseSseStream, PixelCat } from './ChatWidget';
import { PendingEdit, ResumeSection } from '../types';

// ---- 前端兜底：解析泄露到 text 里的 <<<EDIT...EDIT>>> 块 ----
interface ParsedEditBlock {
  sectionId: string;
  original: string;
  suggested: string;
  rationale: string;
}

function parseSingleEditBlock(block: string, sections: ResumeSection[]): ParsedEditBlock | null {
  const sectionMatch = block.match(/SECTION:\s*(.+?)(?:\n|$)/m);
  const originalMatch = block.match(/ORIGINAL:\s*([\s\S]+?)(?=\nSUGGESTED:)/);
  const suggestedMatch = block.match(/SUGGESTED:\s*([\s\S]+?)(?=\nRATIONALE:)/);
  const rationaleMatch = block.match(/RATIONALE:\s*([\s\S]+?)(?=\n?EDIT>>>)/);
  if (!originalMatch || !suggestedMatch) return null;

  const sectionTitle = sectionMatch?.[1]?.trim() || '';
  const original = originalMatch[1].trim();
  const suggested = suggestedMatch[1].trim();
  const rationale = rationaleMatch?.[1]?.trim() || '';

  // 按标题匹配 section
  let sectionId = sections[0]?.id || 'section-0';
  if (sectionTitle && sections.length > 0) {
    const idx = sections.findIndex(s =>
      s.title.includes(sectionTitle) || sectionTitle.includes(s.title)
    );
    if (idx !== -1) sectionId = sections[idx].id;
  }
  return { sectionId, original, suggested, rationale };
}

/** 从文本中提取完整 EDIT 块，返回清理后的展示文本和解析出的 edit 列表 */
function cleanEditBlocksFromText(
  text: string,
  sections: ResumeSection[],
): { displayText: string; edits: ParsedEditBlock[] } {
  const edits: ParsedEditBlock[] = [];

  // 提取所有完整 <<<EDIT...EDIT>>> 块
  const editRegex = /<<<EDIT[\s\S]*?EDIT>>>/g;
  let match;
  while ((match = editRegex.exec(text)) !== null) {
    const parsed = parseSingleEditBlock(match[0], sections);
    if (parsed) edits.push(parsed);
  }
  // 从展示文本中移除完整块
  let display = text.replace(/<<<EDIT[\s\S]*?EDIT>>>/g, '');
  // 隐藏正在流式传输中的不完整 EDIT 块
  const incompleteIdx = display.indexOf('<<<EDIT');
  if (incompleteIdx !== -1) display = display.slice(0, incompleteIdx);

  return { displayText: display.trim(), edits };
}

// ---- 修改建议卡片组件 ----
const EditSuggestionCard: React.FC<{
  rationale: string;
  suggested: string;
}> = ({ rationale, suggested }) => (
  <div className="mt-2 rounded-xl border border-[#CA7C5E]/20 bg-[#FDF5F0] overflow-hidden">
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#CA7C5E]/10">
      <FileEdit className="w-3.5 h-3.5 text-[#CA7C5E]" />
      <span className="text-xs font-semibold text-[#CA7C5E]">修改建议</span>
    </div>
    <div className="px-3 py-2.5 space-y-2">
      {rationale && (
        <div>
          <span className="text-[11px] font-medium text-gray-400">修改原因</span>
          <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{rationale}</p>
        </div>
      )}
      <div>
        <span className="text-[11px] font-medium text-gray-400">改写后</span>
        <div className="text-sm text-gray-700 mt-0.5 bg-white rounded-lg px-3 py-2 border border-gray-100 leading-relaxed whitespace-pre-wrap">
          {suggested}
        </div>
      </div>
    </div>
  </div>
);

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

  // 已处理的 edit 去重（防止后端 onEdit + 前端文本解析重复触发）
  const processedEditsRef = useRef(new Set<string>());
  // 修改建议卡片数据
  const [editCards, setEditCards] = useState<Array<{ rationale: string; suggested: string }>>([]);

  // 统一处理一个 edit：去重 → 触发 onEditSuggestion → 存卡片数据
  const handleParsedEdit = useCallback((edit: ParsedEditBlock) => {
    const key = edit.original.slice(0, 50);
    if (processedEditsRef.current.has(key)) return;
    processedEditsRef.current.add(key);
    streamHasEditRef.current = true;
    onEditSuggestion(edit);
    setEditCards(prev => [...prev, { rationale: edit.rationale, suggested: edit.suggested }]);
  }, [onEditSuggestion]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || inputValue).trim().slice(0, MAX_INPUT_LENGTH);
    if (!text || isLoading || !sessionId) return;

    // 解析快捷操作标记 [QUICK:用户可见文本]LLM指令
    const quickMatch = text.match(/^\[QUICK:(.+?)\]/);
    const messageToSend = quickMatch ? text.slice(quickMatch[0].length) : text;

    // 显示用户消息
    if (text.startsWith('[CANVAS_AUTO_START]')) {
      // 自动开场：隐藏
    } else if (quickMatch) {
      // 快捷操作：显示自然语言描述，不暴露 LLM 指令
      setMessages(prev => [...prev, { role: 'user', content: quickMatch[1] }]);
    } else {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
    }
    if (!overrideText) setInputValue('');
    setIsLoading(true);
    streamHasEditRef.current = false;
    processedEditsRef.current.clear();
    setEditCards([]);
    setLastStreamHadEdit(false);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${apiBase}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: messageToSend,
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
          // 前端兜底：解析并剥离泄露到文本中的 EDIT 块
          const { displayText, edits } = cleanEditBlocksFromText(fullText, resumeSections);
          for (const edit of edits) handleParsedEdit(edit);
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: displayText };
            return updated;
          });
        },
        (edit) => {
          // 后端正常解析的 edit 事件
          handleParsedEdit({
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
  }, [apiBase, inputValue, isLoading, sessionId, handleParsedEdit, resumeSections]);

  // 外部消息注入（选中文本快捷操作）
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    if (externalMessage) {
      sendMessageRef.current(externalMessage);
      onExternalMessageConsumed?.();
    }
  }, [externalMessage, onExternalMessageConsumed]);

  // 进入画布时自动触发第一条改写（仅当已有对话历史时，新对话不自动开始）
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStartPrompt && sessionId && !autoStarted.current && messages.length > 0) {
      autoStarted.current = true;
      setTimeout(async () => {
        setIsLoading(true);
        streamHasEditRef.current = false;
        processedEditsRef.current.clear();
        setEditCards([]);
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
              const { displayText, edits } = cleanEditBlocksFromText(fullText, resumeSections);
              for (const edit of edits) handleParsedEdit(edit);
              setMessages([{ role: 'assistant', content: displayText }]);
            },
            (edit) => {
              handleParsedEdit({
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
              {/* 文字气泡：有文本时显示，或无卡片时显示加载动画 */}
              {(msg.role === 'user' || msg.content || !(isLastAssistant && editCards.length > 0)) && (
                <div
                  className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    msg.role === 'user'
                      ? 'bg-[#CA7C5E] rounded-2xl px-4 py-3 text-white shadow-md'
                      : 'bg-gray-50 rounded-2xl px-4 py-3 text-gray-700 border border-gray-100'
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
              )}
              {/* 修改建议卡片 + 接受/再优化按钮 */}
              {isLastAssistant && editCards.length > 0 && (
                <div>
                  {editCards.map((card, i) => (
                    <EditSuggestionCard key={i} rationale={card.rationale} suggested={card.suggested} />
                  ))}
                  {showEditActions && (
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
