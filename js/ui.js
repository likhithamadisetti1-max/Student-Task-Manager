/* =========================================================
   ui.js
   ---------------------------------------------------------
   UIManager turns data (stats, progress, tasks) into DOM
   elements, and provides helpers for opening/closing modals
   and showing field validation errors.

   UIManager never modifies task data itself — app.js reads
   user actions, updates TaskManager, then calls UIManager
   to redraw the screen.
   ========================================================= */

const CATEGORY_LABELS = {
  assignment: "Assignment",
  exam: "Exam Prep",
  project: "Project",
  personal: "Personal",
};

const STATUS_LABELS = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  completed: "Completed",
};

export class UIManager {
  constructor() {
    // Cache references to elements we update often.
    this.taskGrid = document.getElementById("task-grid");
    this.emptyState = document.getElementById("empty-state");
    this.loadingState = document.getElementById("loading-state");

    this.statTotal = document.getElementById("stat-total");
    this.statCompleted = document.getElementById("stat-completed");
    this.statPending = document.getElementById("stat-pending");
    this.statOverdue = document.getElementById("stat-overdue");

    this.progressRingFill = document.getElementById("progress-ring-fill");
    this.progressRingText = document.getElementById("progress-ring-text");
    this.progressBarFill = document.getElementById("progress-bar-fill");
    this.progressSummary = document.getElementById("progress-summary");

    // Circle circumference for r=48 -> 2 * PI * 48
    this.ringCircumference = 2 * Math.PI * 48;
  }

  /* ---------------- Loading & Empty States ---------------- */

  showLoading(show) {
    this.loadingState.classList.toggle("hidden", !show);
  }

  /* ---------------- Stats ---------------- */

  renderStats(stats) {
    this.statTotal.textContent = stats.total;
    this.statCompleted.textContent = stats.completed;
    this.statPending.textContent = stats.pending;
    this.statOverdue.textContent = stats.overdue;
  }

  /* ---------------- Progress ---------------- */

  renderProgress(progress) {
    const { completed, total, percent } = progress;

    this.progressSummary.textContent = `${completed} of ${total} task${
      total === 1 ? "" : "s"
    } completed (${percent}%)`;

    this.progressBarFill.style.width = `${percent}%`;
    this.progressRingText.textContent = `${percent}%`;

    const offset = this.ringCircumference * (1 - percent / 100);
    this.progressRingFill.style.strokeDasharray = `${this.ringCircumference}`;
    this.progressRingFill.style.strokeDashoffset = `${offset}`;
  }

  /* ---------------- Task Grid ---------------- */

  /**
   * Renders the full task grid.
   * @param {Array} tasks - already filtered & sorted tasks
   * @param {TaskManager} taskManager - used for deadline info
   */
  renderTasks(tasks, taskManager) {
    this.taskGrid.innerHTML = "";

    if (tasks.length === 0) {
      this.emptyState.classList.remove("hidden");
      this.taskGrid.classList.add("hidden");
      return;
    }

    this.emptyState.classList.add("hidden");
    this.taskGrid.classList.remove("hidden");

    tasks.forEach((task) => {
      this.taskGrid.appendChild(this._createTaskCard(task, taskManager));
    });
  }

