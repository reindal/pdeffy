/**
 * Pointer-based list reordering.
 * Prefer this over HTML5 Drag & Drop: Tauri intercepts native DnD for file drops,
 * which makes element reordering unreliable in the webview.
 */

/**
 * @param {HTMLElement} container
 * @param {{
 *   itemSelector?: string,
 *   ignoreSelector?: string,
 *   onReorder: (fromIndex: number, toIndex: number) => void,
 * }} options
 * @returns {() => void} cleanup
 */
export function enableListReorder(container, options = {}) {
  if (!container) return () => {};

  const itemSelector = options.itemSelector || '[data-reorder-item]';
  const ignoreSelector = options.ignoreSelector || 'button, a, input, textarea, select, label';
  const onReorder = options.onReorder;
  if (typeof onReorder !== 'function') return () => {};

  let active = null;
  let fromIndex = -1;
  let currentIndex = -1;
  let pointerId = null;
  let startY = 0;
  let startX = 0;
  let activated = false;
  const THRESHOLD = 4;

  function items() {
    return Array.from(container.querySelectorAll(itemSelector));
  }

  function indexOf(el) {
    return items().indexOf(el);
  }

  function clearHover() {
    items().forEach((el) => el.classList.remove('dragover', 'is-reorder-target'));
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    const item = e.target.closest(itemSelector);
    if (!item || !container.contains(item)) return;
    if (e.target.closest(ignoreSelector)) return;

    active = item;
    fromIndex = indexOf(item);
    currentIndex = fromIndex;
    pointerId = e.pointerId;
    startY = e.clientY;
    startX = e.clientX;
    activated = false;

    try {
      item.setPointerCapture(e.pointerId);
    } catch (_) { /* ignore */ }

    item.addEventListener('pointermove', onPointerMove);
    item.addEventListener('pointerup', onPointerUp);
    item.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!active || e.pointerId !== pointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!activated) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      activated = true;
      active.classList.add('dragging');
      document.body.classList.add('pdeffy-reordering');
    }

    e.preventDefault();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = el?.closest?.(itemSelector);
    clearHover();
    if (!over || over === active || !container.contains(over)) return;

    over.classList.add('dragover', 'is-reorder-target');
    currentIndex = indexOf(over);
  }

  function onPointerUp(e) {
    if (!active || (pointerId != null && e.pointerId !== pointerId)) return;

    const item = active;
    item.removeEventListener('pointermove', onPointerMove);
    item.removeEventListener('pointerup', onPointerUp);
    item.removeEventListener('pointercancel', onPointerUp);
    try {
      item.releasePointerCapture(e.pointerId);
    } catch (_) { /* ignore */ }

    const toIndex = currentIndex;
    const from = fromIndex;
    const didDrag = activated;

    item.classList.remove('dragging');
    document.body.classList.remove('pdeffy-reordering');
    clearHover();

    active = null;
    fromIndex = -1;
    currentIndex = -1;
    pointerId = null;
    activated = false;

    if (didDrag && from >= 0 && toIndex >= 0 && from !== toIndex) {
      onReorder(from, toIndex);
    }
  }

  container.addEventListener('pointerdown', onPointerDown);

  return () => {
    container.removeEventListener('pointerdown', onPointerDown);
    document.body.classList.remove('pdeffy-reordering');
  };
}

/** Move an item in an array from → to (in-place). */
export function moveArrayItem(arr, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return arr;
  if (fromIndex >= arr.length || toIndex >= arr.length) return arr;
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, item);
  return arr;
}

export default { enableListReorder, moveArrayItem };
