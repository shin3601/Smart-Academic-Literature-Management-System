
import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// =====================================
// SMART ACADEMIC - LECTURE MANAGEMENT
// =====================================

const lectureForm =
  document.getElementById("lectureForm");

const lectureTitle =
  document.getElementById("lectureTitle");

const lectureDescription =
  document.getElementById("lectureDescription");

const lectureContent =
  document.getElementById("lectureContent");

const lectureFile =
  document.getElementById("lectureFile");

const currentAttachment =
  document.getElementById("currentAttachment");

const saveLectureBtn =
  document.getElementById("saveLectureBtn");

const cancelEditBtn =
  document.getElementById("cancelEditBtn");

const lectureMessage =
  document.getElementById("lectureMessage");

const lecturesList =
  document.getElementById("lecturesList");

const lectureCount =
  document.getElementById("lectureCount");

const formTitle =
  document.getElementById("formTitle");

const logoutBtn =
  document.getElementById("logoutBtn");

const BUCKET = "lecture files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

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

let currentAdmin = null;
let editingId = null;
let lectures = [];

// =====================================
// MESSAGES
// =====================================

function showMessage(text, type = "error") {
  lectureMessage.textContent = text;
  lectureMessage.className =
    `lecture-message ${type}`;
}

// =====================================
// VERIFY ADMIN
// =====================================

async function initializePage() {
  lectureForm.hidden = true;

  try {
    const profile = await getCurrentProfile();

    if (!profile || profile.role !== "admin") {
      window.location.replace("index.html");
      return;
    }

    currentAdmin = profile;
    lectureForm.hidden = false;

    await loadLectures();

  } catch (error) {
    showMessage(error.message || "Unable to load page.");
  }
}

// =====================================
// LOAD LECTURES
// =====================================

async function loadLectures() {
  lectureCount.textContent = "Loading lectures...";

  const { data, error } = await supabase
    .from("lectures")
    .select(
      "id, title, description, content, file_path, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    lectureCount.textContent =
      "Unable to load lectures.";
    showMessage(error.message);
    return;
  }

  lectures = data || [];

  lectureCount.textContent =
    `${lectures.length} lecture(s)`;

  renderLectures();
}

// =====================================
// DISPLAY LECTURES
// =====================================

function renderLectures() {
  lecturesList.replaceChildren();

  if (lectures.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      "No lectures yet. Create your first lecture!";
    lecturesList.appendChild(empty);
    return;
  }

  lectures.forEach(lecture => {
    const card = document.createElement("article");
    card.className = "lecture-item";

    const title = document.createElement("h3");
    title.textContent = lecture.title;

    const description = document.createElement("p");
    description.textContent =
      lecture.description || "No description.";

    const content = document.createElement("p");
    content.className = "lecture-content";
    content.textContent =
      lecture.content || "No content provided.";

    card.append(title, description, content);

    if (lecture.file_path) {
      const fileButton =
        document.createElement("button");

      fileButton.type = "button";
      fileButton.className = "attachment-link";
      fileButton.textContent = "📎 Open Attachment";

      fileButton.addEventListener("click", () => {
        openAttachment(lecture.file_path);
      });

      card.appendChild(fileButton);
    }

    const actions = document.createElement("div");
    actions.className = "lecture-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-btn";
    editBtn.textContent = "✏️ Edit";

    editBtn.addEventListener("click", () => {
      startEditing(lecture);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "🗑️ Delete";

    deleteBtn.addEventListener("click", () => {
      deleteLecture(lecture);
    });

    actions.append(editBtn, deleteBtn);
    card.appendChild(actions);

    lecturesList.appendChild(card);
  });
}

// =====================================
// OPEN PRIVATE ATTACHMENT
// =====================================

async function openAttachment(filePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60);

  if (error || !data?.signedUrl) {
    showMessage(
      error?.message || "Unable to open attachment."
    );
    return;
  }

  window.open(
    data.signedUrl,
    "_blank",
    "noopener,noreferrer"
  );
}

// =====================================
// VALIDATE FILE
// =====================================

function validateFile(file) {
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      "File is too large. Maximum size is 50 MB."
    );
  }

  const extension =
    file.name.split(".").pop().toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error("Unsupported file format.");
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(
      "Unsupported file type. Choose a PDF, Word, PowerPoint, or image file."
    );
  }
}

// =====================================
// UPLOAD FILE
// =====================================

