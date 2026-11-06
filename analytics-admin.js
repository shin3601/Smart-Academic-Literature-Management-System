
import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// ==========================================
// SMART ACADEMIC
// ADMIN ANALYTICS AND REPORTS
// ==========================================

const $ = id => document.getElementById(id);

const messageBox = $("reportMessage");
const refreshBtn = $("refreshBtn");
const logoutBtn = $("logoutBtn");
const studentSelect = $("studentSelect");

let currentAdmin = null;

const store = {
  students: [],
  sessions: [],
  records: [],
  activities: [],
  submissions: []
};

// ==========================================
// HELPERS
// ==========================================

function showMessage(message, type = "error") {
  messageBox.textContent = message;
  messageBox.className = "analytics-message " + type;
}

function textElement(tag, value, className = "") {
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

function hasScore(submission) {
  return submission &&
    submission.score !== null &&
    submission.score !== undefined;
}

function createItem(title) {
  const card = document.createElement("article");
  card.className = "analytics-item";

  card.appendChild(textElement("h3", title));

  return card;
}

function addBadge(card, label, status) {
  card.appendChild(
    textElement(
      "span",
      label,
      "analytics-badge " + status
    )
  );
}

function addParagraph(card, value) {
  card.appendChild(
    textElement("p", value, "analytics-muted")
  );
}

function createStat(label, value) {
  const card = document.createElement("article");
  card.className = "analytics-card";

  card.appendChild(textElement("h3", label));
  card.appendChild(
    textElement("div", value, "analytics-number")
  );

  return card;
}

// ==========================================
// AUTHENTICATION
// ==========================================

async function initialize() {
  refreshBtn.disabled = true;

  try {
    const profile = await getCurrentProfile();

    if (!profile || profile.role !== "admin") {
      window.location.replace("index.html");
      return;
    }

    currentAdmin = profile;

    await loadReports();

  } catch (error) {
    console.error("Initialization:", error);
    showMessage(
      error.message || "Unable to open reports."
    );

    refreshBtn.disabled = false;
  }
}

// ==========================================
// FETCH ALL ROWS WITH PAGINATION
// ==========================================

// Supabase may limit query results to 1000.
// Load results in pages to avoid incomplete totals.

async function fetchAll(table, columns, studentsOnly = false) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from(table)
      .select(columns);

    if (studentsOnly) {
      query = query.eq("role", "student");
    }

    const { data, error } = await query
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(
        table + ": " + error.message
      );
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}

// ==========================================
// LOAD REPORTS
// ==========================================

async function loadReports() {
  if (!currentAdmin) return;

  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading...";

  showMessage("Loading reports...", "success");

  const previousStudent = studentSelect.value;

  try {
    const [
      students,
      sessions,
      records,
      activities,
      submissions
    ] = await Promise.all([
      fetchAll(
        "profiles",
        "id, full_name, student_id, role",
        true
      ),

      fetchAll(
        "attendance_sessions",
        "id, title, starts_at, ends_at, is_active"
      ),

      fetchAll(
        "attendance_records",
        "id, session_id, student_id, marked_at"
      ),

      fetchAll(
        "activities",
        "id, title, max_score, due_date"
      ),

      fetchAll(
        "activity_submissions",
        "id, student_id, activity_id, score, feedback, submitted_at"
      )
    ]);

    store.students = students;
    store.sessions = sessions;
    store.records = records;
    store.activities = activities;
    store.submissions = submissions;

    store.students.sort((a, b) =>
      (a.full_name || "").localeCompare(
        b.full_name || ""
      )
    );

    store.sessions.sort((a, b) =>
      new Date(b.starts_at) - new Date(a.starts_at)
    );

    renderOverview();
    renderStudentOptions(previousStudent);
    renderSelectedStudent();
    renderSessionReports();

    showMessage(
      "Admin reports updated successfully!",
      "success"
    );

  } catch (error) {
    console.error("Reports:", error);

    showMessage(
      error.message || "Unable to load reports."
    );

  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh Reports";
  }
}

// ==========================================
// REMOVE DUPLICATE ATTENDANCE COUNTS
// ==========================================

