
import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// ======================================
// SMART ACADEMIC
// STUDENT ANALYTICS AND REPORTS
// ======================================

const $ = id => document.getElementById(id);

const messageBox = $("reportMessage");
const refreshBtn = $("refreshReportsBtn");
const logoutBtn = $("logoutBtn");

let currentStudent = null;
let attendanceRecords = [];
let activities = [];
let submissions = [];

let calendarMonth = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  1
);

// ======================================
// HELPER FUNCTIONS
// ======================================

function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = "message " + type;
}

function createText(tag, value, className = "") {
  const element = document.createElement(tag);
  element.textContent = String(value ?? "");

  if (className) {
    element.className = className;
  }

  return element;
}

function formatDate(value) {
  if (!value) return "Unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function dateKey(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ======================================
// LATEST SUBMISSION PER ACTIVITY
// ======================================

function getSubmissionMap() {
  const map = new Map();

  submissions.forEach(item => {
    const existing = map.get(item.activity_id);

    if (
      !existing ||
      new Date(item.submitted_at).getTime() >
      new Date(existing.submitted_at).getTime()
    ) {
      map.set(item.activity_id, item);
    }
  });

  return map;
}

// ======================================
// AUTHENTICATION
// ======================================

async function initialize() {
  try {
    const profile = await getCurrentProfile();

    if (!profile || profile.role !== "student") {
      window.location.replace("index.html");
      return;
    }

    currentStudent = profile;

    await loadReports();

  } catch (error) {
    console.error("Initialize:", error);

    showMessage(
      error.message || "Unable to open reports."
    );
  }
}

// ======================================
// LOAD REPORT DATA
// ======================================

async function loadReports() {
  if (!currentStudent) return;

  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading...";

  showMessage("Loading your academic reports...", "success");

  try {

    // EXISTING SECURE ATTENDANCE HISTORY RPC
    const attendanceRequest = supabase.rpc(
      "get_my_attendance_history"
    );

    // EXISTING ACTIVITIES TABLE
    const activitiesRequest = supabase
      .from("activities")
      .select("id, title, max_score, due_date")
      .order("created_at", {
        ascending: false
      });

    // ONLY THE LOGGED-IN STUDENT'S SUBMISSIONS
    const submissionsRequest = supabase
      .from("activity_submissions")
      .select(
        "id, activity_id, submitted_at, score, feedback"
      )
      .eq("student_id", currentStudent.id);

    const [
      attendanceResult,
      activitiesResult,
      submissionsResult
    ] = await Promise.all([
      attendanceRequest,
      activitiesRequest,
      submissionsRequest
    ]);

    if (attendanceResult.error) {
      throw attendanceResult.error;
    }

    if (activitiesResult.error) {
      throw activitiesResult.error;
    }

    if (submissionsResult.error) {
      throw submissionsResult.error;
    }

    attendanceRecords =
      attendanceResult.data || [];

    activities =
      activitiesResult.data || [];

    submissions =
      submissionsResult.data || [];

    attendanceRecords.sort(
      (a, b) =>
        new Date(b.marked_at) -
        new Date(a.marked_at)
    );

    renderOverview();
    renderCalendar();
    renderAttendance();
    renderGrades();

    showMessage(
      "Reports updated successfully!",
      "success"
    );

  } catch (error) {
    console.error("Load reports:", error);

    showMessage(
      error.message ||
      "Unable to load academic reports."
    );

  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh Reports";
  }
}

// ======================================
// OVERVIEW STATISTICS
// ======================================

function renderOverview() {
  const submissionMap = getSubmissionMap();

  const submittedCount = submissionMap.size;

  let gradedCount = 0;
  let pendingCount = 0;

  let totalEarned = 0;
  let totalPossible = 0;

  activities.forEach(activity => {
    const submission = submissionMap.get(
      activity.id
    );

    if (!submission) return;

    if (
      submission.score === null ||
      submission.score === undefined
    ) {
      pendingCount++;
      return;
    }

    const score = Number(submission.score);
    const maxScore = Number(activity.max_score);

    if (
      !Number.isFinite(score) ||
      !Number.isFinite(maxScore) ||
      maxScore <= 0
    ) {
      return;
    }

    gradedCount++;
    totalEarned += score;
    totalPossible += maxScore;
  });

  const overallScore = totalPossible > 0
    ? (
      totalEarned / totalPossible * 100
    ).toFixed(1) + "%"
    : "—";

  $("presentCount").textContent =
    attendanceRecords.length;

  $("submittedCount").textContent =
    submittedCount;

  $("gradedCount").textContent =
    gradedCount;

  $("averageScore").textContent =
    overallScore;

  $("pendingCount").textContent =
    pendingCount;
}

// ======================================
// ATTENDANCE CALENDAR
// ======================================

function renderCalendar() {
  const grid = $("calendarGrid");
  const monthLabel = $("calendarMonthLabel");

  grid.replaceChildren();

  monthLabel.textContent =
    calendarMonth.toLocaleDateString(
      undefined,
      {
        month: "long",
        year: "numeric"
      }
    );

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();

  const firstDay = new Date(
    year, month, 1
  ).getDay();

  const totalDays = new Date(
    year, month + 1, 0
  ).getDate();

  const presentDates = new Set(
    attendanceRecords
      .map(record => dateKey(record.marked_at))
      .filter(Boolean)
  );

  const weekdays = [
    "Sun", "Mon", "Tue", "Wed",
    "Thu", "Fri", "Sat"
  ];

  weekdays.forEach(day => {
    grid.appendChild(
      createText(
        "div",
        day,
        "calendar-day header"
      )
    );
  });

  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(
      createText(
        "div",
        "",
        "calendar-day empty"
      )
    );
  }

  for (let day = 1; day <= totalDays; day++) {
    const key = dateKey(
      new Date(year, month, day)
    );

    const isPresent = presentDates.has(key);

    const cell = createText(
      "div",
      day,
      isPresent
        ? "calendar-day present-day"
        : "calendar-day"
    );

    cell.title = isPresent
      ? "Attendance recorded"
      : "No attendance record shown";

    grid.appendChild(cell);
  }
}

