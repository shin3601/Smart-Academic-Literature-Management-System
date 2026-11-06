
import { supabase } from "./supabase.js";
import { getCurrentProfile } from "./roles.js";

// ======================================
// SMART ACADEMIC AUTHENTICATION
// ======================================

// DISPLAY MESSAGES
function showMessage(text, type = "error") {
  const message = document.getElementById("message");

  if (!message) return;

  message.textContent = text;
  message.className = `message ${type}`;
}

// ======================================
// STUDENT / ADMIN ROLE SELECTOR
// ======================================

const studentRoleBtn =
  document.getElementById("studentRoleBtn");

const adminRoleBtn =
  document.getElementById("adminRoleBtn");

const selectedRoleInput =
  document.getElementById("selectedRole");

const roleHint =
  document.getElementById("roleHint");

const loginBtn =
  document.getElementById("loginBtn");

function selectRole(role) {
  if (!selectedRoleInput) return;

  selectedRoleInput.value = role;

  const isStudent = role === "student";

  studentRoleBtn.classList.toggle(
    "active",
    isStudent
  );

  adminRoleBtn.classList.toggle(
    "active",
    !isStudent
  );

  studentRoleBtn.setAttribute(
    "aria-pressed",
    String(isStudent)
  );

  adminRoleBtn.setAttribute(
    "aria-pressed",
    String(!isStudent)
  );

  roleHint.textContent = isStudent
    ? "Access your student dashboard."
    : "Access your administrator dashboard.";

  loginBtn.textContent = isStudent
    ? "Login as Student"
    : "Login as Admin";

  showMessage("");
}

if (studentRoleBtn && adminRoleBtn) {
  studentRoleBtn.addEventListener(
    "click",
    () => selectRole("student")
  );

  adminRoleBtn.addEventListener(
    "click",
    () => selectRole("admin")
  );
}

// ======================================
// LOGIN SYSTEM
// ======================================

const loginForm =
  document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const email = document
        .getElementById("email")
        .value.trim();

      const password = document
        .getElementById("password")
        .value;

      const selectedRole =
        selectedRoleInput.value;

      loginBtn.disabled = true;
      studentRoleBtn.disabled = true;
      adminRoleBtn.disabled = true;

      loginBtn.textContent = "Logging in...";

      showMessage("");

      try {
        // AUTHENTICATE WITH SUPABASE
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password
          });

        if (error) {
          throw error;
        }

        if (!data?.user) {
          throw new Error(
            "Login failed. No account found."
          );
        }

        // READ THE REAL ACCOUNT ROLE
        const profile =
          await getCurrentProfile();

        if (!profile) {
          throw new Error(
            "Your account profile could not be loaded."
          );
        }

        // CHECK SELECTED ROLE
        if (profile.role !== selectedRole) {
          await supabase.auth.signOut();

          throw new Error(
            selectedRole === "admin"
              ? "This account is not registered as an Admin. Please select Student."
              : "This account is not registered as a Student. Please select Admin."
          );
        }

        showMessage(
          "Login successful! Redirecting...",
          "success"
        );

        // OPEN THE CORRECT DASHBOARD
        if (profile.role === "admin") {
          window.location.replace("admin.html");
        } else if (profile.role === "student") {
          window.location.replace("student.html");
        } else {
          throw new Error(
            "Invalid account role."
          );
        }

      } catch (error) {
        console.error("Login error:", error);

        showMessage(
          error.message || "Unable to log in."
        );

        loginBtn.disabled = false;
        studentRoleBtn.disabled = false;
        adminRoleBtn.disabled = false;

        loginBtn.textContent =
          selectedRole === "admin"
            ? "Login as Admin"
            : "Login as Student";
      }
    }
  );
}

// ======================================
// STUDENT REGISTRATION
// ======================================

const registerForm =
  document.getElementById("registerForm");

if (registerForm) {
  registerForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const fullName = document
        .getElementById("fullName")
        .value.trim();

      const studentId = document
        .getElementById("studentId")
        .value.trim();

      const email = document
        .getElementById("registerEmail")
        .value.trim();

      const password = document
        .getElementById("registerPassword")
        .value;

      const confirmPassword = document
        .getElementById("confirmPassword")
        .value;

      const registerBtn =
        document.getElementById("registerBtn");

      if (!fullName || !studentId || !email) {
        showMessage(
          "Please complete all required fields."
        );
        return;
      }

      if (password.length < 6) {
        showMessage(
          "Password must contain at least 6 characters."
        );
        return;
      }

      if (password !== confirmPassword) {
        showMessage("Passwords do not match.");
        return;
      }

      registerBtn.disabled = true;
      registerBtn.textContent =
        "Creating account...";

      showMessage("");

      try {
        const { data, error } =
          await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                student_id: studentId,
                role: "student"
              }
            }
          });

        if (error) {
          throw error;
        }

        if (!data?.user) {
          throw new Error(
            "Registration failed. No user returned."
          );
        }

        if (data.user.identities?.length === 0) {
          throw new Error(
            "This email may already be registered."
          );
        }

        showMessage(
          data.session
            ? "Registration accepted! You can now log in."
            : "Registration accepted! Check your email if confirmation is required.",
          "success"
        );

        registerForm.reset();

        setTimeout(() => {
          window.location.href = "index.html";
        }, 3500);

      } catch (error) {
        console.error(
          "Registration error:",
          error
        );

        showMessage(
          error.message || "Registration failed."
        );

      } finally {
        registerBtn.disabled = false;
        registerBtn.textContent =
          "Create Student Account";
      }
    }
  );
}

// ======================================
// SHOW / HIDE LOGIN PASSWORD
// ======================================

const togglePassword =
  document.getElementById("togglePassword");

if (togglePassword) {
  togglePassword.addEventListener(
    "click",
    () => {
      const password =
        document.getElementById("password");

      if (password.type === "password") {
        password.type = "text";
        togglePassword.textContent = "🙈";
      } else {
        password.type = "password";
        togglePassword.textContent = "👁";
      }
    }
  );
}

// ======================================
// SHOW / HIDE REGISTRATION PASSWORD
// ======================================

const toggleRegisterPassword =
  document.getElementById(
    "toggleRegisterPassword"
  );

if (toggleRegisterPassword) {
  toggleRegisterPassword.addEventListener(
    "click",
    () => {
      const password =
        document.getElementById(
          "registerPassword"
        );

      if (password.type === "password") {
        password.type = "text";
        toggleRegisterPassword.textContent = "🙈";
      } else {
        password.type = "password";
        toggleRegisterPassword.textContent = "👁";
      }
    }
  );
}

// ======================================
// END
// ======================================
    
