/**
 * ResumePanel - 画布模式右侧简历预览面板
 * 按 section 分块展示，支持内联 diff 高亮 + 采纳/忽略
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Check, X, Loader2, Pencil, Eye } from 'lucide-react';
import { ResumeSection, PendingEdit } from '../types';

/**
 * 清理简历文本：
 * 1. 把单独占一行的 bullet（•·-）合并到下一行前面
 * 2. 修复句中意外断行（上一行末尾不是标点/bullet，下一行开头不是 bullet/空行）
 */
function cleanResumeContent(raw: string): string {
  const lines = raw.split('\n');
  const merged: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 单独的 bullet 符号（•, ·, -, *, ●, ○），合并到下一行
    if (/^[•·\-*●○]$/.test(trimmed) && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine) {
        merged.push(`${trimmed} ${nextLine}`);
        i++; // 跳过下一行
        continue;
      }
    }

    // 检测句中断行：上一行末尾不是句末标点，当前行也不是 bullet/空行开头
    if (
      merged.length > 0 &&
      trimmed &&
      !/^[•·\-*●○\d]/.test(trimmed) &&        // 当前行不是 bullet 或编号开头
      !/[。！？.!?\n]$/.test(merged[merged.length - 1].trim()) && // 上一行不以句末标点结尾
      !/[：:；;]$/.test(merged[merged.length - 1].trim())          // 上一行也不以冒号分号结尾
    ) {
      merged[merged.length - 1] = merged[merged.length - 1].trimEnd() + trimmed;
      continue;
    }

    merged.push(lines[i]);
  }

  return merged.join('\n');
}

interface ResumePanelProps {
  sections: ResumeSection[];
  pendingEdits: PendingEdit[];
  onAcceptEdit: (editIndex: number) => void;
  onRejectEdit: (editIndex: number) => void;
  onContentChange: (sectionId: string, content: string) => void;
}

// 段落类型 → 中文标签 + 颜色
const SECTION_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  education: { label: '教育经历', color: 'text-blue-600', bg: 'bg-blue-50' },
  internship: { label: '实习经历', color: 'text-green-600', bg: 'bg-green-50' },
  project: { label: '项目经历', color: 'text-purple-600', bg: 'bg-purple-50' },
  competition: { label: '竞赛经历', color: 'text-orange-600', bg: 'bg-orange-50' },
  skill: { label: '技能证书', color: 'text-teal-600', bg: 'bg-teal-50' },
  other: { label: '其他', color: 'text-gray-600', bg: 'bg-gray-50' },
};

/**
 * 判断一行是否是 bullet 行
 */
function isBulletLine(line: string): boolean {
  return /^\s*[•·\-*●○]\s/.test(line) || /^\s*\d+[.)]\s/.test(line);
}

/**
 * 提取 bullet 行的文本（去掉前缀符号）
 */
function extractBulletText(line: string): string {
  return line.replace(/^\s*[•·\-*●○]\s*/, '').replace(/^\s*\d+[.)]\s*/, '');
}

/**
 * 将纯文本渲染为结构化排版的 React 节点
 */
function renderFormattedContent(text: string, keyPrefix = ''): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let bulletGroup: string[] = [];
  let groupIdx = 0;

  const flushBullets = () => {
    if (bulletGroup.length === 0) return;
    elements.push(
      <ul key={`${keyPrefix}ul-${groupIdx}`} className="list-disc pl-5 space-y-1.5">
        {bulletGroup.map((item, i) => (
          <li key={i} className="text-sm text-gray-600 leading-relaxed">{item}</li>
        ))}
      </ul>
    );
    bulletGroup = [];
    groupIdx++;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushBullets();
      elements.push(<div key={`${keyPrefix}sp-${i}`} className="h-1.5" />);
      continue;
    }

    if (isBulletLine(trimmed)) {
      bulletGroup.push(extractBulletText(trimmed));
    } else {
      flushBullets();
      elements.push(
        <p key={`${keyPrefix}p-${i}`} className="text-sm text-gray-600 leading-relaxed">{trimmed}</p>
      );
    }
  }

  flushBullets();
  return elements;
}

/**
 * 内联 Diff 渲染：在正文中高亮被修改的片段
 */
