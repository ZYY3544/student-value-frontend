/**
 * CanvasView - 全屏简历画布
 * 左侧：AI 对话面板
 * 右侧：简历实时预览面板（带 diff 高亮）
 */

import React, { useCallback, useState } from 'react';
import { ArrowLeft, PenLine, Download, Loader2 } from 'lucide-react';
import { ChatMessage } from './ChatWidget';
import { CanvasChat } from './CanvasChat';
import { ResumePanel } from './ResumePanel';
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
  pendingEdits: PendingEdit[];
  setPendingEdits: React.Dispatch<React.SetStateAction<PendingEdit[]>>;
  onAcceptEdit: (editIndex: number) => void;
  onRejectEdit: (editIndex: number) => void;
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
  pendingEdits,
  setPendingEdits,
  onAcceptEdit,
  onRejectEdit,
  onExitCanvas,
}) => {
  const [exporting, setExporting] = useState(false);

  // 处理 AI 的编辑建议
  const handleEditSuggestion = useCallback((edit: Omit<PendingEdit, 'status'>) => {
    setPendingEdits(prev => [...prev, { ...edit, status: 'pending' }]);
  }, [setPendingEdits]);

  // 导出 Word
  const handleExportWord = useCallback(async () => {
    if (!sessionId || exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`${apiBase}/api/chat/resume/export`, {
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
      a.download = '我的简历.docx';
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
          <PenLine className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold text-gray-800">简历画布</span>
        </div>
        {pendingEdits.filter(e => e.status === 'pending').length > 0 && (
          <span className="ml-2 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            {pendingEdits.filter(e => e.status === 'pending').length} 条待处理
          </span>
        )}

        {/* 右侧导出按钮 */}
        <div className="ml-auto">
          <button
            onClick={handleExportWord}
            disabled={exporting || resumeSections.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-[#0A66C2] rounded-lg hover:bg-[#004F90] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            导出 Word
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat */}
        <div className="w-[45%] border-r border-gray-100 flex flex-col bg-white">
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

        {/* Right: Resume preview */}
        <div className="w-[55%] overflow-y-auto bg-gray-50/50">
          <ResumePanel
            sections={resumeSections}
            pendingEdits={pendingEdits}
            onAcceptEdit={onAcceptEdit}
            onRejectEdit={onRejectEdit}
          />
        </div>
      </div>
    </div>
  );
};