$("prevMonthBtn").addEventListener(
  "click",
  () => {
    calendarMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() - 1,
      1
    );

    renderCalendar();
  }
);

$("nextMonthBtn").addEventListener(
  "click",
  () => {
    calendarMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      1
    );

    renderCalendar();
  }
);

// ======================================
// STUDENT ATTENDANCE HISTORY
// ======================================

function renderAttendance() {
  const list = $("attendanceList");

  list.replaceChildren();

  $("attendanceCount").textContent =
    attendanceRecords.length +
    " recorded attendance session(s)";

  if (attendanceRecords.length === 0) {
    list.appendChild(
      createText(
        "p",
        "No attendance records available yet.",
        "muted"
      )
    );

    return;
  }

  attendanceRecords.forEach(record => {
    const card = document.createElement("article");
    card.className = "report-item";

    card.appendChild(
      createText(
        "h3",
        record.session_title ||
        "Class Attendance"
      )
    );

    card.appendChild(
      createText(
        "p",
        "Recorded: " + formatDate(record.marked_at),
        "muted"
      )
    );

    card.appendChild(
      createText(
        "span",
        "PRESENT",
        "report-status present"
      )
    );

    list.appendChild(card);
  });
}

// ======================================
// ACTIVITY GRADES
// ======================================

function renderGrades() {
  const list = $("gradesList");

  list.replaceChildren();

  $("gradesCount").textContent =
    activities.length + " available activity(s)";

  if (activities.length === 0) {
    list.appendChild(
      createText(
        "p",
        "No activities have been posted yet.",
        "muted"
      )
    );

    return;
  }

  const submissionMap = getSubmissionMap();

  activities.forEach(activity => {
    const card = document.createElement("article");
    card.className = "report-item";

    card.appendChild(
      createText("h3", activity.title)
    );

    const submission = submissionMap.get(
      activity.id
    );

    // NOT SUBMITTED
    if (!submission) {
      card.appendChild(
        createText(
          "span",
          "NOT SUBMITTED",
          "report-status missing"
        )
      );

      list.appendChild(card);
      return;
    }

    card.appendChild(
      createText(
        "p",
        "Submitted: " +
        formatDate(submission.submitted_at),
        "muted"
      )
    );

    // WAITING FOR GRADE
    if (
      submission.score === null ||
      submission.score === undefined
    ) {
      card.appendChild(
        createText(
          "span",
          "PENDING GRADE",
          "report-status pending"
        )
      );

      list.appendChild(card);
      return;
    }

    const score = Number(submission.score);
    const maximum = Number(activity.max_score);

    if (
      !Number.isFinite(score) ||
      !Number.isFinite(maximum) ||
      maximum <= 0
    ) {
      card.appendChild(
        createText(
          "p",
          "Grade information is unavailable.",
          "muted"
        )
      );

      list.appendChild(card);
      return;
    }

    const percent = score / maximum * 100;

    card.appendChild(
      createText(
        "span",
        "GRADED",
        "report-status graded"
      )
    );

    card.appendChild(
      createText(
        "p",
        "Score: " + score + " / " + maximum
      )
    );

    card.appendChild(
      createText(
        "p",
        "Percentage: " + percent.toFixed(1) + "%"
      )
    );

    const track = document.createElement("div");
    track.className = "score-track";

    const fill = document.createElement("div");
    fill.className = "score-fill";

    fill.style.width =
      Math.max(0, Math.min(100, percent)) + "%";

    track.appendChild(fill);
    card.appendChild(track);

    card.appendChild(
      createText(
        "p",
        "Feedback: " +
        (submission.feedback || "No feedback provided."),
        "muted"
      )
    );

    list.appendChild(card);
  });
}

// ======================================
// REFRESH BUTTON
// ======================================

refreshBtn.addEventListener(
  "click",
  loadReports
);

// ======================================
// LOGOUT
// ======================================

logoutBtn.addEventListener(
  "click",
  async () => {
    logoutBtn.disabled = true;

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      showMessage(error.message);
      logoutBtn.disabled = false;
      return;
    }

    window.location.replace("index.html");
  }
);

// ======================================
// START
// ======================================

initialize();
