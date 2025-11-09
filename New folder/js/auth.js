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
   Destinations
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
   SIGN UP (students)
   ================================ */
const signupForm = document.getElementById("signup-form");

function clearError(el) {
  el.classList.remove("is-invalid");
  el.removeAttribute("aria-invalid");
  el.parentElement?.querySelector(".field-error")?.remove();
}
function showError(el, message) {
  el.classList.add("is-invalid");
  el.setAttribute("aria-invalid", "true");
  el.parentElement?.querySelector(".field-error")?.remove();
  const p = document.createElement("div");
  p.className = "field-error";
  p.textContent = message || "This field is required";
  el.parentElement.appendChild(p);
}
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

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

  [name,email,pass,pass2,studentId,course,year,section].forEach(clearError);

  if (!name.value.trim())      { showError(name); ok = false; }
  if (!studentId.value.trim()) { showError(studentId); ok = false; }
  if (!email.value.trim())     { showError(email); ok = false; }
  if (!course.value)           { showError(course); ok = false; }
  if (!year.value)             { showError(year); ok = false; }
  if (!section.value)          { showError(section); ok = false; }
  if (!pass.value)             { showError(pass); ok = false; }
  if (!pass2.value)            { showError(pass2); ok = false; }

  if (email.value && !validEmail(email.value.trim())) {
    showError(email, "Enter a valid email"); ok = false;
  }
  if (studentId.value && !/^[0-9\-]{5,20}$/.test(studentId.value.trim())) {
    showError(studentId, "Use digits and dashes only"); ok = false;
  }
  if (pass.value && pass.value.length < 8) {
    showError(pass, "Use at least 8 characters"); ok = false;
  }
  if (pass.value && pass2.value && pass.value !== pass2.value) {
    showError(pass2, "Passwords do not match"); ok = false;
  }
  if (!terms.checked) {
    document.querySelector(".terms-checkbox")?.classList.add("is-invalid"); ok = false;
  }
  return ok;
}

document.querySelectorAll("#signup-form .form-control").forEach((el) => {
  el.addEventListener("input", () => el.classList.contains("is-invalid") && clearError(el));
  el.addEventListener("change", () => el.classList.contains("is-invalid") && clearError(el));
});

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateSignup()) {
      signupForm.querySelector(".is-invalid")?.focus();
      return;
    }

    // Collect + normalize
    const nameRaw      = document.getElementById("signup-name")?.value ?? "";
    const emailRaw     = document.getElementById("signup-email")?.value ?? "";
    const pass         = document.getElementById("signup-password")?.value ?? "";
    const studentIdRaw = document.getElementById("signup-id")?.value ?? "";
    const courseRaw    = document.getElementById("signup-course")?.value ?? "";
    const yearRaw      = document.getElementById("signup-year")?.value ?? "";
    const sectionRaw   = document.getElementById("signup-section")?.value ?? "";

    const name      = nameRaw.trim();
    const email     = emailRaw.trim();
    const studentId = studentIdRaw.trim();
    const course    = courseRaw.trim().toUpperCase();   // e.g. BSIT
    const year      = String(yearRaw).trim();           // keep as string for UI dropdown
    const section   = sectionRaw.trim().toUpperCase();  // e.g. A/B/C

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) await updateProfile(cred.user, { displayName: name });

      // Write full profile immediately so the Student Profile page has data on first login
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        role: "student",

        // Identity
        name,
        email,

        // Student profile fields (two keys for compatibility with readers)
        studentId,
        studentIdNumber: studentId,

        // Academic info
        course,     // "BSIT"
        year,       // "1" | "2" | ...
        section,    // "A" | "B" | ...

        // Helpful extras
        searchName: name.toLowerCase(),
        createdAt: serverTimestamp(),
      }, { merge: true });

      // Sign out to return to login
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
      try { await setPersistence(auth, browserLocalPersistence); } 
      catch (err) { console.warn("[auth.js] setPersistence failed:", err?.message || err); }
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      sessionStorage.removeItem("stayOnAuthOnce");
      await goToDashboard(cred.user);
    } catch (err) {
      console.error("[auth.js] login error:", err?.code, err?.message);
      alert(err?.message || "Login failed. Please try again.");
    }
  });
}

/* ================================
   Auto-redirect if already logged in (only on auth/index)
   ================================ */
onAuthStateChanged(auth, async (user) => {
  const path = location.pathname.toLowerCase();
  const isAuthPage = path.endsWith("auth.html") || path.endsWith("/") || path.endsWith("index.html");
  if (!isAuthPage || !user) return;

  const stayOnce = sessionStorage.getItem("stayOnAuthOnce") === "1";
  const urlHasAfterSignup = (new URLSearchParams(location.search)).get("after") === "signup";
  if (stayOnce || urlHasAfterSignup) {
    try { await signOut(auth); } catch {}
    sessionStorage.removeItem("stayOnAuthOnce");
    return; // stay on login tab
  }

  try { await goToDashboard(user); } catch {}
});
