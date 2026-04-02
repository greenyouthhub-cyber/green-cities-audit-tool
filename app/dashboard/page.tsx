'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

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
};

type AreaAverage = {
  area: string;
  avg: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

function getShortPriority(area: string) {
  const value = area.toLowerCase();

  if (value.includes('mobility')) {
    return 'Improve signage, pedestrian safety and quick low-cost mobility fixes.';
  }
  if (value.includes('waste')) {
    return 'Reinforce waste information, container clarity and local awareness actions.';
  }
  if (value.includes('energy') || value.includes('infrastructure')) {
    return 'Upgrade basic lighting efficiency and identify urgent maintenance issues.';
  }
  if (value.includes('pollution')) {
    return 'Address local hotspots and strengthen immediate monitoring and communication.';
  }
  if (value.includes('urban design') || value.includes('public space')) {
    return 'Improve maintenance, shade, accessibility and quick public-space upgrades.';
  }
  if (value.includes('services') || value.includes('governance')) {
    return 'Simplify access to information and open clearer participation channels.';
  }

  return 'Define a quick-win action plan focused on visibility, maintenance and accessibility.';
}

function getMediumPriority(area: string) {
  const value = area.toLowerCase();

  if (value.includes('mobility')) {
    return 'Plan structural investment in public transport, cycling networks and intermodality.';
  }
  if (value.includes('waste')) {
    return 'Develop a stronger circular-economy system with reuse, repair and education measures.';
  }
  if (value.includes('energy') || value.includes('infrastructure')) {
    return 'Promote medium-term energy modernization and renewable urban infrastructure.';
  }
  if (value.includes('pollution')) {
    return 'Design integrated policies for air, noise and water quality improvement.';
  }
  if (value.includes('urban design') || value.includes('public space')) {
    return 'Expand green infrastructure and inclusive urban planning across neighbourhoods.';
  }
  if (value.includes('services') || value.includes('governance')) {
    return 'Strengthen participatory governance and improve coordination of public services.';
  }

  return 'Develop a medium-term improvement roadmap with measurable objectives and local actors.';
}

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [blockResponses, setBlockResponses] = useState<BlockResponseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCountry, setSelectedCountry] = useState('All');
  const [selectedCity, setSelectedCity] = useState('All');
  const [selectedAge, setSelectedAge] = useState('All');

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const { data: submissionsData, error: submissionsError } = await supabase
        .from('submissions')
        .select('id, city, country, age_group, overall_score, overall_result, created_at')
        .order('created_at', { ascending: false });

      const { data: blockData, error: blockError } = await supabase
        .from('block_responses')
        .select('submission_id, block_name, block_score, age_group');

      if (submissionsError) {
        console.error('Error loading submissions:', submissionsError);
      } else {
        setSubmissions((submissionsData || []) as SubmissionRow[]);
      }

      if (blockError) {
        console.error('Error loading block responses:', blockError);
      } else {
        setBlockResponses((blockData || []) as BlockResponseRow[]);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  const countryOptions = useMemo(() => {
    return [
      'All',
      ...Array.from(
        new Set(submissions.map((s) => s.country).filter((v): v is string => !!v))
      ).sort(),
    ];
  }, [submissions]);

  const cityOptions = useMemo(() => {
    const filteredByCountry =
      selectedCountry === 'All'
        ? submissions
        : submissions.filter((s) => (s.country || 'Unknown') === selectedCountry);

    return [
      'All',
      ...Array.from(
        new Set(filteredByCountry.map((s) => s.city).filter((v): v is string => !!v))
      ).sort(),
    ];
  }, [submissions, selectedCountry]);

  const ageOptions = useMemo(() => {
    return [
      'All',
      ...Array.from(
        new Set(submissions.map((s) => s.age_group).filter((v): v is string => !!v))
      ).sort(),
    ];
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      const countryOk =
        selectedCountry === 'All' || (s.country || 'Unknown') === selectedCountry;
      const cityOk = selectedCity === 'All' || (s.city || 'Unknown') === selectedCity;
      const ageOk = selectedAge === 'All' || (s.age_group || 'Unknown') === selectedAge;

      return countryOk && cityOk && ageOk;
    });
  }, [submissions, selectedCountry, selectedCity, selectedAge]);

  const filteredSubmissionIds = useMemo(() => {
    return new Set(filteredSubmissions.map((s) => s.id));
  }, [filteredSubmissions]);

  const filteredBlockResponses = useMemo(() => {
    return blockResponses.filter((row) => filteredSubmissionIds.has(row.submission_id));
  }, [blockResponses, filteredSubmissionIds]);

  const submissionsMap = useMemo(() => {
    const map = new Map<string, SubmissionRow>();
    submissions.forEach((s) => map.set(s.id, s));
    return map;
  }, [submissions]);

  const totalResponses = filteredSubmissions.length;

  const countries = useMemo(() => {
    return [...new Set(filteredSubmissions.map((s) => s.country).filter(Boolean))];
  }, [filteredSubmissions]);

  const cities = useMemo(() => {
    return [...new Set(filteredSubmissions.map((s) => s.city).filter(Boolean))];
  }, [filteredSubmissions]);

  const averageOverallScore = useMemo(() => {
    return average(
      filteredSubmissions
        .map((s) => s.overall_score)
        .filter((v): v is number => typeof v === 'number')
    );
  }, [filteredSubmissions]);

  const responsesByCountry = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredSubmissions.forEach((s) => {
      const key = s.country || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredSubmissions]);

  const responsesByCity = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredSubmissions.forEach((s) => {
      const key = s.city || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredSubmissions]);

  const responsesByAge = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredSubmissions.forEach((s) => {
      const key = s.age_group || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([age, count]) => ({ age, count }))
      .sort((a, b) => a.age.localeCompare(b.age));
  }, [filteredSubmissions]);

  const averageByArea = useMemo((): AreaAverage[] => {
    const grouped: Record<string, number[]> = {};

    filteredBlockResponses.forEach((row) => {
      if (typeof row.block_score !== 'number') return;
      if (!grouped[row.block_name]) grouped[row.block_name] = [];
      grouped[row.block_name].push(row.block_score);
    });

    return Object.entries(grouped)
      .map(([area, scores]) => ({
        area,
        avg: average(scores),
      }))
      .sort((a, b) => a.avg - b.avg);
  }, [filteredBlockResponses]);

  const weakestAreas = useMemo(() => {
    return [...averageByArea].sort((a, b) => a.avg - b.avg).slice(0, 3);
  }, [averageByArea]);

  const shortPriorities = useMemo(() => {
    return weakestAreas.map((item) => ({
      area: item.area,
      avg: item.avg,
      action: getShortPriority(item.area),
    }));
  }, [weakestAreas]);

  const mediumPriorities = useMemo(() => {
    return weakestAreas.map((item) => ({
      area: item.area,
      avg: item.avg,
      action: getMediumPriority(item.area),
    }));
  }, [weakestAreas]);

  const averageByAgeAndArea = useMemo(() => {
    const grouped: Record<string, Record<string, number[]>> = {};

    filteredBlockResponses.forEach((row) => {
      const age = row.age_group || 'Unknown';
      const area = row.block_name;
      const score = row.block_score;

      if (typeof score !== 'number') return;

      if (!grouped[age]) grouped[age] = {};
      if (!grouped[age][area]) grouped[age][area] = [];
      grouped[age][area].push(score);
    });

    const result: Record<string, Record<string, number>> = {};

    Object.keys(grouped).forEach((age) => {
      result[age] = {};
      Object.keys(grouped[age]).forEach((area) => {
        result[age][area] = average(grouped[age][area]);
      });
    });

    return result;
  }, [filteredBlockResponses]);

  const areaByCountryChartData = useMemo(() => {
    const grouped: Record<string, Record<string, number[]>> = {};

    filteredBlockResponses.forEach((row) => {
      const submission = submissionsMap.get(row.submission_id);
      const country = submission?.country || 'Unknown';
      const area = row.block_name;
      const score = row.block_score;

      if (typeof score !== 'number') return;

      if (!grouped[area]) grouped[area] = {};
      if (!grouped[area][country]) grouped[area][country] = [];
      grouped[area][country].push(score);
    });

    return Object.entries(grouped).map(([area, countryScores]) => {
      const row: Record<string, string | number> = { area };
      Object.entries(countryScores).forEach(([country, scores]) => {
        row[country] = average(scores);
      });
      return row;
    });
  }, [filteredBlockResponses, submissionsMap]);

  const countriesInChart = useMemo(() => {
    return Array.from(
      new Set(filteredSubmissions.map((s) => s.country).filter((v): v is string => !!v))
    ).sort();
  }, [filteredSubmissions]);

  function resetFilters() {
    setSelectedCountry('All');
    setSelectedCity('All');
    setSelectedAge('All');
  }

  if (loading) {
    return (
      <main style={{ padding: '24px' }}>
        <h1>Green Cities Audit Dashboard</h1>
        <p>Cargando datos...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '24px', background: '#f8fafc', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '8px' }}>Green Cities Audit Dashboard</h1>
      <p style={{ marginBottom: '24px', color: '#475569' }}>
        Overview, filtros, comparativas por área y prioridades automáticas
      </p>

      <div style={{ ...panelStyle, marginBottom: '24px' }}>
        <h2 style={panelTitle}>Filters</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '16px',
            alignItems: 'end',
          }}
        >
          <div>
            <label style={labelStyle}>Country</label>
            <select
              value={selectedCountry}
              onChange={(e) => {
                setSelectedCountry(e.target.value);
                setSelectedCity('All');
              }}
              style={selectStyle}
            >
              {countryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>City</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              style={selectStyle}
            >
              {cityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Age group</label>
            <select
              value={selectedAge}
              onChange={(e) => setSelectedAge(e.target.value)}
              style={selectStyle}
            >
              {ageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button onClick={resetFilters} style={buttonStyle}>
              Reset filters
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={cardStyle}>
          <p style={cardLabel}>Total responses</p>
          <p style={cardValue}>{totalResponses}</p>
        </div>

        <div style={cardStyle}>
          <p style={cardLabel}>Countries represented</p>
          <p style={cardValue}>{countries.length}</p>
        </div>

        <div style={cardStyle}>
          <p style={cardLabel}>Cities represented</p>
          <p style={cardValue}>{cities.length}</p>
        </div>

        <div style={cardStyle}>
          <p style={cardLabel}>Average overall score</p>
          <p style={cardValue}>{averageOverallScore}</p>
        </div>
      </div>

      <div style={{ ...panelStyle, marginBottom: '24px' }}>
        <h2 style={panelTitle}>Weakest areas</h2>
        {weakestAreas.length === 0 ? (
          <p style={{ margin: 0 }}>No data available for the current filters.</p>
        ) : (
          weakestAreas.map((item, index) => (
            <div key={item.area} style={rowStyle}>
              <span>
                {index + 1}. {item.area}
              </span>
              <strong>{item.avg}</strong>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={panelStyle}>
          <h2 style={panelTitle}>Short priorities</h2>
          {shortPriorities.length === 0 ? (
            <p style={{ margin: 0 }}>No short priorities available.</p>
          ) : (
            shortPriorities.map((item) => (
              <div key={item.area} style={priorityBoxStyle}>
                <div style={priorityHeaderStyle}>
                  <strong>{item.area}</strong>
                  <span>{item.avg}</span>
                </div>
                <p style={priorityTextStyle}>{item.action}</p>
              </div>
            ))
          )}
        </div>

        <div style={panelStyle}>
          <h2 style={panelTitle}>Medium priorities</h2>
          {mediumPriorities.length === 0 ? (
            <p style={{ margin: 0 }}>No medium priorities available.</p>
          ) : (
            mediumPriorities.map((item) => (
              <div key={item.area} style={priorityBoxStyle}>
                <div style={priorityHeaderStyle}>
                  <strong>{item.area}</strong>
                  <span>{item.avg}</span>
                </div>
                <p style={priorityTextStyle}>{item.action}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={panelStyle}>
          <h2 style={panelTitle}>Average score by area</h2>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={averageByArea}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="area" hide />
                <YAxis domain={[0, 5]} />
                <Tooltip />
                <Bar dataKey="avg" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: '16px' }}>
            {averageByArea.map((item) => (
              <div key={item.area} style={rowStyle}>
                <span>{item.area}</span>
                <strong>{item.avg}</strong>
              </div>
            ))}
          </div>
        </div>

        <div style={panelStyle}>
          <h2 style={panelTitle}>Responses by city</h2>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={responsesByCity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="city" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: '16px' }}>
            {responsesByCity.map((item) => (
              <div key={item.city} style={rowStyle}>
                <span>{item.city}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...panelStyle, marginBottom: '24px' }}>
        <h2 style={panelTitle}>Area comparison by country</h2>
        <div style={{ width: '100%', height: 420 }}>
          <ResponsiveContainer>
            <BarChart data={areaByCountryChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="area" hide />
              <YAxis domain={[0, 5]} />
              <Tooltip />
              <Legend />
              {countriesInChart.map((country) => (
                <Bar key={country} dataKey={country} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginTop: '16px' }}>
          {areaByCountryChartData.map((row, index) => (
            <div
              key={`${String(row.area)}-${index}`}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <strong>{String(row.area)}</strong>
              <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
                {countriesInChart.map((country) => (
                  <div
                    key={`${String(row.area)}-${country}`}
                    style={{ display: 'flex', justifyContent: 'space-between' }}
                  >
                    <span>{country}</span>
                    <span>{typeof row[country] === 'number' ? row[country] : '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={panelStyle}>
          <h2 style={panelTitle}>Responses by country</h2>
          {responsesByCountry.map((item) => (
            <div key={item.country} style={rowStyle}>
              <span>{item.country}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>

        <div style={panelStyle}>
          <h2 style={panelTitle}>Responses by city</h2>
          {responsesByCity.map((item) => (
            <div key={item.city} style={rowStyle}>
              <span>{item.city}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>

        <div style={panelStyle}>
          <h2 style={panelTitle}>Responses by age group</h2>
          {responsesByAge.map((item) => (
            <div key={item.age} style={rowStyle}>
              <span>{item.age}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={panelTitle}>Age group × area</h2>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
              <th style={thStyle}>Age group</th>
              <th style={thStyle}>Area</th>
              <th style={thStyle}>Average score</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(averageByAgeAndArea).flatMap(([age, areas]) =>
              Object.entries(areas).map(([area, score]) => (
                <tr key={`${age}-${area}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={tdStyle}>{age}</td>
                  <td style={tdStyle}>{area}</td>
                  <td style={tdStyle}>
                    <strong>{score}</strong>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '16px',
};

const cardLabel: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  color: '#64748b',
};

const cardValue: React.CSSProperties = {
  margin: '8px 0 0 0',
  fontSize: '28px',
  fontWeight: 700,
  color: '#0f172a',
};

const panelStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '16px',
};

const panelTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: '16px',
  fontSize: '18px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid #e2e8f0',
};

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '14px',
  color: '#334155',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #0f172a',
  background: '#0f172a',
  color: '#ffffff',
  cursor: 'pointer',
};

const priorityBoxStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '12px',
  marginBottom: '12px',
  background: '#fff',
};

const priorityHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '8px',
};

const priorityTextStyle: React.CSSProperties = {
  margin: 0,
  color: '#334155',
  lineHeight: 1.5,
};