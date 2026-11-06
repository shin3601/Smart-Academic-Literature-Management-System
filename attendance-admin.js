
import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// ==========================================
// SMART ACADEMIC
// ADMIN QR ATTENDANCE MANAGEMENT
// ==========================================

const $ = id => document.getElementById(id);

// CREATE SESSION
const sessionForm = $("sessionForm");
const sessionTitle = $("sessionTitle");
const sessionDuration = $("sessionDuration");
const createSessionBtn = $("createSessionBtn");

// MESSAGES
const attendanceMessage = $("attendanceMessage");

// SESSION LIST
const sessionCount = $("sessionCount");
const sessionsList = $("sessionsList");

// QR DISPLAY
const qrPanel = $("qrPanel");
const qrCode = $("qrCode");
const qrSessionTitle = $("qrSessionTitle");
const qrSessionDetails = $("qrSessionDetails");
const qrTokenText = $("qrTokenText");
const copyTokenBtn = $("copyTokenBtn");
const printQRBtn = $("printQRBtn");
const hideQRBtn = $("hideQRBtn");

// ATTENDANCE RECORDS
const attendanceTitle = $("attendanceTitle");
const attendanceCount = $("attendanceCount");
const attendanceList = $("attendanceList");

// LOGOUT
const logoutBtn = $("logoutBtn");

// STATE
let currentAdmin = null;
let sessions = [];
let currentQRSessionId = null;
let selectedAttendanceSessionId = null;
let deletingRecordId = null;
let deletingSessionId = null;
let attendanceRequestId = 0;

// ==========================================
// SHOW MESSAGE
// ==========================================

function showMessage(message, type = "error") {
  attendanceMessage.textContent = message;
  attendanceMessage.className = "message " + type;
}

// ==========================================
// CREATE TEXT ELEMENT
// ==========================================

function createText(tag, text, className = "") {
  const element = document.createElement(tag);

  element.textContent = text;

  if (className) {
    element.className = className;
  }

  return element;
}

// ==========================================
// CREATE BUTTON
// ==========================================

function createButton(text, className, action) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = text;
  button.className = className;

  button.addEventListener("click", action);

  return button;
}

// ==========================================
// DATE FORMAT
// ==========================================

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

// ==========================================
// CHECK SESSION STATUS
// ==========================================

function getSessionStatus(session) {
  if (!session.is_active) {
    return "Closed";
  }

  const now = Date.now();
  const start = new Date(session.starts_at).getTime();
  const end = new Date(session.ends_at).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "Unknown";
  }

  if (now >= end) {
    return "Expired";
  }

  if (now < start) {
    return "Upcoming";
  }

  return "Active";
}

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

async function initialize() {
  sessionForm.hidden = true;

  try {
    const profile = await getCurrentProfile();

    if (!profile || profile.role !== "admin") {
      window.location.replace("index.html");
      return;
    }

    currentAdmin = profile;
    sessionForm.hidden = false;

    await loadSessions();

  } catch (error) {
    console.error("Initialization:", error);

    showMessage(
      error.message || "Unable to initialize attendance."
    );
  }
}

// ==========================================
// CREATE ATTENDANCE SESSION
// ==========================================

sessionForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentAdmin) {
    showMessage("Admin access required.");
    return;
  }

  const title = sessionTitle.value.trim();
  const duration = Number(sessionDuration.value);

  if (!title) {
    showMessage("Please enter a session name.");
    return;
  }

  if (
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 480
  ) {
    showMessage("Invalid attendance duration.");
    return;
  }

  const startsAt = new Date();

  const endsAt = new Date(
    startsAt.getTime() + duration * 60000
  );

  createSessionBtn.disabled = true;
  createSessionBtn.textContent = "Creating QR Code...";

  showMessage("");

  try {
    const { data, error } = await supabase
      .from("attendance_sessions")
      .insert({
        title: title,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        created_by: currentAdmin.id,
        is_active: true
      })
      .select(
        "id, title, qr_token, starts_at, ends_at, is_active, created_at"
      )
      .single();

    if (error) throw error;

    sessionForm.reset();
    sessionDuration.value = "60";

    if (data.qr_token) {
      showQRCode(data);
    } else {
      showMessage(
        "Session created, but its QR token is missing."
      );
    }

    await loadSessions();

    if (data.qr_token) {
      showMessage(
        "Attendance session created successfully!",
        "success"
      );
    }

  } catch (error) {
    console.error("Create session:", error);

    showMessage(
      error.message || "Unable to create session."
    );

  } finally {
    createSessionBtn.disabled = false;
    createSessionBtn.textContent =
      "Generate Attendance QR";
  }
});

