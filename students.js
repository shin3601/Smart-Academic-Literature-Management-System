
import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

const studentsList = document.getElementById("studentsList");
const studentCount = document.getElementById("studentCount");
const studentSearch = document.getElementById("studentSearch");
const logoutBtn = document.getElementById("logoutBtn");

let students = [];

async function initializePage() {
  const profile = await getCurrentProfile();

  if (!profile || profile.role !== "admin") {
    window.location.replace("index.html");
    return;
  }

  await loadStudents();
}

async function loadStudents() {
  studentCount.textContent = "Loading students...";

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, student_id, role")
    .eq("role", "student")
    .order("full_name", { ascending: true });

  if (error) {
    studentCount.textContent = "Unable to load students.";
    studentsList.textContent = error.message;
    return;
  }

  students = data || [];
  studentCount.textContent =
    `${students.length} registered student(s)`;

  renderStudents();
}

function renderStudents() {
  const query = studentSearch.value.trim().toLowerCase();

  const filtered = students.filter(student => {
    const name = (student.full_name || "").toLowerCase();
    const id = (student.student_id || "").toLowerCase();

    return name.includes(query) || id.includes(query);
  });

  studentsList.replaceChildren();

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No students found.";
    studentsList.appendChild(empty);
    return;
  }

  filtered.forEach(student => {
    const card = document.createElement("div");

    card.style.cssText = `
      padding:14px;
      margin-bottom:12px;
      background:#F7F2E8;
      border:1px solid #E6D8C6;
      border-radius:12px;
    `;

    const name = document.createElement("h3");
    name.textContent = student.full_name || "Unnamed Student";

    const id = document.createElement("p");
    id.textContent =
      `Student ID: ${student.student_id || "Not provided"}`;

    card.append(name, id);
    studentsList.appendChild(card);
  });
}

studentSearch.addEventListener("input", renderStudents);

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;

  const { error } = await supabase.auth.signOut();

  if (error) {
    alert(error.message);
    logoutBtn.disabled = false;
    return;
  }

  window.location.replace("index.html");
});

initializePage();
