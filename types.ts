export interface AssessmentInput {
  assessmentType: 'CV';
  city: string;
  industry: string;
  jobTitle: string;
  jobFunction: string;
  jobFunctions?: string[];  // 多岗位对比（最多3个）
  resumeText: string;
  resumeFile?: {
    mimeType: string;
    data: string;
  } | null;
  resumeFileName?: string;
  educationLevel: string;
  major: string;
  companyType: string;
  targetCompany: string;
}

// 单个能力维度
export interface AbilityItem {
  score: number;      // 分数 (0-100)
  level: string;      // 等级: 'high' | 'medium' | 'low'
  grade?: string;     // 原始档位 (e.g. "E", "II", "3")
  explanation: string; // 能力解释文案
}

// 5能力维度
export interface Abilities {
  专业力: AbilityItem;
  管理力: AbilityItem;
  合作力: AbilityItem;
  思辨力: AbilityItem;
  创新力: AbilityItem;
}

// 雷达图数据
export interface RadarData {
  专业力: number;
  管理力: number;
  合作力: number;
  思辨力: number;
  创新力: number;
}

// Part 2: 简历表达力诊断
export interface ExpressionDimension {
  score: number;        // 0-100
  level: string;        // 'high' | 'medium' | 'low'
  tip: string;          // 改进建议
}

export interface ResumeExpression {
  overallScore: number;   // 综合表达力评分 0-100
  dimensions: {
    量化程度: ExpressionDimension;
    STAR规范度: ExpressionDimension;
    信息完整度: ExpressionDimension;
    表达力度: ExpressionDimension;
    关键词覆盖: ExpressionDimension;
    结构规范度: ExpressionDimension;
  };
}

// Part 3: 岗位竞争力对比
export interface JobComparison {
  jobFunction: string;       // 岗位名称
  salaryRange: string;       // 薪酬区间
  matchScore: number;        // 匹配度 0-100
  coreDuties: string;        // 核心职责（3-4个关键词）
}

export interface AssessmentResult {
  // === Part 1: 能力画像 ===
  level: number;
  abilityScore?: number;           // 能力评分 0-100
  levelTag: string;                // 专业段位名称（如"独立执行者"）
  levelDesc: string;               // 段位描述
  abilities?: Abilities;
  radarData?: RadarData;
  abilitySummary?: string;
  abilityCompetitiveness?: number; // 能力百分位

  // === Part 2: 简历表达力诊断 ===
  resumeExpression?: ResumeExpression;  // 6维度表达力诊断
  resumeHealthScore?: number;           // 综合表达力评分（兼容旧字段）

  // === Part 3: 岗位竞争力对比 ===
  jobComparisons?: JobComparison[];     // 多岗位对比
  recommendedJob?: string | null;       // 推荐岗位

  // === 市场薪酬（主岗位，向后兼容） ===
  salaryRange?: string;
  marketSalary?: {
    range: string;
    note: string;
    city: string;
    industry: string;
    function: string;
  };
  salaryCompetitiveness?: number;

  // === 其他 ===
  schoolTier?: string;
  factors?: Record<string, string>;
  logId?: number;
  greeting?: string;
  resumeText?: string;
  // 预拆分的简历段落（评测阶段并行生成）
  resumeSections?: { type: string; title: string; content: string }[];

  // 旧字段（向后兼容）
  jobValue?: string;
  personValue?: string;
  currency?: string;
  strengths?: string[];
  weaknesses?: string[];
  resumeAdvice?: string;
}

// 简历画布（Canvas）相关类型
export interface ResumeSection {
  id: string;            // "section-0", "section-1"
  type: string;          // "education" | "internship" | "project" | "skill" | "other"
  title: string;         // "字节跳动-产品实习"
  content: string;       // 当前内容（采纳编辑后更新）
  highlightRanges?: { start: number; end: number }[]; // JD 优化后的高亮区间，自动淡出
}

export interface PendingEdit {
  editId: string;        // 唯一标识，用于定位单个 edit
  sectionId: string;
  original: string;      // 被替换的原文
  suggested: string;     // 建议替换为
  rationale: string;     // 修改理由
  status: 'pending' | 'accepted' | 'rejected';
}

// JD Analysis
export interface JdRequirement {
  name: string;
  description: string;
  priority: 'must' | 'preferred' | 'nice';
}

export interface ParsedJd {
  title: string;
  company?: string;
  requirements: JdRequirement[];
  keywords: string[];
  responsibilities: string[];
}

export interface JdMatchItem {
  requirement: string;
  status: 'covered' | 'partial' | 'missing';
  evidence?: string;
  suggestion?: string;
}

// 简历版本快照
export interface ResumeVersion {
  id: string;                    // uuid
  name: string;                  // 版本显示名称
  sections: ResumeSection[];     // 各段落内容快照
  pendingEdits: PendingEdit[];   // diff 状态快照
  jdContent: string | null;      // 关联的 JD 内容
  createdAt: number;             // Date.now()
  updatedAt: number;             // 最近编辑时间
  isProtected?: boolean;         // 受保护版本，不可删除
  versionType?: 'original' | 'general' | 'jd';  // 原始简历 | 通用版 | JD版本
}

export enum AppState {
  AUTH = 'AUTH',
  FORM = 'FORM',
  LOADING = 'LOADING',
  RESULT = 'RESULT',
  HISTORY = 'HISTORY',
}
