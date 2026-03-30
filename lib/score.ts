export function avg(values: number[]) {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!valid.length) return 0;
  return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
}

export function weakestAreas(blocks: { key: string; avg: number; title: string }[]) {
  return [...blocks].filter((b) => b.avg > 0).sort((a, b) => a.avg - b.avg).slice(0, 2);
}