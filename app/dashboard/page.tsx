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
  Legend,
  LineChart,
  Line,
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
  MapPinned,
  CalendarRange,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import Link from 'next/link';
import Image from 'next/image';

type ItemResponseRow = {
  submission_id: string;
  block_name: string;
  item_code: string;
  item_question: string;
  item_order: number;
  score: number | null;
  explanation: string | null;
  age_group: string | null;
  country?: string | null;
  city?: string | null;
};

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
  block_name: string;
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

type CountRow = {
  label: string;
  count: number;
};

type ComparisonRow = {
  group: string;
  area: string;
  avg: number;
};

type PatternRow = {
  pattern: string;
  occurrences: number;
};

const BRAND = {
  dark: '#10472f',
  bright: '#7dd420',
};

const CHART_COLORS = [
  '#10472f',
  '#7dd420',
  '#1f7a4d',
  '#4ea66e',
  '#b7e87a',
  '#2f855a',
  '#84cc16',
  '#16a34a',
];

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

  if (
    v === 'Group 16–22' ||
    v === 'Group 16-22' ||
    v === '16–22' ||
    v === '16-22'
  ) {
    return 'Group 16–22';
  }

  if (
    v === 'Group 23-30' ||
    v === 'Group 23–30' ||
    v === '23-30' ||
    v === '23–30'
  ) {
    return 'Group 23-30';
  }

  return v;
}

function formatDateLabel(dateString: string | null | undefined) {
  if (!dateString) return 'Unknown';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function formatMonthLabel(dateString: string | null | undefined) {
  if (!dateString) return 'Unknown';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
  });
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
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
  ].join('\n');
}

