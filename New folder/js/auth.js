// js/auth.js (fixed: normalize year so admin table shows correct Year & Student ID)
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

/* ================================ */
const ADMIN_DASHBOARD   = "admin-dashboard.html";
const TEACHER_DASHBOARD = "teacher-dashboard.html";
const STUDENT_DASHBOARD = "student-dashboard.html";

/* ================================ */
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
  } catch {
    redirectByRole("student");
  }
}

/* ================================ */
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
  const existing = el.parentElement.querySelector(".field-error");
  if (existing) existing.remove();
  const p = document.createElement("div");
  p.className = "field-error";
  p.textContent = message || "Required";
  el.parentElement.appendChild(p);
}
function validateEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// normalize year label -> "1".."5"
function yearKey(label) {
  const v = String(label||"");
  const m = v.match(/^(\d)/);
  if (m) return m[1];
  const low = v.toLowerCase();
  if (low.includes("first")) return "1";
  if (low.includes("second")) return "2";
  if (low.includes("third")) return "3";
  if (low.includes("fourth")) return "4";
  if (low.includes("fifth")) return "5";
  return v.replace(/[^0-9]/g,"") || "";
}

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name      = document.getElementById("signup-name")?.value.trim() || "";
    const email     = document.getElementById("signup-email")?.value.trim() || "";
    const pass      = document.getElementById("signup-password")?.value || "";
    const pass2     = document.getElementById("signup-confirm-password")?.value || "";
    const studentId = document.getElementById("signup-id")?.value.trim() || "";
    const course    = document.getElementById("signup-course")?.value || "";
    const yearLabel = document.getElementById("signup-year")?.value || "";
    const section   = document.getElementById("signup-section")?.value || "";

    // quick validation
    let ok = true;
    const req = (el, msg) => { if (!el?.value?.trim()) { showError(el, msg); ok = false; } };
    req(document.getElementById("signup-name"));
    req(document.getElementById("signup-email"));
    req(document.getElementById("signup-password"));
    req(document.getElementById("signup-confirm-password"));
    req(document.getElementById("signup-id"));
    req(document.getElementById("signup-course"));
    req(document.getElementById("signup-year"));
    req(document.getElementById("signup-section"));
    if (email && !validateEmailFormat(email)) { showError(document.getElementById("signup-email"), "Enter a valid email"); ok = false; }
    if (pass && pass.length < 8) { showError(document.getElementById("signup-password"), "Use at least 8 characters"); ok = false; }
    if (pass && pass2 && pass !== pass2) { showError(document.getElementById("signup-confirm-password"), "Passwords do not match"); ok = false; }
    if (!ok) return;

    const year = yearKey(yearLabel); // store canonical "1".."5"

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) await updateProfile(cred.user, { displayName: name });

      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        role: "student",
        name,
        email,
        studentId,            // <-- exact key used by admin.js
        course,
        year,                 // <-- normalized number-like string
        section,
        createdAt: serverTimestamp(),
      }, { merge: true });

      // let them log in fresh
      await signOut(auth).catch(()=>{});
      window.location.href = "auth.html#student?after=signup";
    } catch (err) {
      console.error("[auth.js] signup error:", err?.code, err?.message);
      alert(err?.message || "Sign up failed. Please try again.");
    }
  });
}

/* ================================ LOGIN ================================ */
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email")?.value.trim() || "";
    const pass  = document.getElementById("login-password")?.value || "";
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await goToDashboard(cred.user);
    } catch (err) {
      console.error("[auth.js] login error:", err?.code, err?.message);
      alert(err?.message || "Login failed. Please try again.");
    }
  });
}

/* ================================ Auto-redirect (auth page only) ================================ */
onAuthStateChanged(auth, async (user) => {
  const path = location.pathname.toLowerCase();
  const isAuthPage = path.endsWith("auth.html") || path.endsWith("/") || path.endsWith("index.html");
  if (!isAuthPage || !user) return;

  try { await goToDashboard(user); } catch {}
});
