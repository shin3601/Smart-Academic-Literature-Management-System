import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// ==========================================
// SMART ACADEMIC
// STUDENT ACTIVITIES AND GRADES
// COMPLETE VERSION
// ==========================================

const $ = id => document.getElementById(id);

const messageBox = $("studentMessage");
const activityCount = $("activityCount");
const activitiesList = $("studentActivitiesList");
const logoutButton = $("logoutBtn");

const BUCKET = "activity-submissions";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SIGNED_URL_DURATION = 120;

const ALLOWED_EXTENSIONS = [
  "pdf", "doc", "docx",
  "ppt", "pptx",
  "png", "jpg", "jpeg", "webp"
];

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp"
];

let currentStudent = null;
let loading = false;

// ==========================================
// CHECK REQUIRED HTML ELEMENTS
// ==========================================

if (
  !messageBox ||
  !activityCount ||
  !activitiesList ||
  !logoutButton
) {
  throw new Error(
    "Required Student Activities HTML elements are missing."
  );
}

// ==========================================
// MESSAGE FUNCTIONS
// ==========================================

function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = "message " + type;
}

function showLoading(text) {
  activityCount.textContent = text;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

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

function isClosed(activity) {
  if (!activity.due_date) return false;

  const deadline = new Date(
    activity.due_date
  ).getTime();

  return (
    Number.isFinite(deadline) &&
    Date.now() > deadline
  );
}

function isGraded(submission) {
  return (
    submission.score !== null &&
    submission.score !== undefined
  );
}

function createFileId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  if (crypto.getRandomValues) {
    return Array.from(
      crypto.getRandomValues(new Uint8Array(16)),
      value => value.toString(16).padStart(2, "0")
    ).join("");
  }

  throw new Error(
    "Secure file upload is not supported by this browser."
  );
}

// ==========================================
// REQUEST TIMEOUT
// ==========================================

async function withTimeout(promise, label) {
  let timer;

  try {
    return await Promise.race([
      promise,

      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              label +
              " timed out. Check your internet connection or Supabase."
            )
          );
        }, 20000);
      })
    ]);

  } finally {
    clearTimeout(timer);
  }
}

// ==========================================
// FILE VALIDATION
// ==========================================

function validateFile(file) {
  if (!file) return null;

  const extension = file.name
    .split(".")
    .pop()
    .toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error(
      "Unsupported file extension."
    );
  }

  if (
    file.type &&
    file.type !== "application/octet-stream" &&
    !ALLOWED_MIME_TYPES.includes(file.type)
  ) {
    throw new Error(
      "Unsupported file format."
    );
  }

  if (file.size === 0) {
    throw new Error(
      "Selected file is empty."
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      "Maximum file size is 10 MB."
    );
  }

  return extension;
}

// ==========================================
// STUDENT AUTHENTICATION
// ==========================================

async function initialize() {
  showLoading("Checking student account...");

  try {
    const profile = await withTimeout(
      getCurrentProfile(),
      "Account verification"
    );

    if (!profile) {
      showLoading("Please log in.");

      window.location.replace("index.html");
      return;
    }

    if (profile.role !== "student") {
      showLoading("Student access required.");

      window.location.replace("index.html");
      return;
    }

    currentStudent = profile;

    showLoading(
      "Student verified. Loading activities..."
    );

    await loadActivities();

  } catch (error) {
    console.error(
      "Student initialization:",
      error
    );

    showLoading(
      "Unable to initialize student activities."
    );

    showMessage(
      error.message ||
      "Unable to load student account."
    );
  }
}

// ==========================================
// LOAD ACTIVITIES AND SUBMISSIONS
// ==========================================