// ==========================================
// DISPLAY QR CODE AND TOKEN
// ==========================================

function showQRCode(session) {
  qrCode.replaceChildren();

  if (!session?.qr_token) {
    showMessage("No QR token available.");
    return;
  }

  currentQRSessionId = session.id;

  qrSessionTitle.textContent = session.title;

  qrSessionDetails.textContent =
    "Status: " + getSessionStatus(session) +
    " | Valid until: " + formatDate(session.ends_at);

  qrTokenText.textContent = session.qr_token;
  copyTokenBtn.disabled = false;

  qrPanel.hidden = false;

  if (!window.QRCode) {
    showMessage(
      "QR generator unavailable. You can still copy the token."
    );
    return;
  }

  try {
    new window.QRCode(qrCode, {
      text: session.qr_token,
      width: 250,
      height: 250,
      colorDark: "#3b2921",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.H
    });

    qrPanel.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

  } catch (error) {
    console.error("QR generation:", error);

    showMessage(
      "Unable to render QR. The token can still be copied."
    );
  }
}

// ==========================================
// COPY QR TOKEN
// ==========================================

copyTokenBtn.addEventListener("click", async () => {
  const token = qrTokenText.textContent.trim();

  if (
    !token ||
    token === "No token generated"
  ) {
    showMessage("No QR token available.");
    return;
  }

  copyTokenBtn.disabled = true;

  try {
    if (
      navigator.clipboard?.writeText &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(token);

    } else {
      const textarea = document.createElement("textarea");

      textarea.value = token;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");
      textarea.remove();

      if (!copied) {
        throw new Error("Clipboard unavailable.");
      }
    }

    showMessage(
      "Attendance token copied!",
      "success"
    );

  } catch (error) {
    console.error("Copy token:", error);

    showMessage(
      "Copy failed. Select and copy the displayed token manually."
    );

  } finally {
    copyTokenBtn.disabled = false;
  }
});

// ==========================================
// HIDE QR
// ==========================================

hideQRBtn.addEventListener("click", () => {
  hideCurrentQR();
});

function hideCurrentQR() {
  qrPanel.hidden = true;
  qrCode.replaceChildren();
  qrTokenText.textContent = "No token generated";
  currentQRSessionId = null;
}

// ==========================================
// PRINT QR
// ==========================================

printQRBtn.addEventListener("click", () => {
  if (!qrPanel.hidden) {
    window.print();
  }
});

// ==========================================
// LOAD ATTENDANCE SESSIONS
// ==========================================

async function loadSessions() {
  sessionCount.textContent =
    "Loading attendance sessions...";

  const { data, error } = await supabase
    .from("attendance_sessions")
    .select(
      "id, title, qr_token, starts_at, ends_at, is_active, created_at"
    )
    .order("created_at", {
      ascending: false
    });

  if (error) {
    sessionCount.textContent =
      "Unable to load sessions.";

    showMessage(error.message);
    return false;
  }

  sessions = data || [];

  sessionCount.textContent =
    sessions.length + " attendance session(s)";

  displaySessions();
  return true;
}

// ==========================================
// DISPLAY SESSION CARDS
// ==========================================

function displaySessions() {
  sessionsList.replaceChildren();

  if (sessions.length === 0) {
    sessionsList.appendChild(
      createText(
        "p",
        "No attendance sessions created yet.",
        "muted"
      )
    );
    return;
  }

  sessions.forEach(session => {
    const card = document.createElement("article");
    card.className = "attendance-session";

    card.appendChild(
      createText("h3", session.title)
    );

    card.appendChild(
      createText(
        "p",
        "Started: " + formatDate(session.starts_at),
        "muted"
      )
    );

    card.appendChild(
      createText(
        "p",
        "Expires: " + formatDate(session.ends_at),
        "muted"
      )
    );

    const status = getSessionStatus(session);

    const badge = createText(
      "span",
      status,
      "status " + status.toLowerCase()
    );

    card.appendChild(badge);

    const actions = document.createElement("div");
    actions.className = "attendance-actions";

    // VIEW QR
    actions.appendChild(
      createButton(
        "View QR",
        "primary-action",
        () => showQRCode(session)
      )
    );

    // VIEW ATTENDANCE
    actions.appendChild(
      createButton(
        "View Attendance",
        "secondary-action",
        () => loadAttendance(session)
      )
    );

    // CLOSE ACTIVE SESSION
    if (status === "Active" || status === "Upcoming") {
      actions.appendChild(
        createButton(
          "Close Session",
          "secondary-action",
          () => closeSession(session)
        )
      );
    }

    // DELETE ENTIRE SESSION
    actions.appendChild(
      createButton(
        "🗑 Delete Session",
        "danger-action",
        () => deleteAttendanceSession(session)
      )
    );

    card.appendChild(actions);
    sessionsList.appendChild(card);
  });
}

