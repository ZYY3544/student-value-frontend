/**
 * ResumePanel - 画布模式右侧简历预览面板
 * Word 式 diff 高亮（绿增/红删），自由编辑，三态循环：diff → editing → clean
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Pencil, Eye, ChevronDown, Trash2, Check, X } from 'lucide-react';
import { ResumeSection, PendingEdit, ResumeVersion } from '../types';

interface ResumePanelProps {
  sections: ResumeSection[];
  pendingEdits: PendingEdit[];
  onContentChange: (sectionId: string, content: string) => void;
  readOnly?: boolean;
}

// 版本选择器下拉组件
function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

export const VersionSelector: React.FC<{
  versions: ResumeVersion[];
  activeVersionId: string | null;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ versions, activeVersionId, onSwitch, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const activeVersion = versions.find(v => v.id === activeVersionId);

  // 排序：通用版在前，JD版本按时间，原始简历在最后
  const sorted = [...versions].sort((a, b) => {
    if (a.versionType === 'general') return -1;
    if (b.versionType === 'general') return 1;
    if (a.versionType === 'original') return 1;
    if (b.versionType === 'original') return -1;
    return a.createdAt - b.createdAt;
  });

  const jdCount = versions.filter(v => v.versionType === 'jd').length;

  return (
    <div className="relative">
      <button
        onClick={() => { setIsOpen(prev => !prev); setConfirmDeleteId(null); }}
        className="flex items-center gap-1 px-2 py-0.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
      >
        <span className="max-w-[160px] truncate">{activeVersion ? activeVersion.name : '版本管理'}</span>
        {activeVersion?.versionType === 'general' && <span className="text-[10px] text-gray-400 ml-0.5">自动保存</span>}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => { setIsOpen(false); setConfirmDeleteId(null); }} />
          <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-[200] py-1 overflow-hidden">
            {sorted.map(v => (
              <div key={v.id} className="group relative">
                {confirmDeleteId === v.id ? (
                  <div className="flex items-center justify-between px-3 py-2 bg-red-50">
                    <span className="text-xs text-red-600">确认删除？</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { onDelete(v.id); setConfirmDeleteId(null); }} className="p-1 text-red-600 hover:bg-red-100 rounded">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`flex items-center px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${v.id === activeVersionId ? 'bg-blue-50/50' : ''}`}
                    onClick={() => { onSwitch(v.id); setIsOpen(false); }}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-800 truncate block">
                        {v.name}
                        {v.id === activeVersionId && <span className="ml-1.5 text-[10px] text-[#0A66C2] font-medium">编辑中</span>}
                        {v.versionType === 'original' && v.id !== activeVersionId && <span className="ml-1.5 text-[10px] text-gray-400">只读</span>}
                      </span>
                      {v.versionType === 'jd' && (
                        <span className="text-[10px] text-gray-400 block mt-0.5">{formatTime(v.createdAt)}</span>
                      )}
                    </div>
                    {v.versionType === 'jd' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(v.id); }}
                        className="p-1 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all"
                        title="删除版本"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {jdCount >= 5 && (
              <div className="mx-2 my-1 px-2.5 py-2 bg-amber-50 rounded-lg text-[11px] text-amber-700 leading-relaxed">
                JD 版本已达上限（5个），请先删除再上传新 JD
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

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
 * 渲染带 inline diff 高亮的内容
 * content 是原文（未替换），在 edit.original 的位置嵌入 DiffMark，前后正常渲染
 */
/** 流式显示高亮文本：逐字显示 + 透明占位（无布局跳动） */
const StreamHighlight: React.FC<{ text: string }> = ({ text }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    // 速度：总时长 = min(text.length * 25ms, 2000ms)，至少 15ms/字
    const speed = Math.max(15, Math.min(25, 2000 / text.length));
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setProgress(i);
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text]);

  if (progress >= text.length) {
    return <span className="bg-green-50 border-b-2 border-green-200 rounded-sm">{text}</span>;
  }

  return (
    <>
      <span className="bg-green-50 border-b-2 border-green-200 rounded-sm">{text.slice(0, progress)}</span>
      <span style={{ color: 'transparent' }}>{text.slice(progress)}</span>
    </>
  );
};

