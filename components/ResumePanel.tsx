/**
 * ResumePanel - 画布模式右侧简历预览面板
 * 按 section 分块展示，支持 diff 高亮 + 采纳/忽略
 */

import React, { useEffect, useRef } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
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

export const ResumePanel: React.FC<ResumePanelProps> = ({
  sections,
  pendingEdits,
  onAcceptEdit,
  onRejectEdit,
}) => {
  // 当新 edit 出现时，自动滚动到对应 section
  const prevEditCountRef = useRef(pendingEdits.length);
  useEffect(() => {
    if (pendingEdits.length > prevEditCountRef.current) {
      // 找到最新添加的 edit 对应的 sectionId
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
        <p className="text-xs text-gray-400 mt-1">AI 的修改建议会在对应段落中高亮显示</p>
      </div>

      {sections.map((section) => {
        const typeConfig = SECTION_TYPE_CONFIG[section.type] || SECTION_TYPE_CONFIG.other;
        // 找到这个 section 的所有 pending edits
        const sectionEdits = pendingEdits
          .map((edit, idx) => ({ edit, idx }))
          .filter(({ edit }) => edit.sectionId === section.id && edit.status === 'pending');

        return (
          <div
            key={section.id}
            id={`resume-${section.id}`}
            className={`rounded-2xl border transition-all ${
              sectionEdits.length > 0
                ? 'border-blue-200 shadow-md shadow-blue-50'
                : 'border-gray-100 shadow-sm'
            }`}
          >
            {/* Section header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeConfig.bg} ${typeConfig.color}`}>
                {typeConfig.label}
              </span>
              <h3 className="text-sm font-semibold text-gray-800">{section.title}</h3>
            </div>

            {/* Section content */}
            <div className="px-5 py-4">
              <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {cleanResumeContent(section.content)}
              </div>

              {/* Pending edits for this section */}
              {sectionEdits.map(({ edit, idx }) => (
                <div key={idx} className="mt-4 rounded-xl border border-blue-100 bg-blue-50/30 overflow-hidden">
                  {/* Diff display */}
                  <div className="p-4 space-y-3">
                    {/* Original - strikethrough red */}
                    <div>
                      <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">原文</span>
                      <p className="text-sm text-red-600 line-through mt-1 leading-relaxed bg-red-50 rounded-lg px-3 py-2">
                        {edit.original}
                      </p>
                    </div>

                    {/* Suggested - highlighted green */}
                    <div>
                      <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">建议改为</span>
                      <p className="text-sm text-green-700 mt-1 leading-relaxed bg-green-50 rounded-lg px-3 py-2 font-medium">
                        {edit.suggested}
                      </p>
                    </div>

                    {/* Rationale */}
                    <p className="text-xs text-gray-500 italic">
                      修改理由：{edit.rationale}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex border-t border-blue-100">
                    <button
                      onClick={() => onAcceptEdit(idx)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      采纳
                    </button>
                    <div className="w-px bg-blue-100" />
                    <button
                      onClick={() => onRejectEdit(idx)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      忽略
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
