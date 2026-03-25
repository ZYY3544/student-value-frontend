/**
 * PrintableResume - 打印专用简历组件
 * 基于 Google AI Studio 生成的 A4 模板排版
 * 平时 hidden，window.print() 时 print:block 显示
 */

import React from 'react';
import { ResumeSection } from '../types';

interface PrintableResumeProps {
  resumeSections: ResumeSection[];
}

/** 从个人信息 section 提取姓名、电话、邮箱 */
function parsePersonalInfo(content: string) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  let name = '';
  let phone = '';
  let email = '';

  for (const line of lines) {
    const emailMatch = line.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) { email = emailMatch[0]; }
    const phoneMatch = line.match(/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/);
    if (phoneMatch) { phone = phoneMatch[0].replace(/[\s-]/g, ''); }
  }

  for (const line of lines) {
    const clean = line.replace(/[\s:：]/g, '');
    if (clean.length >= 2 && clean.length <= 8 && !/[@\d{5}]/.test(clean) && !/^(姓名|电话|邮箱|手机|微信|地址)/.test(clean)) {
      name = clean;
      break;
    }
    const nameMatch = line.match(/姓名[：:]\s*(.{2,6})/);
    if (nameMatch) { name = nameMatch[1].trim(); break; }
  }

  if (!name && lines.length > 0) {
    name = lines[0].replace(/^姓名[：:]?\s*/, '').slice(0, 8);
  }

  return { name, phone, email };
}

/** 渲染 section content：识别 bullet 行和普通行，保留模板排版风格 */
function renderSectionContent(content: string) {
  const lines = content.split('\n');
  const bullets: string[] = [];
  const plain: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[•·\-*●○]\s*/.test(trimmed)) {
      bullets.push(trimmed.replace(/^[•·\-*●○]\s*/, ''));
    } else {
      plain.push(trimmed);
    }
  }

  if (bullets.length > 0 && plain.length === 0) {
    return (
      <ul className="list-disc ml-5 text-sm space-y-1">
        {bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    );
  }

  return (
    <div>
      {plain.length > 0 && (
        <div className="text-sm whitespace-pre-wrap mb-1">{plain.join('\n')}</div>
      )}
      {bullets.length > 0 && (
        <ul className="list-disc ml-5 text-sm space-y-1">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}

export const PrintableResume: React.FC<PrintableResumeProps> = ({ resumeSections }) => {
  if (resumeSections.length === 0) return null;

  const firstSection = resumeSections[0];
  const isPersonalInfo = firstSection.type === 'other' || firstSection.title.includes('个人');
  const personalInfo = isPersonalInfo ? parsePersonalInfo(firstSection.content) : null;
  const bodySections = isPersonalInfo ? resumeSections.slice(1) : resumeSections;

  return (
    <div
      className="hidden print:block"
      id="printable-resume"
    >
      <div
        id="resume-page"
        className="w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl p-[15mm_20mm] text-black print:shadow-none print:m-0"
        style={{
          fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
          lineHeight: '1.5',
        }}
      >
        {/* Header — 模板风格：姓名居中大字 + 联系方式 */}
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

        {/* Body Sections — 模板风格：标题加粗+黑色下划线，内容用 bullet list */}
        {bodySections.map((section) => (
          <section key={section.id} className="mb-6" style={{ breakInside: 'avoid' }}>
            <h2 className="text-base font-bold border-b border-black mb-2 pb-0.5">
              {section.title}
            </h2>
            {renderSectionContent(section.content)}
          </section>
        ))}
      </div>
    </div>
  );
};