// ==========================================
// CLOSE ATTENDANCE SESSION
// ==========================================

async function closeSession(session) {
  if (!currentAdmin) {
    showMessage("Admin access required.");
    return;
  }

  const confirmed = confirm(
    'Close attendance for "' + session.title + '"?\n\n' +
    "Students will no longer be able to register."
  );

  if (!confirmed) return;

  try {
    const { data, error } = await supabase
      .from("attendance_sessions")
      .update({
        is_active: false
      })
      .eq("id", session.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "Session was not updated. Check permissions."
      );
    }

    if (currentQRSessionId === session.id) {
      hideCurrentQR();
    }

    await loadSessions();

    showMessage(
      "Attendance session closed successfully.",
      "success"
    );

  } catch (error) {
    console.error("Close session:", error);

    showMessage(
      error.message || "Unable to close session."
    );
  }
}

// ==========================================
// DELETE ENTIRE ATTENDANCE SESSION
// ADMIN ONLY - SUPABASE RPC
// ==========================================

async function deleteAttendanceSession(session) {
  if (!currentAdmin || !session?.id) {
    showMessage("Admin access required.");
    return;
  }

  if (deletingSessionId || deletingRecordId) {
    return;
  }

  const confirmed = confirm(
    "DELETE ATTENDANCE SESSION?\n\n" +
    "Session: " + session.title + "\n" +
    "Started: " + formatDate(session.starts_at) + "\n\n" +
    "This permanently deletes the session " +
    "and ALL student attendance records inside it.\n\n" +
    "This action cannot be undone.\n\n" +
    "Continue?"
  );

  if (!confirmed) return;

  deletingSessionId = session.id;

  showMessage("Deleting attendance session...");

  try {
    const { data, error } = await supabase.rpc(
      "admin_delete_attendance_session",
      {
        p_session_id: session.id
      }
    );

    if (error) throw error;

    if (data !== true) {
      throw new Error(
        "The database did not confirm deletion."
      );
    }

    // HIDE QR IF IT BELONGS TO DELETED SESSION
    if (currentQRSessionId === session.id) {
      hideCurrentQR();
    }

    // CLEAR THE SELECTED ATTENDANCE LIST
    if (selectedAttendanceSessionId === session.id) {
      selectedAttendanceSessionId = null;
      attendanceRequestId++;

      attendanceTitle.textContent =
        "Student Attendance Records";

      attendanceCount.textContent =
        "Select View Attendance on a session.";

      attendanceList.replaceChildren();
    }

    const refreshed = await loadSessions();

    if (!refreshed) {
      showMessage(
        "Session deleted, but the list could not refresh. Reload the page.",
        "success"
      );
      return;
    }

    showMessage(
      'Session "' + session.title +
      '" and its attendance records were deleted.',
      "success"
    );

  } catch (error) {
    console.error("Delete session:", error);

    showMessage(
      error.message || "Unable to delete session."
    );

  } finally {
    deletingSessionId = null;
  }
}

// ==========================================
// LOAD STUDENT ATTENDANCE
// ==========================================

