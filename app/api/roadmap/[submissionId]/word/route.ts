import { NextRequest } from 'next/server';
import { getRoadmapData } from '@/lib/roadmap/getRoadmapData';
import { buildRoadmapDocument } from '@/lib/roadmap/buildRoadmapDocument';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await context.params;

    const roadmapData = await getRoadmapData(submissionId);
    const buffer = await buildRoadmapDocument(roadmapData);

    const safeCity = roadmapData.city.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="green-cities-roadmap-${safeCity}.docx"`,
      },
    });
  } catch (error) {
    console.error('Roadmap Word export error:', error);

    return Response.json(
      { error: 'Failed to generate roadmap document.' },
      { status: 500 }
    );
  }
}