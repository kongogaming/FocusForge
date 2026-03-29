/** @typedef {"focus" | "break"} SessionMode */

/**
 * @typedef {{
 *  subject: string,
 *  duration: number,
 *  date: string
 * }} StudySession
 */

/**
 * @typedef {{
 *  isRunning: boolean,
 *  intervalId: number | null,
 *  totalDuration: number,
 *  breakDuration: number,
 *  timeRemaining: number,
 *  mode: SessionMode,
 *  currentSubject: string,
 *  subjects: string[],
 *  studySessions: StudySession[]
 * }} TimerState
 */

const STORAGE_KEYS = {
  subjects: "focusforge_subjects",
  sessions: "focusforge_sessions",
  duration: "focusforge_duration",
  selected: "focusforge_selected_subject"
};

const DEFAULTS = {
  focusDuration: 25 * 60,
  breakDuration: 5 * 60
};

const modeUi = {
  focus: {
    badge: "Focus Mode",
    status: "Focus mode is active.",
    good: true
  },
  break: {
    badge: "Break Mode",
    status: "Break mode is active. Relax.",
    good: false
  }
};

function createStorage() {
  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function loadNumber(key, fallback) {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function loadString(key, fallback) {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  }

  return {
    loadInitialState() {
      /** @type {TimerState} */
      const state = {
        isRunning: false,
        intervalId: null,
        totalDuration: loadNumber(STORAGE_KEYS.duration, DEFAULTS.focusDuration),
        breakDuration: DEFAULTS.breakDuration,
        timeRemaining: loadNumber(STORAGE_KEYS.duration, DEFAULTS.focusDuration),
        mode: "focus",
        currentSubject: loadString(STORAGE_KEYS.selected, ""),
        subjects: loadArray(STORAGE_KEYS.subjects),
        studySessions: loadArray(STORAGE_KEYS.sessions)
      };

      return state;
    },

    save(state) {
      localStorage.setItem(STORAGE_KEYS.subjects, JSON.stringify(state.subjects));
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.studySessions));
      localStorage.setItem(STORAGE_KEYS.duration, String(state.totalDuration));
      localStorage.setItem(STORAGE_KEYS.selected, state.currentSubject);
    }
  };
}

