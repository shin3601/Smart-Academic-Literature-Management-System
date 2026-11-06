
import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

async function initializeDashboard() {
  const profile = await getCurrentProfile();

  if (!profile) {
    window.location.replace("index.html");
    return;
  }

  const page = window.location.pathname
    .split("/")
    .pop();

  if (page === "admin.html" &&
      profile.role !== "admin") {
    window.location.replace("student.html");
    return;
  }

  if (page === "student.html" &&
      profile.role !== "student") {
    window.location.replace("admin.html");
    return;
  }

  const welcome = document.getElementById("welcomeText");

  if (welcome) {
    welcome.textContent =
      `Welcome, ${profile.full_name}! 👋`;
  }
}

initializeDashboard();

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
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
}
