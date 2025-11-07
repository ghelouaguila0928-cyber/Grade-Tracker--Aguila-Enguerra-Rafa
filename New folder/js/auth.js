// js/auth.js
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ---------- Config: dashboard destinations ---------- */
const ADMIN_DASHBOARD = "admin-dashboard.html";
const TEACHER_DASHBOARD = "teacher-dashboard.html";
const STUDENT_DASHBOARD = "student-dashboard.html";

/* ---------- Role helpers ---------- */
function redirectByRole(role) {
  switch ((role || "student").toLowerCase()) {
    case "admin":
      window.location.href = ADMIN_DASHBOARD;
      break;
    case "teacher":
      window.location.href = TEACHER_DASHBOARD;
      break;
    default:
      window.location.href = STUDENT_DASHBOARD;
  }
}

/**
 * Decide where to go after login/signup.
 * 1) Try custom claims: token.claims.admin / token.claims.teacher
 * 2) Fallback to Firestore users/{uid}.role
 */
async function goToDashboard(user) {
  try {
    // 1) Custom claims (most secure, if you're setting them via Admin SDK)
    const token = await user.getIdTokenResult(true); // force-refresh to pick up fresh claims
    const claims = token.claims || {};

    if (claims.admin === true) {
      redirectByRole("admin");
      return;
    }
    if (claims.teacher === true) {
      redirectByRole("teacher");
      return;
    }

    // 2) Firestore fallback
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn(`[auth.js] users/${user.uid} not found, defaulting to student`);
      redirectByRole("student");
      return;
    }

    const role = (snap.data()?.role || "student").toLowerCase();
    redirectByRole(role);
  } catch (err) {
    console.error("[auth.js] goToDashboard failed:", err.code, err.message);
    redirectByRole("student");
  }
}

/* ---------- SIGNUP (students only) ---------- */
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const pass = document.getElementById("signup-password").value;
    const pass2 = document.getElementById("signup-confirm-password").value;

    if (pass !== pass2) {
      alert("Passwords do not match");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);

      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }

      // 🔒 Enforce student-only signups on the client
      const role = "student";

      // Create Firestore user doc
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        name: name || "",
        email,
        role, // "student"
        createdAt: serverTimestamp(),
      });

      await goToDashboard(cred.user);
    } catch (err) {
      console.error("[auth.js] signup error:", err.code, err.message);
      alert(err.message);
    }
  });

  // If you happen to have role buttons in the UI, ignore them (student-only signups).
  const roleOptions = document.querySelectorAll(".role-option");
  roleOptions.forEach((opt) => {
    opt.addEventListener("click", () => {
      roleOptions.forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      // intentionally not changing role; signups are student-only
    });
  });
}

/* ---------- LOGIN ---------- */
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-password").value;

    // Optional "Remember me" support if you have the checkbox in your HTML
    const remember = document.getElementById("remember-me");
    if (remember?.checked) {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (err) {
        console.warn("[auth.js] setPersistence failed, continuing with default:", err?.message || err);
      }
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await goToDashboard(cred.user);
    } catch (err) {
      console.error("[auth.js] login error:", err.code, err.message);
      alert(err.message);
    }
  });
}

/* ---------- (Optional) Auto-redirect if already logged in ---------- */
onAuthStateChanged(auth, async (user) => {
  // Only auto-redirect on the auth page(s)
  const isAuthPage =
    location.pathname.endsWith("login.html") ||
    location.pathname.endsWith("/") ||
    location.pathname.endsWith("index.html");

  if (!isAuthPage || !user) return;

  try {
    await goToDashboard(user);
  } catch {
    // ignore; goToDashboard already handles fallback
  }
});

export { goToDashboard };
