'use client';

import { useEffect, useMemo, useState } from 'react';
import EvidenceMap from './EvidenceMap';

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

function getCardClass(isActive: boolean) {
  return [
    'rounded-2xl border bg-white p-4 shadow-sm transition cursor-pointer',
    isActive
      ? 'border-slate-900 ring-2 ring-slate-900/10'
      : 'border-slate-200 hover:border-slate-300 hover:shadow',
  ].join(' ');
}

export default function EvidenceMapWrapper({
  points,
}: {
  points: MediaPoint[];
}) {
  const [mediaType, setMediaType] = useState('all');
  const [blockName, setBlockName] = useState('all');
  const [city, setCity] = useState('all');
  const [country, setCountry] = useState('all');
  const [fitTrigger, setFitTrigger] = useState(0);

  const areaOptions = useMemo(() => {
    return Array.from(new Set(points.map((p) => p.block_name).filter(Boolean))).sort();
  }, [points]);

  const countryOptions = useMemo(() => {
    return Array.from(new Set(points.map((p) => p.country).filter(Boolean) as string[])).sort();
  }, [points]);

  const cityOptions = useMemo(() => {
    const source =
      country === 'all'
        ? points
        : points.filter((p) => p.country === country);

    return Array.from(new Set(source.map((p) => p.city).filter(Boolean) as string[])).sort();
  }, [points, country]);

  useEffect(() => {
    if (city !== 'all' && !cityOptions.includes(city)) {
      setCity('all');
    }
  }, [city, cityOptions]);

  const filteredPoints = useMemo(() => {
    return points.filter((point) => {
      const typeOk = mediaType === 'all' || point.media_type === mediaType;
      const areaOk = blockName === 'all' || point.block_name === blockName;
      const countryOk = country === 'all' || point.country === country;
      const cityOk = city === 'all' || point.city === city;

      return typeOk && areaOk && countryOk && cityOk;
    });
  }, [points, mediaType, blockName, country, city]);

  const stats = useMemo(() => {
    const total = filteredPoints.length;
    const problems = filteredPoints.filter((p) => p.media_type === 'problem').length;
    const goodPractices = filteredPoints.filter((p) => p.media_type === 'good_practice').length;
    const cities = new Set(filteredPoints.map((p) => p.city).filter(Boolean)).size;
    const countries = new Set(filteredPoints.map((p) => p.country).filter(Boolean)).size;

    return {
      total,
      problems,
      goodPractices,
      cities,
      countries,
    };
  }, [filteredPoints]);

  function handleResetFilters() {
    setMediaType('all');
    setBlockName('all');
    setCountry('all');
    setCity('all');
    setFitTrigger((prev) => prev + 1);
  }

  function handleFitVisiblePoints() {
    setFitTrigger((prev) => prev + 1);
  }

  function handleMediaTypeCardClick(value: 'all' | 'problem' | 'good_practice') {
    setMediaType(value);
    setFitTrigger((prev) => prev + 1);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => handleMediaTypeCardClick('all')}
          className={getCardClass(mediaType === 'all')}
        >
          <p className="text-sm text-slate-500">Total points</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{stats.total}</p>
        </button>

        <button
          type="button"
          onClick={() => handleMediaTypeCardClick('problem')}
          className={getCardClass(mediaType === 'problem')}
        >
          <p className="text-sm text-slate-500">Problems</p>
          <p className="mt-1 text-3xl font-bold text-red-600">{stats.problems}</p>
        </button>

        <button
          type="button"
          onClick={() => handleMediaTypeCardClick('good_practice')}
          className={getCardClass(mediaType === 'good_practice')}
        >
          <p className="text-sm text-slate-500">Good practices</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{stats.goodPractices}</p>
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Cities represented</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{stats.cities}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Countries represented</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{stats.countries}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Filter by type
          </label>
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
          >
            <option value="all">All</option>
            <option value="problem">Problem</option>
            <option value="good_practice">Good practice</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Filter by area
          </label>
          <select
            value={blockName}
            onChange={(e) => setBlockName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
          >
            <option value="all">All</option>
            {areaOptions.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Filter by country
          </label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
          >
            <option value="all">All</option>
            {countryOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Filter by city
          </label>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
          >
            <option value="all">All</option>
            {cityOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-700">
            Showing <strong>{filteredPoints.length}</strong> points
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium text-slate-800">Legend:</span>

          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: '#dc2626' }}
            />
            <span>Problem</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: '#16a34a' }}
            />
            <span>Good practice</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleFitVisiblePoints}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Fit visible points
          </button>

          <button
            onClick={handleResetFilters}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Reset filters
          </button>
        </div>
      </div>

      <EvidenceMap points={filteredPoints} fitTrigger={fitTrigger} />
    </div>
  );
}