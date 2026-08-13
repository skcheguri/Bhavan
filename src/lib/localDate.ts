// Today's date as YYYY-MM-DD in the user's LOCAL timezone.
//
// new Date().toISOString().split('T')[0] is UTC — for IST users between
// 00:00 and 05:29 it reads as the previous calendar day, which makes date
// pickers default to yesterday, lets a past date be picked for a visit, and
// files a cash payment logged just after midnight under the wrong month.
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
