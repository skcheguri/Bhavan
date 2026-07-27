import { useState } from 'react';

interface StarRatingProps {
  value: number;
  onChange?: (val: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = { sm: 'text-sm', md: 'text-xl', lg: 'text-3xl' };

export default function StarRating({ value, onChange, readonly = false, size = 'md' }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = (hovered || value) >= star;
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => onChange && onChange(star)}
            onMouseEnter={() => !readonly && setHovered(star)}
            onMouseLeave={() => !readonly && setHovered(0)}
            className={`${sizeMap[size]} transition-transform ${!readonly ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
          >
            <i className={filled ? 'ri-star-fill text-amber-400' : 'ri-star-line text-charcoal/30'} />
          </button>
        );
      })}
      {!readonly && (hovered || value) > 0 && (
        <span className="ml-2 text-sm font-medium text-amber-600">{labels[hovered || value]}</span>
      )}
    </div>
  );
}
