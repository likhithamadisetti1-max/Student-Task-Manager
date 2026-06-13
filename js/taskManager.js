/* =========================================================
   taskManager.js
   ---------------------------------------------------------
   Contains:
     - Task: a small class representing one task
     - TaskManager: holds the list of tasks in memory,
       keeps it in sync with StorageManager, and provides
       CRUD, filtering, sorting, stats, and deadline helpers.

   UI code never edits the `tasks` array directly — it
   always goes through TaskManager methods, which guarantee
   the data is also saved to localStorage.
   ========================================================= */

import { StorageManager } from "./storage.js";

/** Priority order used for sorting (lower = shown first). */
const PRIORITY_ORDER = { high: 1, medium: 2, low: 3 };

export class Task {
  constructor({
    id,
    title,
    description = "",
    dueDate,
    priority = "medium",
    category = "assignment",
    status = "not-started",
    createdAt = Date.now(),
  }) {
    this.id = id || Task.createId();
    this.title = title;
    this.description = description;
    this.dueDate = dueDate; // ISO date string, e.g. "2026-06-20"
    this.priority = priority; // "high" | "medium" | "low"
    this.category = category; // "assignment" | "exam" | "project" | "personal"
    this.status = status; // "not-started" | "in-progress" | "completed"
    this.createdAt = createdAt;
  }

  static createId() {
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }
}

export class TaskManager {
  constructor() {
    // Load any previously-saved tasks into memory on startup.
    const saved = StorageManager.getTasks();
    this.tasks = saved.map((data) => new Task(data));
  }

  /* ---------------- CRUD ---------------- */

  /** Returns the raw, in-memory task list (in storage order). */
  getAll() {
    return this.tasks;
  }

  /** Creates a new task, saves it, and returns it. */
  addTask(data) {
    const task = new Task({ ...data, createdAt: Date.now() });
    this.tasks.push(task);
    this._persist();
    return task;
  }

  /** Merges `updates` into the task with the given id. */
  updateTask(id, updates) {
    this.tasks = this.tasks.map((task) =>
      task.id === id ? new Task({ ...task, ...updates }) : task
    );
    this._persist();
  }

  /** Permanently removes a task. */
  deleteTask(id) {
    this.tasks = this.tasks.filter((task) => task.id !== id);
    this._persist();
  }

  /** Finds a single task by id (or undefined if not found). */
  getTaskById(id) {
    return this.tasks.find((task) => task.id === id);
  }

  /** Shortcut for the "Mark Complete" button. */
  markComplete(id) {
    this.updateTask(id, { status: "completed" });
  }

  /**
   * Replaces the task order with the given array of ids
   * (used after a drag-and-drop reorder). Any ids not
   * present in `orderedIds` keep their relative order at
   * the end, as a safety net.
   */
  reorder(orderedIds) {
    const byId = new Map(this.tasks.map((task) => [task.id, task]));
    const reordered = [];

    orderedIds.forEach((id) => {
      if (byId.has(id)) {
        reordered.push(byId.get(id));
        byId.delete(id);
      }
    });

    // Append anything that wasn't in orderedIds (shouldn't normally happen).
    byId.forEach((task) => reordered.push(task));

    this.tasks = reordered;
    this._persist();
  }

  /* ---------------- Filtering ---------------- */

  /**
   * Returns a NEW array containing only tasks that match the
   * given filters. `filters` looks like:
   * { search, status, priority, category }
   */
  filter(filters) {
    const { search = "", status = "all", priority = "all", category = "all" } = filters;
    const term = search.trim().toLowerCase();

    return this.tasks.filter((task) => {
      const matchesSearch = !term || task.title.toLowerCase().includes(term);
      const matchesStatus = status === "all" || task.status === status;
      const matchesPriority = priority === "all" || task.priority === priority;
      const matchesCategory = category === "all" || task.category === category;

      return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
    });
  }

  /* ---------------- Sorting ---------------- */

  /**
   * Returns a NEW sorted array. Does not mutate the
   * original list or change the saved order — only
   * dragging-and-dropping changes the saved order.
   */
  sort(taskList, sortBy) {
    const sorted = [...taskList];

    switch (sortBy) {
      case "dueDate":
        sorted.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        break;
      case "priority":
        sorted.sort(
          (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        );
        break;
      case "alphabetical":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "dateAdded":
      default:
        // "Date Added" doubles as the default / manual order.
        // `this.tasks` is already stored in this order (creation
        // order, or whatever order the user last dragged them
        // into via DragDropManager), so no extra sort is applied —
        // this is what makes drag-and-drop reordering "stick".
        break;
    }

    return sorted;
  }

  /* ---------------- Stats & Progress ---------------- */

  /** Returns { total, completed, pending, overdue }. */
  getStats() {
    const total = this.tasks.length;
    const completed = this.tasks.filter((t) => t.status === "completed").length;
    const overdue = this.tasks.filter(
      (t) => t.status !== "completed" && this.isOverdue(t.dueDate)
    ).length;
    const pending = total - completed;

    return { total, completed, pending, overdue };
  }

  /** Returns { completed, total, percent } for the progress ring/bar. */
  getProgress() {
    const { total, completed } = this.getStats();
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { completed, total, percent };
  }

  /* ---------------- Deadline helpers ---------------- */

  /** True if the given date string is strictly before today. */
  isOverdue(dueDateStr) {
    return this._daysUntil(dueDateStr) < 0;
  }

  /** True if the date is today, tomorrow, in 2, or in 3 days (and not overdue). */
  isDueSoon(dueDateStr) {
    const diff = this._daysUntil(dueDateStr);
    return diff >= 0 && diff <= 3;
  }

  /** True if the due date string represents a date before today. */
  isPastDate(dueDateStr) {
    return this._daysUntil(dueDateStr) < 0;
  }

  /**
   * Returns a human-readable countdown label and a CSS class
   * name describing how urgent a deadline is.
   * e.g. { label: "Due in 2 days", className: "due-soon" }
   */
  getDeadlineInfo(dueDateStr) {
    const diff = this._daysUntil(dueDateStr);

    if (diff < 0) {
      const days = Math.abs(diff);
      return {
        label: `Overdue by ${days} day${days === 1 ? "" : "s"}`,
        className: "overdue",
        isOverdue: true,
      };
    }

    if (diff === 0) {
      return { label: "Due today", className: "due-soon", isOverdue: false };
    }

    if (diff === 1) {
      return { label: "Due tomorrow", className: "due-soon", isOverdue: false };
    }

    if (diff <= 3) {
      return { label: `Due in ${diff} days`, className: "due-soon", isOverdue: false };
    }

    return { label: `Due in ${diff} days`, className: "due-later", isOverdue: false };
  }

  /** Number of whole days between today and the given date (can be negative). */
  _daysUntil(dueDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((due - today) / msPerDay);
  }

  /* ---------------- Internal ---------------- */

  _persist() {
    StorageManager.saveTasks(this.tasks);
  }
}
