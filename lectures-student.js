
import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// ======================================
// SMART ACADEMIC
// STUDENT LECTURE MANAGEMENT
// ======================================

const lectureCount =
  document.getElementById("lectureCount");

const lecturesList =
  document.getElementById("lecturesList");

const lectureMessage =
  document.getElementById("lectureMessage");

const logoutBtn =
  document.getElementById("logoutBtn");

const BUCKET = "lecture files";

let currentStudent = null;
let lectures = [];

// ======================================
// MESSAGE SYSTEM
// ======================================

function showMessage(message, type = "error") {

  lectureMessage.textContent = message;

  lectureMessage.className =
    "lecture-message " + type;

}

// ======================================
// CREATE TEXT ELEMENT
// ======================================

function createText(tag, text, className = "") {

  const element =
    document.createElement(tag);

  element.textContent = text;

  if (className) {
    element.className = className;
  }

  return element;

}

// ======================================
// FORMAT DATE
// ======================================

function formatDate(value) {

  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );

}

// ======================================
// GET FILE TYPE
// ======================================

function getFileType(filePath) {

  if (!filePath) return "FILE";

  const extension =
    filePath.split(".").pop().toLowerCase();

  const types = {
    pdf: "PDF DOCUMENT",
    doc: "WORD DOCUMENT",
    docx: "WORD DOCUMENT",
    ppt: "POWERPOINT",
    pptx: "POWERPOINT",
    png: "IMAGE",
    jpg: "IMAGE",
    jpeg: "IMAGE",
    webp: "IMAGE"
  };

  return types[extension] || "ATTACHMENT";

}

// ======================================
// STUDENT AUTHENTICATION
// ======================================

async function initializePage() {

  lectureCount.textContent =
    "Checking student account...";

  try {

    const profile =
      await getCurrentProfile();

    if (
      !profile ||
      profile.role !== "student"
    ) {

      window.location.replace("index.html");

      return;

    }

    currentStudent = profile;

    await loadLectures();

  } catch (error) {

    console.error(
      "Initialization error:",
      error
    );

    showMessage(
      error.message ||
      "Unable to initialize lecture page."
    );

  }

}

// ======================================
// LOAD LECTURES FROM SUPABASE
// ======================================

async function loadLectures() {

  if (!currentStudent) return;

  lectureCount.textContent =
    "Loading lectures...";

  lecturesList.replaceChildren();

  try {

    const { data, error } = await supabase

      .from("lectures")

      .select(
        "id, title, description, content, file_path, created_at"
      )

      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (error) {
      throw error;
    }

    lectures = data || [];

    lectureCount.textContent =
      lectures.length +
      " lecture(s) available";

    displayLectures();

  } catch (error) {

    console.error(
      "Lecture loading error:",
      error
    );

    lectureCount.textContent =
      "Unable to load lectures.";

    showMessage(
      error.message ||
      "Something went wrong while loading lectures."
    );

  }

}

// ======================================
// DISPLAY ALL LECTURES
// ======================================

function displayLectures() {

  lecturesList.replaceChildren();

  if (lectures.length === 0) {

    lecturesList.appendChild(
      createText(
        "p",
        "No lectures have been uploaded yet. Please check again later.",
        "empty-message"
      )
    );

    return;

  }

  lectures.forEach(lecture => {

    const card =
      document.createElement("article");

    card.className = "lecture-item";

    // TITLE

    card.appendChild(
      createText(
        "h3",
        lecture.title
      )
    );

    // DESCRIPTION

    card.appendChild(
      createText(
        "p",
        lecture.description ||
        "No description provided.",
        "lecture-description"
      )
    );

    // CONTENT

    card.appendChild(
      createText(
        "p",
        lecture.content ||
        "No additional lecture content provided.",
        "lecture-content"
      )
    );

    // DATE

    card.appendChild(
      createText(
        "p",
        "Uploaded: " +
        formatDate(lecture.created_at),
        "lecture-date"
      )
    );

    // ATTACHMENT

    if (lecture.file_path) {

      const attachmentButton =
        document.createElement("button");

      attachmentButton.type = "button";

      attachmentButton.className =
        "attachment-button";

      attachmentButton.textContent =
        "📎 Open " +
        getFileType(lecture.file_path);

      attachmentButton.addEventListener(
        "click",
        () => openAttachment(
          lecture.file_path,
          attachmentButton
        )
      );

      card.appendChild(attachmentButton);

    }

    lecturesList.appendChild(card);

  });

}

// ======================================
// OPEN PRIVATE LECTURE ATTACHMENT
// ======================================

async function openAttachment(
  filePath,
  button
) {

  if (!currentStudent) {

    showMessage(
      "Student authentication required."
    );

    return;

  }

  button.disabled = true;

  button.textContent =
    "Opening attachment...";

  try {

    const { data, error } =
      await supabase.storage

        .from(BUCKET)

        .createSignedUrl(
          filePath,
          60
        );

    if (error) {
      throw error;
    }

    if (!data?.signedUrl) {

      throw new Error(
        "Unable to generate attachment link."
      );

    }

    // Open the file in the current tab.
    // This avoids mobile popup-blocking issues.

    window.location.assign(
      data.signedUrl
    );

  } catch (error) {

    console.error(
      "Attachment error:",
      error
    );

    showMessage(
      error.message ||
      "Unable to open lecture attachment."
    );

    button.disabled = false;

    button.textContent =
      "📎 Open " +
      getFileType(filePath);

  }

}

// ======================================
// LOGOUT
// ======================================

logoutBtn.addEventListener(
  "click",
  async () => {

    logoutBtn.disabled = true;

    logoutBtn.textContent =
      "Logging out...";

    try {

      const { error } =
        await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      window.location.replace(
        "index.html"
      );

    } catch (error) {

      alert(
        error.message ||
        "Unable to log out."
      );

      logoutBtn.disabled = false;

      logoutBtn.textContent =
        "Logout";

    }

  }
);

// ======================================
// START PAGE
// ======================================

initializePage();
    
