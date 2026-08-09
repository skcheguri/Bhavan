/**
 * Shared presentation pieces for the society screens.
 *
 * Extracted so the notices and maintenance panels can live in their own
 * file without either importing from the page (which would be circular)
 * or keeping its own copy of the same input styling.
 */

export const inputCls =
  'w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[70vh] bg-offwhite">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">{children}</div>
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl sm:text-[2rem] font-semibold text-charcoal tracking-[-.03em] leading-tight">{title}</h1>
      {subtitle && <p className="text-[15px] text-charcoal/55 mt-2 max-w-[60ch]">{subtitle}</p>}
    </div>
  );
}

export function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'error' | 'success';
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    info: 'bg-blue-50 border-blue-100 text-blue-900',
    warn: 'bg-amber-50 border-amber-100 text-amber-900',
    error: 'bg-red-50 border-red-100 text-red-900',
    success: 'bg-green-50 border-green-100 text-green-900',
  };
  return (
    <div className={`rounded-2xl border p-5 sm:p-6 ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        <i className={`${icon} text-lg mt-0.5 flex-shrink-0`} />
        <div className="min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          <div className="text-sm mt-1 opacity-90">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-charcoal mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/** The small count on a tab. Its whole job is to say "look in here". */
export function Pip({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`ml-1.5 min-w-[18px] px-1.5 h-[18px] inline-flex items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${
        active ? 'bg-white/25 text-white' : 'bg-lightgray text-charcoal/60'
      }`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-black/5 p-8 text-center">
      <i className={`${icon} text-3xl text-gray-200`} />
      <p className="text-sm text-gray-400 mt-2">{children}</p>
    </div>
  );
}
