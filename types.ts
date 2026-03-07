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
  resumeHealthScore?: number;
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
  WELCOME = 'WELCOME',
  FORM = 'FORM',
  LOADING = 'LOADING',
  RESULT = 'RESULT',
}
