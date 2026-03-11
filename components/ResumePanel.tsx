/**
 * ResumePanel - 画布模式右侧简历预览面板
 * Word 式 diff 高亮（绿增/红删），自由编辑，三态循环：diff → editing → clean
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Pencil, Eye, FileText } from 'lucide-react';
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
  originalSections: ResumeSection[];
  pendingEdits: PendingEdit[];
  onContentChange: (sectionId: string, content: string) => void;
}

// 每个 section 的显示模态
type SectionMode = 'diff' | 'editing' | 'clean';

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
 * Word 式修订标记组件（无操作按钮，hover 显示修改理由）
 */
const DiffMark: React.FC<{
  original: string;
  suggested: string;
  rationale: string;
}> = ({ original, suggested, rationale }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span className="inline">
      {/* 删除的原文 */}
      <span className="bg-red-50 text-red-400 line-through decoration-red-300 rounded px-0.5 text-sm">
        {original}
      </span>
      {/* 新增的文本 */}
      <span
        className="relative bg-green-50 text-green-700 border-b-2 border-green-300 rounded px-0.5 text-sm cursor-help"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {suggested}
        {showTooltip && rationale && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg whitespace-pre-wrap max-w-xs z-50 pointer-events-none">
            {rationale}
            <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-800" />
          </span>
        )}
      </span>
    </span>
  );
};

/**
 * 渲染带 diff 高亮的内容
 * 在已应用的内容中查找 suggested 文本，标记为绿色；original 显示为红色删除线
 */
function renderContentWithDiff(
  content: string,
  sectionEdits: { edit: PendingEdit; idx: number }[],
): React.ReactNode {
  if (sectionEdits.length === 0) {
    return <div className="space-y-2">{renderFormattedContent(cleanResumeContent(content))}</div>;
  }

  // 在 content 中查找每个 edit 的 suggested 文本位置
  type Match = { start: number; end: number; edit: PendingEdit; idx: number };
  const matched: Match[] = [];
  const normalize = (s: string) => s.split(/\s+/).join(' ');

  for (const { edit, idx } of sectionEdits) {
    // 精确匹配 suggested
    const pos = content.indexOf(edit.suggested);
    if (pos !== -1) {
      matched.push({ start: pos, end: pos + edit.suggested.length, edit, idx });
    } else {
      // 模糊匹配：忽略空白差异
      const normSuggested = normalize(edit.suggested);
      let found = false;
      for (let i = 0; i < content.length && !found; i++) {
        for (let len = normSuggested.length; len <= normSuggested.length + 50; len++) {
          if (i + len > content.length) break;
          const candidate = content.slice(i, i + len);
          if (normalize(candidate) === normSuggested) {
            matched.push({ start: i, end: i + len, edit, idx });
            found = true;
            break;
          }
        }
      }
      // 找不到则跳过（用户可能已手动修改）
    }
  }

  matched.sort((a, b) => a.start - b.start);

  // 去除重叠
  const nonOverlapping: Match[] = [];
  for (const m of matched) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (!last || m.start >= last.end) {
      nonOverlapping.push(m);
    }
  }

  // 没有可匹配的 diff，渲染为普通内容
  if (nonOverlapping.length === 0) {
    return <div className="space-y-2">{renderFormattedContent(cleanResumeContent(content))}</div>;
  }

  // 切分文本为 plain + diff 片段
  const fragments: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < nonOverlapping.length; i++) {
    const m = nonOverlapping[i];

    if (cursor < m.start) {
      const plainText = content.slice(cursor, m.start);
      fragments.push(
        <React.Fragment key={`plain-${i}`}>
          {renderFormattedContent(cleanResumeContent(plainText), `plain-${i}-`)}
        </React.Fragment>
      );
    }

    fragments.push(
      <DiffMark
        key={`diff-${i}`}
        original={m.edit.original}
        suggested={m.edit.suggested}
        rationale={m.edit.rationale}
      />
    );

    cursor = m.end;
  }

  if (cursor < content.length) {
    const remaining = content.slice(cursor);
    fragments.push(
      <React.Fragment key="tail">
        {renderFormattedContent(cleanResumeContent(remaining), 'tail-')}
      </React.Fragment>
    );
  }

  return <div className="space-y-2">{fragments}</div>;
}

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
        完成编辑
      </button>
    </div>
  );
};

