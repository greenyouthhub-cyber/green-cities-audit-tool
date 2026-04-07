import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Faltan las variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const ITEM_CODES_BY_BLOCK: Record<string, string[]> = {
  'Urban Design and Public Space': ['A1', 'A2', 'A3', 'A4'],
  'Sustainable Mobility': ['B1', 'B2', 'B3', 'B4'],
  'Waste and Circular Economy': ['C1', 'C2', 'C3', 'C4'],
  'Infrastructure/Urban Energy': ['D1', 'D2', 'D3'],
  'Pollution': ['E1', 'E2', 'E3'],
  'Access to Services and Governance': ['F1', 'F2', 'F3'],
};

const QUESTION_TEXTS: Record<string, string[]> = {
  'Urban Design and Public Space': [
    'Shade and climate comfort in public spaces',
    'Quality and continuity of sidewalks and pedestrian routes',
    'Accessibility and maintenance of green areas',
    'Universal accessibility in the city',
  ],
  'Sustainable Mobility': [
    'Public transport availability',
    'Cycling infrastructure',
    'Road safety',
    'Connections between transport options',
  ],
  'Waste and Circular Economy': [
    'Availability and clarity of waste containers',
    'Urban cleanliness and street cleaning services',
    'Reuse and repair initiatives',
    'Information provided to citizens about waste separation',
  ],
  'Infrastructure/Urban Energy': [
    'Efficiency of public lighting and urban energy equipment',
    'Visible renewable or local energy initiatives',
    'Quality of public lighting at night',
  ],
  'Pollution': [
    'Noise level in the city',
    'Air quality in the city',
    'Water quality in rivers/lakes',
  ],
  'Access to Services and Governance': [
    'Access to essential services without using a car',
    'Public information from local authorities',
    'Youth participation in decision-making',
  ],
};

type ScoreValue = number | null;

type AuditBlock = {
  key: string;
  title: string;
  scores: ScoreValue[];
  explanations: string[];
  mainIssue: string;
  suggestions: string;
};

type AuditPayload = {
  profile: {
    email?: string;
    consent?: string;
    city?: string;
    neighbourhood?: string;
    country?: string;
    frequency?: string;
    ageGroup?: string;
    means?: string[];
    meansOther?: string;
  };
  scoreSummary?: {
    overall?: number;
    overallLabel?: string;
    areaScores?: Array<{
      area: string;
      avg: number;
    }>;
  };
  blocks: AuditBlock[];
};



function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return round2(values.reduce((sum, n) => sum + n, 0) / values.length);
}

function getOverallResult(score: number) {
  if (score <= 1.5) return 'Very poor';
  if (score <= 2.5) return 'Poor';
  if (score <= 3.5) return 'Acceptable';
  if (score <= 4.5) return 'Good';
  return 'Excellent';
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const rawAuditData = formData.get('auditData');

    if (!rawAuditData || typeof rawAuditData !== 'string') {
      return new NextResponse('Falta auditData en la petición.', { status: 400 });
    }

    const parsed = JSON.parse(rawAuditData) as AuditPayload;

    if (!parsed?.profile || !Array.isArray(parsed?.blocks)) {
      return new NextResponse('Formato de auditData no válido.', { status: 400 });
    }

    const profile = parsed.profile;
    const orderedBlocks = parsed.blocks;

    const blockAverages = orderedBlocks.map((block) => {
      const validScores = (block.scores || []).filter(
        (s): s is number => typeof s === 'number' && s >= 1 && s <= 5
      );
      return {
        block_name: block.key,
        block_score: validScores.length ? average(validScores) : null,
      };
    });

    const validBlockScores = blockAverages
      .map((b) => b.block_score)
      .filter((v): v is number => typeof v === 'number' && v > 0);

    const overallScore = validBlockScores.length ? average(validBlockScores) : null;
    const overallResult = overallScore ? getOverallResult(overallScore) : null;

    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .insert({
        email: profile.email || null,
        city: profile.city || null,
        country: profile.country || null,
        age_group: profile.ageGroup || null,
        overall_score: overallScore,
        overall_result: overallResult,
      })
      .select()
      .single();

    if (submissionError) throw submissionError;

    const submissionId = submission.id as string;

    if (Array.isArray(profile.means) && profile.means.length > 0) {
      const meansRows = profile.means.map((m) => ({
        submission_id: submissionId,
        means:
          m === 'Other' && profile.meansOther?.trim()
            ? `Other: ${profile.meansOther.trim()}`
            : m,
      }));

      const { error: meansError } = await supabase
        .from('submission_means')
        .insert(meansRows);

      if (meansError) throw meansError;
    }

    const blockRows = orderedBlocks.map((block) => {
      const validScores = (block.scores || []).filter(
        (s): s is number => typeof s === 'number' && s >= 1 && s <= 5
      );

      return {
        submission_id: submissionId,
        block_name: block.key,
        block_score: validScores.length ? average(validScores) : null,
        age_group: profile.ageGroup || null,
        city: profile.city || null,
        country: profile.country || null,
        main_issue: block.mainIssue || null,
        suggestions: block.suggestions || null,
      };
    });

    const { error: blockError } = await supabase
      .from('block_responses')
      .insert(blockRows);

    if (blockError) throw blockError;

    const itemRows: Array<{
      submission_id: string;
      block_name: string;
      item_code: string;
      item_question: string;
      item_order: number;
      score: number;
      explanation: string | null;
      age_group: string | null;
      city: string | null;
      country: string | null;
    }> = [];

    for (const block of orderedBlocks) {
      const itemCodes = ITEM_CODES_BY_BLOCK[block.key] || [];
      const questions = QUESTION_TEXTS[block.key] || [];

      (block.scores || []).forEach((rawScore, index) => {
        if (typeof rawScore !== 'number' || rawScore < 1 || rawScore > 5) return;

        itemRows.push({
          submission_id: submissionId,
          block_name: block.key,
          item_code: itemCodes[index] || `${block.key}-${index + 1}`,
          item_question: questions[index] || `Question ${index + 1}`,
          item_order: index + 1,
          score: rawScore,
          explanation: block.explanations?.[index]?.trim() || null,
          age_group: profile.ageGroup || null,
          city: profile.city || null,
          country: profile.country || null,
        });
      });
    }

    if (itemRows.length > 0) {
      const { error: itemError } = await supabase
        .from('item_responses')
        .insert(itemRows);

      if (itemError) throw itemError;
    }

    return NextResponse.json({
      ok: true,
      submissionId,
      overallScore,
      overallResult,
    });
  } catch (error) {
    console.error('submit-audit error:', error);

    const message =
      error instanceof Error ? error.message : 'Error inesperado al guardar la auditoría.';

    return new NextResponse(message, { status: 500 });
  }
}