function validAttendance() {
  const sessionIds = new Set(
    store.sessions.map(s => s.id)
  );

  const studentIds = new Set(
    store.students.map(s => s.id)
  );

  const unique = new Map();

  store.records.forEach(record => {
    if (
      !sessionIds.has(record.session_id) ||
      !studentIds.has(record.student_id)
    ) {
      return;
    }

    const key =
      record.session_id + ":" + record.student_id;

    if (!unique.has(key)) {
      unique.set(key, record);
    }
  });

  return [...unique.values()];
}

// ==========================================
// GET LATEST SUBMISSIONS FOR A STUDENT
// ==========================================

function studentSubmissionMap(studentId) {
  const map = new Map();

  store.submissions
    .filter(s => s.student_id === studentId)
    .forEach(submission => {
      const old = map.get(submission.activity_id);

      if (
        !old ||
        new Date(submission.submitted_at) >
        new Date(old.submitted_at)
      ) {
        map.set(submission.activity_id, submission);
      }
    });

  return map;
}

// ==========================================
// CALCULATE STUDENT SUMMARY
// ==========================================

function getStudentSummary(studentId) {
  const attendance = validAttendance().filter(
    record => record.student_id === studentId
  );

  const submissionMap =
    studentSubmissionMap(studentId);

  let submitted = 0;
  let graded = 0;
  let pending = 0;
  let earned = 0;
  let possible = 0;

  store.activities.forEach(activity => {
    const submission = submissionMap.get(activity.id);

    if (!submission) return;

    submitted++;

    if (!hasScore(submission)) {
      pending++;
      return;
    }

    const score = Number(submission.score);
    const max = Number(activity.max_score);

    if (
      !Number.isFinite(score) ||
      !Number.isFinite(max) ||
      max <= 0
    ) {
      return;
    }

    graded++;
    earned += score;
    possible += max;
  });

  return {
    present: attendance.length,
    submitted,
    graded,
    pending,
    percentage: possible > 0
      ? (earned / possible * 100).toFixed(1) + "%"
      : "—"
  };
}

// ==========================================
// ADMIN OVERVIEW
// ==========================================

function renderOverview() {
  const graded = store.submissions.filter(
    s => hasScore(s) &&
      store.activities.some(a => a.id === s.activity_id) &&
      store.students.some(p => p.id === s.student_id)
  ).length;

  $("studentTotal").textContent =
    store.students.length;

  $("sessionTotal").textContent =
    store.sessions.length;

  $("attendanceTotal").textContent =
    validAttendance().length;

  $("gradedTotal").textContent = graded;
}

// ==========================================
// STUDENT SELECT OPTIONS
// ==========================================

function renderStudentOptions(previousStudent) {
  studentSelect.replaceChildren();

  if (store.students.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No registered students";

    studentSelect.appendChild(option);
    studentSelect.disabled = true;
    return;
  }

  store.students.forEach(student => {
    const option = document.createElement("option");

    option.value = student.id;
    option.textContent =
      (student.full_name || "Unnamed Student") +
      " (" + (student.student_id || "No ID") + ")";

    studentSelect.appendChild(option);
  });

  studentSelect.disabled = false;

  const exists = store.students.some(
    student => student.id === previousStudent
  );

  studentSelect.value = exists
    ? previousStudent
    : store.students[0].id;
}

// ==========================================
// DISPLAY SELECTED STUDENT
// ==========================================

function renderSelectedStudent() {
  const id = studentSelect.value;

  const student = store.students.find(
    item => item.id === id
  );

  const summaryBox = $("studentSummary");
  const attendanceList = $("studentAttendanceList");
  const gradeList = $("studentGradesList");

  summaryBox.replaceChildren();
  attendanceList.replaceChildren();
  gradeList.replaceChildren();

  if (!student) {
    $("selectedStudentInfo").textContent =
      "No student selected.";

    return;
  }

  $("selectedStudentInfo").textContent =
    "Student: " + student.full_name +
    " | ID: " + (student.student_id || "Unavailable");

  const summary = getStudentSummary(id);

  summaryBox.append(
    createStat("Present Sessions", summary.present),
    createStat("Submitted Activities", summary.submitted),
    createStat("Graded Activities", summary.graded),
    createStat("Activity Score", summary.percentage),
    createStat("Pending Grades", summary.pending),
    createStat(
      "Not Submitted",
      Math.max(0, store.activities.length - summary.submitted)
    )
  );

  renderStudentAttendance(id);
  renderStudentGrades(id);
}

