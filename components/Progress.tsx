import React from 'react';
export function Progress({ value = 0 }: { value?: number }) {
  return (
    <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
      <div className="h-full bg-[#7dd420]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}