/**
 * OriginalResumePanel - 三栏布局中间的原文只读面板
 */
export const OriginalResumePanel: React.FC<{
  sections: ResumeSection[];
}> = ({ sections }) => {
  if (sections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p className="text-sm">暂无原始简历</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="mb-2">
        <h2 className="text-base font-bold text-gray-800">简历原文</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">初始版本，仅供参考对比</p>
      </div>

      {sections.map((section) => {
        const typeConfig = SECTION_TYPE_CONFIG[section.type] || SECTION_TYPE_CONFIG.other;

        return (
          <div
            key={section.id}
            className="rounded-2xl border border-gray-100 bg-white/60"
          >
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeConfig.bg} ${typeConfig.color}`}>
                {typeConfig.label}
              </span>
              <h3 className="text-sm font-semibold text-gray-700">{section.title}</h3>
            </div>
            <div className="px-5 py-4 space-y-2">
              {renderFormattedContent(cleanResumeContent(section.content))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * ResumePanel - 右栏优化版本面板
 * 三态循环：diff（查看修改）→ editing（编辑）→ clean（干净预览）→ diff ...
 */
export const ResumePanel: React.FC<ResumePanelProps> = ({
  sections,
  originalSections,
  pendingEdits,
  onContentChange,
}) => {
  const [sectionModes, setSectionModes] = useState<Record<string, SectionMode>>({});

  const getSectionMode = useCallback((sectionId: string): SectionMode => {
    return sectionModes[sectionId] || 'diff';
  }, [sectionModes]);

  const setSectionMode = useCallback((sectionId: string, mode: SectionMode) => {
    setSectionModes(prev => ({ ...prev, [sectionId]: mode }));
  }, []);

  // 当新 AI edit 到达时，将对应 section 重置为 diff 模式并滚动到位
  const prevEditCountRef = useRef(pendingEdits.length);
  useEffect(() => {
    if (pendingEdits.length > prevEditCountRef.current) {
      const newestEdit = pendingEdits[pendingEdits.length - 1];
      if (newestEdit?.sectionId) {
        setSectionMode(newestEdit.sectionId, 'diff');
        const el = document.getElementById(`resume-${newestEdit.sectionId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
    prevEditCountRef.current = pendingEdits.length;
  }, [pendingEdits, setSectionMode]);

  // AI 尚未提供任何建议时，显示占位提示
  if (pendingEdits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-400">优化版本</p>
          <p className="text-xs text-gray-300 mt-1">与 AI 对话后，优化建议将在此显示</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="mb-2">
        <h2 className="text-base font-bold text-gray-800">优化版本</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">绿色为新增内容，红色删除线为原文，点击铅笔可编辑</p>
      </div>

      {sections.map((section) => {
        const typeConfig = SECTION_TYPE_CONFIG[section.type] || SECTION_TYPE_CONFIG.other;
        const sectionEdits = pendingEdits
          .map((edit, idx) => ({ edit, idx }))
          .filter(({ edit }) => edit.sectionId === section.id);

        const mode = getSectionMode(section.id);
        const hasEdits = sectionEdits.length > 0;

        return (
          <div
            key={section.id}
            id={`resume-${section.id}`}
            className={`rounded-2xl border transition-all ${
              mode === 'diff' && hasEdits
                ? 'border-blue-200 shadow-md shadow-blue-50'
                : mode === 'editing'
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
              {/* 铅笔按钮：diff/clean 模式下显示 */}
              {mode !== 'editing' && (
                <button
                  onClick={() => {
                    if (mode === 'clean') {
                      // clean → diff（颜色恢复）
                      setSectionMode(section.id, 'diff');
                    } else {
                      // diff → editing（进入编辑）
                      setSectionMode(section.id, 'editing');
                    }
                  }}
                  className="ml-auto p-1 text-[#CA7C5E] hover:text-[#a8604a] transition-colors"
                  title={mode === 'clean' ? '查看修改' : '编辑此段落'}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Section content */}
            <div className="px-5 py-4">
              {mode === 'editing' ? (
                <SectionEditor
                  section={section}
                  onContentChange={onContentChange}
                  onDone={() => setSectionMode(section.id, 'clean')}
                />
              ) : mode === 'diff' && hasEdits ? (
                renderContentWithDiff(section.content, sectionEdits)
              ) : (
                <div className="space-y-2">
                  {renderFormattedContent(cleanResumeContent(section.content))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