async function uploadFile(file) {
  validateFile(file);

  const extension =
    file.name.split(".").pop().toLowerCase();

  const filePath =
    `${currentAdmin.id}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) throw error;

  return filePath;
}

// =====================================
// CREATE OR UPDATE LECTURE
// =====================================

lectureForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (!currentAdmin) {
      showMessage("Admin access required.");
      return;
    }

    const title = lectureTitle.value.trim();
    const description =
      lectureDescription.value.trim();
    const content = lectureContent.value.trim();
    const file = lectureFile.files[0] || null;

    if (!title) {
      showMessage("Please enter a lecture title.");
      return;
    }

    let newFilePath = null;
    let saved = false;

    saveLectureBtn.disabled = true;
    saveLectureBtn.textContent = "Saving...";
    showMessage("");

    try {
      const existingLecture = editingId
        ? lectures.find(item => item.id === editingId)
        : null;

      if (editingId && !existingLecture) {
        throw new Error("Lecture not found.");
      }

      let filePath =
        existingLecture?.file_path || null;

      if (file) {
        showMessage(
          "Uploading attachment...",
          "success"
        );

        newFilePath = await uploadFile(file);
        filePath = newFilePath;
      }

      let result;

      if (editingId) {
        result = await supabase
          .from("lectures")
          .update({
            title,
            description,
            content,
            file_path: filePath,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingId)
          .select("id")
          .single();

      } else {
        result = await supabase
          .from("lectures")
          .insert({
            title,
            description,
            content,
            file_path: filePath,
            created_by: currentAdmin.id
          })
          .select("id")
          .single();
      }

      if (result.error) throw result.error;

      saved = true;

      // Remove the previous attachment only
      // after the database update succeeds.
      if (
        existingLecture?.file_path &&
        newFilePath &&
        existingLecture.file_path !== newFilePath
      ) {
        const { error: cleanupError } =
          await supabase.storage
            .from(BUCKET)
            .remove([existingLecture.file_path]);

        if (cleanupError) {
          console.warn(
            "Old attachment cleanup:",
            cleanupError.message
          );
        }
      }

      resetForm();
      await loadLectures();

      showMessage(
        "Lecture saved successfully!",
        "success"
      );

    } catch (error) {
      if (newFilePath && !saved) {
        const { error: cleanupError } =
          await supabase.storage
            .from(BUCKET)
            .remove([newFilePath]);

        if (cleanupError) {
          console.warn(
            "Upload cleanup:",
            cleanupError.message
          );
        }
      }

      showMessage(
        error.message || "Unable to save lecture."
      );

    } finally {
      saveLectureBtn.disabled = false;
      saveLectureBtn.textContent =
        editingId ? "Update Lecture" : "Save Lecture";
    }
  }
);

// =====================================
// EDIT LECTURE
// =====================================

function startEditing(lecture) {
  editingId = lecture.id;

  lectureTitle.value = lecture.title;
  lectureDescription.value =
    lecture.description || "";
  lectureContent.value =
    lecture.content || "";

  lectureFile.value = "";

  currentAttachment.textContent =
    lecture.file_path
      ? "Current attachment exists. Choose a new file to replace it."
      : "No attachment yet.";

  formTitle.textContent = "Edit Lecture";
  saveLectureBtn.textContent = "Update Lecture";
  cancelEditBtn.hidden = false;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// =====================================
// RESET FORM
// =====================================

function resetForm() {
  editingId = null;
  lectureForm.reset();

  currentAttachment.textContent = "";
  formTitle.textContent = "Create New Lecture";
  saveLectureBtn.textContent = "Save Lecture";
  cancelEditBtn.hidden = true;
}

cancelEditBtn.addEventListener(
  "click",
  resetForm
);

// =====================================
// DELETE LECTURE
// =====================================

async function deleteLecture(lecture) {
  const confirmed = confirm(
    `Delete "${lecture.title}"?`
  );

  if (!confirmed) return;

  const { data, error } = await supabase
    .from("lectures")
    .delete()
    .eq("id", lecture.id)
    .select("id");

  if (error) {
    showMessage(error.message);
    return;
  }

  if (!data || data.length === 0) {
    showMessage(
      "Lecture was not deleted. Check permissions."
    );
    return;
  }

  if (lecture.file_path) {
    const { error: storageError } =
      await supabase.storage
        .from(BUCKET)
        .remove([lecture.file_path]);

    if (storageError) {
      console.warn(
        "Attachment cleanup:",
        storageError.message
      );
    }
  }

  if (editingId === lecture.id) {
    resetForm();
  }

  await loadLectures();

  showMessage(
    "Lecture deleted successfully!",
    "success"
  );
}

// =====================================
// LOGOUT
// =====================================

logoutBtn.addEventListener(
  "click",
  async () => {
    logoutBtn.disabled = true;

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert(error.message);
      logoutBtn.disabled = false;
      return;
    }

    window.location.replace("index.html");
  }
);

// =====================================
// START
// =====================================

initializePage();
  
