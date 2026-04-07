import { supabase } from '@/lib/supabaseClient';

type SubmissionRow = {
  id: string;
  city: string | null;
  country: string | null;
  created_at: string | null;
  overall_score: number | null;
  overall_result: string | null;
};

type BlockResponseRow = {
  submission_id: string;
  block_name: string;
  block_score: number | null;
};

export type RoadmapPriorityArea = {
  area: string;
  score: number;
  explanation: string;
};

export type RoadmapAction = {
  area: string;
  problem: string;
  evidence: string;
  proposedAction: string;
  timeline: string;
  actors: string;
};

export type RoadmapDocumentData = {
  city: string;
  country: string;
  date: string;
  overallScore: number;
  overallLevel: string;
  executiveSummary: string;
  priorityAreas: RoadmapPriorityArea[];
  actions: RoadmapAction[];
  closingNote: string;
};

function formatDate(dateString?: string | null) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB');
}

function normalizeText(value?: string | null, fallback = 'Not specified') {
  const text = value?.trim();
  return text ? text : fallback;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function buildPriorityExplanation(_row: BlockResponseRow): string {
  return 'This area received one of the lowest scores in the audit and requires priority attention.';
}

function inferActionFromAreaAndProblem(area: string, problem: string): {
  proposedAction: string;
  timeline: string;
  actors: string;
} {
  const areaLower = area.toLowerCase();
  const problemLower = problem.toLowerCase();

  if (areaLower.includes('mobility')) {
    if (problemLower.includes('infrastructure')) {
      return {
        proposedAction:
          'Improve safe walking and cycling infrastructure and strengthen connections with public transport.',
        timeline: 'Medium term',
        actors: 'Municipality, mobility department, transport operators, local communities',
      };
    }

    if (problemLower.includes('private car')) {
      return {
        proposedAction:
          'Promote real alternatives to private car use through better public transport, pedestrian routes and cycling conditions.',
        timeline: 'Medium term',
        actors: 'Municipality, mobility department, transport operators',
      };
    }

    return {
      proposedAction:
        'Strengthen sustainable mobility options through safer infrastructure, better signage and improved intermodality.',
      timeline: 'Medium term',
      actors: 'Municipality, mobility department, local stakeholders',
    };
  }

  if (areaLower.includes('waste')) {
    if (problemLower.includes('information') || problemLower.includes('education')) {
      return {
        proposedAction:
          'Develop clearer signage and awareness campaigns on waste separation, reuse and circular economy practices.',
        timeline: 'Quick win',
        actors: 'Municipality, waste management services, schools, environmental organisations',
      };
    }

    return {
      proposedAction:
        'Improve waste separation, reuse and repair systems while making circular economy options more visible and accessible.',
        timeline: 'Medium term',
        actors: 'Municipality, waste management services, reuse networks, local communities',
      };
    }

  if (areaLower.includes('urban design') || areaLower.includes('public space')) {
    return {
      proposedAction:
        'Enhance public spaces through more inclusive design, better maintenance, climate comfort measures and safer pedestrian routes.',
      timeline: 'Medium term',
      actors: 'Municipality, urban planning department, public works teams',
    };
  }

  if (areaLower.includes('energy') || areaLower.includes('infrastructure')) {
    return {
      proposedAction:
        'Modernise urban energy infrastructure through efficient lighting, visible renewable solutions and improved maintenance.',
      timeline: 'Structural change',
      actors: 'Municipality, energy department, infrastructure services, utility providers',
    };
  }

  if (areaLower.includes('pollution')) {
    return {
      proposedAction:
        'Adopt targeted measures to reduce pollution sources, improve environmental monitoring and mitigate impacts on quality of life.',
      timeline: 'Medium term',
      actors: 'Municipality, environmental department, transport and public health stakeholders',
    };
  }

  if (areaLower.includes('governance') || areaLower.includes('services')) {
    return {
      proposedAction:
        'Improve access to services, simplify public information and create clearer participation channels for young people.',
      timeline: 'Quick win',
      actors: 'Municipality, public service departments, youth councils, local organisations',
    };
  }

  return {
    proposedAction:
      'Implement targeted improvement measures based on the weaknesses identified in this area.',
    timeline: 'Medium term',
    actors: 'Municipality and relevant local stakeholders',
  };
}

function buildExecutiveSummary(
  city: string,
  country: string,
  weakestAreas: RoadmapPriorityArea[]
) {
  const areaText =
    weakestAreas.length > 0
      ? weakestAreas.map((a) => a.area).join(', ')
      : 'the areas assessed in the audit';

  return `This roadmap analyses the sustainability perceptions collected through the Green Cities Audit Tool in ${city}, ${country}. It is based on citizen responses and identifies priority improvement areas, especially ${areaText}. The document proposes indicative actions to support a greener, more accessible and people-centred city.`;
}

export async function getRoadmapData(
  submissionId: string
): Promise<RoadmapDocumentData> {
  const { data: submission, error: submissionError } = await supabase
    .from('submissions')
    .select('id, city, country, created_at, overall_score, overall_result')
    .eq('id', submissionId)
    .single<SubmissionRow>();

  if (submissionError || !submission) {
    throw new Error(`Unable to load submission ${submissionId}`);
  }

  const { data: blockResponses, error: blocksError } = await supabase
    .from('block_responses')
    .select('submission_id, block_name, block_score')
    .eq('submission_id', submissionId)
    .returns<BlockResponseRow[]>();

  if (blocksError || !blockResponses) {
    throw new Error(`Unable to load block responses for submission ${submissionId}`);
  }

  const validBlocks = blockResponses
    .filter((row) => typeof row.block_score === 'number')
    .sort((a, b) => (a.block_score ?? 999) - (b.block_score ?? 999));

  const priorityAreas: RoadmapPriorityArea[] = validBlocks.slice(0, 3).map((row) => ({
    area: row.block_name,
    score: round1(row.block_score ?? 0),
    explanation: buildPriorityExplanation(row),
  }));

  const actions: RoadmapAction[] = validBlocks.slice(0, 3).map((row) => {
    const problem = 'Weak performance detected in this area';
    const inferred = inferActionFromAreaAndProblem(row.block_name, problem);

    return {
      area: row.block_name,
      problem,
      evidence:
        typeof row.block_score === 'number'
          ? `Score: ${round1(row.block_score)}`
          : 'Citizen feedback points to weaknesses in this area.',
      proposedAction: inferred.proposedAction,
      timeline: inferred.timeline,
      actors: inferred.actors,
    };
  });

  const city = normalizeText(submission.city, 'Unknown city');
  const country = normalizeText(submission.country, 'Unknown country');

  return {
    city,
    country,
    date: formatDate(submission.created_at),
    overallScore: round1(submission.overall_score ?? 0),
    overallLevel: normalizeText(submission.overall_result, 'Not specified'),
    executiveSummary: buildExecutiveSummary(city, country, priorityAreas),
    priorityAreas,
    actions,
    closingNote:
      'This roadmap gathers suggested actions derived from participants’ perceptions and does not replace a formal municipal technical plan.',
  };
}