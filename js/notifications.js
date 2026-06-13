/* =========================================================
   notifications.js
   ---------------------------------------------------------
   NotificationManager handles two things:

     1. Toast messages — small pop-ups in the bottom-right
        corner (success, warning, danger, info).

     2. Deadline alerts — automatically scans the task list
        and shows a toast for any task that is due within
        24 hours or already overdue. Each task only triggers
        one alert (tracked via StorageManager) so the user
        isn't spammed every time the app re-renders.
   ========================================================= */

import { StorageManager } from "./storage.js";

const ICONS = {
  success: "fa-solid fa-circle-check",
  warning: "fa-solid fa-triangle-exclamation",
  danger: "fa-solid fa-circle-exclamation",
  info: "fa-solid fa-circle-info",
};

export class NotificationManager {
  constructor(containerEl) {
    this.container = containerEl;
  }

  /**
   * Shows a toast message.
   * @param {string} message
   * @param {"success"|"warning"|"danger"|"info"} type
   * @param {number} duration - milliseconds before auto-dismiss
   */
  showToast(message, type = "info", duration = 4500) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", "status");

    toast.innerHTML = `
      <i class="${ICONS[type] || ICONS.info}" aria-hidden="true"></i>
      <span>${this._escape(message)}</span>
      <button class="toast-close" aria-label="Dismiss notification">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    `;

    toast.querySelector(".toast-close").addEventListener("click", () => {
      this._dismiss(toast);
    });

    this.container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => this._dismiss(toast), duration);
    }
  }

  /**
   * Checks every task's deadline. Shows a toast for tasks
   * that are overdue or due within 24 hours, but only once
   * per task (remembered across reloads via localStorage).
   */
  checkDeadlines(taskManager) {
    const notified = new Set(StorageManager.getNotifiedIds());
    let changed = false;

    taskManager.getAll().forEach((task) => {
      if (task.status === "completed") return;
      if (notified.has(task.id)) return;

      const info = taskManager.getDeadlineInfo(task.dueDate);

      if (info.isOverdue) {
        this.showToast(`"${task.title}" is overdue!`, "danger");
        notified.add(task.id);
        changed = true;
      } else if (info.label === "Due today" || info.label === "Due tomorrow") {
        this.showToast(`"${task.title}" is due within 24 hours.`, "warning");
        notified.add(task.id);
        changed = true;
      }
    });

    if (changed) {
      StorageManager.saveNotifiedIds(Array.from(notified));
    }
  }

  /* ---------------- Internal ---------------- */

  _dismiss(toast) {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 200);
  }

  _escape(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
