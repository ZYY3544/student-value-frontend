/**
 * CanvasView - 全屏简历画布（三栏布局）
 * 左侧：AI 对话面板
 * 中间：简历原文（只读，供参考对比）
 * 右侧：优化版本（Word 式 diff 高亮 + 自由编辑）
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ArrowLeft, Download, PanelLeft, Sparkles, FileSearch } from 'lucide-react';
import { ChatMessage, PixelCat, parseSseStream } from './ChatWidget';
import { CanvasChat } from './CanvasChat';
import { ResumePanel, OriginalResumePanel } from './ResumePanel';
import { ResumeSection, PendingEdit, ParsedJd, JdMatchItem } from '../types';

// 选中文本快捷操作
// display: 用户可见的消息（自然语言）
// prompt: 发给 LLM 的指令（CANVAS_MODE_PROMPT 已约束 EDIT 格式，这里不重复）
const QUICK_ACTIONS = [
  { label: '润色', icon: Sparkles, action: '润色简历',
    display: (text: string) => `帮我润色这段：「${text.slice(0, 50)}${text.length > 50 ? '...' : ''}」`,
    prompt: (text: string, sectionTitle?: string) => {
      const sec = sectionTitle ? `[SECTION:${sectionTitle}] ` : '';
      return `[ACTION:润色简历] ${sec}${text}`;
    }},
];

interface CanvasViewProps {
  // Chat state (lifted from ResultView)
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  apiBase: string;
  // Canvas state
  resumeSections: ResumeSection[];
  originalSections: ResumeSection[];
  pendingEdits: PendingEdit[];
  onEditSuggestion: (edit: Omit<PendingEdit, 'status'>) => void;
  onAcceptEdit: (sectionId: string) => void;
  onSectionContentChange: (sectionId: string, content: string) => void;
  onExitCanvas: () => void;
  // JD analysis
  parsedJd: ParsedJd | null;
  jdChecklist: JdMatchItem[];
  setParsedJd: (jd: ParsedJd | null) => void;
  setJdChecklist: (list: JdMatchItem[]) => void;
  // Not needed but passed through
  assessmentContext?: any;
  resumeText?: string;
}

export const CanvasView: React.FC<CanvasViewProps> = ({
  sessionId,
  messages,
  setMessages,
  isLoading,
  setIsLoading,
  apiBase,
  resumeSections,
  originalSections,
  pendingEdits,
  onEditSuggestion,
  onAcceptEdit,
  onSectionContentChange,
  onExitCanvas,
  parsedJd,
  jdChecklist,
  setParsedJd,
  setJdChecklist,
  assessmentContext,
}) => {

  // 被改段落高亮跟踪（中间栏联动）
  const [highlightSectionId, setHighlightSectionId] = useState<string | null>(null);
  // 中栏原文：精确高亮用户选中的文本片段
  const [highlightText, setHighlightText] = useState<string | null>(null);
  // ref 同步：SSE 回调链闭包长，state 可能过期，用 ref 保证始终读到最新值
  const highlightTextRef = useRef<string | null>(null);
  const highlightSectionIdRef = useRef<string | null>(null);
  highlightTextRef.current = highlightText;
  highlightSectionIdRef.current = highlightSectionId;

  // autoStartPrompt 已移除：进入画布后保留对话历史，等用户主动操作
  const [showOriginal, setShowOriginal] = useState(true);
  const originalRef = useRef<HTMLDivElement>(null);
  const optimizedRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 从 DOM 节点向上查找所属 section
  const findSectionFromNode = useCallback((node: Node | null): { id: string; title: string } | null => {
    let el = node instanceof Element ? node : node?.parentElement;
    while (el) {
      // 中栏原文用 data-section-id，右栏优化版用 id="resume-section-X"
      const sectionId = el.getAttribute('data-section-id');
      if (sectionId) {
        const sec = originalSections.find(s => s.id === sectionId) || resumeSections.find(s => s.id === sectionId);
        if (sec) return { id: sectionId, title: sec.title };
      }
      const elId = el.getAttribute('id');
      if (elId?.startsWith('resume-')) {
        const secId = elId.replace('resume-', '');
        const sec = resumeSections.find(s => s.id === secId) || originalSections.find(s => s.id === secId);
        if (sec) return { id: secId, title: sec.title };
      }
      el = el.parentElement;
    }
    return null;
  }, [originalSections, resumeSections]);

  // 选中文本浮动工具栏状态
  const [selectionToolbar, setSelectionToolbar] = useState<{
    text: string;
    top: number;
    left: number;
    sectionId?: string;
    sectionTitle?: string;
  } | null>(null);
  const [externalMessage, setExternalMessage] = useState<string | null>(null);

  // 同步滚动：按滚动百分比对齐
  const handleScroll = useCallback((source: 'original' | 'optimized') => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    const from = source === 'original' ? originalRef.current : optimizedRef.current;
    const to = source === 'original' ? optimizedRef.current : originalRef.current;
    if (from && to) {
      const ratio = from.scrollTop / (from.scrollHeight - from.clientHeight || 1);
      to.scrollTop = ratio * (to.scrollHeight - to.clientHeight || 1);
    }
    requestAnimationFrame(() => { isSyncing.current = false; });
  }, []);

  // AI 编辑建议：用前端记录的选中文本 / sectionId 覆盖 LLM 返回值，确保匹配可靠
  // 读 ref 而非 state，避免 SSE 回调链闭包捕获过期值
  const handleEditSuggestion = useCallback((edit: Omit<PendingEdit, 'status'>) => {
    const frontendText = highlightTextRef.current;
    const frontendSectionId = highlightSectionIdRef.current;
    const enrichedEdit = {
      ...edit,
      ...(frontendText ? { original: frontendText } : {}),
      ...(frontendSectionId ? { sectionId: frontendSectionId } : {}),
    };
    onEditSuggestion(enrichedEdit);
    setHighlightSectionId(edit.sectionId || frontendSectionId);
  }, [onEditSuggestion]);

  // 用户接受改写：清除高亮 + 通知 ResultView 清除 diff
  const handleAcceptEdit = useCallback((sectionId: string) => {
    setHighlightSectionId(null);
    setHighlightText(null);
    onAcceptEdit(sectionId);
  }, [onAcceptEdit]);

  // 中间栏自动滚动到被高亮段落
  useEffect(() => {
    if (highlightSectionId && originalRef.current) {
      const el = originalRef.current.querySelector(`[data-section-id="${highlightSectionId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightSectionId]);

  // 选中文本检测
  const handleMouseUp = useCallback(() => {
    // 延迟一帧，确保 selection 已更新
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;

      const text = sel.toString().trim();
      if (text.length < 6) return;

      // 确保选中内容在简历面板的正文区域内（排除标题、描述等非正文元素）
      const anchor = sel.anchorNode;
      if (!anchor) return;
      const inOriginal = originalRef.current?.contains(anchor);
      const inOptimized = optimizedRef.current?.contains(anchor);
      if (!inOriginal && !inOptimized) return;

      // 必须在 section 正文区域（data-section-content）内，排除标题栏等
      const anchorEl = anchor instanceof Element ? anchor : anchor.parentElement;
      if (!anchorEl?.closest('[data-section-content]')) return;

      // 检测所属 section
      const sectionInfo = findSectionFromNode(anchor);

      // 计算位置
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setSelectionToolbar({
        text,
        top: rect.top < 70 ? rect.bottom : rect.top,  // 靠近顶部时改为下方
        left: rect.left + rect.width / 2,
        sectionId: sectionInfo?.id,
        sectionTitle: sectionInfo?.title,
      });
    });
  }, [findSectionFromNode]);

  // 点击外部关闭工具栏
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setSelectionToolbar(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // 导出 PDF（浏览器打印）
  const handleExportPdf = useCallback(() => {
    window.print();
  }, []);

  // 首次进入画布的使用引导弹窗
  const [showGuide, setShowGuide] = useState(() => {
    return !localStorage.getItem('canvas_guide_shown');
  });
  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    localStorage.setItem('canvas_guide_shown', '1');
  }, []);

  // JD 分析弹窗状态
  const [showJdModal, setShowJdModal] = useState(false);
  const [jdInput, setJdInput] = useState('');
  const [isJdLoading, setIsJdLoading] = useState(false);

  const handleJdAnalyze = useCallback(async () => {
    if (!jdInput.trim() || !sessionId) return;

    // Close modal
    setShowJdModal(false);
    const jdTextToSend = jdInput.trim();
    setJdInput('');

    // Add user message + empty assistant message
    setMessages(prev => [...prev,
      { role: 'user', content: '根据这个 JD 自动优化我的简历' },
      { role: 'assistant', content: '' }
    ]);
    setIsLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/chat/jd-auto-optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, jdText: jdTextToSend }),
      });

      if (!res.ok) throw new Error('优化失败');

      await parseSseStream(
        res,
        // onText: update the last assistant message
        (fullText) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: fullText };
            return updated;
          });
        },
        // onEdit: auto-apply edit to right panel
        (edit) => {
          handleEditSuggestion({
            sectionId: edit.sectionId,
            original: edit.original,
            suggested: edit.suggested,
            rationale: edit.rationale,
          });
        }
      );
    } catch (err: any) {
      console.error('JD auto-optimize failed:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: '抱歉，优化过程中遇到问题，请重试。'
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [jdInput, sessionId, apiBase, setMessages, handleEditSuggestion]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar */}
      <header className="h-12 border-b border-gray-100 flex items-center px-5 gap-4 flex-shrink-0 bg-white z-10 canvas-no-print">
        <button
          onClick={onExitCanvas}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回报告
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <PixelCat size={18} />
          <span className="text-sm font-bold text-gray-800">简历画布</span>
        </div>

        {/* 右侧按钮组 */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowJdModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg transition-colors ${
              parsedJd
                ? 'text-green-700 border-green-200 bg-green-50 hover:bg-green-100'
                : 'text-gray-500 border-gray-200 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <FileSearch className="w-3.5 h-3.5" />
            {parsedJd ? `JD: ${parsedJd.title?.slice(0, 10) || '已锚定'}` : '锚定 JD'}
          </button>
          {!showOriginal && (
            <button
              onClick={() => setShowOriginal(true)}
              className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="显示原文"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleExportPdf}
            disabled={resumeSections.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-[#0A66C2] rounded-lg hover:bg-[#004F90] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            导出 PDF
          </button>
        </div>
      </header>

      {/* Main content - 三栏布局，divide-x 统一分隔线，避免 border-r 导致中/右栏宽度不一致 */}
      <div className="flex-1 flex overflow-hidden divide-x divide-gray-100">
        {/* 左栏: Chat */}
        <div className={`${showOriginal ? 'w-[30%]' : 'w-[40%]'} min-w-[280px] flex flex-col bg-white transition-all duration-300 canvas-no-print`}>
          <CanvasChat
            sessionId={sessionId}
            messages={messages}
            setMessages={setMessages}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            apiBase={apiBase}
            onEditSuggestion={handleEditSuggestion}
            externalMessage={externalMessage}
            onExternalMessageConsumed={() => setExternalMessage(null)}
            autoStartPrompt={undefined}
            pendingEdits={pendingEdits}
            onAcceptEdit={handleAcceptEdit}
            resumeSections={resumeSections}
          />
        </div>

        {/* 中栏: 简历原文（只读） */}
        {showOriginal && (
          <div
            ref={originalRef}
            onScroll={() => handleScroll('original')}
            onMouseUp={handleMouseUp}
            className="w-[35%] overflow-y-auto bg-gray-50/80 canvas-no-print"
          >
            <OriginalResumePanel sections={originalSections} highlightSectionId={highlightSectionId} highlightText={highlightText} onHide={() => setShowOriginal(false)} />
          </div>
        )}

        {/* 右栏: 可编辑简历（含 diff 高亮）— 打印时唯一显示的区域 */}
        <div
          ref={optimizedRef}
          onScroll={() => handleScroll('optimized')}
          onMouseUp={handleMouseUp}
          className={`${showOriginal ? 'w-[35%]' : 'w-[60%]'} overflow-y-auto bg-white transition-all duration-300 canvas-print-area`}
        >
          <ResumePanel
            sections={resumeSections}
            originalSections={originalSections}
            pendingEdits={pendingEdits}
            onContentChange={onSectionContentChange}
          />
        </div>
      </div>

      {/* 选中文本浮动工具栏 */}
      {selectionToolbar && (
        <div
          ref={toolbarRef}
          className="fixed z-[100] flex items-center gap-0.5 bg-white rounded-xl shadow-xl border border-gray-200 px-1.5 py-1"
          style={{
            top: selectionToolbar.top,
            left: selectionToolbar.left,
            transform: selectionToolbar.top < 70
              ? 'translate(-50%, 8px)'           // 靠近顶部：显示在下方
              : 'translate(-50%, -100%) translateY(-8px)',  // 正常：显示在上方
          }}
        >
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => {
                // 设置中栏精确高亮
                if (selectionToolbar.sectionId) {
                  setHighlightSectionId(selectionToolbar.sectionId);
                  setHighlightText(selectionToolbar.text);
                }
                const display = action.display(selectionToolbar.text);
                const prompt = action.prompt(selectionToolbar.text, selectionToolbar.sectionTitle);
                setExternalMessage(`[QUICK:${display}]${prompt}`);
                setSelectionToolbar(null);
                window.getSelection()?.removeAllRanges();
              }}
              disabled={isLoading}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-[#0A66C2] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
            >
              <action.icon className="w-3 h-3" />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* 首次使用引导弹窗 */}
      {showGuide && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] p-7">
            <h3 className="text-lg font-bold text-gray-900 mb-5">简历画布使用指南</h3>
            <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 bg-[#0A66C2] text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">1</span>
                <div>
                  <span className="font-semibold text-gray-800">对话改写</span>
                  <span className="text-gray-500"> — 直接跟 Sparky 说你想改哪里，它会在原文中标记并在优化版本中给出修改</span>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 bg-[#0A66C2] text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">2</span>
                <div>
                  <span className="font-semibold text-gray-800">选中润色</span>
                  <span className="text-gray-500"> — 选中原文中的任意段落，点击"润色"或"精简"，Sparky 直接帮你改</span>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 bg-[#0A66C2] text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">3</span>
                <div>
                  <span className="font-semibold text-gray-800">自由编辑</span>
                  <span className="text-gray-500"> — 你也可以直接在右侧优化版本中手动编辑</span>
                </div>
              </div>
            </div>
            <div className="mt-5 p-3 bg-amber-50 rounded-xl">
              <p className="text-xs text-amber-700">
                <span className="font-semibold">小 tips：</span>Sparky 支持联网搜索岗位 JD，你可以说"帮我搜一下字节的产品经理 JD"，然后让它结合 JD 来定制改写你的简历
              </p>
            </div>
            <button
              onClick={dismissGuide}
              className="mt-5 w-full py-2.5 bg-[#0A66C2] text-white text-sm font-semibold rounded-xl hover:bg-[#084e96] transition-colors"
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* JD 分析弹窗 */}
      {showJdModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl shadow-2xl w-[520px] p-7">
            <h3 className="text-lg font-bold text-gray-900 mb-2">锚定目标 JD</h3>
            <p className="text-xs text-gray-400 mb-4">粘贴岗位 JD 全文或链接，Sparky 将针对该岗位定制化优化你的简历</p>
            <textarea
              value={jdInput}
              onChange={e => setJdInput(e.target.value)}
              placeholder="粘贴 JD 内容或 URL..."
              className="w-full h-48 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#CA7C5E]/20 resize-none"
              disabled={isJdLoading}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowJdModal(false); setJdInput(''); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                disabled={isJdLoading}
              >
                取消
              </button>
              <button
                onClick={handleJdAnalyze}
                disabled={!jdInput.trim() || isJdLoading}
                className="px-5 py-2 bg-[#0A66C2] text-white text-sm font-semibold rounded-xl hover:bg-[#084e96] disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {isJdLoading ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    优化中...
                  </>
                ) : '开始优化'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
