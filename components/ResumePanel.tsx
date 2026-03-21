/**
 * ResumePanel - 画布模式右侧简历预览面板
 * Word 式 diff 高亮（绿增/红删），自由编辑，三态循环：diff → editing → clean
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Pencil, Eye, FileText, PanelLeftClose } from 'lucide-react';
import { ResumeSection, PendingEdit } from '../types';

/**
 * 清理简历文本：
 * 1. 把单独占一行的 bullet（•·-）合并到下一行前面
 * 2. 修复句中意外断行（上一行末尾不是标点/bullet，下一行开头不是 bullet/空行）
 */
export function cleanResumeContent(raw: string): string {
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
 * 字符级 LCS diff：对比 original 和 suggested，只标记真正变化的部分
 */
interface DiffPart { type: 'same' | 'del' | 'add'; text: string }

function computeCharDiff(original: string, suggested: string): DiffPart[] {
  const a = [...original];
  const b = [...suggested];
  const m = a.length, n = b.length;

  // LCS 动态规划
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // 回溯生成 diff
  const raw: { type: 'same' | 'del' | 'add'; char: string }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.unshift({ type: 'same', char: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'add', char: b[j - 1] });
      j--;
    } else {
      raw.unshift({ type: 'del', char: a[i - 1] });
      i--;
    }
  }

  // 合并连续同类型字符
  const merged: DiffPart[] = [];
  for (const r of raw) {
    if (merged.length > 0 && merged[merged.length - 1].type === r.type) {
      merged[merged.length - 1].text += r.char;
    } else {
      merged.push({ type: r.type, text: r.char });
    }
  }
  return merged;
}

/**
 * Word 式修订标记组件：细粒度 diff，只高亮真正变化的字符
 */
const DiffMark: React.FC<{
  original: string;
  suggested: string;
  rationale: string;
}> = ({ original, suggested }) => {
  const parts = computeCharDiff(original, suggested);

  return (
    <span className="inline">
      {parts.map((p, i) =>
        p.type === 'same' ? (
          <span key={i} className="text-sm text-gray-600">{p.text}</span>
        ) : p.type === 'del' ? (
          <span key={i} className="bg-red-50 text-red-400 line-through decoration-red-300 rounded px-0.5 text-sm">{p.text}</span>
        ) : (
          <span key={i} className="bg-green-50 text-green-700 border-b-2 border-green-300 rounded px-0.5 text-sm">{p.text}</span>
        )
      )}
    </span>
  );
};

/**
 * AcceptedMark - 已采纳的修改：淡绿背景标记，不显示 diff 对比
 */
const AcceptedMark: React.FC<{ text: string }> = ({ text }) => (
  <span className="bg-green-50 text-gray-700 rounded px-0.5 text-sm border-b border-green-200">
    {text}
  </span>
);

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
      m.edit.status === 'accepted' ? (
        <AcceptedMark key={`diff-${i}`} text={content.slice(m.start, m.end)} />
      ) : (
        <DiffMark
          key={`diff-${i}`}
          original={m.edit.original}
          suggested={m.edit.suggested}
          rationale={m.edit.rationale}
        />
      )
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
    <div>
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
    </div>
  );
};

/**
 * 渲染带精确文本高亮的内容：保持原始排版结构，在行内对匹配部分加 mark
 */
