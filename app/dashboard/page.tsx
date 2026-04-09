'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  Trophy,
  Globe2,
  Building2,
  Users,
  TrendingUp,
  Download,
  Filter,
  RefreshCw,
  Target,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import Link from 'next/link';
import Image from 'next/image';
import ExportAuditData from '@/components/ExportAuditData';

type SubmissionRow = {
  id: string;
  city: string | null;
  country: string | null;
  age_group: string | null;
  overall_score: number | null;
  overall_result: string | null;
  created_at?: string | null;
};

type BlockResponseRow = {
  submission_id: string;
  block_name: string | null;
  block_score: number | null;
  age_group: string | null;
  country?: string | null;
  city?: string | null;
};

type SortDir = 'asc' | 'desc';

type AreaAverage = {
  area: string;
  avg: number;
  count: number;
};

const BRAND = {
  dark: '#10472f',
  bright: '#7dd420',
};

const CHART_COLORS = ['#10472f', '#7dd420', '#1f7a4d', '#4ea66e', '#84cc16', '#16a34a'];

const AGE_16_22 = 'Group 16–22';
const AGE_23_30 = 'Group 23-30';

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

function safeLabel(value: string | null | undefined, fallback = 'Unknown') {
  const trimmed = (value || '').trim();
  return trimmed ? trimmed : fallback;
}

function normalizeAgeGroup(value: string | null | undefined) {
  const v = safeLabel(value);

  if (v === 'Group 16–22' || v === 'Group 16-22' || v === '16–22' || v === '16-22') {
    return AGE_16_22;
  }

  if (v === 'Group 23-30' || v === 'Group 23–30' || v === '23-30' || v === '23–30') {
    return AGE_23_30;
  }

  return v;
}

function toCSV(rows: Record<string, string | number | null | undefined>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);

  const escapeCell = (value: unknown) => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ].join('\n');
}