function downloadCSV(filename: string, rows: Record<string, string | number | null | undefined>[]) {
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

type DownloadRoadmapButtonProps = {
  submissionId: string;
};

function DownloadRoadmapButton({
  submissionId,
}: DownloadRoadmapButtonProps) {
  const handleDownload = () => {
    window.open(`/api/roadmap/${submissionId}/word`, '_blank');
  };

  return (
    <button
      onClick={handleDownload}
      className="rounded-xl px-4 py-2 bg-green-700 text-white"
    >
      Download Word Roadmap
    </button>
  );
}

function groupCounts(items: string[]) {
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    counts[item] = (counts[item] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function buildPatternLabel(area: string, score: number) {
  if (score <= 2) return `${area}: critical`;
  if (score <= 3) return `${area}: medium-low`;
  return `${area}: acceptable/high`;
}

function sortRows<T>(rows: T[], selector: (row: T) => string | number, dir: SortDir = 'asc') {
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
  if (lower.includes('mobility')) return 'Improve safe active mobility and public transport connections';
  if (lower.includes('waste')) return 'Improve recycling access, clarity, and circular economy services';
  if (lower.includes('energy')) return 'Modernise urban energy infrastructure and visible renewable solutions';
  if (lower.includes('pollution')) return 'Reduce the most visible pollution sources through targeted local measures';
  if (lower.includes('governance') || lower.includes('service')) return 'Improve access to services and youth participation channels';
  if (lower.includes('urban')) return 'Improve inclusive, shaded, and accessible public spaces';
  return 'Define a targeted city improvement measure for this weak area';
}

function inferActors(area: string) {
  const lower = area.toLowerCase();
  if (lower.includes('mobility')) return 'Municipality, transport authority, youth organisations';
  if (lower.includes('waste')) return 'Municipality, waste operator, schools, youth organisations';
  if (lower.includes('energy')) return 'Municipality, utilities, private sector';
  if (lower.includes('pollution')) return 'Municipality, environmental authority, local community';
  if (lower.includes('governance') || lower.includes('service')) return 'Municipality, youth council, public services';
  return 'Municipality, youth organisations, local stakeholders';
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

function BasicTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-semibold text-slate-700">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {row.map((cell, cidx) => (
                <td key={`${idx}-${cidx}`} className="px-3 py-2 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [blockResponses, setBlockResponses] = useState<BlockResponseRow[]>([]);
  const [itemResponses, setItemResponses] = useState<ItemResponseRow[]>([]);
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

        const itemsRes = await supabase
  .from('item_responses')
  .select(
    'submission_id, block_name, item_code, item_question, item_order, score, explanation, age_group, country, city'
  );

if (itemsRes.error) throw itemsRes.error;

setSubmissions((submissionsRes.data || []) as SubmissionRow[]);
setBlockResponses((blocksRes.data || []) as BlockResponseRow[]);
setItemResponses((itemsRes.data || []) as ItemResponseRow[]);
4
        
      } catch (err: any) {
        console.error('DASHBOARD LOAD ERROR FULL:', JSON.stringify(err, null, 2));
        console.error('DASHBOARD LOAD ERROR RAW:', err);
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
    () => ['All', ...sortRows([...new Set(submissions.map((s) => safeLabel(s.country)).filter(Boolean))], (v) => v, 'asc')],
    [submissions]
  );

  const cities = useMemo(
    () => ['All', ...sortRows([...new Set(submissions.map((s) => safeLabel(s.city)).filter(Boolean))], (v) => v, 'asc')],
    [submissions]
  );

  const ageGroups = useMemo(
    () => ['All', ...sortRows([...new Set(submissions.map((s) => normalizeAgeGroup(s.age_group)).filter(Boolean))], (v) => v, 'asc')],
    [submissions]
  );

 
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      const normalizedAge = normalizeAgeGroup(s.age_group);
      const matchesCountry = countryFilter === 'All' || safeLabel(s.country) === countryFilter;
      const matchesCity = cityFilter === 'All' || safeLabel(s.city) === cityFilter;
      const matchesAge = ageFilter === 'All' || normalizedAge === ageFilter;
      return matchesCountry && matchesCity && matchesAge;
    });
  }, [submissions, countryFilter, cityFilter, ageFilter]);

  const filteredSubmissionIds = useMemo(() => new Set(filteredSubmissions.map((s) => s.id)), [filteredSubmissions]);

  const filteredItemResponses = useMemo(() => {
  return itemResponses.filter((row) => {
    if (!filteredSubmissionIds.has(row.submission_id)) return false;

    const normalizedAge = normalizeAgeGroup(row.age_group);
    const matchesCountry = countryFilter === 'All' || safeLabel(row.country) === countryFilter;
    const matchesCity = cityFilter === 'All' || safeLabel(row.city) === cityFilter;
    const matchesAge = ageFilter === 'All' || normalizedAge === ageFilter;

    return matchesCountry && matchesCity && matchesAge;
  });
}, [itemResponses, filteredSubmissionIds, countryFilter, cityFilter, ageFilter]);



  const filteredBlockResponses = useMemo(() => {
    return blockResponses.filter((b) => {
      if (!filteredSubmissionIds.has(b.submission_id)) return false;
      const normalizedAge = normalizeAgeGroup(b.age_group);
      const matchesCountry = countryFilter === 'All' || safeLabel(b.country) === countryFilter;
      const matchesCity = cityFilter === 'All' || safeLabel(b.city) === cityFilter;
      const matchesAge = ageFilter === 'All' || normalizedAge === ageFilter;
      return matchesCountry && matchesCity && matchesAge;
    });
  }, [blockResponses, filteredSubmissionIds, countryFilter, cityFilter, ageFilter]);

  


  const totalResponses = filteredSubmissions.length;
  const countriesRepresented = useMemo(() => new Set(filteredSubmissions.map((s) => safeLabel(s.country))).size, [filteredSubmissions]);
  const citiesRepresented = useMemo(() => new Set(filteredSubmissions.map((s) => safeLabel(s.city))).size, [filteredSubmissions]);
  const ageRepresented = useMemo(() => new Set(filteredSubmissions.map((s) => normalizeAgeGroup(s.age_group))).size, [filteredSubmissions]);

  const averageOverallScore = useMemo(() => {
    return average(filteredSubmissions.map((s) => s.overall_score).filter((v): v is number => typeof v === 'number'));
  }, [filteredSubmissions]);

  const responsesByCountry = useMemo<CountRow[]>(() => {
    return groupCounts(filteredSubmissions.map((s) => safeLabel(s.country))).map((row) => ({ label: row.label, count: row.count }));
  }, [filteredSubmissions]);

  const responsesByCity = useMemo<CountRow[]>(() => {
    return groupCounts(filteredSubmissions.map((s) => safeLabel(s.city))).map((row) => ({ label: row.label, count: row.count }));
  }, [filteredSubmissions]);

  const responsesByAge = useMemo<CountRow[]>(() => {
    return groupCounts(filteredSubmissions.map((s) => normalizeAgeGroup(s.age_group))).map((row) => ({ label: row.label, count: row.count }));
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
  const strongestAreas = useMemo(() => [...averageByArea].sort((a, b) => b.avg - a.avg).slice(0, 3), [averageByArea]);

  const comparisonByCountry = useMemo<ComparisonRow[]>(() => {
    const grouped: Record<string, Record<string, number[]>> = {};
    filteredBlockResponses.forEach((row) => {
      if (typeof row.block_score !== 'number') return;
      const group = safeLabel(row.country);
      const area = safeLabel(row.block_name);
      if (!grouped[group]) grouped[group] = {};
      if (!grouped[group][area]) grouped[group][area] = [];
      grouped[group][area].push(row.block_score);
    });

    return Object.entries(grouped).flatMap(([group, areas]) =>
      Object.entries(areas).map(([area, scores]) => ({ group, area, avg: average(scores) }))
    );
  }, [filteredBlockResponses]);

  const comparisonByCity = useMemo<ComparisonRow[]>(() => {
    const grouped: Record<string, Record<string, number[]>> = {};
    filteredBlockResponses.forEach((row) => {
      if (typeof row.block_score !== 'number') return;
      const group = safeLabel(row.city);
      const area = safeLabel(row.block_name);
      if (!grouped[group]) grouped[group] = {};
      if (!grouped[group][area]) grouped[group][area] = [];
      grouped[group][area].push(row.block_score);
    });

    return Object.entries(grouped).flatMap(([group, areas]) =>
      Object.entries(areas).map(([area, scores]) => ({ group, area, avg: average(scores) }))
    );
  }, [filteredBlockResponses]);

  const comparisonByAge = useMemo<ComparisonRow[]>(() => {
    const grouped: Record<string, Record<string, number[]>> = {};
    filteredBlockResponses.forEach((row) => {
      if (typeof row.block_score !== 'number') return;
      const group = normalizeAgeGroup(row.age_group);
      const area = safeLabel(row.block_name);
      if (!grouped[group]) grouped[group] = {};
      if (!grouped[group][area]) grouped[group][area] = [];
      grouped[group][area].push(row.block_score);
    });

    return Object.entries(grouped).flatMap(([group, areas]) =>
      Object.entries(areas).map(([area, scores]) => ({ group, area, avg: average(scores) }))
    );
  }, [filteredBlockResponses]);

  const ageBandComparison = useMemo(() => {
    const data = averageByArea.map((row) => ({
      area: row.area,
      [AGE_16_22]: 0,
      [AGE_23_30]: 0,
    }));

    const areaIndex = new Map(
      data.map((d, idx) => [d.area, idx] as const)
    );

    const grouped: Record<string, Record<string, number[]>> = {};

    filteredBlockResponses.forEach((row) => {
      if (typeof row.block_score !== 'number') return;

      const age = normalizeAgeGroup(row.age_group);
      const area = safeLabel(row.block_name);

      if (age !== AGE_16_22 && age !== AGE_23_30) return;

      if (!grouped[age]) grouped[age] = {};
      if (!grouped[age][area]) grouped[age][area] = [];
      grouped[age][area].push(row.block_score);
    });

    Object.entries(grouped).forEach(([age, areas]) => {
      Object.entries(areas).forEach(([area, scores]) => {
        const idx = areaIndex.get(area);
        if (idx === undefined) return;

        data[idx] = {
          ...data[idx],
          [age]: average(scores),
        };
      });
    });

    return data;
  }, [averageByArea, filteredBlockResponses]);

  const areaChartData = useMemo(
    () => averageByArea.map((row) => ({ area: row.area, avg: row.avg, count: row.count })),
    [averageByArea]
  );

  const countryChartData = useMemo(
    () => responsesByCountry.map((row) => ({ country: row.label, count: row.count })),
    [responsesByCountry]
  );

  const ageChartData = useMemo(
    () => responsesByAge.map((row) => ({ age: row.label, count: row.count })),
    [responsesByAge]
  );

  const cityChartData = useMemo(() => {
    const grouped: Record<string, number[]> = {};
    filteredSubmissions.forEach((s) => {
      if (typeof s.overall_score !== 'number') return;
      const city = safeLabel(s.city);
      if (!grouped[city]) grouped[city] = [];
      grouped[city].push(s.overall_score);
    });

    return Object.entries(grouped)
      .map(([city, scores]) => ({ city, avg: average(scores), responses: scores.length }))
      .sort((a, b) => b.responses - a.responses);
  }, [filteredSubmissions]);

  const responsesOverTime = useMemo(() => {
    const grouped: Record<string, number[]> = {};
    filteredSubmissions.forEach((s) => {
      const key = formatMonthLabel(s.created_at);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(typeof s.overall_score === 'number' ? s.overall_score : 0);
    });

    return Object.entries(grouped).map(([month, scores]) => ({
      month,
      responses: scores.length,
      avgScore: average(scores.filter((s) => s > 0)),
    }));
  }, [filteredSubmissions]);

  const mapCityData: {
    city: string;
    lat: number;
    lng: number;
    count: number;
    avgScore: number;
  }[] = [];

  const hasMapData = false;

const weakestIndicators = useMemo(() => {
  const grouped: Record<
    string,
    {
      item_code: string;
      item_question: string;
      block_name: string;
      scores: number[];
    }
  > = {};

  filteredItemResponses.forEach((row) => {
    if (typeof row.score !== 'number') return;

    const key = `${row.item_code}|||${row.item_question}`;

    if (!grouped[key]) {
      grouped[key] = {
        item_code: row.item_code,
        item_question: row.item_question,
        block_name: safeLabel(row.block_name),
        scores: [],
      };
    }

    grouped[key].scores.push(row.score);
  });

  return Object.values(grouped)
    .map((row) => ({
      indicator: `${row.item_code} - ${row.item_question}`,
      block: row.block_name,
      avg: average(row.scores),
      count: row.scores.length,
    }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 10);
}, [filteredItemResponses]);

  const repeatedPatterns = useMemo<PatternRow[]>(() => {
  const labels: string[] = [];

  filteredItemResponses.forEach((row) => {
    if (typeof row.score !== 'number') return;
    labels.push(buildPatternLabel(`${row.item_code} ${row.item_question}`, row.score));
  });

  return groupCounts(labels)
    .map((row) => ({ pattern: row.label, occurrences: row.count }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 10);
}, [filteredItemResponses]);


const weakestIndicatorsByCity = useMemo(() => {
  const grouped: Record<
    string,
    {
      city: string;
      item_code: string;
      item_question: string;
      scores: number[];
    }
  > = {};

  filteredItemResponses.forEach((row) => {
    if (typeof row.score !== 'number') return;

    const city = safeLabel(row.city);
    const key = `${city}|||${row.item_code}|||${row.item_question}`;

    if (!grouped[key]) {
      grouped[key] = {
        city,
        item_code: row.item_code,
        item_question: row.item_question,
        scores: [],
      };
    }

    grouped[key].scores.push(row.score);
  });

  return Object.values(grouped)
    .map((row) => ({
      group: row.city,
      indicator: `${row.item_code} - ${row.item_question}`,
      avg: average(row.scores),
      count: row.scores.length,
    }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 20);
}, [filteredItemResponses]);

const weakestIndicatorsByCountry = useMemo(() => {
  const grouped: Record<
    string,
    {
      country: string;
      item_code: string;
      item_question: string;
      scores: number[];
    }
  > = {};

  filteredItemResponses.forEach((row) => {
    if (typeof row.score !== 'number') return;

    const country = safeLabel(row.country);
    const key = `${country}|||${row.item_code}|||${row.item_question}`;

    if (!grouped[key]) {
      grouped[key] = {
        country,
        item_code: row.item_code,
        item_question: row.item_question,
        scores: [],
      };
    }

    grouped[key].scores.push(row.score);
  });

  return Object.values(grouped)
    .map((row) => ({
      group: row.country,
      indicator: `${row.item_code} - ${row.item_question}`,
      avg: average(row.scores),
      count: row.scores.length,
    }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 20);
}, [filteredItemResponses]);

const weakestIndicatorsByAge = useMemo(() => {
  const grouped: Record<
    string,
    {
      age: string;
      item_code: string;
      item_question: string;
      scores: number[];
    }
  > = {};

  filteredItemResponses.forEach((row) => {
    if (typeof row.score !== 'number') return;

    const age = normalizeAgeGroup(row.age_group);
    const key = `${age}|||${row.item_code}|||${row.item_question}`;

    if (!grouped[key]) {
      grouped[key] = {
        age,
        item_code: row.item_code,
        item_question: row.item_question,
        scores: [],
      };
    }

    grouped[key].scores.push(row.score);
  });

  return Object.values(grouped)
    .map((row) => ({
      group: row.age,
      indicator: `${row.item_code} - ${row.item_question}`,
      avg: average(row.scores),
      count: row.scores.length,
    }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 20);
}, [filteredItemResponses]);


  const roadmapSuggestions = useMemo(() => {
    return weakestAreas.map((row, index) => ({
      priority: index + 1,
      area: row.area,
      score: row.avg,
      scoreBand: scoreBand(row.avg),
      actionType: inferRoadmapType(row.avg),
      suggestedAction: inferAction(row.area),
      actors: inferActors(row.area),
    }));
  }, [weakestAreas]);


  
  const exportOverview = () => {
    downloadCSV(
      'dashboard-overview.csv',
      filteredSubmissions.map((s) => ({
        id: s.id,
        country: safeLabel(s.country),
        city: safeLabel(s.city),
        age_group: normalizeAgeGroup(s.age_group),
        overall_score: s.overall_score,
        overall_result: safeLabel(s.overall_result),
        created_at: s.created_at || '',
      }))
    );
  };
  

  const exportAreas = () => {
    downloadCSV(
      'dashboard-area-averages.csv',
      averageByArea.map((row) => ({
        area: row.area,
        average_score: row.avg,
        responses: row.count,
        score_band: scoreBand(row.avg),
      }))
    );
  };

  const exportRoadmap = () => {
    const grouped: Record<string, number[]> = {};

    blockResponses.forEach((row) => {
      if (typeof row.block_score !== 'number') return;

      const country = safeLabel(row.country);
      const city = safeLabel(row.city);
      const age_group = normalizeAgeGroup(row.age_group);
      const area = safeLabel(row.block_name);

      const key = `${country}|||${city}|||${age_group}|||${area}`;

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row.block_score);
    });

    const roadmapRows = Object.entries(grouped).map(([key, scores]) => {
      const [country, city, age_group, area] = key.split('|||');
      const score = average(scores);

      return {
        country,
        city,
        age_group,
        area,
        score,
        score_band: scoreBand(score),
        action_type: inferRoadmapType(score),
        suggested_action: inferAction(area),
        actors: inferActors(area),
      };
    });

    const byGroup: Record<string, typeof roadmapRows> = {};

    roadmapRows.forEach((row) => {
      const groupKey = `${row.country}|||${row.city}|||${row.age_group}`;
      if (!byGroup[groupKey]) byGroup[groupKey] = [];
      byGroup[groupKey].push(row);
    });

    const rankedRows: Array<{
      priority_rank: number;
      country: string;
      city: string;
      age_group: string;
      area: string;
      score: number;
      score_band: string;
      action_type: string;
      suggested_action: string;
      actors: string;
    }> = [];

    Object.values(byGroup).forEach((rows) => {
      rows
        .sort((a, b) => a.score - b.score)
        .forEach((row, index) => {
          rankedRows.push({
            priority_rank: index + 1,
            ...row,
          });
        });
    });

    rankedRows.sort((a, b) => {
      if (a.country !== b.country) return a.country.localeCompare(b.country);
      if (a.city !== b.city) return a.city.localeCompare(b.city);
      if (a.age_group !== b.age_group) return a.age_group.localeCompare(b.age_group);
      return a.priority_rank - b.priority_rank;
    });

    downloadCSV('dashboard-roadmap-all-cities-ranked.csv', rankedRows);
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
  Green Cities Audit Dashboard
</h1>

    <p className="mt-4 text-xl text-slate-600">
      Overview of responses, scores and roadmap outputs.
    </p>
  </div>

  <div className="flex flex-wrap justify-center gap-3">
    <Link
      href="/map"
      className="rounded-xl bg-green-700 px-5 py-3 text-white font-medium hover:bg-green-800"
    >
      Open Evidence Map
    </Link>

    <Link
      href="/"
      className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-slate-700 font-medium hover:bg-slate-100"
    >
      Back to form
    </Link>

    <button
      onClick={exportOverview}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <Download className="h-4 w-4" />
      Export overview
    </button>

    <button
      onClick={exportAreas}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <Download className="h-4 w-4" />
      Export areas
    </button>

    <button
      onClick={exportRoadmap}
      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100"
    >
      <Download className="h-4 w-4" />
      Export roadmap all cities
    </button>
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
                    <option key={country} value={country}>{country}</option>
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
                    <option key={city} value={city}>{city}</option>
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
                    <option key={age} value={age}>{age}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Total responses" value={totalResponses} icon={<Users className="h-5 w-5 text-emerald-700" />} />
          <KpiCard title="Countries" value={countriesRepresented} icon={<Globe2 className="h-5 w-5 text-emerald-700" />} />
          <KpiCard title="Cities" value={citiesRepresented} icon={<Building2 className="h-5 w-5 text-emerald-700" />} />
          <KpiCard title="Age groups" value={ageRepresented} icon={<Users className="h-5 w-5 text-emerald-700" />} />
          <KpiCard title="Global average" value={averageOverallScore} icon={<TrendingUp className="h-5 w-5 text-emerald-700" />} />
          <KpiCard title="Timeline points" value={responsesOverTime.length} icon={<CalendarRange className="h-5 w-5 text-emerald-700" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Distribution by country</CardTitle></CardHeader>
            <CardContent>
              <BasicTable headers={['Country', 'Responses']} rows={responsesByCountry.map((row) => [row.label, row.count])} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Distribution by city</CardTitle></CardHeader>
            <CardContent>
              <BasicTable headers={['City', 'Responses']} rows={responsesByCity.map((row) => [row.label, row.count])} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Distribution by age</CardTitle></CardHeader>
            <CardContent>
              <BasicTable headers={['Age group', 'Responses']} rows={responsesByAge.map((row) => [row.label, row.count])} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <span>Top 3 weakest areas</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {weakestAreas.map((item, idx) => (
                  <div key={item.area} className="flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50 p-3">
                    <div>
                      <p className="font-medium text-slate-900">{idx + 1}. {item.area}</p>
                      <p className="text-sm text-slate-500">{item.count} scored responses</p>
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
                  <span>Top 3 strongest areas</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {strongestAreas.map((item, idx) => (
                  <div key={item.area} className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                    <div>
                      <p className="font-medium text-slate-900">{idx + 1}. {item.area}</p>
                      <p className="text-sm text-slate-500">{item.count} scored responses</p>
                    </div>
                    <div className="text-lg font-bold text-emerald-700">{item.avg}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Average results by block / area</CardTitle></CardHeader>
          <CardContent>
            <BasicTable headers={['Area', 'Average score', 'Responses', 'Band']} rows={averageByArea.map((row) => [row.area, row.avg, row.count, scoreBand(row.avg)])} />
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Comparison by country</CardTitle></CardHeader>
            <CardContent>
              <BasicTable headers={['Country', 'Area', 'Average score']} rows={comparisonByCountry.map((row) => [row.group, row.area, row.avg])} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Comparison by city</CardTitle></CardHeader>
            <CardContent>
              <BasicTable headers={['City', 'Area', 'Average score']} rows={comparisonByCity.map((row) => [row.group, row.area, row.avg])} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Comparison by age group</CardTitle></CardHeader>
            <CardContent>
              <BasicTable headers={['Age group', 'Area', 'Average score']} rows={comparisonByAge.map((row) => [row.group, row.area, row.avg])} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>16–22 vs 23–30</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ageBandComparison} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="area" angle={-20} textAnchor="end" interval={0} height={70} tick={{ fill: '#334155', fontSize: 12 }} />
                    <YAxis domain={[0, 5]} tick={{ fill: '#334155', fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey={AGE_16_22} fill={BRAND.dark} radius={[6, 6, 0, 0]} />
                    <Bar dataKey={AGE_23_30} fill={BRAND.bright} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Bar chart by area</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={areaChartData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="area" angle={-20} textAnchor="end" interval={0} height={70} tick={{ fill: '#334155', fontSize: 12 }} />
                    <YAxis domain={[0, 5]} tick={{ fill: '#334155', fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="avg" name="Average score" radius={[6, 6, 0, 0]}>
                      {areaChartData.map((entry, index) => (
                        <Cell key={`cell-${entry.area}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Chart by countries</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countryChartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="country" tick={{ fill: '#334155', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#334155', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Responses" radius={[6, 6, 0, 0]}>
                      {countryChartData.map((entry, index) => (
                        <Cell key={`country-${entry.country}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Chart by age groups</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ageChartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="age" tick={{ fill: '#334155', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#334155', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Responses" radius={[6, 6, 0, 0]}>
                      {ageChartData.map((entry, index) => (
                        <Cell key={`age-${entry.age}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Comparison between cities</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cityChartData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="city" angle={-20} textAnchor="end" interval={0} height={70} tick={{ fill: '#334155', fontSize: 12 }} />
                    <YAxis domain={[0, 5]} tick={{ fill: '#334155', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="avg" name="Average score" radius={[6, 6, 0, 0]}>
                      {cityChartData.map((entry, index) => (
                        <Cell key={`city-${entry.city}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <MapPinned className="h-5 w-5 text-emerald-700" />
                  <span>Map by cities</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasMapData ? (
                <BasicTable headers={['City', 'Lat', 'Lng', 'Responses', 'Avg score']} rows={mapCityData.map((row) => [row.city, row.lat, row.lng, row.count, row.avgScore])} />
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No geographic coordinates detected. For a real map you need latitude/longitude in submissions.
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-5 w-5 text-emerald-700" />
                  <span>Timeline view</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={responsesOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fill: '#334155', fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fill: '#334155', fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fill: '#334155', fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="responses" stroke={BRAND.dark} strokeWidth={3} dot={{ fill: BRAND.dark }} name="Responses" />
                    <Line yAxisId="right" type="monotone" dataKey="avgScore" stroke={BRAND.bright} strokeWidth={3} dot={{ fill: BRAND.bright }} name="Average score" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Weakest indicators</CardTitle></CardHeader>
            <CardContent>
              
              <BasicTable headers={['Indicator proxy', 'Block', 'Avg score', 'Responses']} rows={weakestIndicators.map((row) => [row.indicator, row.block, row.avg, row.count])} />
            </CardContent>
          </Card>
          <div className="grid gap-4 xl:grid-cols-3">
  <Card>
    <CardHeader>
      <CardTitle>Weakest indicators by city</CardTitle>
    </CardHeader>
    <CardContent>
      <BasicTable
        headers={['City', 'Indicator', 'Avg score', 'Responses']}
        rows={weakestIndicatorsByCity.map((row) => [
          row.group,
          row.indicator,
          row.avg,
          row.count,
        ])}
      />
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Weakest indicators by country</CardTitle>
    </CardHeader>
    <CardContent>
      <BasicTable
        headers={['Country', 'Indicator', 'Avg score', 'Responses']}
        rows={weakestIndicatorsByCountry.map((row) => [
          row.group,
          row.indicator,
          row.avg,
          row.count,
        ])}
      />
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Weakest indicators by age group</CardTitle>
    </CardHeader>
    <CardContent>
      <BasicTable
        headers={['Age group', 'Indicator', 'Avg score', 'Responses']}
        rows={weakestIndicatorsByAge.map((row) => [
          row.group,
          row.indicator,
          row.avg,
          row.count,
        ])}
      />
    </CardContent>
  </Card>
</div>
          <Card>
            <CardHeader><CardTitle>Repeated patterns</CardTitle></CardHeader>
            <CardContent>
              <BasicTable headers={['Pattern', 'Occurrences']} rows={repeatedPatterns.map((row) => [row.pattern, row.occurrences])} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Roadmap suggestions from the weakest areas</CardTitle></CardHeader>
          <CardContent>
            <BasicTable headers={['Priority', 'Area', 'Score', 'Band', 'Action type', 'Suggested action', 'Actors']} rows={roadmapSuggestions.map((row) => [row.priority, row.area, row.score, row.scoreBand, row.actionType, row.suggestedAction, row.actors])} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent submissions</CardTitle></CardHeader>
          <CardContent>
            <BasicTable headers={['Date', 'Country', 'City', 'Age', 'Overall score', 'Result']} rows={filteredSubmissions.slice(0, 20).map((s) => [formatDateLabel(s.created_at), safeLabel(s.country), safeLabel(s.city), normalizeAgeGroup(s.age_group), typeof s.overall_score === 'number' ? s.overall_score : '-', safeLabel(s.overall_result)])} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}