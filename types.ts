export interface AssessmentInput {
  assessmentType: 'CV';
  city: string;
  industry: string;
  jobTitle: string;
  jobFunction: string;
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

// 8能力维度
export interface Abilities {
  知识深度: AbilityItem;
  统筹能力: AbilityItem;
  沟通影响: AbilityItem;
  问题复杂度: AbilityItem;
  创新思维: AbilityItem;
  决策自主性: AbilityItem;
  影响规模: AbilityItem;
  贡献类型: AbilityItem;
}

// 雷达图数据
export interface RadarData {
  知识深度: number;
  统筹能力: number;
  沟通影响: number;
  问题复杂度: number;
  创新思维: number;
  决策自主性: number;
  影响规模: number;
  贡献类型: number;
}

export interface AssessmentResult {
  jobValue: string;
  personValue: string;
  currency: string;
  level: number;
  levelTag: string;
  levelDesc: string;
  strengths?: string[];
  weaknesses?: string[];
  resumeAdvice?: string;

  abilities?: Abilities;
  radarData?: RadarData;
  abilitySummary?: string;
  salaryCompetitiveness?: number;
  abilityCompetitiveness?: number;
  resumeHealthScore?: number;
  marketSalary?: {
    range: string;
    note: string;
    city: string;
    industry: string;
    function: string;
  };
  logId?: number;

  // HAY 8因素评估结果（用于简历优化助手）
  factors?: Record<string, string>;
  // 解析后的简历文本（用于聊天 Agent）
  resumeText?: string;
}

// 简历画布（Canvas）相关类型
export interface ResumeSection {
  id: string;            // "section-0", "section-1"
  type: string;          // "education" | "internship" | "project" | "skill" | "other"
  title: string;         // "字节跳动-产品实习"
  content: string;       // 当前内容（采纳编辑后更新）
}

export interface PendingEdit {
  sectionId: string;
  original: string;      // 被替换的原文
  suggested: string;     // 建议替换为
  rationale: string;     // 修改理由
  status: 'pending' | 'accepted' | 'rejected';
}

export enum AppState {
  AUTH = 'AUTH',
  FORM = 'FORM',
  LOADING = 'LOADING',
  RESULT = 'RESULT',
  HISTORY = 'HISTORY',
}
