import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// ==========================================
// SMART ACADEMIC
// STUDENT QR ATTENDANCE
// ==========================================

const $ = id => document.getElementById(id);

const attendanceMessage = $("attendanceMessage");
const historyCount = $("historyCount");
const historyList = $("historyList");

const startScanBtn = $("startScanBtn");
const stopScanBtn = $("stopScanBtn");

const manualForm = $("manualForm");
const manualToken = $("manualToken");
const manualSubmitBtn = $("manualSubmitBtn");

const logoutBtn = $("logoutBtn");

let currentStudent = null;
let scanner = null;
let processing = false;

// ==========================================
// MESSAGE
// ==========================================

function showMessage(message, type = "error") {
  attendanceMessage.textContent = message;
  attendanceMessage.className = "message " + type;
}

// ==========================================
// CREATE ELEMENT
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
// FORMAT DATE
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
// AUTHENTICATION
// ==========================================

async function initialize() {
  try {
    const profile = await getCurrentProfile();

    if (!profile || profile.role !== "student") {
      window.location.replace("index.html");
      return;
    }

    currentStudent = profile;

    await loadHistory();

  } catch (error) {
    showMessage(
      error.message || "Unable to initialize attendance."
    );
  }
}

// ==========================================
// EXTRACT QR TOKEN
// ==========================================

function extractToken(value) {
  const raw = String(value || "").trim();

  if (!raw) return null;

  try {
    const url = new URL(raw);

    const token = url.searchParams.get("token");

    if (token) {
      return token.trim();
    }

  } catch (error) {
    // The value is probably a raw UUID.
  }

  return raw;
}

// ==========================================
// VALIDATE TOKEN
// ==========================================

function validateToken(token) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return uuidPattern.test(token);
}

// ==========================================
// START CAMERA
// ==========================================

async function startScanner() {
  if (!currentStudent) {
    showMessage("Student account required.");
    return;
  }

  if (processing || scanner) return;

  if (!window.Html5Qrcode) {
    showMessage(
      "QR scanner failed to load. Check your internet connection."
    );
    return;
  }

  if (
    !window.isSecureContext &&
    location.hostname !== "localhost"
  ) {
    showMessage(
      "Camera access requires a secure HTTPS connection."
    );
    return;
  }

  startScanBtn.disabled = true;
  startScanBtn.textContent = "Opening Camera...";

  try {
    scanner = new window.Html5Qrcode("qr-reader");

    await scanner.start(
      {
        facingMode: "environment"
      },
      {
        fps: 10,
        qrbox: {
          width: 240,
          height: 240
        }
      },

      async decodedText => {
        if (processing) return;

        processing = true;

        await stopScanner();

        processing = false;

        await submitToken(decodedText);
      },

      errorMessage => {
        // Ignore unsuccessful camera frame detections.
      }
    );

    startScanBtn.textContent = "Camera Active";
    stopScanBtn.disabled = false;

    showMessage(
      "Camera is ready. Scan the Admin attendance QR.",
      "success"
    );

  } catch (error) {
    console.error("Camera error:", error);

    await stopScanner();

    showMessage(
      error.message ||
      "Unable to access camera. Check camera permissions."
    );
  }
}

// ==========================================
// STOP CAMERA
// ==========================================

async function stopScanner() {
  if (scanner) {
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch (error) {
      console.warn("Scanner stop:", error);
    }

    try {
      await scanner.clear();
    } catch (error) {
      console.warn("Scanner cleanup:", error);
    }

    scanner = null;
  }

  startScanBtn.disabled = false;
  startScanBtn.textContent = "Start Camera Scanner";

  stopScanBtn.disabled = true;
}

// ==========================================
// SUBMIT ATTENDANCE
// ==========================================

async function submitToken(rawValue) {
  if (processing) return;

  if (!currentStudent) {
    showMessage("Student account required.");
    return;
  }

  const token = extractToken(rawValue);

  if (!token || !validateToken(token)) {
    showMessage(
      "Invalid token. Enter the actual QR token, not the class or session name."
    );
    return;
  }

  processing = true;

  manualSubmitBtn.disabled = true;
  manualSubmitBtn.textContent = "Registering Attendance...";

  startScanBtn.disabled = true;

  showMessage("Verifying your attendance...");

  try {
    const { data, error } = await supabase.rpc(
      "mark_attendance",
      {
        p_token: token
      }
    );

    if (error) throw error;

    const result = Array.isArray(data)
      ? data[0]
      : data;

    if (!result) {
      throw new Error(
        "No attendance confirmation received."
      );
    }

    if (result.already_marked) {
      showMessage(
        "You are already marked PRESENT for " +
        result.session_title + ".",
        "success"
      );
    } else {
      showMessage(
        "Attendance successfully recorded! You are PRESENT for " +
        result.session_title + ".",
        "success"
      );
    }

    manualToken.value = "";

    await loadHistory();

  } catch (error) {
    console.error("Attendance registration:", error);

    showMessage(
      error.message || "Unable to register attendance."
    );

  } finally {
    processing = false;

    manualSubmitBtn.disabled = false;
    manualSubmitBtn.textContent = "Submit Attendance";

    startScanBtn.disabled = false;
  }
}

// ==========================================
// CAMERA BUTTONS
// ==========================================

startScanBtn.addEventListener(
  "click",
  startScanner
);

stopScanBtn.addEventListener(
  "click",
  stopScanner
);

// ==========================================
// MANUAL TOKEN ENTRY
// ==========================================

manualForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    await stopScanner();

    await submitToken(manualToken.value);
  }
);

// ==========================================
// LOAD ATTENDANCE HISTORY
// ==========================================

async function loadHistory() {
  if (!currentStudent) return;

  historyCount.textContent =
    "Loading attendance history...";

  historyList.replaceChildren();

  try {
    const { data, error } = await supabase.rpc(
      "get_my_attendance_history"
    );

    if (error) throw error;

    const records = data || [];

    historyCount.textContent =
      records.length + " attendance record(s)";

    if (records.length === 0) {
      historyList.appendChild(
        createText(
          "p",
          "You do not have any attendance records yet.",
          "muted"
        )
      );

      return;
    }

    records.forEach(record => {
      const card = document.createElement("article");

      card.className = "attendance-record";

      card.appendChild(
        createText(
          "h3",
          record.session_title || "Class Attendance"
        )
      );

      card.appendChild(
        createText(
          "p",
          "Attendance Date: " +
          formatDate(record.marked_at),
          "muted"
        )
      );

      card.appendChild(
        createText(
          "p",
          "Status: PRESENT",
          "present"
        )
      );

      historyList.appendChild(card);
    });

  } catch (error) {
    console.error("Attendance history:", error);

    historyCount.textContent =
      "Unable to load attendance history.";

    showMessage(
      error.message ||
      "Unable to load attendance history."
    );
  }
}

// ==========================================
// LOGOUT
// ==========================================

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;

  try {
    await stopScanner();

    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    window.location.replace("index.html");

  } catch (error) {
    alert(error.message);
    logoutBtn.disabled = false;
  }
});

// ==========================================
// CLEAN UP CAMERA
// ==========================================

window.addEventListener("pagehide", () => {
  if (scanner && scanner.isScanning) {
    scanner.stop().catch(() => {});
  }
});

// ==========================================
// INITIALIZE
// ==========================================

initialize();