function createView() {
  const elements = {
    timer: document.getElementById("timer"),
    timerOrb: document.getElementById("timerOrb"),
    modeBadge: document.getElementById("modeBadge"),
    focusStatus: document.getElementById("focusStatus"),
    activeSubject: document.getElementById("activeSubject"),
    subjectInput: document.getElementById("subjectInput"),
    subjectList: document.getElementById("subjectList"),
    timeInput: document.getElementById("timeInput"),
    statsList: document.getElementById("statsList"),
    startBtn: document.getElementById("startBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    resetBtn: document.getElementById("resetBtn"),
    addSubjectBtn: document.getElementById("addSubjectBtn"),
    setTimeBtn: document.getElementById("setTimeBtn"),
    editModal: document.getElementById("editModal"),
    editSubjectInput: document.getElementById("editSubjectInput"),
    modalSaveBtn: document.getElementById("modalSaveBtn"),
    modalDeleteBtn: document.getElementById("modalDeleteBtn"),
    modalCancelBtn: document.getElementById("modalCancelBtn"),
    modalClose: document.querySelector(".modal-close"),
    resetAllBtn: document.getElementById("resetAllBtn"),
    resetModal: document.getElementById("resetModal"),
    resetConfirmInput: document.getElementById("resetConfirmInput"),
    resetConfirmBtn: document.getElementById("resetConfirmBtn"),
    resetCancelBtn: document.getElementById("resetCancelBtn")
  };

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function renderTimer(state) {
    elements.timer.innerText = formatTime(state.timeRemaining);
    const cycleTotal = state.mode === "focus" ? state.totalDuration : state.breakDuration;
    const elapsed = cycleTotal - state.timeRemaining;
    const progress = cycleTotal > 0 ? elapsed / cycleTotal : 0;
    const degrees = Math.max(0, Math.min(360, Math.round(progress * 360)));

    elements.timerOrb.style.background =
      `conic-gradient(var(--accent) ${degrees}deg, var(--accent-soft) ${degrees}deg)`;

    elements.timerOrb.classList.toggle("running", state.isRunning);
    elements.modeBadge.innerText = modeUi[state.mode].badge;
  }

  function renderStatus(message, isGood) {
    elements.focusStatus.innerText = message;
    elements.focusStatus.style.color = isGood ? "var(--success)" : "var(--muted)";
  }

  function renderSubjectHeadline(state) {
    elements.activeSubject.innerText = state.currentSubject || "No subject selected";
  }

  function renderSubjects(state, onSelect, onEdit, onDelete) {
    elements.subjectList.innerHTML = "";

    if (state.subjects.length === 0) {
      const li = document.createElement("li");
      li.innerText = "No subjects yet. Add one to get started.";
      elements.subjectList.appendChild(li);
      return;
    }

    state.subjects.forEach((subject) => {
      const li = document.createElement("li");
      li.className = "subject-item";

      const name = document.createElement("span");
      name.className = "subject-name";
      name.innerText = subject;

      const selectBtn = document.createElement("button");
      selectBtn.className = "btn select-subject";
      selectBtn.type = "button";
      selectBtn.innerText = state.currentSubject === subject ? "Selected" : "Select";
      selectBtn.disabled = state.currentSubject === subject;
      selectBtn.addEventListener("click", () => onSelect(subject));

      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-edit";
      editBtn.type = "button";
      editBtn.title = "Edit subject";
      editBtn.innerText = "✏️";
      editBtn.addEventListener("click", () => onEdit(subject));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-delete";
      deleteBtn.type = "button";
      deleteBtn.title = "Delete subject";
      deleteBtn.innerText = "🗑️";
      deleteBtn.addEventListener("click", () => onDelete(subject));

      const actions = document.createElement("div");
      actions.className = "subject-actions";
      actions.appendChild(selectBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(name);
      li.appendChild(actions);
      elements.subjectList.appendChild(li);
    });
  }

  function renderStats(state, filter = "all-time") {
    const sessions = state.studySessions;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    let filtered = sessions;
    if (filter === "today") {
      filtered = sessions.filter(s => {
        const sessionDate = new Date(s.date);
        return sessionDate >= today;
      });
    } else if (filter === "week") {
      filtered = sessions.filter(s => {
        const sessionDate = new Date(s.date);
        return sessionDate >= weekStart;
      });
    }

    // Core metrics
    const totalSessions = filtered.length;
    const totalSeconds = filtered.reduce((sum, item) => sum + item.duration, 0);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const avgDuration = totalSessions > 0 ? Math.round(totalSeconds / totalSessions / 60) : 0;

    // Subject breakdown
    const perSubject = filtered.reduce((map, item) => {
      map[item.subject] = (map[item.subject] || 0) + item.duration;
      return map;
    }, {});

    let topSubject = "-";
    let topDuration = 0;
    const subjectEntries = Object.entries(perSubject);
    subjectEntries.forEach(([subject, duration]) => {
      if (duration > topDuration) {
        topDuration = duration;
        topSubject = subject;
      }
    });

    // Daily streak
    let streak = 0;
    const dates = new Set();
    sessions.forEach(s => {
      const date = new Date(s.date).toDateString();
      dates.add(date);
    });
    const sortedDates = Array.from(dates).sort().reverse();
    for (let i = 0; i < sortedDates.length; i++) {
      const checkDate = new Date(sortedDates[i]);
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() - i);
      if (checkDate.toDateString() === expectedDate.toDateString()) {
        streak++;
      } else {
        break;
      }
    }

    // Longest session
    const longestSession = filtered.length > 0 
      ? Math.max(...filtered.map(s => s.duration)) / 60 
      : 0;

    // Previous period comparison
    let prevFiltered = [];
    if (filter === "week") {
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(weekStart);
      prevFiltered = sessions.filter(s => {
        const sessionDate = new Date(s.date);
        return sessionDate >= prevWeekStart && sessionDate < weekStart;
      });
    } else if (filter === "today") {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      prevFiltered = sessions.filter(s => {
        const sessionDate = new Date(s.date);
        return sessionDate >= yesterday && sessionDate < today;
      });
    }
    const prevMinutes = Math.floor(prevFiltered.reduce((sum, item) => sum + item.duration, 0) / 60);
    const growth = prevMinutes > 0 ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100) : 0;

    elements.statsList.innerHTML = "";

    // Summary stats with progress bars
    const summaryStats = [
      { icon: "📊", label: "Sessions", value: totalSessions },
      { icon: "⏱️", label: "Total Time", value: `${totalMinutes}m` },
      { icon: "⌛", label: "Avg Duration", value: `${avgDuration}m` },
      { icon: "🔥", label: "Streak", value: `${streak}d` },
      { icon: "⭐", label: "Longest", value: `${Math.round(longestSession)}m` }
    ];

    const summaryDiv = document.createElement("div");
    summaryDiv.className = "stats-summary";
    
    summaryStats.forEach(stat => {
      const item = document.createElement("div");
      item.className = "stat-item";
      item.innerHTML = `<span class="stat-icon">${stat.icon}</span><span class="stat-value">${stat.value}</span><span class="stat-label">${stat.label}</span>`;
      summaryDiv.appendChild(item);
    });

    const summaryLi = document.createElement("li");
    summaryLi.className = "stats-summary-container";
    summaryLi.appendChild(summaryDiv);
    elements.statsList.appendChild(summaryLi);

    // Top subject with progress bar
    if (totalMinutes > 0) {
      const topSubjectLi = document.createElement("li");
      topSubjectLi.className = "stat-progress-item";
      const percentage = Math.round((topDuration / totalSeconds) * 100);
      topSubjectLi.innerHTML = `
        <div class="stat-header">
          <span class="stat-title">Top Subject</span>
          <span class="stat-value">${topSubject}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${percentage}%"></div>
        </div>
        <span class="stat-percent">${percentage}% of total time</span>
      `;
      elements.statsList.appendChild(topSubjectLi);
    }

    // Subject breakdown
    if (subjectEntries.length > 0) {
      subjectEntries.sort((a, b) => b[1] - a[1]).forEach(([subject, duration]) => {
        const percentage = Math.round((duration / totalSeconds) * 100);
        const li = document.createElement("li");
        li.className = "stat-progress-item";
        li.innerHTML = `
          <div class="stat-header">
            <span class="stat-title subject-name">${subject}</span>
            <span class="stat-value">${Math.round(duration / 60)}m</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%"></div>
          </div>
        `;
        elements.statsList.appendChild(li);
      });
    }

    // Growth indicator
    if (filter !== "all-time" && prevMinutes >= 0) {
      const growthLi = document.createElement("li");
      growthLi.className = "stat-growth-item";
      const arrow = growth >= 0 ? "📈" : "📉";
      const growthText = growth >= 0 ? `+${growth}%` : `${growth}%`;
      growthLi.innerHTML = `
        <span class="stat-icon">${arrow}</span>
        <span class="growth-text"><strong>${growthText}</strong> vs last ${filter === "week" ? "week" : "day"}</span>
      `;
      elements.statsList.appendChild(growthLi);
    }

    // Recent sessions
    if (filtered.length > 0) {
      const recentHeader = document.createElement("li");
      recentHeader.className = "stat-section-header";
      recentHeader.innerText = "Recent Sessions";
      elements.statsList.appendChild(recentHeader);

      filtered.slice(-3).reverse().forEach((item) => {
        const li = document.createElement("li");
        li.className = "stat-recent-item";
        const date = new Date(item.date).toLocaleDateString();
        const mins = Math.round(item.duration / 60);
        li.innerHTML = `
          <span class="recent-subject">${item.subject}</span>
          <span class="recent-time">${mins}m</span>
          <span class="recent-date">${date}</span>
        `;
        elements.statsList.appendChild(li);
      });
    }
  }

  function setRunningUi(isRunning) {
    elements.startBtn.disabled = isRunning;
    elements.pauseBtn.disabled = !isRunning;
  }

  return {
    elements,
    renderTimer,
    renderStatus,
    renderSubjectHeadline,
    renderSubjects,
    renderStats,
    setRunningUi
  };
}

