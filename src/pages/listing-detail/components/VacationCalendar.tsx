import { useState, useCallback } from 'react';

interface ReservedRange {
  from: string;
  to: string;
}

interface VacationCalendarProps {
  reservedDates: ReservedRange[];
  checkIn: string;
  checkOut: string;
  onCheckInChange: (date: string) => void;
  onCheckOutChange: (date: string) => void;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateObj(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isDateBlocked(dateStr: string, reserved: ReservedRange[]): boolean {
  const d = toDateObj(dateStr);
  return reserved.some(({ from, to }) => {
    const f = toDateObj(from);
    const t = toDateObj(to);
    return d >= f && d <= t;
  });
}

function isDateInRange(dateStr: string, from: string, to: string): boolean {
  if (!from || !to) return false;
  const d = toDateObj(dateStr);
  return d > toDateObj(from) && d < toDateObj(to);
}

function rangeOverlapsBlocked(from: string, to: string, reserved: ReservedRange[]): boolean {
  if (!from || !to) return false;
  const start = toDateObj(from);
  const end = toDateObj(to);
  return reserved.some(({ from: rf, to: rt }) => {
    const rStart = toDateObj(rf);
    const rEnd = toDateObj(rt);
    return start < rEnd && end > rStart;
  });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function VacationCalendar({
  reservedDates,
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
}: VacationCalendarProps) {
  const todayStr = toDateStr(new Date());
  const todayDate = new Date();

  const [viewYear, setViewYear] = useState(() => todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => todayDate.getMonth());
  const [hoverDate, setHoverDate] = useState('');
  const [selectingCheckout, setSelectingCheckout] = useState(false);

  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const handleDayClick = useCallback((dateStr: string) => {
    if (isDateBlocked(dateStr, reservedDates)) return;
    if (dateStr < todayStr) return;

    if (!checkIn || (checkIn && checkOut)) {
      // Start fresh selection
      onCheckInChange(dateStr);
      onCheckOutChange('');
      setSelectingCheckout(true);
    } else if (selectingCheckout || (!checkOut && checkIn)) {
      // Selecting checkout
      if (dateStr <= checkIn) {
        onCheckInChange(dateStr);
        onCheckOutChange('');
        setSelectingCheckout(true);
        return;
      }
      if (rangeOverlapsBlocked(checkIn, dateStr, reservedDates)) return;
      onCheckOutChange(dateStr);
      setSelectingCheckout(false);
    }
  }, [checkIn, checkOut, selectingCheckout, reservedDates, todayStr, onCheckInChange, onCheckOutChange]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const m = String(viewMonth + 1).padStart(2, '0');
    const day = String(d).padStart(2, '0');
    cells.push(`${viewYear}-${m}-${day}`);
  }

  // Determine effective end for hover preview
  const previewEnd = checkIn && !checkOut && hoverDate && hoverDate > checkIn ? hoverDate : checkOut;

  return (
    <div className="select-none">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-charcoal/60">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-sage inline-block" />
          Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-sage-light inline-block" />
          Your stay
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" />
          Booked
        </span>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer"
        >
          <i className="ri-arrow-left-s-line text-charcoal/70" />
        </button>
        <span className="text-[15px] font-semibold text-charcoal">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer"
        >
          <i className="ri-arrow-right-s-line text-charcoal/70" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-charcoal/40 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((dateStr, idx) => {
          if (!dateStr) {
            return <div key={`empty-${idx}`} />;
          }

          const isPast = dateStr < todayStr;
          const isBlocked = isDateBlocked(dateStr, reservedDates);
          const isCheckIn = dateStr === checkIn;
          const isCheckOut = dateStr === checkOut;
          const isInRange = isDateInRange(dateStr, checkIn, previewEnd);
          const isHoverPreview = !checkOut && checkIn && hoverDate && dateStr > checkIn && dateStr <= hoverDate;
          const isRangeOverlap = !checkOut && checkIn && hoverDate && hoverDate > checkIn
            ? rangeOverlapsBlocked(checkIn, hoverDate, reservedDates)
            : false;

          let cellClass = 'relative h-8 flex items-center justify-center text-xs font-medium transition ';
          let textClass = '';

          if (isPast || isBlocked) {
            cellClass += 'cursor-not-allowed ';
            textClass = isBlocked
              ? 'text-charcoal/30 line-through'
              : 'text-charcoal/30';
          } else if (isCheckIn || isCheckOut) {
            cellClass += 'cursor-pointer z-10 ';
            textClass = 'text-white';
          } else if (isInRange || isHoverPreview) {
            cellClass += 'cursor-pointer ';
            textClass = isRangeOverlap ? 'text-charcoal/40' : 'text-sage-dark';
          } else {
            cellClass += 'cursor-pointer hover:bg-sage-light rounded-full ';
            textClass = 'text-charcoal hover:text-sage-dark';
          }

          // Range background
          const showRangeBg = (isInRange || isHoverPreview) && !isCheckIn && !isCheckOut;
          const isRangeStart = isCheckIn && checkOut;
          const isRangeEnd = isCheckOut;

          return (
            <div
              key={dateStr}
              className={`relative h-8 flex items-center justify-center`}
              onMouseEnter={() => {
                if (checkIn && !checkOut) setHoverDate(dateStr);
              }}
              onMouseLeave={() => setHoverDate('')}
              onClick={() => handleDayClick(dateStr)}
            >
              {/* Range fill background */}
              {showRangeBg && (
                <div className={`absolute inset-y-0 inset-x-0 ${isRangeOverlap ? 'bg-lightgray' : 'bg-sage-light'}`} />
              )}
              {/* Half-fill for range start */}
              {isRangeStart && (
                <div className="absolute inset-y-0 right-0 w-1/2 bg-sage-light" />
              )}
              {/* Half-fill for range end */}
              {isRangeEnd && (
                <div className="absolute inset-y-0 left-0 w-1/2 bg-sage-light" />
              )}

              {/* Circle for selected days */}
              {(isCheckIn || isCheckOut) && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-sage" />
                </div>
              )}

              <span className={`relative z-10 text-xs font-medium ${textClass}`}>
                {Number(dateStr.split('-')[2])}
              </span>

              {/* Blocked dot indicator */}
              {isBlocked && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gray-300" />
              )}
            </div>
          );
        })}
      </div>

      {/* Instruction hint */}
      <p className="text-xs text-charcoal/40 mt-3 text-center">
        {!checkIn
          ? 'Select a check-in date'
          : !checkOut
          ? 'Now select a check-out date'
          : `${checkIn} → ${checkOut}`}
      </p>
    </div>
  );
}