function downloadCSV(
  filename: string,
  rows: Record<string, string | number | null | undefined>[]
) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function sortRows<T>(
  rows: T[],
  selector: (row: T) => string | number,
  dir: SortDir = 'asc'
) {
  const copy = [...rows];

  copy.sort((a, b) => {
    const va = selector(a);
    const vb = selector(b);

    if (typeof va === 'number' && typeof vb === 'number') {
      return dir === 'asc' ? va - vb : vb - va;
    }

    return dir === 'asc'
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  return copy;
}

function inferRoadmapType(score: number) {
  if (score <= 2) return 'Structural change';
  if (score <= 3) return 'Operational improvement';
  return 'Quick win';
}

function inferAction(area: string) {
  const lower = area.toLowerCase();

  if (lower.includes('mobility')) return 'Improve safe active mobility and public transport';
  if (lower.includes('waste')) return 'Improve recycling access and circular services';
  if (lower.includes('energy') || lower.includes('infrastructure')) {
    return 'Modernise urban energy infrastructure';
  }
  if (lower.includes('pollution')) return 'Reduce visible pollution sources';
  if (lower.includes('governance') || lower.includes('service')) {
    return 'Improve access to services and participation';
  }
  if (lower.includes('urban') || lower.includes('public space')) {
    return 'Improve inclusive, shaded and accessible spaces';
  }

  return 'Define a targeted city improvement measure';
}

function inferActors(area: string) {
  const lower = area.toLowerCase();

  if (lower.includes('mobility')) return 'Municipality, transport authority, youth groups';
  if (lower.includes('waste')) return 'Municipality, waste operator, schools';
  if (lower.includes('energy') || lower.includes('infrastructure')) {
    return 'Municipality, utilities, private sector';
  }
  if (lower.includes('pollution')) return 'Municipality, environmental authority';
  if (lower.includes('governance') || lower.includes('service')) {
    return 'Municipality, youth council, public services';
  }

  return 'Municipality, youth groups, local stakeholders';
}

function scoreBand(score: number) {
  if (score < 2) return 'Very low';
  if (score < 3) return 'Low';
  if (score < 4) return 'Medium';
  return 'High';
}

function KpiCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>{title}</CardTitle>
          <div className="rounded-xl bg-emerald-50 p-2">{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-slate-900">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [blockResponses, setBlockResponses] = useState<BlockResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [countryFilter, setCountryFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');
  const [ageFilter, setAgeFilter] = useState('All');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const submissionsRes = await supabase
          .from('submissions')
          .select('id, city, country, age_group, overall_score, overall_result, created_at')
          .order('created_at', { ascending: false });

        if (submissionsRes.error) throw submissionsRes.error;

        const blocksRes = await supabase
          .from('block_responses')
          .select('submission_id, block_name, block_score, age_group, country, city');

        if (blocksRes.error) throw blocksRes.error;

        setSubmissions((submissionsRes.data || []) as SubmissionRow[]);
        setBlockResponses((blocksRes.data || []) as BlockResponseRow[]);
      } catch (err: any) {
        const message =
          err?.message ||
          err?.error_description ||
          err?.details ||
          JSON.stringify(err) ||
          'Unexpected error loading dashboard';

        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const countries = useMemo(
    () => [
      'All',
      ...sortRows(
        [...new Set(submissions.map((s) => safeLabel(s.country)).filter(Boolean))],
        (v) => v,
        'asc'
      ),
    ],
    [submissions]
  );

  const cities = useMemo(
    () => [
      'All',
      ...sortRows(
        [...new Set(submissions.map((s) => safeLabel(s.city)).filter(Boolean))],
        (v) => v,
        'asc'
      ),
    ],
    [submissions]
  );

  const ageGroups = useMemo(
    () => [
      'All',
      ...sortRows(
        [...new Set(submissions.map((s) => normalizeAgeGroup(s.age_group)).filter(Boolean))],
        (v) => v,
        'asc'
      ),
    ],
    [submissions]
  );

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((submission) => {
      const normalizedAge = normalizeAgeGroup(submission.age_group);
      const matchesCountry =
        countryFilter === 'All' || safeLabel(submission.country) === countryFilter;
      const matchesCity = cityFilter === 'All' || safeLabel(submission.city) === cityFilter;
      const matchesAge = ageFilter === 'All' || normalizedAge === ageFilter;
      return matchesCountry && matchesCity && matchesAge;
    });
  }, [submissions, countryFilter, cityFilter, ageFilter]);

  const filteredSubmissionIds = useMemo(
    () => new Set(filteredSubmissions.map((submission) => submission.id)),
    [filteredSubmissions]
  );

  const filteredBlockResponses = useMemo(() => {
    return blockResponses.filter((row) => {
      if (!filteredSubmissionIds.has(row.submission_id)) return false;

      const normalizedAge = normalizeAgeGroup(row.age_group);
      const matchesCountry = countryFilter === 'All' || safeLabel(row.country) === countryFilter;
      const matchesCity = cityFilter === 'All' || safeLabel(row.city) === cityFilter;
      const matchesAge = ageFilter === 'All' || normalizedAge === ageFilter;

      return matchesCountry && matchesCity && matchesAge;
    });
  }, [blockResponses, filteredSubmissionIds, countryFilter, cityFilter, ageFilter]);

  const totalResponses = filteredSubmissions.length;
  const countriesRepresented = useMemo(
    () => new Set(filteredSubmissions.map((s) => safeLabel(s.country))).size,
    [filteredSubmissions]
  );
  const citiesRepresented = useMemo(
    () => new Set(filteredSubmissions.map((s) => safeLabel(s.city))).size,
    [filteredSubmissions]
  );
  const averageOverallScore = useMemo(() => {
    return average(
      filteredSubmissions
        .map((s) => s.overall_score)
        .filter((value): value is number => typeof value === 'number')
    );
  }, [filteredSubmissions]);

  const averageByArea = useMemo<AreaAverage[]>(() => {
    const grouped: Record<string, number[]> = {};

    filteredBlockResponses.forEach((row) => {
      if (typeof row.block_score !== 'number') return;
      const area = safeLabel(row.block_name);
      if (!grouped[area]) grouped[area] = [];
      grouped[area].push(row.block_score);
    });

    return Object.entries(grouped)
      .map(([area, scores]) => ({ area, avg: average(scores), count: scores.length }))
      .sort((a, b) => a.avg - b.avg);
  }, [filteredBlockResponses]);

  const weakestAreas = useMemo(() => averageByArea.slice(0, 3), [averageByArea]);
  const strongestAreas = useMemo(
    () => [...averageByArea].sort((a, b) => b.avg - a.avg).slice(0, 3),
    [averageByArea]
  );

  const areaChartData = useMemo(
    () => averageByArea.map((row) => ({ area: row.area, avg: row.avg })),
    [averageByArea]
  );

  const roadmapSuggestions = useMemo(() => {
    return weakestAreas.map((row, index) => ({
      priority: index + 1,
      area: row.area,
      score: row.avg,
      band: scoreBand(row.avg),
      actionType: inferRoadmapType(row.avg),
      suggestedAction: inferAction(row.area),
      actors: inferActors(row.area),
    }));
  }, [weakestAreas]);

  const exportOverview = () => {
    downloadCSV(
      'dashboard-overview.csv',
      filteredSubmissions.map((submission) => ({
        id: submission.id,
        country: safeLabel(submission.country),
        city: safeLabel(submission.city),
        age_group: normalizeAgeGroup(submission.age_group),
        overall_score: submission.overall_score,
        overall_result: safeLabel(submission.overall_result),
        created_at: submission.created_at || '',
      }))
    );
  };

  const exportRoadmap = () => {
    downloadCSV('dashboard-roadmap-priorities.csv', roadmapSuggestions);
  };

  const resetFilters = () => {
    setCountryFilter('All');
    setCityFilter('All');
    setAgeFilter('All');
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <RefreshCw className="h-5 w-5 animate-spin text-emerald-700" />
            <p className="text-slate-700">Loading dashboard...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
            <p className="font-semibold">Dashboard error</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
              <Image
                src="/logo-greencities.png"
                alt="GreenYOUth logo"
                width={260}
                height={90}
                className="h-auto w-[180px] object-contain sm:w-[220px] md:w-[260px]"
                priority
              />
              <Image
                src="/UEuropa.png"
                alt="European Union logo"
                width={220}
                height={90}
                className="h-auto w-[150px] object-contain sm:w-[190px] md:w-[220px]"
                priority
              />
            </div>
          </div>

          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-5xl font-bold leading-tight text-[#10472f]">
              Green Cities Audit Dashboard
            </h1>
            <p className="mt-4 text-xl text-slate-600">
              Compact executive view of responses, priorities and suggested roadmap actions.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/map"
              className="rounded-xl bg-green-700 px-5 py-3 font-medium text-white hover:bg-green-800"
            >
              Open Evidence Map
            </Link>

            <Link
              href="/"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 hover:bg-slate-100"
            >
              Back to form
            </Link>

            
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-emerald-700" />
                  <span>Filters</span>
                </div>
              </CardTitle>

              <button
                onClick={resetFilters}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  {cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Age group</label>
                <select
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  {ageGroups.map((age) => (
                    <option key={age} value={age}>
                      {age}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Total responses"
            value={totalResponses}
            icon={<Users className="h-5 w-5 text-emerald-700" />}
          />
          <KpiCard
            title="Countries"
            value={countriesRepresented}
            icon={<Globe2 className="h-5 w-5 text-emerald-700" />}
          />
          <KpiCard
            title="Cities"
            value={citiesRepresented}
            icon={<Building2 className="h-5 w-5 text-emerald-700" />}
          />
          <KpiCard
            title="Global average"
            value={averageOverallScore}
            icon={<TrendingUp className="h-5 w-5 text-emerald-700" />}
          />
          <KpiCard
            title="Priority areas"
            value={weakestAreas.length}
            icon={<Target className="h-5 w-5 text-emerald-700" />}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <span>Weakest areas</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {weakestAreas.map((item, idx) => (
                  <div
                    key={item.area}
                    className="flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{idx + 1}. {item.area}</p>
                      <p className="text-sm text-slate-500">{scoreBand(item.avg)}</p>
                    </div>
                    <div className="text-lg font-bold text-orange-700">{item.avg}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-emerald-700" />
                  <span>Strongest areas</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {strongestAreas.map((item, idx) => (
                  <div
                    key={item.area}
                    className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{idx + 1}. {item.area}</p>
                      <p className="text-sm text-slate-500">{scoreBand(item.avg)}</p>
                    </div>
                    <div className="text-lg font-bold text-emerald-700">{item.avg}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Roadmap priorities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {roadmapSuggestions.map((row) => (
                  <div key={row.priority} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">P{row.priority}. {row.area}</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {row.score}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700"><strong>Type:</strong> {row.actionType}</p>
                    <p className="mt-1 text-sm text-slate-700"><strong>Action:</strong> {row.suggestedAction}</p>
                    <p className="mt-1 text-sm text-slate-700"><strong>Actors:</strong> {row.actors}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Average score by area</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[420px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaChartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="area"
                    angle={-18}
                    textAnchor="end"
                    interval={0}
                    height={90}
                    tick={{ fill: '#334155', fontSize: 12 }}
                  />
                  <YAxis domain={[0, 5]} tick={{ fill: '#334155', fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="avg" name="Average score" radius={[8, 8, 0, 0]}>
                    {areaChartData.map((entry, index) => (
                      <Cell key={entry.area} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <ExportAuditData />
    </main>
  );
}
