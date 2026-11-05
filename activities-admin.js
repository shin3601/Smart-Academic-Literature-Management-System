import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// ========================================
// SMART ACADEMIC
// ADMIN - ACTIVITIES AND GRADES
// COMPLETE SUBMISSION AND GRADING SYSTEM
// ========================================

const $ = id => document.getElementById(id);

const BUCKET = "activity-submissions";
const SIGNED_URL_DURATION = 300;

// FORM ELEMENTS
const form = $("activityForm");
const titleInput = $("activityTitle");
const descriptionInput = $("activityDescription");
const instructionsInput = $("activityInstructions");
const dueDateInput = $("activityDueDate");
const maxScoreInput = $("activityMaxScore");

const formTitle = $("activityFormTitle");
const saveButton = $("saveActivityBtn");
const cancelButton = $("cancelActivityBtn");
const messageBox = $("activityMessage");

// ACTIVITY ELEMENTS
const activityCount = $("activityCount");
const activitiesList = $("activitiesList");

// SUBMISSION ELEMENTS
const submissionsTitle = $("submissionsTitle");
const submissionsHint = $("submissionsHint");
const submissionsList = $("submissionsList");

// LOGOUT
const logoutButton = $("logoutBtn");

// ========================================
// SYSTEM STATE
// ========================================

let currentAdmin = null;
let editingId = null;
let activities = [];
let selectedActivityId = null;
let submissionRequestId = 0;

// ========================================
// HELPER FUNCTIONS
// ========================================

function showMessage(message, type = "error") {
  messageBox.textContent = message;
  messageBox.className = "message " + type;
}

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function localDateValue(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const adjusted = new Date(
    date.getTime() -
    date.getTimezoneOffset() * 60000
  );

  return adjusted.toISOString().slice(0, 16);
}

function createText(tag, text, className = "") {
  const element = document.createElement(tag);

  element.textContent = String(text ?? "");

  if (className) {
    element.className = className;
  }

  return element;
}

function createButton(text, className, action) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = text;
  button.className = className;

  button.addEventListener("click", action);

  return button;
}

function isGraded(submission) {
  return (
    submission.score !== null &&
    submission.score !== undefined &&
    submission.score !== ""
  );
}

// ========================================
// ADMIN AUTHENTICATION
// ========================================

async function initialize() {
  form.hidden = true;

  try {
    const profile = await getCurrentProfile();

    if (!profile || profile.role !== "admin") {
      window.location.replace("index.html");
      return;
    }

    currentAdmin = profile;

    form.hidden = false;

    await loadActivities();

  } catch (error) {
    console.error("Admin initialization:", error);

    showMessage(
      error.message || "Unable to initialize activities."
    );
  }
}

// ========================================
// LOAD ACTIVITIES
// ========================================

async function loadActivities() {
  activityCount.textContent = "Loading activities...";

  activitiesList.replaceChildren();

  try {
    const { data, error } = await supabase
      .from("activities")
      .select(
        "id, title, description, instructions, due_date, max_score, created_at"
      )
      .order("created_at", {
        ascending: false
      });

    if (error) throw error;

    activities = data || [];

    activityCount.textContent =
      activities.length + " activity(s)";

    displayActivities();

    return true;

  } catch (error) {
    console.error("Load activities:", error);

    activityCount.textContent =
      "Unable to load activities.";

    showMessage(
      error.message || "Unable to load activities."
    );

    return false;
  }
}

// ========================================
// DISPLAY ACTIVITIES
// ========================================

function displayActivities() {
  activitiesList.replaceChildren();

  if (activities.length === 0) {
    activitiesList.appendChild(
      createText(
        "p",
        "No activities yet. Create your first activity!",
        "muted"
      )
    );

    return;
  }

  activities.forEach(activity => {
    const card = document.createElement("article");

    card.className = "activity-card";

    card.appendChild(
      createText("h3", activity.title)
    );

    card.appendChild(
      createText(
        "p",
        activity.description || "No description."
      )
    );

    card.appendChild(
      createText(
        "p",
        "Instructions: " +
        (activity.instructions || "None provided.")
      )
    );

    card.appendChild(
      createText(
        "p",
        "Deadline: " + formatDate(activity.due_date),
        "muted"
      )
    );

    card.appendChild(
      createText(
        "p",
        "Maximum Score: " + activity.max_score,
        "muted"
      )
    );

    const actions = document.createElement("div");

    actions.className = "activity-actions";

    actions.appendChild(
      createButton(
        "View Submissions",
        "primary-action",
        () => loadSubmissions(activity)
      )
    );

    actions.appendChild(
      createButton(
        "Edit",
        "secondary-action",
        () => editActivity(activity)
      )
    );

    actions.appendChild(
      createButton(
        "🗑 Delete",
        "danger-action",
        () => deleteActivity(activity)
      )
    );

    card.appendChild(actions);

    activitiesList.appendChild(card);
  });
}

