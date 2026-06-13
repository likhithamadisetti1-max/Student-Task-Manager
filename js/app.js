/* =========================================================
   app.js
   ---------------------------------------------------------
   The "controller" of the app. App is an ES6 class that:

     - Creates one instance each of TaskManager, UIManager,
       NotificationManager, and DragDropManager
     - Restores saved theme, filters, and sort preference
     - Wires up every event listener (forms, buttons,
       dropdowns, modals, keyboard shortcuts)
     - Re-renders the dashboard any time the data changes

   Read this file top-to-bottom for a map of everything the
   app can do.
   ========================================================= */

import { StorageManager } from "./storage.js";
import { TaskManager } from "./taskManager.js";
import { UIManager } from "./ui.js";
import { NotificationManager } from "./notifications.js";
import { DragDropManager } from "./dragdrop.js";

const DEADLINE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // re-check every 5 minutes

class App {
  constructor() {
    // Core managers
    this.taskManager = new TaskManager();
    this.ui = new UIManager();
    this.notifications = new NotificationManager(
      document.getElementById("toast-container")
    );

    // State used while a modal is open
    this.editingId = null;
    this.editingOriginalDueDate = null;
    this.pendingDeleteId = null;

    this._cacheElements();
    this._init();
  }

  /* ---------------- Setup ---------------- */

  _cacheElements() {
    // Navbar
    this.themeToggle = document.getElementById("theme-toggle");
    this.shortcutsBtn = document.getElementById("shortcuts-btn");

    // Toolbar
    this.searchInput = document.getElementById("search-input");
    this.filterStatus = document.getElementById("filter-status");
    this.filterPriority = document.getElementById("filter-priority");
    this.filterCategory = document.getElementById("filter-category");
    this.sortSelect = document.getElementById("sort-select");
    this.addTaskBtn = document.getElementById("add-task-btn");
    this.emptyAddBtn = document.getElementById("empty-add-btn");

    // Export / Import
    this.exportMenuBtn = document.getElementById("export-menu-btn");
    this.exportMenu = document.getElementById("export-menu");
    this.exportPdfBtn = document.getElementById("export-pdf-btn");
    this.exportCsvBtn = document.getElementById("export-csv-btn");
    this.importJsonBtn = document.getElementById("import-json-btn");
    this.importJsonInput = document.getElementById("import-json-input");

    // Task grid
    this.taskGrid = document.getElementById("task-grid");

    // Task form modal
    this.taskForm = document.getElementById("task-form");
    this.dueDateInput = document.getElementById("task-due-date");

    // Delete modal
    this.confirmDeleteBtn = document.getElementById("confirm-delete-btn");
  }

  async _init() {
    // 1. Apply saved theme immediately (before paint feels snappy)
    this._applyTheme(StorageManager.getTheme());

    // 2. Restore saved filters / sort preference into the toolbar
    this._restoreFilters();

    // 3. Show a brief loading state for a polished first impression
    this.ui.showLoading(true);
    await this._delay(350);
    this.ui.showLoading(false);

    // 4. Wire up all event listeners
    this._bindEvents();

    // 5. Enable drag-and-drop reordering on the task grid
    this.dragDrop = new DragDropManager(this.taskGrid, (orderedIds) => {
      this.taskManager.reorder(orderedIds);
      this.notifications.showToast("Task order saved.", "info", 2000);
    });

    // 6. First render
    this.refresh();

    // 7. Deadline alerts — check now, then periodically
    this.notifications.checkDeadlines(this.taskManager);
    setInterval(() => {
      this.notifications.checkDeadlines(this.taskManager);
    }, DEADLINE_CHECK_INTERVAL_MS);
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ---------------- Rendering ---------------- */

  /**
   * Re-reads filters/sort from the toolbar, applies them to the
   * task list, and redraws the grid, stats, and progress meters.
   * Call this after ANY change to the task data.
   */
  refresh() {
    const filters = this._currentFilters();
    const filtered = this.taskManager.filter(filters);
    const visible = this.taskManager.sort(filtered, this.sortSelect.value);

    this.ui.renderTasks(visible, this.taskManager);
    this.ui.renderStats(this.taskManager.getStats());
    this.ui.renderProgress(this.taskManager.getProgress());
  }

  _currentFilters() {
    return {
      search: this.searchInput.value,
      status: this.filterStatus.value,
      priority: this.filterPriority.value,
      category: this.filterCategory.value,
    };
  }

  /* ---------------- Theme ---------------- */

  _applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);

