/**
 * Transient notifications. A notice belongs to the plan state it was issued for:
 * it adopts the state key of the render that shows it, disappears when that state
 * changes again or after a timeout, and never stands in for the current result or
 * for unresolved checks (those live in the result itself).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type NoticeKind = "saved" | "opened" | "info" | "warning";

export interface Notice {
  id: number;
  kind: NoticeKind;
  text: string;
  /** The state key this notice describes; undefined until the render that shows it. */
  key?: string;
}

export const NOTICE_MS = 8000;

/** Save and open confirmations link to the saved plans; other notices do not. */
export const linksToSaved = (k: NoticeKind) => k === "saved" || k === "opened";

export function useNotice(stateKey: string, ms = NOTICE_MS) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const n = useRef(0);
  const notify = useCallback((kind: NoticeKind, text: string) => setNotice({ id: ++n.current, kind, text }), []);
  const dismiss = useCallback(() => setNotice(null), []);

  // Adopt the key of the state the notice was issued with, then clear it on the next change of that state.
  useEffect(() => {
    if (!notice) return;
    if (notice.key === undefined) setNotice((x) => (x && x.id === notice.id ? { ...x, key: stateKey } : x));
    else if (notice.key !== stateKey) setNotice((x) => (x && x.id === notice.id ? null : x));
  }, [stateKey, notice]);

  // Every notice expires.
  useEffect(() => {
    if (!notice) return;
    const id = notice.id;
    const t = setTimeout(() => setNotice((x) => (x && x.id === id ? null : x)), ms);
    return () => clearTimeout(t);
  }, [notice?.id, ms]); // eslint-disable-line react-hooks/exhaustive-deps

  return { notice, notify, dismiss };
}
