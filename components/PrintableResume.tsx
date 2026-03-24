/**
 * PrintableResume - 打印专用简历组件
 * A4 排版，隐藏在页面中，window.print() 时显示
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
    // 邮箱
    const emailMatch = line.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) { email = emailMatch[0]; }
    // 电话
    const phoneMatch = line.match(/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/);
    if (phoneMatch) { phone = phoneMatch[0].replace(/[\s-]/g, ''); }
  }

  // 姓名：取第一行中不含 @ 和数字串的短文本
  for (const line of lines) {
    const clean = line.replace(/[\s:：]/g, '');
    if (clean.length >= 2 && clean.length <= 8 && !/[@\d{5}]/.test(clean) && !/^(姓名|电话|邮箱|手机|微信|地址)/.test(clean)) {
      name = clean;
      break;
    }
    // "姓名：张三" 格式
    const nameMatch = line.match(/姓名[：:]\s*(.{2,6})/);
    if (nameMatch) { name = nameMatch[1].trim(); break; }
  }

  // fallback：如果没提取到姓名，取第一行
  if (!name && lines.length > 0) {
    name = lines[0].replace(/^姓名[：:]?\s*/, '').slice(0, 8);
  }

  return { name, phone, email };
}

/** 渲染 section content：识别 bullet 行和普通行 */
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

  // 全是 bullet
  if (bullets.length > 0 && plain.length === 0) {
    return (
      <ul className="list-disc ml-5 text-sm space-y-0.5">
        {bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    );
  }

  // 混合：先渲染普通行，再渲染 bullets
  return (
    <div>
      {plain.length > 0 && (
        <div className="text-sm whitespace-pre-wrap mb-1">{plain.join('\n')}</div>
      )}
      {bullets.length > 0 && (
        <ul className="list-disc ml-5 text-sm space-y-0.5">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}

export const PrintableResume: React.FC<PrintableResumeProps> = ({ resumeSections }) => {
  if (resumeSections.length === 0) return null;

  // 第一个 section 当个人信息（type=other 且排第一）
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
        className="w-[210mm] min-h-[297mm] bg-white mx-auto p-[15mm_20mm] text-black print:shadow-none print:m-0"
        style={{
          fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
          lineHeight: '1.5',
        }}
      >
        {/* Header */}
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

        {/* Body Sections */}
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
