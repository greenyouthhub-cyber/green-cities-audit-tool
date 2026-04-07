import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { RoadmapDocumentData } from './getRoadmapData';

function heading(text: string, level: HeadingLevel = HeadingLevel.HEADING_1) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 200, after: 120 },
  });
}

function body(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 120 },
  });
}

function labelValue(label: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22 }),
      new TextRun({ text: value, size: 22 }),
    ],
    spacing: { after: 80 },
  });
}

function makeCell(text: string, bold = false) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 20 })],
      }),
    ],
    width: { size: 16.6, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
  });
}

export async function buildRoadmapDocument(data: RoadmapDocumentData) {
  const priorityTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          makeCell('Priority Area', true),
          makeCell('Score', true),
          makeCell('Explanation', true),
        ],
      }),
      ...data.priorityAreas.map(
        (item) =>
          new TableRow({
            children: [
              makeCell(item.area),
              makeCell(String(item.score)),
              makeCell(item.explanation),
            ],
          })
      ),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
  });

  const actionsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          makeCell('Area', true),
          makeCell('Problem detected', true),
          makeCell('Evidence', true),
          makeCell('Proposed action', true),
          makeCell('Timeline', true),
          makeCell('Actors involved', true),
        ],
      }),
      ...data.actions.map(
        (action) =>
          new TableRow({
            children: [
              makeCell(action.area),
              makeCell(action.problem),
              makeCell(action.evidence),
              makeCell(action.proposedAction),
              makeCell(action.timeline),
              makeCell(action.actors),
            ],
          })
      ),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'Green Cities Audit Roadmap',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 220 },
          }),

          labelValue('City', data.city),
          labelValue('Country', data.country),
          labelValue('Date', data.date),
          labelValue('Overall score', String(data.overallScore)),
          labelValue('Overall level', data.overallLevel),

          heading('Executive Summary'),
          body(data.executiveSummary),

          heading('Priority Areas'),
          priorityTable,

          heading('Proposed Actions'),
          actionsTable,

          heading('Closing Note'),
          body(data.closingNote),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}