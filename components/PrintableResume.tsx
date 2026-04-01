/**
 * PrintableResume - 打印专用简历组件（LLM 结构化版本）
 * 平时 hidden，window.print() 时 print:block 显示
 * 支持两种模式：
 * 1. structuredData 存在时：使用 LLM 解析的结构化数据渲染精排版
 * 2. fallback：使用 resumeSections 纯文本渲染（兜底）
 */

import React from 'react';
import { ResumeSection } from '../types';

// LLM 返回的结构化类型（支持子项目）
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
    bullets?: string[];
    sub_projects?: Array<{
      name: string;
      bullets: string[];
    }>;
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
    items: any[];
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

const PAGE_STYLE = {
  fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  lineHeight: '1.45',
  fontSize: '13px',
};

/** Bullet 列表 */
const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="mt-0.5">
    {items.map((b, i) => (
      <li key={i} className="text-xs leading-[1.5] flex gap-1" style={{ marginBottom: '1px' }}>
        <span className="shrink-0">·</span>
        <span>{b.replace(/^[·•\-–—]\s*/, '')}</span>
      </li>
    ))}
  </ul>
);

/** Section 标题 + 分隔线 */
const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <h2 className="font-bold border-b border-black pb-0.5 mb-1" style={{ fontSize: '14px' }}>{title}</h2>
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
          className="w-[210mm] min-h-[297mm] bg-white mx-auto p-[12mm_18mm] text-black print:shadow-none print:m-0"
          style={PAGE_STYLE}
        >
          {/* 个人信息居中 */}
          {personal_info?.name && (
            <header className="mb-3 text-center">
              <h1 className="text-xl font-bold tracking-tight mb-0.5">{personal_info.name}</h1>
              <div className="text-xs text-gray-600">
                {[personal_info.phone, personal_info.email, personal_info.other].filter(Boolean).join(' | ')}
              </div>
            </header>
          )}

          {/* 教育经历 */}
          {education?.length > 0 && (
            <section className="mb-2">
              <SectionTitle title="教育背景" />
              {education.map((edu, i) => (
                <div key={i} style={{ breakInside: 'avoid' }}>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold">{edu.school}{edu.degree ? ` | ${edu.degree}` : ''}</span>
                    <span className="text-xs text-gray-500 shrink-0 ml-4">{edu.time}</span>
                  </div>
                  {edu.major && <div className="text-xs text-gray-600">专业：{edu.major}</div>}
                  {edu.details?.length > 0 && <BulletList items={edu.details} />}
                </div>
              ))}
            </section>
          )}

          {/* 实习/工作经历（支持子项目） */}
          {experience?.length > 0 && (
            <section className="mb-2">
              <SectionTitle title="实习经历" />
              {experience.map((exp, i) => (
                <div key={i} className="mb-1.5" style={{ breakInside: 'avoid' }}>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold">{exp.org}</span>
                    <span className="text-xs text-gray-500 shrink-0 ml-4">{exp.time}</span>
                  </div>
                  {exp.role && <div className="text-xs text-gray-600">{exp.role}</div>}

                  {/* 有子项目 → 按项目分组渲染 */}
                  {exp.sub_projects?.length ? (
                    exp.sub_projects.map((sp, j) => (
                      <div key={j} className="mt-1">
                        {sp.name && <div className="text-xs font-bold">{sp.name}</div>}
                        {sp.bullets?.length > 0 && <BulletList items={sp.bullets} />}
                      </div>
                    ))
                  ) : (
                    /* 无子项目 → 直接渲染 bullets */
                    exp.bullets?.length ? <BulletList items={exp.bullets} /> : null
                  )}
                </div>
              ))}
            </section>
          )}

          {/* 项目经历 */}
          {projects?.length > 0 && (
            <section className="mb-2">
              <SectionTitle title="项目与研究经历" />
              {projects.map((proj, i) => (
                <div key={i} className="mb-1.5" style={{ breakInside: 'avoid' }}>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold">{proj.name}</span>
                    <span className="text-xs text-gray-500 shrink-0 ml-4">{proj.time}</span>
                  </div>
                  {(proj.role || proj.org) && (
                    <div className="text-xs text-gray-600">{[proj.role, proj.org].filter(Boolean).join(' · ')}</div>
                  )}
                  {proj.bullets?.length > 0 && <BulletList items={proj.bullets} />}
                </div>
              ))}
            </section>
          )}

          {/* 其他段落（社团经历等） */}
          {other_sections?.map((sec, i) => (
            <section key={i} className="mb-2">
              <SectionTitle title={sec.title} />
              {sec.items?.map((item: any, j: number) => (
                <div key={j} className="mb-1" style={{ breakInside: 'avoid' }}>
                  {typeof item === 'string' ? (
                    <div className="text-xs leading-[1.5] flex gap-1">
                      <span className="shrink-0">·</span>
                      <span>{item.replace(/^[·•\-–—]\s*/, '')}</span>
                    </div>
                  ) : (
                    <>
                      {(item.org || item.role) && (
                        <div className="flex justify-between items-baseline">
                          <span className="text-sm font-bold">{item.org || ''}</span>
                          {item.time && <span className="text-xs text-gray-500 shrink-0 ml-4">{item.time}</span>}
                        </div>
                      )}
                      {item.role && item.org && <div className="text-xs text-gray-600">{item.role}</div>}
                      {item.bullets?.length > 0 && <BulletList items={item.bullets} />}
                    </>
                  )}
                </div>
              ))}
            </section>
          ))}

          {/* 技能（放最后） */}
          {skills?.length > 0 && (
            <section className="mb-2">
              <SectionTitle title="技能及其他" />
              <BulletList items={skills} />
            </section>
          )}
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
        className="w-[210mm] min-h-[297mm] bg-white mx-auto p-[12mm_18mm] text-black print:shadow-none print:m-0"
        style={PAGE_STYLE}
      >
        {personalInfo && (
          <header className="mb-4 text-center">
            <h1 className="text-xl font-bold tracking-tight mb-1">{personalInfo.name}</h1>
            <div className="text-xs">
              {personalInfo.phone && <span>{personalInfo.phone}</span>}
              {personalInfo.phone && personalInfo.email && <span> | </span>}
              {personalInfo.email && <span>{personalInfo.email}</span>}
            </div>
          </header>
        )}
        {bodySections.map((section) => (
          <section key={section.id} className="mb-3" style={{ breakInside: 'avoid' }}>
            <h2 className="font-bold border-b border-black pb-0.5 mb-1" style={{ fontSize: '14px' }}>{section.title}</h2>
            <div className="text-xs whitespace-pre-wrap leading-[1.5]">{section.content}</div>
          </section>
        ))}
      </div>
    </div>
  );
};