// ==========================================
// STUDENT ATTENDANCE
// ==========================================

function renderStudentAttendance(studentId) {
  const list = $("studentAttendanceList");

  const sessionMap = new Map(
    store.sessions.map(s => [s.id, s])
  );

  const records = validAttendance()
    .filter(r => r.student_id === studentId)
    .sort((a, b) =>
      new Date(b.marked_at) - new Date(a.marked_at)
    );

  if (records.length === 0) {
    list.appendChild(
      textElement(
        "p",
        "No QR attendance records yet.",
        "analytics-muted"
      )
    );

    return;
  }

  records.forEach(record => {
    const session = sessionMap.get(record.session_id);

    const card = createItem(
      session?.title || "Attendance Session"
    );

    addParagraph(
      card,
      "Recorded: " + formatDate(record.marked_at)
    );

    addBadge(card, "PRESENT", "present");

    list.appendChild(card);
  });
}

// ==========================================
// STUDENT ACTIVITY GRADES
// ==========================================

function renderStudentGrades(studentId) {
  const list = $("studentGradesList");

  if (store.activities.length === 0) {
    list.appendChild(
      textElement(
        "p",
        "No activities created yet.",
        "analytics-muted"
      )
    );

    return;
  }

  const submissionMap =
    studentSubmissionMap(studentId);

  store.activities.forEach(activity => {
    const card = createItem(activity.title);
    const submission = submissionMap.get(activity.id);

    if (!submission) {
      addBadge(card, "NOT SUBMITTED", "missing");
      list.appendChild(card);
      return;
    }

    addParagraph(
      card,
      "Submitted: " + formatDate(submission.submitted_at)
    );

    if (!hasScore(submission)) {
      addBadge(card, "PENDING GRADE", "pending");
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
      addParagraph(card, "Invalid grade information.");
      list.appendChild(card);
      return;
    }

    const percentage = score / maximum * 100;

    addBadge(card, "GRADED", "graded");

    addParagraph(
      card,
      "Score: " + score + " / " + maximum
    );

    addParagraph(
      card,
      "Percentage: " + percentage.toFixed(1) + "%"
    );

    const bar = document.createElement("div");
    bar.className = "analytics-bar";

    const fill = document.createElement("div");
    fill.className = "analytics-fill";

    fill.style.width =
      Math.min(100, Math.max(0, percentage)) + "%";

    bar.appendChild(fill);
    card.appendChild(bar);

    addParagraph(
      card,
      "Feedback: " +
      (submission.feedback || "No feedback provided.")
    );

    list.appendChild(card);
  });
}

// ==========================================
// ALL ATTENDANCE SESSION REPORTS
// ==========================================

function renderSessionReports() {
  const list = $("sessionReportsList");
  list.replaceChildren();

  if (store.sessions.length === 0) {
    list.appendChild(
      textElement(
        "p",
        "No attendance sessions yet.",
        "analytics-muted"
      )
    );
    return;
  }

  const records = validAttendance();

  store.sessions.forEach(session => {
    const count = records.filter(
      record => record.session_id === session.id
    ).length;

    const card = createItem(session.title);

    addParagraph(
      card,
      "Started: " + formatDate(session.starts_at)
    );

    addParagraph(
      card,
      "Deadline: " + formatDate(session.ends_at)
    );

    addParagraph(
      card,
      "Recorded QR check-ins: " + count
    );

    list.appendChild(card);
  });
}

// ==========================================
// EVENT LISTENERS
// ==========================================

studentSelect.addEventListener(
  "change",
  renderSelectedStudent
);

refreshBtn.addEventListener(
  "click",
  loadReports
);

// ==========================================
// LOGOUT
// ==========================================

logoutBtn.addEventListener(
  "click",
  async () => {
    logoutBtn.disabled = true;

    const { error } = await supabase.auth.signOut();

    if (error) {
      showMessage(error.message);
      logoutBtn.disabled = false;
      return;
    }

    window.location.replace("index.html");
  }
);

// ==========================================
// START
// ==========================================

initialize();
    
