/**
 * ResumePanel - 画布模式右侧简历预览面板
 * Word 式 diff 高亮（绿增/红删），自由编辑，三态循环：diff → editing → clean
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Pencil, Eye, ChevronDown, Trash2, Plus, Check, X, PenLine } from 'lucide-react';
import { ResumeSection, PendingEdit, ResumeVersion } from '../types';

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
  pendingEdits: PendingEdit[];
  onContentChange: (sectionId: string, content: string) => void;
}

// 版本选择器下拉组件
function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

export const VersionSelector: React.FC<{
  versions: ResumeVersion[];
  activeVersionId: string | null;
  onSave: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  hasPendingJd?: boolean;
}> = ({ versions, activeVersionId, onSave, onSwitch, onDelete, onRename, hasPendingJd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeVersion = versions.find(v => v.id === activeVersionId);
  const atLimit = versions.length >= 5;

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleRenameSubmit = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) onRename(id, trimmed);
    setRenamingId(null);
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setIsOpen(prev => !prev); setConfirmDeleteId(null); setRenamingId(null); }}
        className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
      >
        <span className="max-w-[120px] truncate">{activeVersion ? activeVersion.name : '当前编辑'}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => { setIsOpen(false); setConfirmDeleteId(null); setRenamingId(null); }} />
          <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-[200] py-1 overflow-hidden">
            {/* 已保存版本列表 */}
            {versions.length > 0 ? (
              versions.map(v => (
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
                        {renamingId === v.id ? (
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={() => handleRenameSubmit(v.id)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(v.id); if (e.key === 'Escape') setRenamingId(null); }}
                            onClick={e => e.stopPropagation()}
                            className="text-sm text-gray-800 bg-white border border-[#0A66C2] rounded px-1.5 py-0.5 outline-none w-full"
                          />
                        ) : (
                          <span className="text-sm text-gray-800 truncate block">
                            {v.name}
                            {v.id === activeVersionId && <span className="ml-1.5 text-[10px] text-[#0A66C2] font-medium">当前</span>}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 block mt-0.5">
                          {formatTime(v.updatedAt || v.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        {!v.isProtected && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setRenamingId(v.id); setRenameValue(v.name); }}
                            className="p-1 text-gray-300 hover:text-gray-600 rounded"
                            title="重命名"
                          >
                            <PenLine className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!v.isProtected && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(v.id); }}
                            className="p-1 text-gray-300 hover:text-red-500 rounded"
                            title="删除版本"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">暂无保存的版本</div>
            )}

            {/* 版本满 + 有待保存的 JD 版本时提示 */}
            {hasPendingJd && atLimit && (
              <div className="mx-2 my-1 px-2.5 py-2 bg-amber-50 rounded-lg text-[11px] text-amber-700 leading-relaxed">
                JD 改写结果已暂存，删除一个版本后将自动保存
              </div>
            )}

            {/* 分隔线 + 保存按钮 */}
            <div className="h-px bg-gray-100 my-1" />
            <button
              onClick={() => { if (!atLimit) { onSave(); setIsOpen(false); } }}
              disabled={atLimit}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                atLimit ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
              title={atLimit ? '最多保存 5 个版本，请先删除' : ''}
            >
              <Plus className="w-3.5 h-3.5" />
              {atLimit ? '已达上限，请先删除' : '保存当前为新版本'}
            </button>
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
 * ResumePanel - 右栏简历面板
 * 三态循环：diff（查看修改）→ editing（编辑）→ clean（干净预览）→ diff ...
 */
export const ResumePanel: React.FC<ResumePanelProps> = ({
  sections,
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
