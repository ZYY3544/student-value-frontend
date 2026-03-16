/**
 * CanvasView - 全屏简历画布（三栏布局）
 * 左侧：AI 对话面板
 * 中间：简历原文（只读，供参考对比）
 * 右侧：优化版本（Word 式 diff 高亮 + 自由编辑）
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ArrowLeft, Download, PanelLeftClose, PanelLeft, Sparkles, Scissors, Plus } from 'lucide-react';
import { ChatMessage, PixelCat } from './ChatWidget';
import { CanvasChat } from './CanvasChat';
import { ResumePanel, OriginalResumePanel } from './ResumePanel';
import { ResumeSection, PendingEdit } from '../types';

// 选中文本快捷操作
const QUICK_ACTIONS = [
  { label: '润色', icon: Sparkles, prompt: (text: string) => `请润色以下简历内容，使表达更专业流畅：\n「${text}」` },
  { label: '精简', icon: Scissors, prompt: (text: string) => `请精简以下简历内容，保留核心要点：\n「${text}」` },
  { label: '扩充', icon: Plus, prompt: (text: string) => `请扩充以下简历内容，增加量化成果和具体细节：\n「${text}」` },
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
  assessmentContext,
}) => {

  // 构建 Sparky 进入画布时的自动开场指令
  const autoStartPrompt = React.useMemo(() => {
    const ctx = assessmentContext || {};
    const jobTitle = ctx.jobTitle || '';
    const expressionScore = ctx.expressionScore;
    const starScore = ctx.starScore;
    // 找出简历表达力最弱维度
    const dimScores: Record<string, number> = {};
    if (starScore && starScore !== '未知') dimScores['STAR规范度'] = Number(starScore);
    if (ctx.keywordScore && ctx.keywordScore !== '未知') dimScores['关键词覆盖'] = Number(ctx.keywordScore);
    if (ctx.quantifyScore && ctx.quantifyScore !== '未知') dimScores['量化程度'] = Number(ctx.quantifyScore);
    if (ctx.powerScore && ctx.powerScore !== '未知') dimScores['表达力度'] = Number(ctx.powerScore);
    if (ctx.completenessScore && ctx.completenessScore !== '未知') dimScores['信息完整度'] = Number(ctx.completenessScore);
    if (ctx.structureScore && ctx.structureScore !== '未知') dimScores['结构规范度'] = Number(ctx.structureScore);
    const weakest = Object.entries(dimScores).sort((a, b) => a[1] - b[1])[0];
    const weakDim = weakest ? weakest[0] : '';
    const firstSection = resumeSections[1]?.title || resumeSections[0]?.title || '第一段经历';
    return `[CANVAS_AUTO_START] 用户刚进入画布模式。请根据以下信息自动开始第一个改写建议（不要等用户先说话）：简历表达力综合分${expressionScore || '未知'}/100，最弱维度是${weakDim || '未知'}，目标岗位${jobTitle}。建议从「${firstSection}」开始改写。请直接给出改写建议，用 EDIT 指令格式输出。`;
  }, [assessmentContext, resumeSections]);
  const [showOriginal, setShowOriginal] = useState(true);
  const originalRef = useRef<HTMLDivElement>(null);
  const optimizedRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 选中文本浮动工具栏状态
  const [selectionToolbar, setSelectionToolbar] = useState<{
    text: string;
    top: number;
    left: number;
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

  // AI 编辑建议：直接转发给 ResultView 处理（自动应用 + 存储 diff 元数据）
  const handleEditSuggestion = useCallback((edit: Omit<PendingEdit, 'status'>) => {
    onEditSuggestion(edit);
  }, [onEditSuggestion]);

  // 选中文本检测
  const handleMouseUp = useCallback(() => {
    // 延迟一帧，确保 selection 已更新
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;

      const text = sel.toString().trim();
      if (text.length < 6) return;

      // 确保选中内容在简历面板内
      const anchor = sel.anchorNode;
      if (!anchor) return;
      const inOriginal = originalRef.current?.contains(anchor);
      const inOptimized = optimizedRef.current?.contains(anchor);
      if (!inOriginal && !inOptimized) return;

      // 计算位置
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setSelectionToolbar({
        text,
        top: rect.top < 70 ? rect.bottom : rect.top,  // 靠近顶部时改为下方
        left: rect.left + rect.width / 2,
      });
    });
  }, []);

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
            onClick={() => setShowOriginal(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title={showOriginal ? '隐藏原文' : '显示原文'}
          >
            {showOriginal ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
            {showOriginal ? '隐藏原文' : '显示原文'}
          </button>
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

      {/* Main content - 三栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左栏: Chat */}
        <div className={`${showOriginal ? 'w-[30%]' : 'w-[40%]'} min-w-[280px] border-r border-gray-100 flex flex-col bg-white transition-all duration-300 canvas-no-print`}>
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
            autoStartPrompt={autoStartPrompt}
          />
        </div>

        {/* 中栏: 简历原文（只读） */}
        {showOriginal && (
          <div
            ref={originalRef}
            onScroll={() => handleScroll('original')}
            onMouseUp={handleMouseUp}
            className="w-[35%] overflow-y-auto bg-gray-50/80 border-r border-gray-100 canvas-no-print"
          >
            <OriginalResumePanel sections={originalSections} />
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
                setExternalMessage(action.prompt(selectionToolbar.text));
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
    </div>
  );
};
