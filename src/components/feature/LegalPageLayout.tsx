import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  lastUpdated: string;
  intro?: string;
  children: ReactNode;
}

export default function LegalPageLayout({ title, lastUpdated, intro, children }: Props) {
  return (
    <div className="min-h-screen bg-offwhite">
      <section className="bg-white py-12 md:py-16 border-b border-black/5">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-charcoal">{title}</h1>
            <p className="mt-2 text-sm text-charcoal/50">Last updated: {lastUpdated}</p>
            {intro && <p className="mt-4 text-charcoal/70 leading-relaxed">{intro}</p>}
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <article className="max-w-3xl mx-auto space-y-10">{children}</article>
        </div>
      </section>
    </div>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24">
      <h2 className="text-xl font-bold text-charcoal">{title}</h2>
      <div className="mt-3 space-y-3 text-sm md:text-[15px] text-charcoal/70 leading-relaxed">{children}</div>
    </div>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalContactNote({ email }: { email: string }) {
  return (
    <p>
      Questions about this page? Write to{' '}
      <a href={`mailto:${email}`} className="text-brand font-medium hover:text-brand-dark">
        {email}
      </a>
      , or use our{' '}
      <Link to="/contact" className="text-brand font-medium hover:text-brand-dark">
        Contact page
      </Link>
      .
    </p>
  );
}
