/**
 * Arrow keys for radio groups and tab lists (WAI-ARIA pattern): Left/Up and
 * Right/Down move to the previous/next option, Home/End to the first/last,
 * and select it. Options stay reachable with Tab as well.
 */
export function installArrowKeys(doc: Document = document): () => void {
  const on = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    const role = el.getAttribute("role");
    if (role !== "radio" && role !== "tab") return;
    const group = el.closest(role === "radio" ? '[role="radiogroup"]' : '[role="tablist"]');
    if (!group) return;
    const items = Array.from(group.querySelectorAll<HTMLElement>(`[role="${role}"]`)).filter((x) => !(x as HTMLButtonElement).disabled);
    const i = items.indexOf(el);
    if (i < 0) return;
    let j = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % items.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = items.length - 1;
    else return;
    e.preventDefault();
    items[j].focus();
    items[j].click();
  };
  doc.addEventListener("keydown", on);
  return () => doc.removeEventListener("keydown", on);
}
