/**
 * CanvasChat - 画布模式左侧对话面板
 * 复用 ChatWidget 的消息渲染，增加 canvasMode 和 edit 事件处理
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Check, RefreshCw, FileEdit } from 'lucide-react';
import { ChatMessage, formatContent, parseSseStream, PixelCat } from './ChatWidget';
import { FileSearch } from 'lucide-react';
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
  // 清理 EDIT 块残留的孤立标记符号（如 >>、>>>、<<<）
  display = display.replace(/>{2,}/g, '').replace(/<{2,}/g, '');

  return { displayText: display.trim(), edits };
}

// ---- 修改建议卡片组件（只显示改写内容，不含修改原因） ----
const EditSuggestionCard: React.FC<{
  suggested: string;
}> = ({ suggested }) => (
  <div className="mt-2 rounded-xl border border-[#CA7C5E]/20 bg-[#FDF5F0] overflow-hidden">
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#CA7C5E]/10">
      <FileEdit className="w-3.5 h-3.5 text-[#CA7C5E]" />
      <span className="text-xs font-semibold text-[#CA7C5E]">改写建议</span>
    </div>
    <div className="px-3 py-2.5">
      <div className="text-sm text-gray-700 bg-white rounded-lg px-3 py-2 border border-gray-100 leading-relaxed whitespace-pre-wrap">
        {suggested}
      </div>
    </div>
  </div>
);

// 单条编辑卡片数据
interface EditCardData { rationale: string; suggested: string }

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
  onAcceptEdit?: (editId: string) => void;
  resumeSections?: ResumeSection[];
}

// JD 自动检测：长文本 + 多个 JD 特征关键词 + 结构性判断
const JD_KEYWORDS = ['岗位职责', '任职要求', '职位描述', '工作职责', '工作内容', '学历要求', '岗位要求', '职位要求', '任职资格'];
function detectJd(text: string): boolean {
  if (text.length < 200) return false;
  const matchCount = JD_KEYWORDS.filter(kw => text.includes(kw)).length;
  if (matchCount >= 3) return true;
  if (matchCount >= 2) {
    const hasListFormat = /(?:^|\n)\s*(?:\d[.、)）]|[-·•])\s*.{4,}/m.test(text);
    return hasListFormat;
  }
  return false;
}

const MAX_INPUT_LENGTH = 5000;

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // JD 上传弹窗（保留 UI，提交后作为普通消息发送）
  const [showJdModal, setShowJdModal] = useState(false);
  const [jdInput, setJdInput] = useState('');
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
  // 当前流的编辑卡片
  const [currentEditCards, setCurrentEditCards] = useState<EditCardData[]>([]);
  // 历史消息的编辑卡片（key = message index）
  const [frozenEditCards, setFrozenEditCards] = useState<Record<number, EditCardData[]>>({});
  // 缓冲区：edit 事件先暂存，等 text 开始渲染后再释放到 currentEditCards
  const pendingEditCardsRef = useRef<EditCardData[]>([]);

  // 统一处理一个 edit：去重 → 触发 onEditSuggestion → 缓冲卡片数据（等 text 到达后再显示）
  const handleParsedEdit = useCallback((edit: ParsedEditBlock) => {
    const key = edit.original.slice(0, 50);
    if (processedEditsRef.current.has(key)) return;
    processedEditsRef.current.add(key);
    streamHasEditRef.current = true;
    onEditSuggestion(edit);
    // 先缓冲，不直接 setState；由 onText 回调在文字开始渲染时 flush
    pendingEditCardsRef.current.push({ rationale: edit.rationale, suggested: edit.suggested });
  }, [onEditSuggestion]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || inputValue).trim().slice(0, MAX_INPUT_LENGTH);
    if (!text || isLoading || !sessionId) return;

    // 解析快捷操作标记 [QUICK:用户可见文本]LLM指令
    const quickMatch = text.match(/^\[QUICK:(.+?)\]/);
    const messageToSend = quickMatch ? text.slice(quickMatch[0].length) : text;

    // JD 自动检测：用户直接粘贴了 JD 文本 → 引导去点上传按钮
    if (!quickMatch && detectJd(messageToSend)) {
      setMessages(prev => [
        ...prev,
        { role: 'user', content: `${messageToSend.slice(0, 100)}...` },
        { role: 'assistant', content: '你发的内容看起来是一份岗位描述（JD），点击输入框旁边的「上传 JD」按钮可以获得更精准的定制化改写。' },
      ]);
      if (!overrideText) setInputValue('');
      return;
    }

    // 冻结当前 editCards 到上一条 assistant 消息
    if (currentEditCards.length > 0) {
      const lastAssistantIdx = messages.length - 1;
      setFrozenEditCards(prev => ({ ...prev, [lastAssistantIdx]: currentEditCards }));
    }

    // 显示用户消息
    if (text.startsWith('[CANVAS_AUTO_START]')) {
      // 自动开场：隐藏
    } else if (quickMatch) {
      setMessages(prev => [...prev, { role: 'user', content: quickMatch[1] }]);
    } else {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
    }
    if (!overrideText) setInputValue('');
    setIsLoading(true);
    streamHasEditRef.current = false;
    processedEditsRef.current.clear();
    pendingEditCardsRef.current = [];
    setCurrentEditCards([]);
    setLastStreamHadEdit(false);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const res = await fetch(`${apiBase}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: messageToSend,
          stream: true,
          canvasMode: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

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
          // 不在此处释放缓冲区：等 parseSseStream 全部文字渲染完毕后，
          // 由 finally 块统一释放 edit 卡片，确保文字气泡完整显示后再出卡片
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
      const errorMsg = err.name === 'AbortError'
        ? '请求超时了，后端可能正在启动中，请稍后再试。'
        : (err.message?.includes('已用完') || err.message?.includes('次数'))
          ? err.message
          : '抱歉，获取回复失败，请重试。';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: errorMsg };
        return updated;
      });
    } finally {
      // parseSseStream 等渲染循环跑完才 resolve，所以此处文字已全部打完，释放卡片
      if (pendingEditCardsRef.current.length > 0) {
        setCurrentEditCards(prev => [...prev, ...pendingEditCardsRef.current]);
        pendingEditCardsRef.current = [];
      }
      setIsLoading(false);
      if (streamHasEditRef.current) setLastStreamHadEdit(true);
    }
  }, [apiBase, inputValue, isLoading, sessionId, handleParsedEdit, resumeSections, currentEditCards, messages.length]);

  // 外部消息注入（选中文本快捷操作）
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // JD 弹窗提交 → 调用 /api/chat/jd-optimize，结果批量写入 pendingEdits
  const handleJdSubmit = useCallback(async () => {
    const jdText = jdInput.trim();
    if (!jdText || isLoading || !sessionId) return;
    setShowJdModal(false);
    setJdInput('');

    // 显示用户消息 + loading
    setMessages(prev => [
      ...prev,
      { role: 'user', content: `上传 JD：${jdText.slice(0, 80)}...` },
      { role: 'assistant', content: 'Sparky 正在分析 JD 并生成改写建议...' },
    ]);
    setIsLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/chat/jd-optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, jdText }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const { data } = await res.json();
      const { job_essence, overall_gap, edits } = data;

      // 对话区展示诊断摘要
      const summary = `**岗位本质：**${job_essence}\n**匹配距离：**${overall_gap}\n\n共找到 ${edits.length} 处可优化内容，已在右侧简历中标出，你可以逐个查看并采纳。`;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: summary };
        return updated;
      });

      // 批量写入 pendingEdits，复用润色的替换机制
      for (const edit of edits) {
        onEditSuggestion({
          sectionId: edit.sectionId,
          original: edit.original,
          suggested: edit.suggested,
          rationale: edit.reason,
        });
      }
    } catch (err: any) {
      console.error('JD optimize failed:', err);
      const errorMsg = err.message?.includes('已用完') ? err.message : '抱歉，JD 优化过程中遇到问题，请重试。';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: errorMsg };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [jdInput, isLoading, sessionId, apiBase, onEditSuggestion]);

  useEffect(() => {
    if (externalMessage) {
      sendMessageRef.current(externalMessage);
      onExternalMessageConsumed?.();
    }
  }, [externalMessage, onExternalMessageConsumed]);

  // autoStart 已移除：进入画布后保留对话历史，等用户主动操作

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // 接受改写：确认替换，清除 diff，给用户反馈
  const handleAccept = useCallback(() => {
    if (!pendingEdits.length || !onAcceptEdit) return;
    const latestEdit = pendingEdits[pendingEdits.length - 1];
    onAcceptEdit(latestEdit.editId);
    setLastStreamHadEdit(false);
    // 冻结当前卡片到历史，然后清除
    if (currentEditCards.length > 0) {
      const lastAssistantIdx = messages.length - 1;
      setFrozenEditCards(prev => ({ ...prev, [lastAssistantIdx]: currentEditCards }));
    }
    setCurrentEditCards([]);
    // Sparky 确认反馈
    setMessages(prev => [...prev, { role: 'assistant', content: '已采纳，右侧简历已更新。继续选中其他段落，我帮你接着改。' }]);
  }, [pendingEdits, onAcceptEdit, currentEditCards, messages.length]);

  // 再优化：自动发送请求，让 AI 用不同方式重新优化同一段内容
  // 不清除 currentEditCards —— sendMessage 会自动冻结到历史
  const handleReoptimize = useCallback(() => {
    if (!pendingEdits.length) return;
    const latestEdit = pendingEdits[pendingEdits.length - 1];
    setLastStreamHadEdit(false);
    const prompt = `[QUICK:再优化这段内容]请对以下简历段落重新优化，用不同的方式改写，提供更好的版本。\n\n原文：\n${latestEdit.original}`;
    sendMessageRef.current(prompt);
  }, [pendingEdits]);

  // 判断是否在最后一条 assistant 消息下方显示接受/再优化按钮
  const showEditActions = lastStreamHadEdit && !isLoading && pendingEdits.length > 0;

  // 获取某条消息的 editCards（冻结的历史 or 当前流的）
  const getEditCards = (idx: number, isLast: boolean): EditCardData[] => {
    if (isLast) return currentEditCards;
    return frozenEditCards[idx] || [];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {messages.map((msg, idx) => {
          const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1;
          const cards = msg.role === 'assistant' ? getEditCards(idx, isLastAssistant) : [];
          return (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center">
                <PixelCat size={22} />
              </div>
            )}
            <div className="max-w-[85%]">
              {/* 文字气泡：有文本时显示，或无卡片时显示加载动画 */}
              {(msg.role === 'user' || msg.content || !(isLastAssistant && cards.length > 0)) && (
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
              {/* 修改原因（作为 Sparky 的文字回复） + 改写建议卡片 */}
              {cards.length > 0 && (
                <div>
                  {cards.map((card, i) => (
                    <React.Fragment key={i}>
                      {card.rationale && !msg.content && (
                        <div className="mt-2 bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 leading-relaxed">
                          {card.rationale}
                        </div>
                      )}
                      <EditSuggestionCard suggested={card.suggested} />
                    </React.Fragment>
                  ))}
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
              )}
            </div>
          </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-100">
        {/* JD 上传快捷入口 */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setShowJdModal(true)}
            disabled={isLoading || !sessionId}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-500 border border-gray-200 rounded-lg hover:text-[#0A66C2] hover:border-[#0A66C2]/30 hover:bg-blue-50/50 transition-colors disabled:opacity-40"
          >
            <FileSearch className="w-3 h-3" />
            上传 JD
          </button>
        </div>
        <div className="relative">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value.slice(0, MAX_INPUT_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder="告诉 Sparky 你想优化哪段简历...（支持粘贴 JD 全文）"
            disabled={isLoading || !sessionId}
            rows={1}
            className="w-full bg-gray-50 border-none rounded-2xl pl-5 pr-14 py-3.5 text-sm outline-none focus:ring-2 focus:ring-[#CA7C5E]/20 transition-all disabled:bg-gray-100 disabled:text-gray-400 resize-none overflow-hidden"
            style={{ maxHeight: '120px' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isLoading || !sessionId}
            className="absolute right-2 bottom-2 w-9 h-9 bg-[#CA7C5E] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#CA7C5E]/30 disabled:bg-gray-300 disabled:shadow-none transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* JD 上传弹窗 */}
      {showJdModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl shadow-2xl w-[520px] p-7">
            <h3 className="text-lg font-bold text-gray-900 mb-2">上传目标 JD</h3>
            <p className="text-xs text-gray-400 mb-4">粘贴岗位 JD 全文或网址，Sparky 将针对该岗位定制化优化你的简历</p>
            <textarea
              value={jdInput}
              onChange={e => setJdInput(e.target.value)}
              placeholder="粘贴 JD 内容或 URL..."
              className="w-full h-48 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#CA7C5E]/20 resize-none"
              disabled={isLoading}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowJdModal(false); setJdInput(''); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleJdSubmit}
                disabled={!jdInput.trim() || isLoading}
                className="px-5 py-2 bg-[#0A66C2] text-white text-sm font-semibold rounded-xl hover:bg-[#084e96] disabled:opacity-40 transition-colors"
              >
                开始分析
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
