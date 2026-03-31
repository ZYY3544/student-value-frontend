/**
 * PrintableResume - 打印专用简历组件（LLM 结构化版本）
 * 平时 hidden，window.print() 时 print:block 显示
 * 支持两种模式：
 * 1. structuredData 存在时：使用 LLM 解析的结构化数据渲染精排版
 * 2. fallback：使用 resumeSections 纯文本渲染（兜底）
 */

import React from 'react';
import { ResumeSection } from '../types';

// LLM 返回的结构化类型
export interface StructuredResume {
  personal_info: {
    name: string;
    email: string;
    phone: string;
    other: string;
  };
  education: Array<{
    school: string;
    degree: string;
    major: string;
    time: string;
    details: string[];
  }>;
  experience: Array<{
    org: string;
    role: string;
    time: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    role: string;
    org: string;
    time: string;
    bullets: string[];
  }>;
  skills: string[];
  other_sections: Array<{
    title: string;
    items: string[];
  }>;
}

interface PrintableResumeProps {
  resumeSections: ResumeSection[];
  structuredData?: StructuredResume | null;
}

/** fallback: 从个人信息 section 提取姓名、电话、邮箱 */
function parsePersonalInfo(content: string) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  let name = '', phone = '', email = '';
  for (const line of lines) {
    const emailMatch = line.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) email = emailMatch[0];
    const phoneMatch = line.match(/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/);
    if (phoneMatch) phone = phoneMatch[0].replace(/[\s-]/g, '');
  }
  for (const line of lines) {
    const clean = line.replace(/[\s:：]/g, '');
    if (clean.length >= 2 && clean.length <= 8 && !/[@\d{5}]/.test(clean) && !/^(姓名|电话|邮箱|手机|微信|地址)/.test(clean)) {
      name = clean; break;
    }
    const nameMatch = line.match(/姓名[：:]\s*(.{2,6})/);
    if (nameMatch) { name = nameMatch[1].trim(); break; }
  }
  if (!name && lines.length > 0) name = lines[0].replace(/^姓名[：:]?\s*/, '').slice(0, 8);
  return { name, phone, email };
}

// 共用样式常量
const PAGE_STYLE = {
  fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  lineHeight: '1.5',
};

