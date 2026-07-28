// Opens a generated HTML document (rental agreement, rent receipt, etc.)
// in a new tab. Uses a Blob URL rather than window.open('', '_blank') +
// document.write(): that older pattern forces open a print dialog after
// a fixed delay, and since the print dialog is modal, it blocks
// interaction with the original page until dismissed -- clicking
// "View" on a second document while the first one's print dialog is
// still open does nothing, which reads as "I can only view one at a
// time." A Blob URL is just a normal page the browser navigates to, so
// each click opens its own independent tab; printing is left to the
// user's own browser print action (Ctrl/Cmd+P) instead of being forced.
export function viewDocument(html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Give the new tab time to load the blob before revoking it.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