async function loadActivities() {
  if (!currentStudent || loading) {
    return false;
  }

  loading = true;

  activitiesList.replaceChildren();

  showMessage("");

  try {
    showLoading(
      "Fetching available activities..."
    );

    // LOAD ACTIVITIES

    const activityResult = await withTimeout(
      supabase
        .from("activities")
        .select(`
          id,
          title,
          description,
          instructions,
          due_date,
          max_score,
          created_at
        `)
        .order("created_at", {
          ascending: false
        }),
      "Loading activities"
    );

    if (activityResult.error) {
      throw activityResult.error;
    }

    const activities = activityResult.data || [];

    // LOAD CURRENT STUDENT SUBMISSIONS

    showLoading(
      "Fetching your submissions..."
    );

    const submissionResult = await withTimeout(
      supabase
        .from("activity_submissions")
        .select(`
          id,
          activity_id,
          student_id,
          answer,
          file_path,
          file_name,
          submitted_at,
          score,
          feedback,
          graded_at
        `)
        .eq("student_id", currentStudent.id)
        .order("submitted_at", {
          ascending: false
        }),
      "Loading submissions"
    );

    if (submissionResult.error) {
      throw submissionResult.error;
    }

    const submissions =
      submissionResult.data || [];

    // GET THE LATEST SUBMISSION
    // FOR EACH ACTIVITY

    const submissionMap = new Map();

    submissions.forEach(item => {
      const previous = submissionMap.get(
        item.activity_id
      );

      const currentTime =
        new Date(item.submitted_at).getTime();

      const previousTime = previous
        ? new Date(previous.submitted_at).getTime()
        : 0;

      if (
        !previous ||
        currentTime > previousTime
      ) {
        submissionMap.set(
          item.activity_id,
          item
        );
      }
    });

    activityCount.textContent =
      activities.length +
      " activity(s) available";

    // NO ACTIVITIES

    if (activities.length === 0) {
      activitiesList.appendChild(
        createText(
          "p",
          "No activities available for your account.",
          "muted"
        )
      );

      return true;
    }

    // DISPLAY ACTIVITIES

    activities.forEach(activity => {
      displayActivity(
        activity,
        submissionMap.get(activity.id)
      );
    });

    return true;

  } catch (error) {
    console.error(
      "Load activities:",
      error
    );

    showLoading(
      "Unable to load activities."
    );

    showMessage(
      "Activity loading error: " +
      (error.message || String(error))
    );

    return false;

  } finally {
    loading = false;
  }
}

// ==========================================
// DISPLAY ACTIVITY CARD
// ==========================================

function displayActivity(activity, submission) {
  const card = document.createElement("article");

  card.className = "activity-card";

  // ACTIVITY TITLE

  card.appendChild(
    createText("h3", activity.title)
  );

  // DESCRIPTION

  card.appendChild(
    createText(
      "p",
      activity.description || "No description."
    )
  );

  // INSTRUCTIONS

  card.appendChild(
    createText(
      "p",
      "Instructions:\n" +
      (activity.instructions || "None provided.")
    )
  );

  // DEADLINE

  card.appendChild(
    createText(
      "p",
      "Deadline: " +
      (
        activity.due_date
          ? formatDate(activity.due_date)
          : "No deadline"
      ),
      "muted"
    )
  );

  // MAXIMUM SCORE

  card.appendChild(
    createText(
      "p",
      "Maximum Score: " + activity.max_score,
      "muted"
    )
  );

  // ========================================
  // ALREADY SUBMITTED
  // ========================================

  if (submission) {
    card.appendChild(
      createText(
        "span",
        "✓ SUBMITTED",
        "status submitted"
      )
    );

    card.appendChild(
      createText(
        "p",
        "Submitted: " +
        formatDate(submission.submitted_at),
        "muted"
      )
    );

    displaySubmittedWork(
      card,
      submission
    );

    displayGrade(
      card,
      activity,
      submission
    );

  }

  // ========================================
  // DEADLINE PASSED
  // ========================================

  else if (isClosed(activity)) {
    card.appendChild(
      createText(
        "span",
        "Deadline Passed",
        "status closed"
      )
    );

    card.appendChild(
      createText(
        "p",
        "The deadline has passed. New submissions are closed.",
        "muted"
      )
    );

  }

  // ========================================
  // NOT YET SUBMITTED
  // ========================================

  else {
    card.appendChild(
      createText(
        "span",
        "Not Submitted",
        "status pending"
      )
    );

    displayAnswerForm(
      card,
      activity
    );
  }

  activitiesList.appendChild(card);
}

