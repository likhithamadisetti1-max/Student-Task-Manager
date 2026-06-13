/* =========================================================
   dragdrop.js
   ---------------------------------------------------------
   DragDropManager adds drag-and-drop reordering to the task
   grid using the native HTML5 Drag and Drop API.

   How it works:
     1. Every .task-card has draggable="true" (set in ui.js).
     2. dragstart  -> remember which card is being dragged.
     3. dragover   -> figure out where the dragged card
                       would land, and move it there live
                       (so the grid previews the new order).
     4. drop/dragend -> read the new DOM order of cards and
                       call the `onReorder(idsInOrder)`
                       callback so TaskManager can save it.

   This file does NOT touch localStorage or task data itself
   — it only reports the new order back to app.js.
   ========================================================= */

export class DragDropManager {
  /**
   * @param {HTMLElement} gridEl - the container holding .task-card elements
   * @param {(orderedIds: string[]) => void} onReorder - called after a drop
   */
  constructor(gridEl, onReorder) {
    this.gridEl = gridEl;
    this.onReorder = onReorder;
    this.draggedEl = null;

    this._bindEvents();
  }

  _bindEvents() {
    this.gridEl.addEventListener("dragstart", (e) => this._onDragStart(e));
    this.gridEl.addEventListener("dragend", (e) => this._onDragEnd(e));
    this.gridEl.addEventListener("dragover", (e) => this._onDragOver(e));
    this.gridEl.addEventListener("drop", (e) => this._onDrop(e));
  }

  _onDragStart(e) {
    const card = e.target.closest(".task-card");
    if (!card) return;

    this.draggedEl = card;
    card.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    // Some browsers require data to be set for drag to work.
    e.dataTransfer.setData("text/plain", card.dataset.id);
  }

  _onDragOver(e) {
    if (!this.draggedEl) return;
    e.preventDefault();

    const target = e.target.closest(".task-card");
    if (!target || target === this.draggedEl) return;

    const rect = target.getBoundingClientRect();
    const isAfter = e.clientY - rect.top > rect.height / 2;

    target.classList.add("drag-over");

    if (isAfter) {
      target.after(this.draggedEl);
    } else {
      target.before(this.draggedEl);
    }
  }

  _onDrop(e) {
    e.preventDefault();
    if (!this.draggedEl) return;

    this.draggedEl.classList.add("just-dropped");
    setTimeout(() => this.draggedEl?.classList.remove("just-dropped"), 500);

    this._finishDrag();
  }

  _onDragEnd() {
    this._finishDrag();
  }

  _finishDrag() {
    if (!this.draggedEl) return;

    this.draggedEl.classList.remove("is-dragging");
    this.gridEl
      .querySelectorAll(".drag-over")
      .forEach((el) => el.classList.remove("drag-over"));

    // Read the current DOM order and report it.
    const orderedIds = Array.from(this.gridEl.querySelectorAll(".task-card")).map(
      (card) => card.dataset.id
    );

    this.draggedEl = null;
    this.onReorder(orderedIds);
  }
}