function renderContentWithInlineDiff(
  content: string,
  sectionEdits: { edit: PendingEdit; idx: number }[],
  onAcceptEdit: (idx: number) => void,
  onRejectEdit: (idx: number) => void,
): React.ReactNode {
  if (sectionEdits.length === 0) {
    return <div className="space-y-2">{renderFormattedContent(content)}</div>;
  }

  // 找到每个 edit 的 original 在 content 中的位置
  type Match = { start: number; end: number; edit: PendingEdit; idx: number };
  const matched: Match[] = [];
  const unmatched: { edit: PendingEdit; idx: number }[] = [];

  for (const { edit, idx } of sectionEdits) {
    const pos = content.indexOf(edit.original);
    if (pos !== -1) {
      matched.push({ start: pos, end: pos + edit.original.length, edit, idx });
    } else {
      unmatched.push({ edit, idx });
    }
  }

  // 按位置排序
  matched.sort((a, b) => a.start - b.start);

  // 去除重叠
  const nonOverlapping: Match[] = [];
  for (const m of matched) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (!last || m.start >= last.end) {
      nonOverlapping.push(m);
    } else {
      unmatched.push({ edit: m.edit, idx: m.idx });
    }
  }

  // 切分文本为片段
  const fragments: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < nonOverlapping.length; i++) {
    const m = nonOverlapping[i];

    // 普通文本片段
    if (cursor < m.start) {
      const plainText = content.slice(cursor, m.start);
      fragments.push(
        <React.Fragment key={`plain-${i}`}>
          {renderFormattedContent(plainText, `plain-${i}-`)}
        </React.Fragment>
      );
    }

    // 被编辑的片段 — 内联 diff
    fragments.push(
      <InlineDiffMark
        key={`diff-${i}`}
        original={m.edit.original}
        suggested={m.edit.suggested}
        rationale={m.edit.rationale}
        onAccept={() => onAcceptEdit(m.idx)}
        onReject={() => onRejectEdit(m.idx)}
      />
    );

    cursor = m.end;
  }

  // 剩余文本
  if (cursor < content.length) {
    const remaining = content.slice(cursor);
    fragments.push(
      <React.Fragment key="tail">
        {renderFormattedContent(remaining, 'tail-')}
      </React.Fragment>
    );
  }

  return (
    <div className="space-y-2">
      {fragments}

      {/* 匹配不上的 edit 降级为底部独立卡片 */}
      {unmatched.map(({ edit, idx }) => (
        <FallbackEditCard
          key={`fallback-${idx}`}
          edit={edit}
          onAccept={() => onAcceptEdit(idx)}
          onReject={() => onRejectEdit(idx)}
        />
      ))}
    </div>
  );
}

/**
 * 内联 Diff 标记组件
 */
const InlineDiffMark: React.FC<{
  original: string;
  suggested: string;
  rationale: string;
  onAccept: () => void;
  onReject: () => void;
}> = ({ original, suggested, rationale, onAccept, onReject }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span className="inline">
      {/* 删除线原文 */}
      <span className="bg-red-50 text-red-500 line-through decoration-red-300 rounded px-0.5">
        {original}
      </span>
      {/* 建议文本 */}
      <span
        className="relative bg-green-50 text-green-700 border-b-2 border-green-300 rounded px-0.5 cursor-help"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {suggested}
        {/* Tooltip */}
        {showTooltip && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg whitespace-pre-wrap max-w-xs z-50 pointer-events-none">
            {rationale}
            <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-800" />
          </span>
        )}
      </span>
      {/* 操作按钮 */}
      <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
        <button
          onClick={onAccept}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
          title="采纳"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onClick={onReject}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
          title="忽略"
        >
          <X className="w-3 h-3" />
        </button>
      </span>
    </span>
  );
};

/**
 * 降级卡片：当 edit 的 original 在 content 中找不到时使用
 */