// ========================================
// CREATE OR UPDATE ACTIVITY
// ========================================

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentAdmin) {
    showMessage("Admin access required.");
    return;
  }

  const title = titleInput.value.trim();

  const description =
    descriptionInput.value.trim();

  const instructions =
    instructionsInput.value.trim();

  const maxScore = Number(maxScoreInput.value);

  if (!title) {
    showMessage("Please enter an activity title.");
    return;
  }

  if (
    !Number.isSafeInteger(maxScore) ||
    maxScore < 1
  ) {
    showMessage(
      "Maximum score must be a positive whole number."
    );

    return;
  }

  let dueDate = null;

  if (dueDateInput.value) {
    const date = new Date(dueDateInput.value);

    if (Number.isNaN(date.getTime())) {
      showMessage("Invalid deadline.");
      return;
    }

    dueDate = date.toISOString();
  }

  const payload = {
    title,
    description,
    instructions,
    due_date: dueDate,
    max_score: maxScore
  };

  const wasEditing = Boolean(editingId);
  const activityId = editingId;

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  showMessage("");

  try {
    let result;

    if (wasEditing) {
      result = await supabase
        .from("activities")
        .update(payload)
        .eq("id", activityId)
        .select("id")
        .single();

    } else {
      result = await supabase
        .from("activities")
        .insert({
          ...payload,
          created_by: currentAdmin.id
        })
        .select("id")
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    resetForm();

    await loadActivities();

    showMessage(
      wasEditing
        ? "Activity updated successfully!"
        : "Activity created successfully!",
      "success"
    );

  } catch (error) {
    console.error("Save activity:", error);

    showMessage(
      error.message || "Unable to save activity."
    );

  } finally {
    saveButton.disabled = false;

    saveButton.textContent = editingId
      ? "Update Activity"
      : "Save Activity";
  }
});

// ========================================
// EDIT ACTIVITY
// ========================================

function editActivity(activity) {
  editingId = activity.id;

  titleInput.value = activity.title;

  descriptionInput.value =
    activity.description || "";

  instructionsInput.value =
    activity.instructions || "";

  dueDateInput.value =
    localDateValue(activity.due_date);

  maxScoreInput.value = activity.max_score;

  formTitle.textContent = "Edit Activity";

  saveButton.textContent = "Update Activity";

  cancelButton.hidden = false;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// ========================================
// RESET FORM
// ========================================

function resetForm() {
  editingId = null;

  form.reset();

  maxScoreInput.value = 100;

  formTitle.textContent =
    "Create New Activity";

  saveButton.textContent =
    "Save Activity";

  cancelButton.hidden = true;
}

cancelButton.addEventListener(
  "click",
  resetForm
);

// ========================================
// DELETE ACTIVITY
// ========================================

async function deleteActivity(activity) {
  if (!currentAdmin) {
    showMessage("Admin access required.");
    return;
  }

  const confirmed = confirm(
    'Delete "' + activity.title + '"?\n\n' +
    "This may also affect its linked submissions " +
    "depending on your database relationship.\n\n" +
    "This action cannot be undone."
  );

  if (!confirmed) return;

  try {
    const { data, error } = await supabase
      .from("activities")
      .delete()
      .eq("id", activity.id)
      .select("id");

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        "Activity could not be deleted. Check permissions."
      );
    }

    if (editingId === activity.id) {
      resetForm();
    }

    if (selectedActivityId === activity.id) {
      selectedActivityId = null;
      submissionRequestId++;

      submissionsTitle.textContent =
        "Student Submissions";

      submissionsHint.textContent =
        "Select View Submissions on an activity.";

      submissionsList.replaceChildren();
    }

    await loadActivities();

    showMessage(
      "Activity deleted successfully!",
      "success"
    );

  } catch (error) {
    console.error("Delete activity:", error);

    showMessage(
      error.message || "Unable to delete activity."
    );
  }
}

// ========================================
// LOAD STUDENT SUBMISSIONS
// ========================================