function createSubjectManager(state, storage, view) {
  return {
    select(subject) {
      state.currentSubject = subject;
      storage.save(state);
      view.renderSubjectHeadline(state);
      view.renderSubjects(state, this.select.bind(this), this.openEdit.bind(this), this.delete.bind(this));
    },

    add(value) {
      const subject = value.trim();
      if (!subject) return { ok: false, message: "Enter a subject name." };

      const duplicate = state.subjects.some(
        (existing) => existing.toLowerCase() === subject.toLowerCase()
      );

      if (duplicate) {
        return { ok: false, message: "Subject already exists." };
      }

      state.subjects.push(subject);
      if (!state.currentSubject) state.currentSubject = subject;

      storage.save(state);
      view.renderSubjectHeadline(state);
      view.renderSubjects(state, this.select.bind(this), this.openEdit.bind(this), this.delete.bind(this));

      return { ok: true, message: `Added subject: ${subject}.` };
    },

    delete(subject) {
      state.subjects = state.subjects.filter(s => s !== subject);
      if (state.currentSubject === subject) {
        state.currentSubject = state.subjects.length > 0 ? state.subjects[0] : "";
      }
      storage.save(state);
      view.renderSubjectHeadline(state);
      view.renderSubjects(state, this.select.bind(this), this.openEdit.bind(this), this.delete.bind(this));
      return { ok: true, message: `Deleted subject: ${subject}.` };
    },

    edit(oldSubject, newSubject) {
      const trimmed = newSubject.trim();
      if (!trimmed) return { ok: false, message: "Subject name cannot be empty." };

      if (trimmed.toLowerCase() === oldSubject.toLowerCase()) {
        return { ok: false, message: "No changes made." };
      }

      const duplicate = state.subjects.some(
        (existing) => existing.toLowerCase() === trimmed.toLowerCase()
      );

      if (duplicate) {
        return { ok: false, message: "Subject already exists." };
      }

      const index = state.subjects.findIndex(s => s === oldSubject);
      if (index === -1) return { ok: false, message: "Subject not found." };

      state.subjects[index] = trimmed;
      if (state.currentSubject === oldSubject) {
        state.currentSubject = trimmed;
      }

      // Update sessions history with new subject name
      state.studySessions.forEach(session => {
        if (session.subject === oldSubject) {
          session.subject = trimmed;
        }
      });

      storage.save(state);
      view.renderSubjectHeadline(state);
      view.renderSubjects(state, this.select.bind(this), this.openEdit.bind(this), this.delete.bind(this));
      return { ok: true, message: `Renamed to: ${trimmed}.` };
    },

    openEdit(subject) {
      // This will be handled by the app
      return subject;
    }
  };
}

