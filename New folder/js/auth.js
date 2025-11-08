// js/auth.js
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ================================
   Dashboard destinations
   ================================ */
const ADMIN_DASHBOARD   = "admin-dashboard.html";
const TEACHER_DASHBOARD = "teacher-dashboard.html";
const STUDENT_DASHBOARD = "student-dashboard.html";

/* ================================
   Role helpers
   ================================ */
function redirectByRole(role) {
  switch ((role || "student").toLowerCase()) {
    case "admin":   window.location.href = ADMIN_DASHBOARD; break;
    case "teacher": window.location.href = TEACHER_DASHBOARD; break;
    default:        window.location.href = STUDENT_DASHBOARD;
  }
}

/** Decide where to go after login. */
export async function goToDashboard(user) {
  try {
    const token  = await user.getIdTokenResult(true);
    const claims = token.claims || {};
    if (claims.admin === true)   return redirectByRole("admin");
    if (claims.teacher === true) return redirectByRole("teacher");

    const ref  = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const role = (snap.exists() ? (snap.data().role || "student") : "student").toLowerCase();
    redirectByRole(role);
  } catch (err) {
    console.error("[auth.js] goToDashboard failed:", err?.code, err?.message);
    redirectByRole("student");
  }
}

/* ================================
   SIGN UP (students only)
   ================================ */
const signupForm = document.getElementById("signup-form");

function clearError(el) {
  el.classList.remove("is-invalid");
  el.removeAttribute("aria-invalid");
  const msg = el.parentElement.querySelector(".field-error");
  if (msg) msg.remove();
}

function showError(el, message) {
  el.classList.add("is-invalid");
  el.setAttribute("aria-invalid", "true");
  // remove existing
  const existing = el.parentElement.querySelector(".field-error");
  if (existing) existing.remove();
  // add message
  const p = document.createElement("div");
  p.className = "field-error";
  p.textContent = message;
  el.parentElement.appendChild(p);
}

function validateEmailFormat(email) {
  // simple, friendly check; Firebase will still validate server-side
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateSignup() {
  let ok = true;

  const name      = document.getElementById("signup-name");
  const email     = document.getElementById("signup-email");
  const pass      = document.getElementById("signup-password");
  const pass2     = document.getElementById("signup-confirm-password");
  const studentId = document.getElementById("signup-id");
  const course    = document.getElementById("signup-course");
  const year      = document.getElementById("signup-year");
  const section   = document.getElementById("signup-section");
  const terms     = document.getElementById("agree-terms");

  // clear previous errors
  [name, email, pass, pass2, studentId, course, year, section].forEach(clearError);
  document.querySelector(".terms-checkbox")?.classList.remove("is-invalid");

  // required empties
  if (!name.value.trim())                { showError(name, ); ok = false; }
  if (!studentId.value.trim())           { showError(studentId, ); ok = false; }
  if (!email.value.trim())               { showError(email, ); ok = false; }
  if (!course.value)                     { showError(course, ); ok = false; }
  if (!year.value)                       { showError(year, ); ok = false; }
  if (!section.value)                    { showError(section, ); ok = false; }
  if (!pass.value)                       { showError(pass, ); ok = false; }
  if (!pass2.value)                      { showError(pass2, ); ok = false; }

  // formats
  if (email.value && !validateEmailFormat(email.value.trim())) {
    showError(email, "Enter a valid email");
    ok = false;
  }

  // student ID pattern already on the input; we can check it here too
  if (studentId.value && !/^[0-9\-]{5,20}$/.test(studentId.value.trim())) {
    showError(studentId, "");
    ok = false;
  }

  // password checks
  if (pass.value && pass.value.length < 8) {
    showError(pass, "Use at least 8 characters");
    ok = false;
  }
  if (pass.value && pass2.value && pass.value !== pass2.value) {
    showError(pass2, "Passwords do not match");
    ok = false;
  }

  // terms
  if (!terms.checked) {
    document.querySelector(".terms-checkbox")?.classList.add("is-invalid");
    ok = false;
  }

  return ok;
}

// optional: live validation as users type/choose
document.querySelectorAll("#signup-form .form-control").forEach((el) => {
  el.addEventListener("input", () => {
    if (el.classList.contains("is-invalid")) clearError(el);
  });
  el.addEventListener("change", () => {
    if (el.classList.contains("is-invalid")) clearError(el);
  });
});

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // stop here if invalid; fields will be highlighted red
    if (!validateSignup()) {
      // move focus to first invalid input for accessibility
      const firstInvalid = signupForm.querySelector(".is-invalid");
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const name      = document.getElementById("signup-name")?.value.trim() || "";
    const email     = document.getElementById("signup-email")?.value.trim() || "";
    const pass      = document.getElementById("signup-password")?.value || "";
    const studentId = document.getElementById("signup-id")?.value.trim() || "";
    const course    = document.getElementById("signup-course")?.value || "";
    const year      = document.getElementById("signup-year")?.value || "";
    const section   = document.getElementById("signup-section")?.value || "";

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) await updateProfile(cred.user, { displayName: name });

      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        role: "student",
        name,
        email,
        studentId,
        course,
        year,
        section,
        createdAt: serverTimestamp(),
      });

      sessionStorage.setItem("stayOnAuthOnce", "1");
      await signOut(auth).catch(() => {});
      window.location.href = "auth.html#student?after=signup";
    } catch (err) {
      console.error("[auth.js] signup error:", err?.code, err?.message);
      alert(err?.message || "Sign up failed. Please try again.");
    }
  });
}


/* ================================
   LOGIN
   ================================ */
const loginForm = document.getElementById("login-form");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email")?.value.trim() || "";
    const pass  = document.getElementById("login-password")?.value || "";

    const remember = document.getElementById("remember-me");
    if (remember?.checked) {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (err) {
        console.warn("[auth.js] setPersistence failed:", err?.message || err);
      }
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      // Clear the one-shot flag if it still exists
      sessionStorage.removeItem("stayOnAuthOnce");
      await goToDashboard(cred.user);
    } catch (err) {
      console.error("[auth.js] login error:", err?.code, err?.message);
      alert(err?.message || "Login failed. Please try again.");
    }
  });
}

/* ================================
   Auto-redirect if already logged in
   (ONLY when we are on auth.html / index)
   ================================ */
onAuthStateChanged(auth, async (user) => {
  const path = location.pathname.toLowerCase();
  const isAuthPage =
    path.endsWith("auth.html") ||
    path.endsWith("/") ||
    path.endsWith("index.html");

  if (!isAuthPage || !user) return;

  // If we just came from a signup, DO NOT redirect to dashboard.
  const stayOnce = sessionStorage.getItem("stayOnAuthOnce") === "1";
  const urlHasAfterSignup = (new URLSearchParams(location.search)).get("after") === "signup";

  if (stayOnce || urlHasAfterSignup) {
    // Extra safety: ensure logged out so the login form is shown
    try { await signOut(auth); } catch {}
    sessionStorage.removeItem("stayOnAuthOnce");
    return; // stay on auth.html (login tab)
  }

  // Otherwise, user is already authenticated and just opened auth.html → go to dashboard
  try {
    await goToDashboard(user);
  } catch {
    // ignore; goToDashboard handles fallback
  }
});