async function loadSubmissions(activity) {
  selectedActivityId = activity.id;

  const requestId = ++submissionRequestId;

  submissionsTitle.textContent =
    "Submissions: " + activity.title;

  submissionsHint.textContent =
    "Loading student submissions...";

  submissionsList.replaceChildren();

  try {
    const { data, error } = await supabase
      .from("activity_submissions")
      .select(
        "id, student_id, answer, file_path, file_name, submitted_at, score, feedback, graded_at"
      )
      .eq("activity_id", activity.id)
      .order("submitted_at", {
        ascending: false
      });

    if (error) throw error;

    if (
      requestId !== submissionRequestId ||
      selectedActivityId !== activity.id
    ) {
      return false;
    }

    const submissions = data || [];

    if (submissions.length === 0) {
      submissionsHint.textContent =
        "No student submissions yet.";

      submissionsList.appendChild(
        createText(
          "p",
          "Students have not submitted this activity yet.",
          "muted"
        )
      );

      return true;
    }

    const studentIds = [
      ...new Set(
        submissions.map(item => item.student_id)
      )
    ];

    let profiles = [];

    if (studentIds.length > 0) {
      const result = await supabase
        .from("profiles")
        .select("id, full_name, student_id")
        .in("id", studentIds);

      if (result.error) {
        console.warn(
          "Unable to load student profiles:",
          result.error.message
        );

      } else {
        profiles = result.data || [];
      }
    }

    if (
      requestId !== submissionRequestId ||
      selectedActivityId !== activity.id
    ) {
      return false;
    }

    const profileMap = new Map(
      profiles.map(profile => [
        profile.id,
        profile
      ])
    );

    const gradedCount = submissions.filter(
      isGraded
    ).length;

    const pendingCount =
      submissions.length - gradedCount;

    submissionsHint.textContent =
      submissions.length + " Submitted | " +
      gradedCount + " Graded | " +
      pendingCount + " Awaiting Grade";

    submissions.forEach(submission => {
      const student = profileMap.get(
        submission.student_id
      );

      displaySubmission(
        submission,
        student,
        activity
      );
    });

    return true;

  } catch (error) {
    if (requestId !== submissionRequestId) {
      return false;
    }

    console.error("Load submissions:", error);

    submissionsHint.textContent =
      "Unable to load submissions.";

    showMessage(
      error.message || "Unable to load submissions."
    );

    return false;
  }
}

// ========================================
// OPEN STUDENT UPLOADED FILE
// PDF / WORD / POWERPOINT / IMAGE
// ========================================

async function openSubmissionFile(
  submission,
  button,
  card
) {
  if (!submission.file_path) {
    showMessage("No uploaded file found.");
    return;
  }

  button.disabled = true;
  button.textContent = "Opening file...";

  // Open a blank tab immediately.
  // This helps avoid popup blocking.

  const fileWindow = window.open(
    "about:blank",
    "_blank"
  );

  if (fileWindow) {
    fileWindow.opener = null;
  }

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(
        submission.file_path,
        SIGNED_URL_DURATION
      );

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error(
        "Unable to generate a secure file link."
      );
    }

    if (fileWindow) {
      fileWindow.location.href = data.signedUrl;

      button.textContent =
        "📎 Open Submitted File";

    } else {
      // Fallback if popup is blocked.

      const link = document.createElement("a");

      link.href = data.signedUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      link.className = "secondary-action";

      link.textContent =
        "📂 Open Student Attachment";

      link.style.display = "inline-block";
      link.style.marginTop = "10px";

      const oldLink = card.querySelector(
        ".generated-file-link"
      );

      if (oldLink) {
        oldLink.remove();
      }

      link.classList.add("generated-file-link");

      button.insertAdjacentElement(
        "afterend",
        link
      );

      button.textContent =
        "Generate New File Link";
    }

  } catch (error) {
    if (fileWindow) {
      fileWindow.close();
    }

    console.error("Open submitted file:", error);

    showMessage(
      error.message ||
      "Unable to open the student's file."
    );

    button.textContent =
      "📎 Open Submitted File";

  } finally {
    button.disabled = false;
  }
}

// ========================================
// DISPLAY STUDENT SUBMISSION
// AND GRADING FORM
// ========================================

function displaySubmission(
  submission,
  student,
  activity
) {
  const card = document.createElement("article");

  card.className = "submission-card";

  const studentName =
    student?.full_name || "Unknown Student";

  const studentNumber =
    student?.student_id || "Unavailable";

  // STUDENT INFORMATION