function createStatsManager(state, storage, view, getFilter) {
  return {
    recordCompletedSession() {
      state.studySessions.push({
        subject: state.currentSubject || "General",
        duration: state.totalDuration,
        date: new Date().toISOString()
      });

      storage.save(state);
      view.renderStats(state, getFilter ? getFilter() : "all-time");
    }
  };
}

function createTimerController(state, storage, view, statsManager) {
  function stopInternal() {
    if (state.intervalId !== null) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }

    state.isRunning = false;
    view.setRunningUi(false);
    view.renderTimer(state);
  }

  function applyModeUi(mode) {
    const ui = modeUi[mode];
    view.renderStatus(ui.status, ui.good);
  }

  function switchToBreak() {
    state.mode = "break";
    state.timeRemaining = state.breakDuration;
    applyModeUi("break");
    view.renderTimer(state);
  }

  function switchToFocus() {
    state.mode = "focus";
    state.timeRemaining = state.totalDuration;
    applyModeUi("focus");
    view.renderTimer(state);
  }

  function tick() {
    if (state.timeRemaining <= 0) {
      stopInternal();

      if (state.mode === "focus") {
        statsManager.recordCompletedSession();
        switchToBreak();
      } else {
        switchToFocus();
      }

      start();
      return;
    }

    state.timeRemaining -= 1;
    view.renderTimer(state);
  }

  function start() {
    if (state.isRunning) return;

    state.isRunning = true;
    view.setRunningUi(true);
    applyModeUi(state.mode);
    view.renderTimer(state);

    state.intervalId = window.setInterval(tick, 1000);
  }

  function pause() {
    if (!state.isRunning) return;
    stopInternal();
    view.renderStatus("Paused. Resume whenever you're ready.", false);
  }

  function reset() {
    stopInternal();
    switchToFocus();
    view.renderStatus("Timer reset.", false);
  }

  function setFocusDuration(minutes) {
    const numeric = Number(minutes);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return { ok: false, message: "Enter a valid duration." };
    }

    const seconds = Math.round(numeric * 60);
    state.totalDuration = seconds;

    if (state.mode === "focus") {
      state.timeRemaining = seconds;
    }

    storage.save(state);
    view.renderTimer(state);

    return { ok: true, message: `Session length set to ${Math.round(numeric)} min.` };
  }

  return {
    start,
    pause,
    reset,
    setFocusDuration
  };
}

