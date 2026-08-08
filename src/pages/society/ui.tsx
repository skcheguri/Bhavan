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
    <div className="min-h-[70vh] bg-lightgray/40">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">{children}</div>
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-charcoal">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-1.5">{subtitle}</p>}
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
    <div className={`rounded-xl border p-5 ${tones[tone]}`}>
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
      className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] ${
        active ? 'bg-white/20' : 'bg-brand text-white'
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
