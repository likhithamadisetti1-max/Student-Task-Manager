/* =========================================================
   storage.js
   ---------------------------------------------------------
   StorageManager is the ONLY class in the app that talks to
   localStorage directly. It is responsible for:

     - Tasks (the full list, including custom drag-and-drop order)
     - Theme preference (light/dark)
     - Filter preferences (search, status, priority, category)
     - Sort preference

   Every value is saved as JSON so it can store objects and
   arrays, not just strings. If localStorage is unavailable
   (e.g. privacy mode in some browsers) the methods fail
   gracefully instead of crashing the app.
   ========================================================= */

const KEYS = {
  TASKS: "taskflow_tasks",
  THEME: "taskflow_theme",
  FILTERS: "taskflow_filters",
  SORT: "taskflow_sort",
  NOTIFIED: "taskflow_notified_ids",
};

export class StorageManager {
  /* ---------------- Tasks ---------------- */

  /** Returns the saved tasks array, or [] if nothing is saved. */
  static getTasks() {
    return this._read(KEYS.TASKS, []);
  }

  /** Saves the full tasks array (including order). */
  static saveTasks(tasks) {
    this._write(KEYS.TASKS, tasks);
  }

  /* ---------------- Theme ---------------- */

  /** Returns "light" or "dark". Defaults to "light". */
  static getTheme() {
    return this._read(KEYS.THEME, "light");
  }

  static saveTheme(theme) {
    this._write(KEYS.THEME, theme);
  }

  /* ---------------- Filters & Sort ---------------- */

  /**
   * Returns the saved filter settings:
   * { search, status, priority, category }
   */
  static getFilters() {
    return this._read(KEYS.FILTERS, {
      search: "",
      status: "all",
      priority: "all",
      category: "all",
    });
  }

  static saveFilters(filters) {
    this._write(KEYS.FILTERS, filters);
  }

  /** Returns the saved sort key (e.g. "dueDate"). */
  static getSort() {
    return this._read(KEYS.SORT, "dateAdded");
  }

  static saveSort(sortBy) {
    this._write(KEYS.SORT, sortBy);
  }

  /* ---------------- Deadline notification tracking ---------------- */

  /**
   * Returns the list of task ids we've already shown a
   * deadline toast for, so we don't repeat the same toast
   * every few seconds.
   */
  static getNotifiedIds() {
    return this._read(KEYS.NOTIFIED, []);
  }

  static saveNotifiedIds(ids) {
    this._write(KEYS.NOTIFIED, ids);
  }

  /* ---------------- Internal helpers ---------------- */

  static _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (error) {
      console.error(`StorageManager: failed to read "${key}"`, error);
      return fallback;
    }
  }

  static _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`StorageManager: failed to write "${key}"`, error);
    }
  }
}
