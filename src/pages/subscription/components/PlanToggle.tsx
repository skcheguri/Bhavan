import { useState } from 'react';

interface PlanToggleProps {
  value: 'monthly' | 'annual';
  onChange: (value: 'monthly' | 'annual') => void;
}

export default function PlanToggle({ value, onChange }: PlanToggleProps) {
  return (
    <div className="inline-flex items-center bg-lightgray rounded-full p-1.5">
      <button
        onClick={() => onChange('monthly')}
        className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
          value === 'monthly' ? 'bg-amber-500 text-white shadow-sm' : 'text-charcoal/60 hover:text-charcoal'
        }`}
      >
        Monthly
      </button>
      <button
        onClick={() => onChange('annual')}
        className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
          value === 'annual' ? 'bg-amber-500 text-white shadow-sm' : 'text-charcoal/60 hover:text-charcoal'
        }`}
      >
        Annual
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${value === 'annual' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'}`}>
          Save 58%
        </span>
      </button>
    </div>
  );
}