// ==========================================
// DISPLAY STUDENT SUBMITTED WORK
// ==========================================

function displaySubmittedWork(card, submission) {
  const box = document.createElement("div");

  box.className = "grade-box";

  // WRITTEN ANSWER

  if (submission.answer?.trim()) {
    box.appendChild(
      createText(
        "strong",
        "Your Submitted Answer"
      )
    );

    box.appendChild(
      createText(
        "p",
        submission.answer
      )
    );
  }

  // ATTACHED FILE

  if (submission.file_path) {
    box.appendChild(
      createText(
        "p",
        "Attached File: " +
        (submission.file_name || "Assignment")
      )
    );

    const openButton =
      document.createElement("button");

    openButton.type = "button";
    openButton.className = "submit-btn";
    openButton.textContent = "📎 Open My File";

    openButton.addEventListener(
      "click",
      async () => {
        await openStudentFile(
          submission,
          openButton,
          box
        );
      }
    );

    box.appendChild(openButton);
  }

  card.appendChild(box);
}

// ==========================================
// OPEN STUDENT SUBMITTED FILE
// ==========================================

async function openStudentFile(
  submission,
  button,
  container
) {
  if (!submission.file_path) {
    showMessage("No uploaded file found.");
    return;
  }

  button.disabled = true;
  button.textContent = "Opening file...";

  // OPEN WINDOW BEFORE ASYNC REQUEST

  const fileWindow = window.open(
    "about:blank",
    "_blank"
  );

  if (fileWindow) {
    fileWindow.opener = null;
  }

  try {
    const { data, error } =
      await supabase.storage
        .from(BUCKET)
        .createSignedUrl(
          submission.file_path,
          SIGNED_URL_DURATION
        );

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error(
        "File link could not be created."
      );
    }

    if (fileWindow) {
      fileWindow.location.href =
        data.signedUrl;

      button.textContent = "📎 Open My File";

    } else {
      // FALLBACK WHEN POPUP IS BLOCKED

      const link = document.createElement("a");

      link.href = data.signedUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      link.textContent =
        "📎 Tap here to open your submitted file";

      link.style.display = "block";
      link.style.marginTop = "10px";

      container.appendChild(link);

      button.textContent =
        "File link ready below";
    }

    showMessage(
      "Your submitted file is ready.",
      "success"
    );

  } catch (error) {
    if (fileWindow) {
      fileWindow.close();
    }

    console.error(
      "Open student file:",
      error
    );

    showMessage(
      error.message ||
      "Unable to open submitted file."
    );

    button.textContent = "📎 Open My File";

  } finally {
    button.disabled = false;
  }
}

// ==========================================
// STUDENT SUBMISSION FORM
// ==========================================

function displayAnswerForm(card, activity) {
  const form = document.createElement("form");

  form.className = "answer-form";

  // WRITTEN ANSWER

  const answerLabel = createText(
    "label",
    "Written Answer (Optional)"
  );

  const answerInput =
    document.createElement("textarea");

  answerInput.placeholder =
    "Type your answer here or attach a file.";

  answerLabel.appendChild(answerInput);

  // FILE ATTACHMENT

  const fileLabel = createText(
    "label",
    "Attach Assignment (Optional)"
  );

  const fileInput =
    document.createElement("input");

  fileInput.type = "file";

  fileInput.accept =
    ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp";

  fileInput.style.width = "100%";

  fileLabel.appendChild(fileInput);

  // INSTRUCTIONS

  const hint = createText(
    "p",
    "Accepted: PDF, Word, PowerPoint, or image. Maximum 10 MB. Submit text, a file, or both.",
    "muted"
  );

  // SUBMIT BUTTON

  const submitButton =
    document.createElement("button");

  submitButton.type = "submit";
  submitButton.className = "submit-btn";
  submitButton.textContent = "Submit Activity";

  form.append(
    answerLabel,
    fileLabel,
    hint,
    submitButton
  );

  // ========================================
  // SUBMIT ACTIVITY
  // ========================================

  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      if (!currentStudent) {
        showMessage("Student login required.");
        return;
    }
