import { useEffect, useRef } from 'react';

/**
 * Lets Android's back button close whatever is on top of the page before
 * it navigates.
 *
 * Without this, back with a modal open navigated away and left the user
 * on a different screen -- the modal was dismissed only as a side effect
 * of the page changing. Android users reach for back to close things, so
 * an app that leaves the screen instead loses whatever they were doing.
 *
 * A registry rather than a prop chain because modals are scattered across
 * 13 components with no common ancestor, and the back handler lives at the
 * app root. A stack rather than a single slot because modals can nest --
 * closing the topmost is the only ordering that matches what the user
 * sees.
 *
 * Unregistration is by identity on unmount, so a modal that closes by its
 * own button leaves nothing behind.
 */
const layers: Array<() => void> = [];

/** Closes the topmost registered layer. Returns false if there was none. */
export function dismissTopLayer(): boolean {
  const top = layers[layers.length - 1];
  if (!top) return false;
  // Not popped here -- the layer unregisters itself when it unmounts, which
  // is the same path as closing by its own button. Popping here too would
  // remove the wrong entry when a modal chooses not to close.
  top();
  return true;
}

export function useDismissableLayer(onDismiss: () => void): void {
  // Kept in a ref so the registered entry always calls the current handler
  // without re-registering (and reordering the stack) on every render.
  const handler = useRef(onDismiss);
  handler.current = onDismiss;

  useEffect(() => {
    const entry = () => handler.current();
    layers.push(entry);
    return () => {
      const index = layers.indexOf(entry);
      if (index >= 0) layers.splice(index, 1);
    };
  }, []);
}
