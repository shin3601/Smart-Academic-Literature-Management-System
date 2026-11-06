
import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// ==========================================
// SMART ACADEMIC
// CALENDAR AND SCHEDULE MANAGEMENT
// ==========================================

const $ = id => document.getElementById(id);

const CATEGORIES = {
  class: "📚 Class Schedule",
  exam: "📝 Examination",
  holiday: "🏖 Holiday",
  no_class: "🚫 No Classes",
  event: "📢 School Event"
};

let profile = null;
let events = [];
let attendanceByDay = new Map();
let editingId = null;
let busy = false;

let currentMonth = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  1
);

let selectedDate = dateKey(new Date());

// ==========================================
// HELPERS
// ==========================================

function showMessage(text, type = "error") {
  $("calendarMessage").textContent = text;
  $("calendarMessage").className =
    "calendar-message " + type;
}

function createText(tag, text, className = "") {
  const element = document.createElement(tag);

  element.textContent = String(text ?? "");

  if (className) {
    element.className = className;
  }

  return element;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function prettyDate(key) {
  if (!key) return "Unavailable";

  const parts = key.split("-").map(Number);

  const date = new Date(
    parts[0],
    parts[1] - 1,
    parts[2],
    12
  );

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function prettyTime(value) {
  if (!value) return "";

  const parts = value.split(":").map(Number);

  const date = new Date(
    2000, 0, 1,
    parts[0], parts[1]
  );

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function isAdmin() {
  return profile?.role === "admin";
}

// ==========================================
// LOGIN AND ROLE CHECK
// ==========================================

async function initialize() {
  $("calendarForm").hidden = true;

  try {
    profile = await getCurrentProfile();

    if (
      !profile ||
      !["admin", "student"].includes(profile.role)
    ) {
      window.location.replace("index.html");
      return;
    }

    if (isAdmin()) {
      $("backLink").href = "admin.html";
      $("backLink").textContent =
        "← Back to Admin Dashboard";

      $("calendarWelcome").textContent =
        "Manage class schedules, examinations, holidays, and no-class days.";

      $("adminCalendarPanel").hidden = false;
      $("calendarForm").hidden = false;

    } else {
      $("backLink").href = "student.html";
      $("backLink").textContent =
        "← Back to Student Dashboard";

      $("calendarWelcome").textContent =
        "View school schedules, holidays, and your recorded QR attendance.";
    }

    // Attendance highlights apply only to students.
    const attendanceLegend = document.querySelector(
      ".calendar-legend .legend-item:last-child"
    );

    if (attendanceLegend) {
      attendanceLegend.hidden = isAdmin();
    }

    $("eventDate").value = selectedDate;

    await refreshCalendar();

  } catch (error) {
    console.error("Calendar initialization:", error);

    showMessage(
      error.message || "Unable to open calendar."
    );
  }
}

// ==========================================
// LOAD CALENDAR EVENTS AND QR HISTORY
// ==========================================

async function refreshCalendar() {
  if (!profile || busy) return;

  busy = true;

  $("refreshCalendarBtn").disabled = true;
  $("refreshCalendarBtn").textContent =
    "Loading...";

  showMessage("Loading calendar...", "success");

  try {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = dateKey(
      new Date(year, month, 1)
    );

    const lastDay = dateKey(
      new Date(year, month + 1, 0)
    );

    const { data, error } = await supabase
      .from("school_calendar")
      .select(
        "id, event_date, title, category, description, start_time, end_time"
      )
      .gte("event_date", firstDay)
      .lte("event_date", lastDay)
      .order("event_date", {
        ascending: true
      });

    if (error) throw error;

    events = data || [];

    let historyError = null;

    if (!isAdmin()) {
      const result = await supabase.rpc(
        "get_my_attendance_history"
      );

      if (result.error) {
        historyError = result.error.message;

      } else {
        attendanceByDay = new Map();

        (result.data || []).forEach(record => {
          if (!record.marked_at) return;

          const date = new Date(record.marked_at);

          if (Number.isNaN(date.getTime())) {
            return;
          }

          const key = dateKey(date);

          const count =
            attendanceByDay.get(key) || 0;

          attendanceByDay.set(key, count + 1);
        });
      }
    }

    renderCalendar();
    renderSelectedDay();
    renderMonthlyEvents();

    if (historyError) {
      showMessage(
        "Schedules loaded, but QR attendance history could not be loaded: " +
        historyError
      );

    } else {
      showMessage(
        "Calendar updated successfully!",
        "success"
      );
    }

  } catch (error) {
    console.error("Calendar loading:", error);

    showMessage(
      error.message || "Unable to load calendar."
    );

  } finally {
    busy = false;
    $("refreshCalendarBtn").disabled = false;
    $("refreshCalendarBtn").textContent =
      "Refresh Calendar";
  }
}

// ==========================================
// MONTHLY CALENDAR DISPLAY
// ==========================================

function renderCalendar() {
  const grid = $("calendarGrid");
  grid.replaceChildren();

  $("monthLabel").textContent =
    currentMonth.toLocaleDateString(
      undefined,
      {
        month: "long",
        year: "numeric"
      }
    );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstWeekday =
    new Date(year, month, 1).getDay();

  const totalDays =
    new Date(year, month + 1, 0).getDate();

  const weekdays = [
    "Sun", "Mon", "Tue", "Wed",
    "Thu", "Fri", "Sat"
  ];

  weekdays.forEach(day => {
    grid.appendChild(
      createText("div", day, "weekday")
    );
  });

  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(
      createText("div", "")
    );
  }

  for (let day = 1; day <= totalDays; day++) {
    const key = dateKey(
      new Date(year, month, day)
    );

    const dayEvents = events.filter(
      event => event.event_date === key
    );

    const hasHoliday = dayEvents.some(
      event => event.category === "holiday"
    );

    const hasNoClass = dayEvents.some(
      event => event.category === "no_class"
    );

    const presentCount =
      attendanceByDay.get(key) || 0;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell";

    if (hasHoliday) {
      button.classList.add("holiday-day");

    } else if (hasNoClass) {
      button.classList.add("no-class-day");
    }

    if (!isAdmin() && presentCount > 0) {
      button.classList.add("present-day");
    }

    if (key === selectedDate) {
      button.classList.add("selected");
    }

    button.appendChild(
      createText("span", day, "day-number")
    );

    if (hasHoliday) {
      button.appendChild(
        createText("span", "Holiday", "day-marker")
      );

    } else if (hasNoClass) {
      button.appendChild(
        createText("span", "No Class", "day-marker")
      );

    } else if (dayEvents.length > 0) {
      button.appendChild(
        createText(
          "span",
          dayEvents.length + " event(s)",
          "day-marker"
        )
      );
    }

    if (!isAdmin() && presentCount > 0) {
      button.appendChild(
        createText(
          "span",
          "✓ Present",
          "day-marker"
        )
      );
    }

    button.addEventListener("click", () => {
      selectedDate = key;

      if (isAdmin() && !editingId) {
        $("eventDate").value = key;
      }

      renderCalendar();
      renderSelectedDay();
    });

    grid.appendChild(button);
  }
}

// ==========================================
// SELECTED DAY INFORMATION
// ==========================================

function renderSelectedDay() {
  $("selectedDayTitle").textContent =
    prettyDate(selectedDate);

  const list = $("selectedDayEvents");
  list.replaceChildren();

  const dayEvents = events.filter(
    event => event.event_date === selectedDate
  );

  if (!isAdmin()) {
    const count =
      attendanceByDay.get(selectedDate) || 0;

    $("selectedDayAttendance").textContent =
      count > 0
        ? count + " recorded QR attendance check-in(s)."
        : "No QR check-in recorded for this date. This does not automatically mean ABSENT.";

  } else {
    $("selectedDayAttendance").textContent =
      "Events scheduled for this date.";
  }

  if (dayEvents.length === 0) {
    list.appendChild(
      createText(
        "p",
        "No calendar events scheduled for this date.",
        "calendar-muted"
      )
    );
    return;
  }

  dayEvents.forEach(event => {
    list.appendChild(
      createEventCard(event, false)
    );
  });
}

// ==========================================
// CREATE EVENT CARD
// ==========================================

function createEventCard(event, withActions = false) {
  const card = document.createElement("article");
  card.className = "event-card";

  card.appendChild(
    createText("h3", event.title)
  );

  card.appendChild(
    createText(
      "span",
      CATEGORIES[event.category] || event.category,
      "event-category"
    )
  );

  card.appendChild(
    createText(
      "p",
      prettyDate(event.event_date),
      "calendar-muted"
    )
  );

  if (event.start_time || event.end_time) {
    const timeText = [
      prettyTime(event.start_time),
      prettyTime(event.end_time)
    ].filter(Boolean).join(" – ");

    card.appendChild(
      createText(
        "p",
        "Time: " + timeText,
        "calendar-muted"
      )
    );
  }

  if (event.description) {
    card.appendChild(
      createText("p", event.description)
    );
  }

  if (isAdmin() && withActions) {
    const actions = document.createElement("div");
    actions.className = "calendar-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className =
      "calendar-btn secondary";
    editButton.textContent = "Edit";

    editButton.addEventListener("click", () => {
      editEvent(event);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className =
      "calendar-btn danger";
    deleteButton.textContent = "🗑 Delete";

    deleteButton.addEventListener("click", () => {
      deleteEvent(event, deleteButton);
    });

    actions.append(editButton, deleteButton);
    card.appendChild(actions);
  }

  return card;
}

// ==========================================
// MONTHLY EVENT LIST
// ==========================================

function renderMonthlyEvents() {
  const list = $("monthlyEvents");
  list.replaceChildren();

  $("monthlyEventCount").textContent =
    events.length + " event(s) this month";

  if (events.length === 0) {
    list.appendChild(
      createText(
        "p",
        "No scheduled events this month.",
        "calendar-muted"
      )
    );
    return;
  }

  events.forEach(event => {
    list.appendChild(
      createEventCard(event, true)
    );
  });
}

// ==========================================
// SHOW / HIDE TIME FIELDS
// ==========================================

function updateTimeFields() {
  const category = $("eventCategory").value;

  const allDay =
    category === "holiday" ||
    category === "no_class";

  $("eventTimeFields").hidden = allDay;

  if (allDay) {
    $("eventStart").value = "";
    $("eventEnd").value = "";
  }
}

$("eventCategory").addEventListener(
  "change",
  updateTimeFields
);

// ==========================================
// CREATE OR UPDATE CALENDAR EVENT
// ==========================================

$("calendarForm").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (!isAdmin()) {
      showMessage("Admin access required.");
      return;
    }

    const title = $("eventTitle").value.trim();
    const eventDate = $("eventDate").value;
    const category = $("eventCategory").value;
    const description =
      $("eventDescription").value.trim();

    const allDay =
      category === "holiday" ||
      category === "no_class";

    const startTime = allDay
      ? null
      : $("eventStart").value || null;

    const endTime = allDay
      ? null
      : $("eventEnd").value || null;

    if (
      !title ||
      title.length > 120 ||
      !eventDate ||
      !CATEGORIES[category]
    ) {
      showMessage(
        "Please enter a valid event name, date, and type."
      );
      return;
    }

    if (Boolean(startTime) !== Boolean(endTime)) {
      showMessage(
        "Enter both start and end times, or leave both blank."
      );
      return;
    }

    if (startTime && endTime <= startTime) {
      showMessage(
        "End time must be later than start time."
      );
      return;
    }

    const payload = {
      title,
      event_date: eventDate,
      category,
      description,
      start_time: startTime,
      end_time: endTime
    };

    const saveButton = $("saveEventBtn");
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
      let result;

      if (editingId) {
        result = await supabase
          .from("school_calendar")
          .update(payload)
          .eq("id", editingId)
          .select("id")
          .single();

      } else {
        result = await supabase
          .from("school_calendar")
          .insert({
            ...payload,
            created_by: profile.id
          })
          .select("id")
          .single();
      }

      if (result.error) throw result.error;

      resetForm();

      const parts = eventDate.split("-").map(Number);

      currentMonth = new Date(
        parts[0], parts[1] - 1, 1
      );

      selectedDate = eventDate;

      await refreshCalendar();

      showMessage(
        "Calendar event saved successfully!",
        "success"
      );

    } catch (error) {
      console.error("Save calendar event:", error);

      showMessage(
        error.message || "Unable to save calendar event."
      );

    } finally {
      saveButton.disabled = false;

      saveButton.textContent = editingId
        ? "Update Event"
        : "Save Event";
    }
  }
);

// ==========================================
// EDIT EXISTING EVENT
// ==========================================

function editEvent(event) {
  if (!isAdmin()) return;

  editingId = event.id;

  $("eventTitle").value = event.title;
  $("eventDate").value = event.event_date;
  $("eventCategory").value = event.category;
  $("eventDescription").value =
    event.description || "";

  $("eventStart").value =
    event.start_time?.slice(0, 5) || "";

  $("eventEnd").value =
    event.end_time?.slice(0, 5) || "";

  updateTimeFields();

  $("calendarFormTitle").textContent =
    "Edit Calendar Event";

  $("saveEventBtn").textContent = "Update Event";
  $("cancelEventBtn").hidden = false;

  $("adminCalendarPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

// ==========================================
// RESET ADMIN FORM
// ==========================================

function resetForm() {
  editingId = null;

  $("calendarForm").reset();
  $("eventDate").value = selectedDate;

  $("calendarFormTitle").textContent =
    "Add Calendar Event";

  $("saveEventBtn").textContent = "Save Event";
  $("cancelEventBtn").hidden = true;

  updateTimeFields();
}

$("cancelEventBtn").addEventListener(
  "click",
  resetForm
);

// ==========================================
// DELETE EVENT
// ==========================================

async function deleteEvent(event, button) {
  if (!isAdmin()) {
    showMessage("Admin access required.");
    return;
  }

  const confirmed = confirm(
    'Delete "' + event.title + '" from the calendar?'
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Deleting...";

  try {
    const { data, error } = await supabase
      .from("school_calendar")
      .delete()
      .eq("id", event.id)
      .select("id");

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        "Event not deleted. Check permissions."
      );
    }

    if (editingId === event.id) {
      resetForm();
    }

    await refreshCalendar();

    showMessage(
      "Calendar event deleted successfully.",
      "success"
    );

  } catch (error) {
    console.error("Delete event:", error);

    showMessage(
      error.message || "Unable to delete event."
    );

    button.disabled = false;
    button.textContent = "🗑 Delete";
  }
}

// ==========================================
// MONTH NAVIGATION
// ==========================================

$("prevMonthBtn").addEventListener(
  "click",
  async () => {
    if (busy) return;

    currentMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      1
    );

    selectedDate = dateKey(currentMonth);
    resetForm();

    await refreshCalendar();
  }
);

$("nextMonthBtn").addEventListener(
  "click",
  async () => {
    if (busy) return;

    currentMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      1
    );

    selectedDate = dateKey(currentMonth);
    resetForm();

    await refreshCalendar();
  }
);

$("refreshCalendarBtn").addEventListener(
  "click",
  refreshCalendar
);

// ==========================================
// LOGOUT
// ==========================================

$("logoutBtn").addEventListener(
  "click",
  async () => {
    $("logoutBtn").disabled = true;

    try {
      const { error } =
        await supabase.auth.signOut();

      if (error) throw error;

      window.location.replace("index.html");

    } catch (error) {
      showMessage(error.message);

      $("logoutBtn").disabled = false;
    }
  }
);

// ==========================================
// START
// ==========================================

initialize();
  