const FallbackEditCard: React.FC<{
  edit: PendingEdit;
  onAccept: () => void;
  onReject: () => void;
}> = ({ edit, onAccept, onReject }) => (
  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/30 overflow-hidden">
    <div className="p-4 space-y-3">
      <div>
        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">原文</span>
        <p className="text-sm text-red-600 line-through mt-1 leading-relaxed bg-red-50 rounded-lg px-3 py-2">
          {edit.original}
        </p>
      </div>
      <div>
        <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">建议改为</span>
        <p className="text-sm text-green-700 mt-1 leading-relaxed bg-green-50 rounded-lg px-3 py-2 font-medium">
          {edit.suggested}
        </p>
      </div>
      <p className="text-xs text-gray-500 italic">
        修改理由：{edit.rationale}
      </p>
    </div>
    <div className="flex border-t border-blue-100">
      <button
        onClick={onAccept}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors"
      >
        <Check className="w-4 h-4" />
        采纳
      </button>
      <div className="w-px bg-blue-100" />
      <button
        onClick={onReject}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
      >
        <X className="w-4 h-4" />
        忽略
      </button>
    </div>
  </div>
);

/**
 * 单个段落编辑区域
 */
const SectionEditor: React.FC<{
  section: ResumeSection;
  onContentChange: (sectionId: string, content: string) => void;
  onDone: () => void;
}> = ({ section, onContentChange, onDone }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
    textareaRef.current?.focus();
  }, [adjustHeight]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        defaultValue={section.content}
        onChange={(e) => {
          onContentChange(section.id, e.target.value);
          adjustHeight();
        }}
        className="w-full text-sm text-gray-600 leading-relaxed bg-transparent border-none outline-none resize-none focus:ring-0 p-0"
        spellCheck={false}
      />
      <button
        onClick={onDone}
        className="absolute top-0 right-0 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
        title="完成编辑"
      >
        <Eye className="w-3.5 h-3.5" />
        预览
      </button>
    </div>
  );
};

export const ResumePanel: React.FC<ResumePanelProps> = ({
  sections,
  pendingEdits,
  onAcceptEdit,
  onRejectEdit,
  onContentChange,
}) => {
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  // 当新 edit 出现时，自动滚动到对应 section + 退出编辑模式
  const prevEditCountRef = useRef(pendingEdits.length);
  useEffect(() => {
    if (pendingEdits.length > prevEditCountRef.current) {
      setEditingSectionId(null);
      const newestEdit = pendingEdits[pendingEdits.length - 1];
      if (newestEdit?.sectionId) {
        const el = document.getElementById(`resume-${newestEdit.sectionId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
    prevEditCountRef.current = pendingEdits.length;
  }, [pendingEdits]);

  if (sections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
          <p className="text-sm">正在解析简历结构...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="mb-2">
        <h2 className="text-lg font-bold text-gray-800">简历内容</h2>
        <p className="text-xs text-gray-400 mt-1">点击段落右上角铅笔图标可手动编辑，修改自动保存</p>
      </div>

      {sections.map((section) => {
        const typeConfig = SECTION_TYPE_CONFIG[section.type] || SECTION_TYPE_CONFIG.other;
        const sectionEdits = pendingEdits
          .map((edit, idx) => ({ edit, idx }))
          .filter(({ edit }) => edit.sectionId === section.id && edit.status === 'pending');

        const isEditing = editingSectionId === section.id;
        const hasPendingEdits = sectionEdits.length > 0;
        const cleanedContent = cleanResumeContent(section.content);

        return (
          <div
            key={section.id}
            id={`resume-${section.id}`}
            className={`rounded-2xl border transition-all ${
              hasPendingEdits
                ? 'border-blue-200 shadow-md shadow-blue-50'
                : isEditing
                  ? 'border-blue-300 shadow-md ring-1 ring-blue-100'
                  : 'border-gray-100 shadow-sm'
            }`}
          >
            {/* Section header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeConfig.bg} ${typeConfig.color}`}>
                {typeConfig.label}
              </span>
              <h3 className="text-sm font-semibold text-gray-800">{section.title}</h3>
              {/* 编辑按钮（有 pending edits 时隐藏） */}
              {!hasPendingEdits && !isEditing && (
                <button
                  onClick={() => setEditingSectionId(section.id)}
                  className="ml-auto p-1 text-gray-300 hover:text-blue-500 transition-colors"
                  title="编辑此段落"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Section content */}
            <div className="px-5 py-4">
              {isEditing ? (
                <SectionEditor
                  section={section}
                  onContentChange={onContentChange}
                  onDone={() => setEditingSectionId(null)}
                />
              ) : (
                renderContentWithInlineDiff(cleanedContent, sectionEdits, onAcceptEdit, onRejectEdit)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