  _createTaskCard(task, taskManager) {
    const card = document.createElement("article");
    const deadline = taskManager.getDeadlineInfo(task.dueDate);
    const isOverdue = task.status !== "completed" && deadline.isOverdue;

    card.className = `task-card status-${task.status}${
      isOverdue ? " is-overdue" : ""
    }`;
    card.dataset.id = task.id;
    card.draggable = true;
    card.setAttribute("aria-label", `Task: ${task.title}`);

    card.innerHTML = `
      <div class="task-card-top">
        <h3 class="task-title">${this._escape(task.title)}</h3>
        <div class="task-badges">
          ${isOverdue ? `<span class="badge badge-overdue">Overdue</span>` : ""}
          <span class="badge badge-priority-${task.priority}">${this._capitalize(
            task.priority
          )}</span>
        </div>
      </div>

      <div class="task-badges">
        <span class="badge badge-category-${task.category}">
          ${CATEGORY_LABELS[task.category] || task.category}
        </span>
      </div>

      ${
        task.description
          ? `<p class="task-description">${this._escape(task.description)}</p>`
          : ""
      }

      <div class="task-meta-row">
        <span class="task-due">
          <i class="fa-regular fa-calendar" aria-hidden="true"></i>
          ${this._formatDate(task.dueDate)}
        </span>
        <span class="task-countdown ${deadline.className}">${deadline.label}</span>
      </div>

      <div class="task-progress-track" aria-hidden="true">
        <div class="task-progress-fill status-${task.status}"></div>
      </div>

      <div class="task-card-footer">
        <select class="task-status-select" data-id="${task.id}" aria-label="Change status for ${this._escape(
          task.title
        )}">
          ${this._statusOption(task, "not-started")}
          ${this._statusOption(task, "in-progress")}
          ${this._statusOption(task, "completed")}
        </select>

        <div class="task-actions">
          ${
            task.status !== "completed"
              ? `<button class="btn btn-sm btn-ghost task-complete-btn" data-id="${task.id}" title="Mark complete" aria-label="Mark '${this._escape(
                  task.title
                )}' as complete">
                  <i class="fa-solid fa-check" aria-hidden="true"></i>
                </button>`
              : ""
          }
          <button class="btn btn-sm btn-ghost task-edit-btn" data-id="${task.id}" title="Edit task" aria-label="Edit '${this._escape(
            task.title
          )}'">
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
          <button class="btn btn-sm btn-ghost task-delete-btn" data-id="${task.id}" title="Delete task" aria-label="Delete '${this._escape(
            task.title
          )}'">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;

    return card;
  }

  _statusOption(task, value) {
    const selected = task.status === value ? "selected" : "";
    return `<option value="${value}" ${selected}>${STATUS_LABELS[value]}</option>`;
  }

  /* ---------------- Modals ---------------- */

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove("hidden");

    // Focus the first visible, focusable element for accessibility
    // (skip the hidden #task-id field).
    const focusable = modal.querySelector(
      'input:not([type="hidden"]), select, textarea, button'
    );
    if (focusable) focusable.focus();
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.add("hidden");
  }

  isModalOpen(modalId) {
    return !document.getElementById(modalId).classList.contains("hidden");
  }

  /**
   * Fills the Add/Edit task form with a task's data, or
   * clears it for a brand-new task.
   */
  fillTaskForm(task) {
    const idInput = document.getElementById("task-id");
    const titleInput = document.getElementById("task-title");
    const descInput = document.getElementById("task-description");
    const dueInput = document.getElementById("task-due-date");
    const priorityInput = document.getElementById("task-priority");
    const categoryInput = document.getElementById("task-category");
    const statusInput = document.getElementById("task-status");
    const modalTitle = document.getElementById("modal-title");
    const saveBtn = document.getElementById("save-task-btn");

    this.clearFieldErrors();

    if (task) {
      idInput.value = task.id;
      titleInput.value = task.title;
      descInput.value = task.description;
      dueInput.value = task.dueDate;
      priorityInput.value = task.priority;
      categoryInput.value = task.category;
      statusInput.value = task.status;

      modalTitle.textContent = "Edit Task";
      saveBtn.textContent = "Update Task";
    } else {
      idInput.value = "";
      titleInput.value = "";
      descInput.value = "";
      dueInput.value = "";
      priorityInput.value = "medium";
      categoryInput.value = "assignment";
      statusInput.value = "not-started";

      modalTitle.textContent = "Add New Task";
      saveBtn.textContent = "Save Task";
    }
  }

  /* ---------------- Form Validation Helpers ---------------- */

  showFieldError(fieldErrorId, message) {
    const el = document.getElementById(fieldErrorId);
    if (el) el.textContent = message;
  }

  clearFieldErrors() {
    document.querySelectorAll(".field-error").forEach((el) => {
      el.textContent = "";
    });
  }

  /* ---------------- Delete Confirmation ---------------- */

  setDeleteTaskTitle(title) {
    document.getElementById("delete-task-title").textContent = `"${title}"`;
  }

  /* ---------------- Small click-press animation ---------------- */

  pressEffect(el) {
    el.classList.add("is-pressed");
    setTimeout(() => el.classList.remove("is-pressed"), 180);
  }

  /* ---------------- Helpers ---------------- */

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  _formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  _escape(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
