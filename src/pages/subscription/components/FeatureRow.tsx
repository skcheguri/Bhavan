interface FeatureRowProps {
  label: string;
  freeValue: string;
  proValue: string;
  isProCheck?: boolean;
}

export default function FeatureRow({ label, freeValue, proValue, isProCheck = false }: FeatureRowProps) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3.5 px-5 border-b border-gray-50 last:border-0 items-center">
      <span className="text-sm text-charcoal font-medium">{label}</span>
      <span className="text-sm text-charcoal/60 flex items-center gap-1.5">
        {isProCheck ? (
          <>
            <i className="ri-close-circle-line text-charcoal/30" />
            {freeValue}
          </>
        ) : (
          freeValue
        )}
      </span>
      <span className="text-sm text-charcoal font-semibold flex items-center gap-1.5">
        {isProCheck ? (
          <>
            <i className="ri-checkbox-circle-fill text-green-500" />
            {proValue}
          </>
        ) : (
          proValue
        )}
      </span>
    </div>
  );
}