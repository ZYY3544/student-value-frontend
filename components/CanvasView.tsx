/**
 * CanvasView - 全屏简历画布（三栏布局）
 * 左侧：AI 对话面板
 * 中间：简历原文（只读，供参考对比）
 * 右侧：优化版本（Word 式 diff 高亮 + 自由编辑 + 版本管理）
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ArrowLeft, Download, Sparkles } from 'lucide-react';
import { ChatMessage, PixelCat } from './ChatWidget';
import { CanvasChat } from './CanvasChat';
import { ResumePanel, OriginalResumePanel } from './ResumePanel';
import { ResumeSection, PendingEdit, ResumeVersion } from '../types';

// 选中文本快捷操作
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
  // Version management
  versions: ResumeVersion[];
  activeVersionId: string | null;
  onSaveVersion: () => void;
  onSwitchVersion: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
  onRenameVersion: (versionId: string, newName: string) => void;
  onJdVersionCreate: (jdContent: string) => void;
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
  versions,
  activeVersionId,
  onSaveVersion,
  onSwitchVersion,
  onDeleteVersion,
  onRenameVersion,
  onJdVersionCreate,
  assessmentContext,
}) => {

  // 被改段落高亮跟踪（中间栏联动）
  const [highlightSectionId, setHighlightSectionId] = useState<string | null>(null);
  const [highlightText, setHighlightText] = useState<string | null>(null);
  const highlightTextRef = useRef<string | null>(null);
  const highlightSectionIdRef = useRef<string | null>(null);
  highlightTextRef.current = highlightText;
  highlightSectionIdRef.current = highlightSectionId;

  const [showOriginal, setShowOriginal] = useState(true);
  const originalRef = useRef<HTMLDivElement>(null);
  const optimizedRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 从 DOM 节点向上查找所属 section
  const findSectionFromNode = useCallback((node: Node | null): { id: string; title: string } | null => {
    let el = node instanceof Element ? node : node?.parentElement;
    while (el) {
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

  // 同步滚动
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

  const handleAcceptEdit = useCallback((sectionId: string) => {
    setHighlightSectionId(null);
    setHighlightText(null);
    onAcceptEdit(sectionId);
  }, [onAcceptEdit]);

  useEffect(() => {
    if (highlightSectionId && originalRef.current) {
      const el = originalRef.current.querySelector(`[data-section-id="${highlightSectionId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightSectionId]);

  const handleMouseUp = useCallback(() => {
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length < 6) return;
      const anchor = sel.anchorNode;
      if (!anchor) return;
      const inOriginal = originalRef.current?.contains(anchor);
      const inOptimized = optimizedRef.current?.contains(anchor);
      if (!inOriginal && !inOptimized) return;
      const anchorEl = anchor instanceof Element ? anchor : anchor.parentElement;
      if (!anchorEl?.closest('[data-section-content]')) return;
      const sectionInfo = findSectionFromNode(anchor);
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionToolbar({
        text,
        top: rect.top < 70 ? rect.bottom : rect.top,
        left: rect.left + rect.width / 2,
        sectionId: sectionInfo?.id,
        sectionTitle: sectionInfo?.title,
      });
    });
  }, [findSectionFromNode]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setSelectionToolbar(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const handleExportPdf = useCallback(() => { window.print(); }, []);

  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem('canvas_guide_shown'));
  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    localStorage.setItem('canvas_guide_shown', '1');
  }, []);

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

        <div className="ml-auto flex items-center gap-2">
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

      {/* Main content */}
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
            onJdVersionCreate={onJdVersionCreate}
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
            <OriginalResumePanel sections={originalSections} highlightSectionId={highlightSectionId} highlightText={highlightText} />
          </div>
        )}

        {/* 右栏: 优化版本 */}
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
            showOriginal={showOriginal}
            onToggleOriginal={() => setShowOriginal(prev => !prev)}
            versions={versions}
            activeVersionId={activeVersionId}
            onSaveVersion={onSaveVersion}
            onSwitchVersion={onSwitchVersion}
            onDeleteVersion={onDeleteVersion}
            onRenameVersion={onRenameVersion}
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
              ? 'translate(-50%, 8px)'
              : 'translate(-50%, -100%) translateY(-8px)',
          }}
        >
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => {
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
                  <span className="text-gray-500"> — 选中原文中的任意段落，点击"润色"，Sparky 直接帮你改</span>
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
    </div>
  );
};
