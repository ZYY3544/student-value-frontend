/**
 * Word 导出服务 — 使用 docx 库生成 .docx 文件
 * 接收 LLM 解析的 StructuredResume，输出格式化的 Word 文档
 */

import {
  Document, Packer, Paragraph, TextRun, TabStopPosition, TabStopType,
  AlignmentType, BorderStyle, HeadingLevel, convertInchesToTwip,
} from 'docx';
import { saveAs } from 'file-saver';
import type { StructuredResume } from '../components/PrintableResume';

// A4 页面右边距对应的 tab stop 位置（用于右对齐时间）
const RIGHT_TAB = TabStopPosition.MAX;

/** 创建 section 标题（加粗 + 底部黑线） */
function sectionTitle(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
    },
    children: [
      new TextRun({ text: title, bold: true, size: 24, font: 'Microsoft YaHei' }),
    ],
  });
}

/** 创建"左侧加粗标题 + 右侧时间"行 */
function titleTimeLine(title: string, time: string): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    spacing: { before: 80, after: 0 },
    children: [
      new TextRun({ text: title, bold: true, size: 21, font: 'Microsoft YaHei' }),
      new TextRun({ text: '\t', size: 21 }),
      new TextRun({ text: time, size: 20, color: '555555', font: 'Microsoft YaHei' }),
    ],
  });
}

/** 创建副标题行（职位/学位等） */
function subtitleLine(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 20 },
    children: [
      new TextRun({ text, size: 20, color: '444444', font: 'Microsoft YaHei' }),
    ],
  });
}

/** 创建 bullet point */
function bulletPoint(text: string): Paragraph {
  const clean = text.replace(/^[·•\-–—]\s*/, '');
  return new Paragraph({
    spacing: { before: 20, after: 20 },
    children: [
      new TextRun({ text: '· ', size: 20, font: 'Microsoft YaHei' }),
      new TextRun({ text: clean, size: 20, font: 'Microsoft YaHei' }),
    ],
  });
}

/** 创建子项目标题（加粗，不带时间） */
function subProjectTitle(name: string): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 0 },
    children: [
      new TextRun({ text: name, bold: true, size: 20, font: 'Microsoft YaHei' }),
    ],
  });
}

/** 生成 Word 文档并下载 */
export async function exportToWord(data: StructuredResume, filename?: string) {
  const paragraphs: Paragraph[] = [];

  // ===== 个人信息 =====
  if (data.personal_info?.name) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          new TextRun({ text: data.personal_info.name, bold: true, size: 32, font: 'Microsoft YaHei' }),
        ],
      }),
    );
    const contactParts = [data.personal_info.phone, data.personal_info.email, data.personal_info.other].filter(Boolean);
    if (contactParts.length > 0) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: contactParts.join(' | '), size: 20, color: '555555', font: 'Microsoft YaHei' }),
          ],
        }),
      );
    }
  }

  // ===== 教育背景 =====
  if (data.education?.length > 0) {
    paragraphs.push(sectionTitle('教育背景'));
    for (const edu of data.education) {
      const titleText = edu.degree ? `${edu.school} | ${edu.degree}` : edu.school;
      paragraphs.push(titleTimeLine(titleText, edu.time));
      if (edu.major) paragraphs.push(subtitleLine(`专业：${edu.major}`));
      for (const d of (edu.details || [])) paragraphs.push(bulletPoint(d));
    }
  }

  // ===== 实习经历 =====
  if (data.experience?.length > 0) {
    paragraphs.push(sectionTitle('实习经历'));
    for (const exp of data.experience) {
      paragraphs.push(titleTimeLine(exp.org, exp.time));
      if (exp.role) paragraphs.push(subtitleLine(exp.role));

      if (exp.sub_projects?.length) {
        for (const sp of exp.sub_projects) {
          if (sp.name) paragraphs.push(subProjectTitle(sp.name));
          for (const b of (sp.bullets || [])) paragraphs.push(bulletPoint(b));
        }
      } else if (exp.bullets?.length) {
        for (const b of exp.bullets) paragraphs.push(bulletPoint(b));
      }
    }
  }

  // ===== 项目与研究经历 =====
  if (data.projects?.length > 0) {
    paragraphs.push(sectionTitle('项目与研究经历'));
    for (const proj of data.projects) {
      paragraphs.push(titleTimeLine(proj.name, proj.time));
      const sub = [proj.role, proj.org].filter(Boolean).join(' · ');
      if (sub) paragraphs.push(subtitleLine(sub));
      for (const b of (proj.bullets || [])) paragraphs.push(bulletPoint(b));
    }
  }

  // ===== 其他段落（社团经历等） =====
  if (data.other_sections?.length > 0) {
    for (const sec of data.other_sections) {
      paragraphs.push(sectionTitle(sec.title));
      for (const item of (sec.items || [])) {
        if (typeof item === 'string') {
          paragraphs.push(bulletPoint(item));
        } else {
          if (item.org || item.role) {
            paragraphs.push(titleTimeLine(item.org || item.role || '', item.time || ''));
            if (item.role && item.org) paragraphs.push(subtitleLine(item.role));
          }
          for (const b of (item.bullets || [])) paragraphs.push(bulletPoint(b));
        }
      }
    }
  }

  // ===== 技能及其他 =====
  if (data.skills?.length > 0) {
    paragraphs.push(sectionTitle('技能及其他'));
    for (const s of data.skills) paragraphs.push(bulletPoint(s));
  }

  // ===== 生成文档 =====
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.6),
            bottom: convertInchesToTwip(0.6),
            left: convertInchesToTwip(0.8),
            right: convertInchesToTwip(0.8),
          },
        },
      },
      children: paragraphs,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const name = filename || `${data.personal_info?.name || '简历'}.docx`;
  saveAs(blob, name);
}
