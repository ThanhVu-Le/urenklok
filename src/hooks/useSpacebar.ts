import { useEffect, useRef } from 'react';

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'color', 'file'].includes(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Spatiebalk = in-/uitklokken. Niet als er een invoerveld actief is of een dialoog openstaat.
 * Op een gefocuste knop vangen we de spatie ook af, zodat die niet per ongeluk die knop indrukt.
 */
export function useSpacebar(handler: () => void): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(document.activeElement)) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      if (!e.repeat) ref.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
