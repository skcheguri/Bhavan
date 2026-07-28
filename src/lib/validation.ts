export const NAME_REGEX = /^[A-Za-z][A-Za-z\s]*$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const INDIA_PHONE_REGEX = /^\+91 \d{5} \d{5}$/;

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && NAME_REGEX.test(trimmed);
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

// Catches keyboard-mashed/placeholder-style "numbers" that pass a plain
// digit-count check but obviously aren't a real phone number: every
// digit the same (1111111111), or 5+ digits in a row that just count
// up or down (912345xxxx, xxxx987650).
export function hasFakeDigitPattern(digits: string): boolean {
  if (/^(\d)\1{9}$/.test(digits)) return true;
  if (/(\d)\1{4,}/.test(digits)) return true;
  for (let i = 0; i <= digits.length - 5; i++) {
    let ascending = true;
    let descending = true;
    for (let j = i + 1; j < i + 5; j++) {
      if (Number(digits[j]) !== Number(digits[j - 1]) + 1) ascending = false;
      if (Number(digits[j]) !== Number(digits[j - 1]) - 1) descending = false;
    }
    if (ascending || descending) return true;
  }
  return false;
}

export function isValidIndianPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!INDIA_PHONE_REGEX.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '').slice(2); // strip "+91 " and spaces, then the "91" country code
  if (!/^[6-9]/.test(digits)) return false; // Indian mobile numbers only ever start 6-9
  return !hasFakeDigitPattern(digits);
}

// Same checks as isValidIndianPhone, but for a bare 10-digit string with
// no "+91 " formatting -- the shape mobile-OTP fields (signup/login) use.
export function isValidRawIndianMobile(digits: string): boolean {
  if (!/^[6-9]\d{9}$/.test(digits)) return false;
  return !hasFakeDigitPattern(digits);
}

// Formats free-typed digits into "+91 98377 17379" as the user types.
// Strips a leading "+91" from the raw input FIRST -- otherwise the "9"
// and "1" from our own displayed prefix get re-read as typed digits on
// every keystroke (since we re-run this on the already-formatted value),
// corrupting the number after a couple of characters.
export function formatIndianPhoneInput(raw: string): string {
  let value = raw.trim();
  if (value.startsWith('+91')) {
    value = value.slice(3);
  }

  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 10);

  if (digits.length === 0) return '';
  if (digits.length <= 5) return `+91 ${digits}`;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

// Verhoeff checksum tables -- the actual algorithm UIDAI uses for the
// Aadhaar number's trailing check digit. Catches typos/fabricated numbers
// client-side before we spend a real OTP request on them; the Edge Function
// re-checks this server-side too since client-side validation is trivially
// bypassable.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidAadhaarFormat(aadhaar: string): boolean {
  const digits = aadhaar.replace(/\s/g, '');
  // UIDAI never issues a number starting with 0 or 1.
  return /^[2-9]\d{11}$/.test(digits);
}

export function isValidAadhaarChecksum(aadhaar: string): boolean {
  const digits = aadhaar.replace(/\s/g, '');
  if (!/^\d{12}$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

export function isValidAadhaar(aadhaar: string): boolean {
  return isValidAadhaarFormat(aadhaar) && isValidAadhaarChecksum(aadhaar);
}

export const OCCUPATION_OPTIONS = [
  'Salaried Employee',
  'Self-Employed / Business Owner',
  'Freelancer',
  'Government Employee',
  'Student',
  'Retired',
  'Homemaker',
  'Other',
] as const;

export const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export function daysInMonth(month: number, year: number): number {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

export function yearOptions(fromYear = 1900): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= fromYear; y--) years.push(y);
  return years;
}

// "YYYY-MM-DD" <-> { day, month, year } helpers for the DOB dropdowns.
export function parseIsoDate(iso: string | undefined): { day: string; month: string; year: string } {
  if (!iso) return { day: '', month: '', year: '' };
  const [year, month, day] = iso.split('-');
  return { day: day ?? '', month: month ?? '', year: year ?? '' };
}

export function composeIsoDate(day: string, month: string, year: string): string {
  if (!day || !month || !year) return '';
  return `${year}-${month}-${day.padStart(2, '0')}`;
}
