/**
 * CanvasView - 全屏简历画布（三栏布局）
 * 左侧：AI 对话面板
 * 中间：简历原文（只读，供参考对比）
 * 右侧：优化版本（Word 式 diff 高亮 + 自由编辑）
 */

import React, { useCallback, useRef, useState } from 'react';
import { ArrowLeft, Download, Loader2, PanelLeftClose, PanelLeft } from 'lucide-react';
import { ChatMessage, PixelCat } from './ChatWidget';
import { CanvasChat } from './CanvasChat';
import { ResumePanel, OriginalResumePanel } from './ResumePanel';
import { ResumeSection, PendingEdit } from '../types';

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
  onSectionContentChange: (sectionId: string, content: string) => void;
  onExitCanvas: () => void;
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
  onSectionContentChange,
  onExitCanvas,
}) => {
  const [exporting, setExporting] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  const originalRef = useRef<HTMLDivElement>(null);
  const optimizedRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

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

  // AI 编辑建议：直接转发给 ResultView 处理（自动应用 + 存储 diff 元数据）
  const handleEditSuggestion = useCallback((edit: Omit<PendingEdit, 'status'>) => {
    onEditSuggestion(edit);
  }, [onEditSuggestion]);

  // 导出 PDF
  const handleExportPdf = useCallback(async () => {
    if (!sessionId || exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`${apiBase}/api/chat/resume/export-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '导出失败' }));
        throw new Error(err.error || '导出失败');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '我的简历.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || '导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  }, [sessionId, apiBase, exporting]);


  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar */}
      <header className="h-12 border-b border-gray-100 flex items-center px-5 gap-4 flex-shrink-0 bg-white z-10">
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
        {/* 待处理 badge 已移除：编辑自动应用，无需逐条处理 */}

        {/* 右侧按钮组 */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowOriginal(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title={showOriginal ? '隐藏原文' : '显示原文'}
          >
            {showOriginal ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
            {showOriginal ? '隐藏原文' : '显示原文'}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exporting || resumeSections.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-[#0A66C2] rounded-lg hover:bg-[#004F90] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            导出 PDF
          </button>
        </div>
      </header>

      {/* Main content - 三栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左栏: Chat */}
        <div className={`${showOriginal ? 'w-[30%]' : 'w-[40%]'} min-w-[280px] border-r border-gray-100 flex flex-col bg-white transition-all duration-300`}>
          <CanvasChat
            sessionId={sessionId}
            messages={messages}
            setMessages={setMessages}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            apiBase={apiBase}
            onEditSuggestion={handleEditSuggestion}
          />
        </div>

        {/* 中栏: 简历原文（只读） */}
        {showOriginal && (
          <div
            ref={originalRef}
            onScroll={() => handleScroll('original')}
            className="w-[35%] overflow-y-auto bg-gray-50/80 border-r border-gray-100"
          >
            <OriginalResumePanel sections={originalSections} />
          </div>
        )}

        {/* 右栏: 可编辑简历（含 diff 高亮） */}
        <div
          ref={optimizedRef}
          onScroll={() => handleScroll('optimized')}
          className={`${showOriginal ? 'w-[35%]' : 'w-[60%]'} overflow-y-auto bg-white transition-all duration-300`}
        >
          <ResumePanel
            sections={resumeSections}
            originalSections={originalSections}
            pendingEdits={pendingEdits}
            onContentChange={onSectionContentChange}
          />
        </div>
      </div>
    </div>
  );
};
