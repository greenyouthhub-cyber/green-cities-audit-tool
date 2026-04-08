import { supabase } from '@/lib/supabaseClient';
import EvidenceMapWrapper from '@/components/EvidenceMapWrapper';
import Image from 'next/image';
export const dynamic = 'force-dynamic';

type MediaEvidenceRow = {
  id: number;
  submission_id: string;
  block_name: string;
  media_type: string;
  image_url: string;
  location_name: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type SubmissionRow = {
  id: string;
  city: string | null;
  country: string | null;
};

type MediaPoint = {
  id: number;
  submission_id: string;
  block_name: string;
  media_type: string;
  image_url: string;
  location_name: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
};

export default async function MapPage() {
  const { data: mediaData, error: mediaError } = await supabase
    .from('media_evidence')
    .select(
      'id, submission_id, block_name, media_type, image_url, location_name, latitude, longitude'
    )
    .not('image_url', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (mediaError) {
    return (
      <main className="p-6">
        <h1 className="mb-4 text-2xl font-bold">Evidence Map</h1>
        <p>Error loading map data.</p>
      </main>
    );
  }

  const submissionIds = Array.from(
    new Set((mediaData || []).map((item: any) => item.submission_id).filter(Boolean))
  );

  const { data: submissionsData, error: submissionsError } = await supabase
    .from('submissions')
    .select('id, city, country')
    .in('id', submissionIds);

  if (submissionsError) {
    return (
      <main className="p-6">
        <h1 className="mb-4 text-2xl font-bold">Evidence Map</h1>
        <p>Error loading submission data.</p>
      </main>
    );
  }

  const submissionsMap = new Map<string, SubmissionRow>();
  (submissionsData || []).forEach((submission: any) => {
    submissionsMap.set(submission.id, submission as SubmissionRow);
  });

  const points: MediaPoint[] = ((mediaData || []) as MediaEvidenceRow[])
    .map((item) => {
      const submission = submissionsMap.get(item.submission_id);

      return {
        id: Number(item.id),
        submission_id: item.submission_id,
        block_name: item.block_name,
        media_type: item.media_type,
        image_url: item.image_url,
        location_name: item.location_name,
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        city: submission?.city ?? null,
        country: submission?.country ?? null,
      };
    })
    .filter(
      (point) =>
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude) &&
        !!point.image_url
    );

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="flex items-center justify-center gap-8">
              <Image
                src="/logo-greencities.png"
                alt="GreenYOUth logo"
                width={260}
                height={90}
                className="h-auto w-auto object-contain"
                priority
              />
              <Image
                src="/UEuropa.png"
                alt="European Union logo"
                width={220}
                height={90}
                className="h-auto w-auto object-contain"
                priority
              />
            </div>
          </div>

          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-5xl font-bold leading-tight text-[#10472f]">
              Evidence Map
            </h1>
            <p className="mt-4 text-xl text-slate-700">
              Visual evidence uploaded through the Green Cities Audit Tool.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <EvidenceMapWrapper points={points} />
        </div>
      </div>
    </main>
  );
}