/** 渲染带流式绿色高亮的内容（JD 优化后标记改过的区间） */
function renderWithHighlights(content: string, ranges: { start: number; end: number }[]): React.ReactNode {
  if (!ranges.length) return content;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const start = Math.max(r.start, cursor);
    const end = Math.min(r.end, content.length);
    if (start > end) continue;
    if (cursor < start) fragments.push(content.slice(cursor, start));
    fragments.push(<StreamHighlight key={`hl-${i}`} text={content.slice(start, end)} />);
    cursor = end;
  }
  if (cursor < content.length) fragments.push(content.slice(cursor));
  return fragments;
}

function findOriginalPosition(content: string, original: string): { start: number; length: number } | null {
  // 精确匹配
  const pos = content.indexOf(original);
  if (pos !== -1) return { start: pos, length: original.length };

  // normalize fallback：去掉空格换行差异
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  const normContent = normalize(content);
  const normOriginal = normalize(original);
  const normIdx = normContent.indexOf(normOriginal);
  if (normIdx === -1) return null;

  // 映射回原始位置
  let ci = 0, normPos = 0;
  while (normPos < normIdx && ci < content.length) {
    if (/\s/.test(content[ci]) && ci > 0 && /\s/.test(content[ci - 1])) { ci++; continue; }
    ci++; normPos++;
  }
  const matchStart = ci;
  let matchLen = 0, normMatchLen = 0;
  while (normMatchLen < normOriginal.length && ci < content.length) {
    if (/\s/.test(content[ci]) && ci > matchStart && /\s/.test(content[ci - 1])) { ci++; matchLen++; continue; }
    ci++; matchLen++; normMatchLen++;
  }
  return matchLen > 0 ? { start: matchStart, length: matchLen } : null;
}

function renderContentWithDiff(
  content: string,
  sectionEdits: { edit: PendingEdit; idx: number }[],
): React.ReactNode {
  if (sectionEdits.length === 0) {
    return <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{content}</div>;
  }

  // 找到所有 edit 在 content 中的位置，按位置排序
  type MatchedEdit = { start: number; length: number; edit: PendingEdit };
  const matched: MatchedEdit[] = [];
  const unmatched: PendingEdit[] = [];

  for (const { edit } of sectionEdits) {
    const pos = findOriginalPosition(content, edit.original);
    if (pos) {
      matched.push({ start: pos.start, length: pos.length, edit });
    } else {
      unmatched.push(edit);
    }
  }

  matched.sort((a, b) => a.start - b.start);

  // 去除重叠
  const nonOverlapping: MatchedEdit[] = [];
  for (const m of matched) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (!last || m.start >= last.start + last.length) {
      nonOverlapping.push(m);
    }
  }

  if (nonOverlapping.length === 0 && unmatched.length === 0) {
    return <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{content}</div>;
  }

  // 切割渲染：plain → DiffMark → plain → DiffMark → ...
  const fragments: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < nonOverlapping.length; i++) {
    const m = nonOverlapping[i];
    if (cursor < m.start) {
      fragments.push(content.slice(cursor, m.start));
    }
    fragments.push(
      <DiffMark key={m.edit.editId} original={m.edit.original} suggested={m.edit.suggested} rationale={m.edit.rationale} />
    );
    cursor = m.start + m.length;
  }
  if (cursor < content.length) {
    fragments.push(content.slice(cursor));
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{fragments}</div>
      {/* 匹配不上的 edit fallback 到底部卡片 */}
      {unmatched.map(edit => (
        <div key={edit.editId} className="rounded-xl border border-[#CA7C5E]/20 bg-[#FDF5F0]/50 px-4 py-3">
          <div className="text-[11px] font-medium text-[#CA7C5E] mb-2">修改对比</div>
          <DiffMark original={edit.original} suggested={edit.suggested} rationale={edit.rationale} />
        </div>
      ))}
    </div>
  );
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
 * ResumePanel - 右栏简历面板
 * 三态循环：diff（查看修改）→ editing（编辑）→ clean（干净预览）→ diff ...
 */
export const ResumePanel: React.FC<ResumePanelProps> = ({
  sections,
  pendingEdits,
  onContentChange,
  readOnly = false,
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
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-800">简历</h2>
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {pendingEdits.length > 0
            ? '绿色为新增内容，红色删除线为原文，点击铅笔可编辑'
            : 'AI 改写后将自动显示 diff 对比，点击铅笔可手动编辑'}
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
              {!readOnly && (
                mode === 'editing' ? (
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
                )
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
              ) : section.highlightRanges?.length ? (
                <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {renderWithHighlights(section.content, section.highlightRanges)}
                </div>
              ) : (
                <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {section.content}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