async function loadAttendance(session) {
  selectedAttendanceSessionId = session.id;

  const requestId = ++attendanceRequestId;

  attendanceTitle.textContent =
    "Attendance: " + session.title;

  attendanceCount.textContent =
    "Loading student records...";

  attendanceList.replaceChildren();

  try {
    const { data: records, error: recordError } =
      await supabase
        .from("attendance_records")
        .select("id, student_id, marked_at")
        .eq("session_id", session.id)
        .order("marked_at", {
          ascending: true
        });

    if (recordError) throw recordError;

    const { data: students, error: studentError } =
      await supabase
        .from("profiles")
        .select("id, full_name, student_id")
        .eq("role", "student")
        .order("full_name", {
          ascending: true
        });

    if (studentError) throw studentError;

    // IGNORE OUTDATED REQUESTS
    if (
      requestId !== attendanceRequestId ||
      selectedAttendanceSessionId !== session.id
    ) {
      return false;
    }

    // REMOVE DUPLICATE PROFILE IDS
    const uniqueStudents = new Map();

    (students || []).forEach(student => {
      if (student.id) {
        uniqueStudents.set(student.id, student);
      }
    });

    const studentList = [...uniqueStudents.values()];

    // MATCH SAVED ATTENDANCE BY PROFILE UUID
    const attendanceMap = new Map();

    (records || []).forEach(record => {
      if (!attendanceMap.has(record.student_id)) {
        attendanceMap.set(record.student_id, record);
      }
    });

    const presentCount = studentList.filter(
      student => attendanceMap.has(student.id)
    ).length;

    const absentCount =
      studentList.length - presentCount;

    attendanceCount.textContent =
      presentCount + " Present | " +
      absentCount + " Absent | " +
      studentList.length + " Total Students";

    if (studentList.length === 0) {
      attendanceList.appendChild(
        createText(
          "p",
          "No registered students found.",
          "muted"
        )
      );
      return true;
    }

    // DISPLAY INDIVIDUAL STUDENTS
    studentList.forEach(student => {
      const record = attendanceMap.get(student.id);

      const card = document.createElement("div");
      card.className = "student-record";

      const details = document.createElement("div");

      details.appendChild(
        createText(
          "strong",
          student.full_name || "Unnamed Student"
        )
      );

      details.appendChild(
        createText(
          "p",
          "Student ID: " +
          (student.student_id || "Unavailable"),
          "muted"
        )
      );

      if (record) {
        details.appendChild(
          createText(
            "p",
            "Time: " + formatDate(record.marked_at),
            "muted"
          )
        );
      }

      const status = createText(
        "span",
        record ? "PRESENT" : "ABSENT",
        record ? "present" : "absent"
      );

      card.append(details, status);

      // DELETE AN INDIVIDUAL PRESENT RECORD
      if (record) {
        const actions = document.createElement("div");
        actions.className = "attendance-actions";

        const deleteButton = createButton(
          "🗑 Delete Attendance",
          "danger-action",
          () => deleteAttendanceRecord(
            record,
            student,
            session,
            deleteButton
          )
        );

        actions.appendChild(deleteButton);
        card.appendChild(actions);
      }

      attendanceList.appendChild(card);
    });

    return true;

  } catch (error) {
    if (requestId !== attendanceRequestId) {
      return false;
    }

    console.error("Load attendance:", error);

    attendanceCount.textContent =
      "Unable to load attendance records.";

    showMessage(
      error.message || "Unable to load attendance."
    );

    return false;
  }
}

// ==========================================
// DELETE INDIVIDUAL STUDENT ATTENDANCE
// ADMIN ONLY - SUPABASE RPC
// ==========================================

async function deleteAttendanceRecord(
  record,
  student,
  session,
  deleteButton
) {
  if (!record?.id || !currentAdmin) {
    showMessage("Admin access required.");
    return;
  }

  if (deletingRecordId || deletingSessionId) {
    return;
  }

  const confirmed = confirm(
    "DELETE STUDENT ATTENDANCE?\n\n" +
    "Student: " + student.full_name + "\n" +
    "Student ID: " + student.student_id + "\n" +
    "Session: " + session.title + "\n\n" +
    "This permanently removes the student's " +
    "PRESENT record.\n\n" +
    "Continue?"
  );

  if (!confirmed) return;

  deletingRecordId = record.id;

  deleteButton.disabled = true;
  deleteButton.textContent = "Deleting...";

  showMessage("Deleting student attendance...");

  try {
    const { data, error } = await supabase.rpc(
      "admin_delete_attendance_record",
      {
        p_record_id: record.id
      }
    );

    if (error) throw error;

    if (data !== true) {
      throw new Error(
        "Attendance deletion was not confirmed."
      );
    }

    const refreshed = await loadAttendance(session);

    
    if (!refreshed) {
      showMessage(
        "Record deleted. Reload att