function renderFormattedContentWithHighlight(
  raw: string,
  highlightText: string,
  keyPrefix = '',
): React.ReactNode[] {
  const content = cleanResumeContent(raw);

  // 1. 找到高亮区间 [hlStart, hlEnd) —— 精确匹配 or 模糊匹配
  let hlStart = content.indexOf(highlightText);
  let hlLen = highlightText.length;

  if (hlStart === -1) {
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    const normContent = normalize(content);
    const normHighlight = normalize(highlightText);
    const normIdx = normContent.indexOf(normHighlight);
    if (normIdx === -1) return renderFormattedContent(content, keyPrefix);

    // 映射归一化位置回原始位置
    let origIdx = 0, normPos = 0;
    while (normPos < normIdx && origIdx < content.length) {
      if (/\s/.test(content[origIdx]) && (origIdx === 0 || /\s/.test(content[origIdx - 1]))) { origIdx++; continue; }
      origIdx++; normPos++;
    }
    hlStart = origIdx;
    hlLen = 0;
    let normMatchLen = 0;
    while (normMatchLen < normHighlight.length && hlStart + hlLen < content.length) {
      if (/\s/.test(content[hlStart + hlLen]) && hlLen > 0 && /\s/.test(content[hlStart + hlLen - 1])) { hlLen++; continue; }
      hlLen++; normMatchLen++;
    }
  }

  const hlEnd = hlStart + hlLen;

  // 2. 行内高亮辅助：给定文本及其在 content 中的起始偏移，返回带 <mark> 的节点
  const applyHighlight = (text: string, textStart: number, key: string): React.ReactNode => {
    const textEnd = textStart + text.length;
    if (textEnd <= hlStart || textStart >= hlEnd) return text; // 无重叠
    if (textStart >= hlStart && textEnd <= hlEnd) {
      return <mark key={key} className="bg-amber-200/70 rounded px-0.5">{text}</mark>;
    }
    // 部分重叠
    const oStart = Math.max(0, hlStart - textStart);
    const oEnd = Math.min(text.length, hlEnd - textStart);
    return (
      <React.Fragment key={key}>
        {oStart > 0 && text.slice(0, oStart)}
        <mark className="bg-amber-200/70 rounded px-0.5">{text.slice(oStart, oEnd)}</mark>
        {oEnd < text.length && text.slice(oEnd)}
      </React.Fragment>
    );
  };

  // 3. 逐行处理（与 renderFormattedContent 结构完全一致，仅在文本渲染时加高亮）
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let bulletGroup: { text: string; textStart: number }[] = [];
  let groupIdx = 0;
  let offset = 0;

  const flushBullets = () => {
    if (bulletGroup.length === 0) return;
    elements.push(
      <ul key={`${keyPrefix}ul-${groupIdx}`} className="list-disc pl-5 space-y-1.5">
        {bulletGroup.map((item, i) => (
          <li key={i} className="text-sm text-gray-600 leading-relaxed">
            {applyHighlight(item.text, item.textStart, `${keyPrefix}hl-${groupIdx}-${i}`)}
          </li>
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
      offset += line.length + 1;
      continue;
    }

    const leadingSpaces = line.length - line.trimStart().length;

    if (isBulletLine(trimmed)) {
      const bulletText = extractBulletText(trimmed);
      const prefixLen = trimmed.length - bulletText.length;
      bulletGroup.push({ text: bulletText, textStart: offset + leadingSpaces + prefixLen });
    } else {
      flushBullets();
      elements.push(
        <p key={`${keyPrefix}p-${i}`} className="text-sm text-gray-600 leading-relaxed">
          {applyHighlight(trimmed, offset + leadingSpaces, `${keyPrefix}hl-p-${i}`)}
        </p>
      );
    }
    offset += line.length + 1;
  }

  flushBullets();
  return elements;
}

/**
 * OriginalResumePanel - 三栏布局中间的原文只读面板
 */
export const OriginalResumePanel: React.FC<{
  sections: ResumeSection[];
  highlightSectionId?: string | null;
  highlightText?: string | null;
  onHide?: () => void;
}> = ({ sections, highlightSectionId, highlightText, onHide }) => {
  if (sections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p className="text-sm">暂无原始简历</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-800">简历原文</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">初始版本，仅供参考对比</p>
        </div>
        {onHide && (
          <button
            onClick={onHide}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            title="隐藏原文"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {sections.map((section) => {
        const typeConfig = SECTION_TYPE_CONFIG[section.type] || SECTION_TYPE_CONFIG.other;
        const isHighlighted = section.id === highlightSectionId;
        const hasTextHighlight = isHighlighted && !!highlightText;

        return (
          <div
            key={section.id}
            data-section-id={section.id}
            className={`rounded-2xl border transition-all duration-300 ${
              hasTextHighlight
                ? 'border-amber-200 bg-white/60'
                : isHighlighted
                  ? 'bg-amber-50/80 border-amber-200 shadow-md shadow-amber-50'
                  : 'border-gray-100 bg-white/60'
            }`}
          >
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50 min-h-[46px]">
              <h3 className="text-sm font-semibold text-gray-700">{section.title}</h3>
              <div className="ml-auto w-[22px] h-[22px]" />
            </div>
            <div className="px-5 py-4 space-y-2" data-section-content>
              {hasTextHighlight
                ? renderFormattedContentWithHighlight(section.content, highlightText, `orig-${section.id}-`)
                : renderFormattedContent(cleanResumeContent(section.content))}
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

  return (
    <div className="p-6 space-y-5">
      <div className="mb-2">
        <h2 className="text-base font-bold text-gray-800">优化版本</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {pendingEdits.length > 0
            ? '绿色为新增内容，红色删除线为原文，点击铅笔可编辑'
            : '当前显示原文，AI 改写后将自动显示 diff 对比'}
        </p>
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
            data-section-id={section.id}
            className={`rounded-2xl border transition-all ${
              mode === 'diff' && hasEdits
                ? 'border-[#CA7C5E]/30 shadow-md shadow-[#CA7C5E]/5'
                : mode === 'editing'
                  ? 'border-[#CA7C5E]/40 shadow-md ring-1 ring-[#CA7C5E]/10'
                  : 'border-[#CA7C5E]/25 shadow-sm'
            }`}
          >
            {/* Section header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50 min-h-[46px]">
              <h3 className="text-sm font-semibold text-[#CA7C5E]">{section.title}</h3>
              {mode === 'editing' ? (
                <button
                  onClick={() => setSectionMode(section.id, 'clean')}
                  className="ml-auto flex items-center gap-1 text-xs text-[#CA7C5E] hover:text-[#a8604a] transition-colors"
                  title="完成编辑"
                >
                  <Eye className="w-3.5 h-3.5" />
                  完成编辑
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (mode === 'clean') {
                      setSectionMode(section.id, 'diff');
                    } else {
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
            <div className="px-5 py-4" data-section-content>
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