/** 经历/项目条目组件 */
const EntryBlock: React.FC<{ title: string; subtitle?: string; time: string; bullets: string[] }> = ({ title, subtitle, time, bullets }) => (
  <div className="mb-3" style={{ breakInside: 'avoid' }}>
    <div className="flex justify-between items-baseline">
      <span className="text-sm font-bold">{title}</span>
      <span className="text-xs text-gray-500 shrink-0 ml-4">{time}</span>
    </div>
    {subtitle && <div className="text-xs text-gray-600">{subtitle}</div>}
    {bullets.length > 0 && (
      <ul className="mt-1 space-y-0.5">
        {bullets.map((b, i) => (
          <li key={i} className="text-xs leading-relaxed flex gap-1.5">
            <span className="shrink-0 mt-[3px]">·</span>
            <span>{b.replace(/^[·•\-–—]\s*/, '')}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

/** Section 标题 + 分隔线 */
const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <h2 className="text-base font-bold border-b border-black mb-2 pb-0.5">{title}</h2>
);

export const PrintableResume: React.FC<PrintableResumeProps> = ({ resumeSections, structuredData }) => {
  if (!structuredData && resumeSections.length === 0) return null;

  // ===== 结构化渲染 =====
  if (structuredData) {
    const { personal_info, education, experience, projects, skills, other_sections } = structuredData;
    return (
      <div className="hidden print:block" id="printable-resume">
        <div
          id="resume-page"
          className="w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl p-[15mm_20mm] text-black print:shadow-none print:m-0"
          style={PAGE_STYLE}
        >
          {/* 个人信息居中 */}
          {personal_info?.name && (
            <header className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight mb-1">{personal_info.name}</h1>
              <div className="text-xs space-x-2 text-gray-600">
                {personal_info.phone && <span>{personal_info.phone}</span>}
                {personal_info.phone && personal_info.email && <span>|</span>}
                {personal_info.email && <span>{personal_info.email}</span>}
                {personal_info.other && <>{(personal_info.phone || personal_info.email) && <span>|</span>}<span>{personal_info.other}</span></>}
              </div>
            </header>
          )}

          {/* 教育经历 */}
          {education?.length > 0 && (
            <section className="mb-4">
              <SectionTitle title="教育经历" />
              {education.map((edu, i) => (
                <EntryBlock
                  key={i}
                  title={edu.school}
                  subtitle={[edu.degree, edu.major].filter(Boolean).join(' · ')}
                  time={edu.time}
                  bullets={edu.details || []}
                />
              ))}
            </section>
          )}

          {/* 实习/工作经历 */}
          {experience?.length > 0 && (
            <section className="mb-4">
              <SectionTitle title="实习与工作经历" />
              {experience.map((exp, i) => (
                <EntryBlock
                  key={i}
                  title={exp.org}
                  subtitle={exp.role}
                  time={exp.time}
                  bullets={exp.bullets || []}
                />
              ))}
            </section>
          )}

          {/* 项目经历 */}
          {projects?.length > 0 && (
            <section className="mb-4">
              <SectionTitle title="项目与研究经历" />
              {projects.map((proj, i) => (
                <EntryBlock
                  key={i}
                  title={proj.name}
                  subtitle={[proj.role, proj.org].filter(Boolean).join(' · ')}
                  time={proj.time}
                  bullets={proj.bullets || []}
                />
              ))}
            </section>
          )}

          {/* 技能 */}
          {skills?.length > 0 && (
            <section className="mb-4">
              <SectionTitle title="技能" />
              <ul className="space-y-0.5">
                {skills.map((s, i) => (
                  <li key={i} className="text-xs leading-relaxed flex gap-1.5">
                    <span className="shrink-0 mt-[3px]">·</span>
                    <span>{s.replace(/^[·•\-–—]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 其他 */}
          {other_sections?.map((sec, i) => (
            <section key={i} className="mb-4">
              <SectionTitle title={sec.title} />
              {sec.items?.length > 0 ? (
                <ul className="space-y-0.5">
                  {sec.items.map((item, j) => (
                    <li key={j} className="text-xs leading-relaxed flex gap-1.5">
                      <span className="shrink-0 mt-[3px]">·</span>
                      <span>{item.replace(/^[·•\-–—]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    );
  }

  // ===== Fallback: 纯文本渲染 =====
  const firstSection = resumeSections[0];
  const isPersonalInfo = firstSection.type === 'other' || firstSection.title.includes('个人');
  const personalInfo = isPersonalInfo ? parsePersonalInfo(firstSection.content) : null;
  const bodySections = isPersonalInfo ? resumeSections.slice(1) : resumeSections;

  return (
    <div className="hidden print:block" id="printable-resume">
      <div
        id="resume-page"
        className="w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl p-[15mm_20mm] text-black print:shadow-none print:m-0"
        style={PAGE_STYLE}
      >
        {personalInfo && (
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight mb-2">{personalInfo.name}</h1>
            <div className="text-sm space-x-2">
              {personalInfo.phone && <span>{personalInfo.phone}</span>}
              {personalInfo.phone && personalInfo.email && <span>|</span>}
              {personalInfo.email && <span>{personalInfo.email}</span>}
            </div>
          </header>
        )}
        {bodySections.map((section) => (
          <section key={section.id} className="mb-6" style={{ breakInside: 'avoid' }}>
            <h2 className="text-base font-bold border-b border-black mb-2 pb-0.5">{section.title}</h2>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{section.content}</div>
          </section>
        ))}
      </div>
    </div>
  );
};