function createApp() {
  const storage = createStorage();
  const state = storage.loadInitialState();
  const view = createView();
  let currentFilter = "all-time";
  let editingSubject = null;

  const subjectManager = createSubjectManager(state, storage, view);
  const statsManager = createStatsManager(state, storage, view, () => currentFilter);
  const timer = createTimerController(state, storage, view, statsManager);

  function openEditModal(subject) {
    editingSubject = subject;
    view.elements.editSubjectInput.value = subject;
    view.elements.editModal.classList.add("active");
    view.elements.editSubjectInput.focus();
    view.elements.editSubjectInput.select();
  }

  function closeEditModal() {
    view.elements.editModal.classList.remove("active");
    editingSubject = null;
  }

  function handleSaveEdit() {
    if (!editingSubject) return;
    const newName = view.elements.editSubjectInput.value;
    const result = subjectManager.edit(editingSubject, newName);
    view.renderStatus(result.message, result.ok);
    closeEditModal();
  }

  function handleDeleteSubject() {
    if (!editingSubject) return;
    if (confirm(`Delete subject "${editingSubject}"?`)) {
      const result = subjectManager.delete(editingSubject);
      view.renderStatus(result.message, result.ok);
      closeEditModal();
    }
  }

  function openResetModal() {
    view.elements.resetModal.classList.add("active");
    view.elements.resetConfirmInput.value = "";
    view.elements.resetConfirmBtn.disabled = true;
    view.elements.resetConfirmInput.focus();
  }

  function closeResetModal() {
    view.elements.resetModal.classList.remove("active");
    view.elements.resetConfirmInput.value = "";
  }

  function handleResetConfirmInput() {
    const input = view.elements.resetConfirmInput.value;
    view.elements.resetConfirmBtn.disabled = input !== "RESET";
  }

  function handleConfirmReset() {
    if (view.elements.resetConfirmInput.value !== "RESET") return;
    
    // Clear all localStorage
    localStorage.clear();
    
    // Reset state
    Object.assign(state, {
      isRunning: false,
      intervalId: null,
      totalDuration: 25 * 60,
      breakDuration: 5 * 60,
      timeRemaining: 25 * 60,
      mode: "focus",
      currentSubject: "",
      subjects: [],
      studySessions: []
    });

    closeResetModal();
    view.renderStatus("All data has been reset. Starting fresh!", true);
    view.renderTimer(state);
    view.renderSubjectHeadline(state);
    view.renderSubjects(state, subjectManager.select.bind(subjectManager), openEditModal, subjectManager.delete.bind(subjectManager));
    view.renderStats(state, currentFilter);
    view.setRunningUi(false);
  }

  function bindEvents() {
    const { elements } = view;

    elements.startBtn.addEventListener("click", timer.start);
    elements.pauseBtn.addEventListener("click", timer.pause);
    elements.resetBtn.addEventListener("click", timer.reset);

    elements.addSubjectBtn.addEventListener("click", () => {
      const result = subjectManager.add(elements.subjectInput.value);
      elements.subjectInput.value = "";
      view.renderStatus(result.message, result.ok);
    });

    elements.setTimeBtn.addEventListener("click", () => {
      const result = timer.setFocusDuration(elements.timeInput.value);
      view.renderStatus(result.message, result.ok);
    });

    elements.subjectInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") elements.addSubjectBtn.click();
    });

    elements.timeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") elements.setTimeBtn.click();
    });

    document.querySelectorAll(".quick-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const result = timer.setFocusDuration(button.dataset.minutes);
        view.renderStatus(result.message, result.ok);
      });
    });

    // Filter button listeners
    document.querySelectorAll(".stats-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".stats-filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        view.renderStats(state, currentFilter);
      });
    });

    // Modal event listeners
    elements.modalSaveBtn.addEventListener("click", handleSaveEdit);
    elements.modalDeleteBtn.addEventListener("click", handleDeleteSubject);
    elements.modalCancelBtn.addEventListener("click", closeEditModal);
    elements.modalClose.addEventListener("click", closeEditModal);

    elements.editSubjectInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") handleSaveEdit();
      if (event.key === "Escape") closeEditModal();
    });

    // Close modal on background click
    elements.editModal.addEventListener("click", (e) => {
      if (e.target === elements.editModal) closeEditModal();
    });

    // Reset button and modal listeners
    elements.resetAllBtn.addEventListener("click", openResetModal);
    elements.resetCancelBtn.addEventListener("click", closeResetModal);
    elements.resetConfirmBtn.addEventListener("click", handleConfirmReset);

    elements.resetConfirmInput.addEventListener("input", handleResetConfirmInput);
    elements.resetConfirmInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeResetModal();
    });

    // Close reset modal on background click
    elements.resetModal.addEventListener("click", (e) => {
      if (e.target === elements.resetModal) closeResetModal();
    });
  }

  function renderInitialUi() {
    view.renderTimer(state);
    view.renderSubjectHeadline(state);
    view.renderSubjects(state, subjectManager.select.bind(subjectManager), openEditModal, subjectManager.delete.bind(subjectManager));
    view.renderStats(state, currentFilter);
    view.setRunningUi(false);
    view.renderStatus("Ready to focus.", false);
  }

  function init() {
    bindEvents();
    renderInitialUi();
  }

  return { init };
}

createApp().init();