    // Swap the navbar icon: moon in light mode (click to go dark),
    // sun in dark mode (click to go light).
    const icon = this.themeToggle.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-moon", theme !== "dark");
      icon.classList.toggle("fa-sun", theme === "dark");
    }
  }

  _toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    this._applyTheme(next);
    StorageManager.saveTheme(next);
  }

  /* ---------------- Filters & Sort persistence ---------------- */

  _restoreFilters() {
    const filters = StorageManager.getFilters();
    this.searchInput.value = filters.search || "";
    this.filterStatus.value = filters.status || "all";
    this.filterPriority.value = filters.priority || "all";
    this.filterCategory.value = filters.category || "all";
    this.sortSelect.value = StorageManager.getSort();
  }

  _saveFilters() {
    StorageManager.saveFilters(this._currentFilters());
  }

  /* ---------------- Event Binding ---------------- */

  _bindEvents() {
    // ---- Theme toggle ----
    this.themeToggle.addEventListener("click", () => this._toggleTheme());

    // ---- Keyboard shortcuts help ----
    this.shortcutsBtn.addEventListener("click", () =>
      this.ui.openModal("shortcuts-modal")
    );

    // ---- Search / filter / sort ----
    this.searchInput.addEventListener("input", () => {
      this._saveFilters();
      this.refresh();
    });

    [this.filterStatus, this.filterPriority, this.filterCategory].forEach(
      (select) => {
        select.addEventListener("change", () => {
          this._saveFilters();
          this.refresh();
        });
      }
    );

    this.sortSelect.addEventListener("change", () => {
      StorageManager.saveSort(this.sortSelect.value);
      this.refresh();
    });

    // ---- Add Task buttons ----
    this.addTaskBtn.addEventListener("click", () => this._openAddModal());
    this.emptyAddBtn.addEventListener("click", () => this._openAddModal());

    // ---- Task form (Add / Edit) ----
    this.taskForm.addEventListener("submit", (e) => this._handleFormSubmit(e));

    // ---- Modal close buttons (Cancel / X) ----
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.ui.closeModal(btn.dataset.closeModal)
      );
    });

    // Clicking the dark overlay (outside the modal box) closes it
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.add("hidden");
      });
    });

    // ---- Task grid: edit / delete / complete / status change ----
    this.taskGrid.addEventListener("click", (e) => this._handleGridClick(e));
    this.taskGrid.addEventListener("change", (e) => this._handleGridChange(e));

    // ---- Delete confirmation ----
    this.confirmDeleteBtn.addEventListener("click", () =>
      this._confirmDelete()
    );

    // ---- Export / Import menu ----
    this.exportMenuBtn.addEventListener("click", () => this._toggleExportMenu());
    document.addEventListener("click", (e) => this._handleOutsideExportClick(e));

    this.exportPdfBtn.addEventListener("click", () => {
      this._exportPdf();
      this._closeExportMenu();
    });

    this.exportCsvBtn.addEventListener("click", () => {
      this._exportCsv();
      this._closeExportMenu();
    });

    this.importJsonBtn.addEventListener("click", () => {
      this.importJsonInput.click();
      this._closeExportMenu();
    });

    this.importJsonInput.addEventListener("change", (e) =>
      this._handleImportFile(e)
    );

    // ---- Global key handling: shortcuts + button press effect + Escape ----
    document.addEventListener("keydown", (e) => this._handleKeydown(e));
    document.addEventListener("click", (e) => this._handleGlobalClick(e));
  }

  /* ---------------- Add / Edit Modal ---------------- */

  _openAddModal() {
    this.editingId = null;
    this.editingOriginalDueDate = null;

    this.ui.fillTaskForm(null);

    // Prevent picking a past date for brand-new tasks.
    this.dueDateInput.min = this._todayStr();

    this.ui.openModal("task-modal");
  }

  _openEditModal(id) {
    const task = this.taskManager.getTaskById(id);
    if (!task) return;

    this.editingId = id;
    this.editingOriginalDueDate = task.dueDate;

    this.ui.fillTaskForm(task);

    // Allow keeping an existing (possibly past) due date when
    // editing — only NEW or CHANGED dates must be in the future.
    this.dueDateInput.removeAttribute("min");

    this.ui.openModal("task-modal");
  }

  _handleFormSubmit(event) {
    event.preventDefault();

    const data = this._readFormData();
    const isEditing = Boolean(this.editingId);

    if (!this._validateForm(data, isEditing)) {
      return;
    }

    if (isEditing) {
      this.taskManager.updateTask(this.editingId, data);
      this.notifications.showToast("Task updated successfully.", "success");
    } else {
      this.taskManager.addTask(data);
      this.notifications.showToast("Task added successfully.", "success");
    }

    this.ui.closeModal("task-modal");
    this.editingId = null;
    this.editingOriginalDueDate = null;

    this.refresh();
    this.notifications.checkDeadlines(this.taskManager);
  }

  _readFormData() {
    return {
      title: document.getElementById("task-title").value.trim(),
      description: document.getElementById("task-description").value.trim(),
      dueDate: document.getElementById("task-due-date").value,
      priority: document.getElementById("task-priority").value,
      category: document.getElementById("task-category").value,
      status: document.getElementById("task-status").value,
    };
  }

  /**
   * Validates the Add/Edit form.
   * Rules:
   *   - Title is required.
   *   - Due date is required.
   *   - Due date cannot be in the past — UNLESS we're editing a
   *     task and the due date hasn't changed (so existing
   *     overdue tasks can still be edited/saved).
   */
  _validateForm(data, isEditing) {
    this.ui.clearFieldErrors();
    let isValid = true;

    if (!data.title) {
      this.ui.showFieldError("error-title", "Task title is required.");
      isValid = false;
    }

    if (!data.dueDate) {
      this.ui.showFieldError("error-due-date", "Due date is required.");
      isValid = false;
    } else {
      const today = this._todayStr();
      const dateUnchanged = isEditing && data.dueDate === this.editingOriginalDueDate;

      if (!dateUnchanged && data.dueDate < today) {
        this.ui.showFieldError("error-due-date", "Due date cannot be in the past.");
        isValid = false;
      }
    }

    return isValid;
  }

  /** Returns today's date as "YYYY-MM-DD" in the user's local timezone. */
  _todayStr() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offsetMs).toISOString().split("T")[0];
  }

  /* ---------------- Task Grid Interactions ---------------- */

  _handleGridClick(event) {
    const button = event.target.closest("button");
    if (!button || !button.dataset.id) return;

    const id = button.dataset.id;

    if (button.classList.contains("task-edit-btn")) {
      this._openEditModal(id);
    } else if (button.classList.contains("task-delete-btn")) {
      this._openDeleteModal(id);
    } else if (button.classList.contains("task-complete-btn")) {
      this.taskManager.markComplete(id);
      this.notifications.showToast("Task marked as complete! 🎉", "success");
      this.refresh();
    }
  }

  _handleGridChange(event) {
    if (!event.target.classList.contains("task-status-select")) return;

    const id = event.target.dataset.id;
    this.taskManager.updateTask(id, { status: event.target.value });
    this.refresh();
  }

  /* ---------------- Delete Modal ---------------- */

  _openDeleteModal(id) {
    const task = this.taskManager.getTaskById(id);
    if (!task) return;

    this.pendingDeleteId = id;
    this.ui.setDeleteTaskTitle(task.title);
    this.ui.openModal("delete-modal");
  }

  _confirmDelete() {
    if (!this.pendingDeleteId) return;

    this.taskManager.deleteTask(this.pendingDeleteId);
    this.notifications.showToast("Task deleted.", "danger");

    this.pendingDeleteId = null;
    this.ui.closeModal("delete-modal");
    this.refresh();
  }

  /* ---------------- Export / Import ---------------- */

  _toggleExportMenu() {
    const willShow = this.exportMenu.classList.contains("hidden");
    this.exportMenu.classList.toggle("hidden");
    this.exportMenuBtn.setAttribute("aria-expanded", String(willShow));
  }

  _closeExportMenu() {
    this.exportMenu.classList.add("hidden");
    this.exportMenuBtn.setAttribute("aria-expanded", "false");
  }

  _handleOutsideExportClick(event) {
    if (this.exportMenu.classList.contains("hidden")) return;

    const clickedInsideMenu = this.exportMenu.contains(event.target);
    const clickedToggleBtn = this.exportMenuBtn.contains(event.target);

    if (!clickedInsideMenu && !clickedToggleBtn) {
      this._closeExportMenu();
    }
  }

  /** Builds and downloads a simple PDF report of all tasks using jsPDF. */
  _exportPdf() {
    if (!window.jspdf) {
      this.notifications.showToast(
        "PDF library could not load. Check your internet connection.",
        "danger"
      );
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const tasks = this.taskManager.getAll();
    const marginX = 14;
    let y = 18;

    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("TaskFlow — Task Report", marginX, y);

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    y += 6;
    doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y);
    y += 4;
    doc.text(`Total tasks: ${tasks.length}`, marginX, y);
    y += 8;

    if (tasks.length === 0) {
      doc.text("No tasks to display.", marginX, y);
    }

    tasks.forEach((task, index) => {
      if (y > 270) {
        doc.addPage();
        y = 18;
      }

      const deadline = this.taskManager.getDeadlineInfo(task.dueDate);

      doc.setFont(undefined, "bold");
      doc.setFontSize(11);
      doc.text(`${index + 1}. ${task.title}`, marginX, y);
      y += 5;

      doc.setFont(undefined, "normal");
      doc.setFontSize(9);
      doc.text(
        `Due: ${task.dueDate}  |  Priority: ${this._capitalize(task.priority)}  |  ` +
          `Category: ${this._capitalize(task.category)}  |  Status: ${this._capitalize(
            task.status.replace("-", " ")
          )}  |  ${deadline.label}`,
        marginX,
        y
      );
      y += 5;

      if (task.description) {
        const lines = doc.splitTextToSize(task.description, 180);
        doc.text(lines, marginX, y);
        y += lines.length * 4.5;
      }

      y += 4;
    });

    doc.save("taskflow-tasks.pdf");
    this.notifications.showToast("Tasks exported as PDF.", "success");
  }

  /** Builds and downloads a CSV file of all tasks. */
  _exportCsv() {
    const tasks = this.taskManager.getAll();
    const headers = ["Title", "Description", "Due Date", "Priority", "Category", "Status"];

    const rows = tasks.map((task) => [
      task.title,
      task.description,
      task.dueDate,
      task.priority,
      task.category,
      task.status,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => this._csvEscape(cell)).join(","))
      .join("\n");

    this._downloadFile(csv, "taskflow-tasks.csv", "text/csv;charset=utf-8;");
    this.notifications.showToast("Tasks exported as CSV.", "success");
  }

  _csvEscape(value) {
    const str = String(value ?? "");
    // Wrap in quotes (and escape internal quotes) if the value
    // contains a comma, quote, or newline.
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  /** Reads a user-selected .json file and imports any valid tasks from it. */
  _handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const items = Array.isArray(parsed) ? parsed : parsed.tasks;

        if (!Array.isArray(items)) {
          throw new Error("Expected a JSON array of tasks.");
        }

        let imported = 0;

        items.forEach((item) => {
          if (!item || !item.title || !item.dueDate) return;

          this.taskManager.addTask({
            title: String(item.title).slice(0, 100),
            description: item.description ? String(item.description) : "",
            dueDate: item.dueDate,
            priority: ["high", "medium", "low"].includes(item.priority)
              ? item.priority
              : "medium",
            category: ["assignment", "exam", "project", "personal"].includes(
              item.category
            )
              ? item.category
              : "assignment",
            status: ["not-started", "in-progress", "completed"].includes(item.status)
              ? item.status
              : "not-started",
          });

          imported++;
        });

        this.refresh();
        this.notifications.checkDeadlines(this.taskManager);

        if (imported > 0) {
          this.notifications.showToast(
            `Imported ${imported} task${imported === 1 ? "" : "s"} from JSON.`,
            "success"
          );
        } else {
          this.notifications.showToast(
            "No valid tasks were found in that file.",
            "warning"
          );
        }
      } catch (error) {
        console.error("Import failed:", error);
        this.notifications.showToast(
          "Could not import file — make sure it's valid JSON.",
          "danger"
        );
      }
    };

    reader.readAsText(file);

    // Reset so the same file can be selected again later if needed.
    this.importJsonInput.value = "";
  }

  /* ---------------- Keyboard Shortcuts & Global Click Effects ---------------- */

  _handleKeydown(event) {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    // Ctrl/Cmd + N -> open "Add Task"
    if (isCtrlOrCmd && event.key.toLowerCase() === "n") {
      event.preventDefault();
      this._openAddModal();
      return;
    }

    // Ctrl/Cmd + F -> focus the search box
    if (isCtrlOrCmd && event.key.toLowerCase() === "f") {
      event.preventDefault();
      this.searchInput.focus();
      return;
    }

    // Escape -> close any open modal
    if (event.key === "Escape") {
      document.querySelectorAll(".modal-overlay").forEach((overlay) => {
        overlay.classList.add("hidden");
      });
    }
  }

  /** Adds a small "press" animation to any button the user clicks. */
  _handleGlobalClick(event) {
    const target = event.target.closest(".btn, .icon-btn");
    if (target) this.ui.pressEffect(target);
  }

  /* ---------------- Small helpers ---------------- */

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Start the application once this module loads.
new App();
