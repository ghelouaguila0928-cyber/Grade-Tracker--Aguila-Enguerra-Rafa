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
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ================================ Destinations ================================ */
const ADMIN_DASHBOARD = "admin-dashboard.html";
const TEACHER_DASHBOARD = "teacher-dashboard.html";
const STUDENT_DASHBOARD = "student-dashboard.html";

/* ================================ Flags ================================ */
// Ginagamit para HUWAG auto-redirect sa portal habang nag-si-signup
const SIGNUP_SUPPRESS_KEY = "__signupSuppressRedirect";

/* ================================ Loading overlay helpers ================================ */
const overlayEl = document.getElementById("loading-overlay");
const successEl = overlayEl?.querySelector(".success-check");

function showLoading() {
  if (!overlayEl) return;
  successEl?.classList.add("hidden");
  overlayEl.hidden = false;
  overlayEl.classList.remove("portal-animation");
  overlayEl.setAttribute("aria-busy", "true");
}

function showSuccessThenHide(ms = 700) {
  if (!overlayEl) return;
  successEl?.classList.remove("hidden");
  overlayEl.setAttribute("aria-busy", "false");
  overlayEl.classList.remove("portal-animation");
  setTimeout(() => {
    overlayEl.hidden = true;
  }, ms);
}

function hideLoading() {
  if (!overlayEl) return;
  overlayEl.hidden = true;
  overlayEl.removeAttribute("aria-busy");
  successEl?.classList.add("hidden");
  overlayEl.classList.remove("portal-animation");
}

/* -------- NEW: Portal animation + redirect helper -------- */
function showSuccessAndRedirect(targetHref, delay = 800) {
  if (!targetHref) return;

  if (overlayEl) {
    // Make sure overlay is visible
    overlayEl.hidden = false;
    overlayEl.setAttribute("aria-busy", "false");
    // Show success check icon
    successEl?.classList.remove("hidden");
    // Add CSS hook for portal animation
    overlayEl.classList.add("portal-animation");
  }

  // Small delay for animation, then go to dashboard
  setTimeout(() => {
    window.location.href = targetHref;
  }, delay);
}

/* ================================ Role helpers ================================ */
function redirectByRole(role) {
  const normalized = (role || "student").toLowerCase();
  let target = STUDENT_DASHBOARD;

  switch (normalized) {
    case "admin":
      target = ADMIN_DASHBOARD;
      break;
    case "teacher":
      target = TEACHER_DASHBOARD;
      break;
    default:
      target = STUDENT_DASHBOARD;
  }

  // Instead of instant redirect, play portal animation then enter portal
  showSuccessAndRedirect(target);
}

export async function goToDashboard(user) {
  try {
    const token = await user.getIdTokenResult(true);
    const claims = token.claims || {};
    if (claims.admin === true) return redirectByRole("admin");
    if (claims.teacher === true) return redirectByRole("teacher");

    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const role = (
      snap.exists() ? snap.data().role || "student" : "student"
    ).toLowerCase();
    redirectByRole(role);
  } catch (err) {
    console.error("[auth.js] goToDashboard failed:", err?.code, err?.message);
    redirectByRole("student");
  }
}

async function getEffectiveRole(user) {
  const token = await user.getIdTokenResult(true);
  const claims = token.claims || {};
  if (claims.admin === true) return "admin";
  if (claims.teacher === true) return "teacher";

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const role = (
    snap.exists() ? snap.data().role || "student" : "student"
  ).toLowerCase();
  return role;
}

/* -------- single source of truth for the wanted role (active tab) -------- */
function getWantedRole() {
  const activeTab = document.querySelector(".auth-tab.active");
  if (activeTab?.dataset?.role) return activeTab.dataset.role.toLowerCase();

  const htmlRole = document.documentElement.dataset?.activeRole;
  if (htmlRole) return htmlRole.toLowerCase();

  return "student";
}

/* ================================ READY-LOGIN MODAL ================================ */
/* Ito yung animation/modal sa gitna after signup */
const readyLoginModal = document.getElementById("readyLoginModal");
const readyLoginBtn = document.getElementById("readyLoginBtn");

// Gawing green yung "Continue to Log In" button
if (readyLoginBtn) {
  readyLoginBtn.style.backgroundColor = "#16a34a"; // green
  readyLoginBtn.style.borderColor = "#16a34a";
  readyLoginBtn.style.color = "#ffffff";
}

function openReadyModal() {
  if (!readyLoginModal) return;
  readyLoginModal.hidden = false;
  readyLoginModal.classList.add("active");
}

function closeReadyModal() {
  if (!readyLoginModal) return;
  readyLoginModal.classList.remove("active");
  setTimeout(() => {
    readyLoginModal.hidden = true;
  }, 200);
}

// function declaration para hoisted (ginagamit sa click)
function setActiveRole(role) {
  const tabs = document.querySelectorAll(".auth-tab");
  const normalized = (role || "student").toLowerCase();

  tabs.forEach((t) => {
    const active = (t.dataset.role || "").toLowerCase() === normalized;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });

  document.documentElement.dataset.activeRole = normalized;

  document.querySelectorAll("[data-only]").forEach((el) => {
    el.style.display =
      (el.dataset.only || "").toLowerCase() === normalized ? "" : "none";
  });
}

/* ================================ Signup modal ================================ */
const signupFloat = document.getElementById("signup-float");

function closeSignupFloat() {
  if (!signupFloat) return;
  signupFloat.classList.remove("active");
  setTimeout(() => (signupFloat.hidden = true), 300);
}

// CLICK: Continue to Log In
readyLoginBtn?.addEventListener("click", () => {
  // 1) gawin active yung STUDENT tab
  setActiveRole("student");

  // 2) isara modal
  closeReadyModal();

  // 3) isara rin yung SIGNUP FLOAT para lumabas na yung login form
  closeSignupFloat();

  // 4) focus sa email field ng login
  const emailEl = document.getElementById("login-email");
  if (emailEl) {
    emailEl.focus();
    emailEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

/* ================================ SIGN UP ================================ */
const signupForm = document.getElementById("signup-form");

function clearError(el) {
  const group = el.closest(".form-group") || el.parentElement;
  if (!group) return;
  el.classList.remove("is-invalid");
  el.removeAttribute("aria-invalid");
  group.querySelectorAll(".field-error").forEach((n) => n.remove());
}
function showError(el, message) {
  const group = el.closest(".form-group") || el.parentElement;
  if (!group) return;
  el.classList.add("is-invalid");
  el.setAttribute("aria-invalid", "true");
  group.querySelectorAll(".field-error").forEach((n) => n.remove());
  const p = document.createElement("div");
  p.className = "field-error";
  p.textContent = message || "";
  group.appendChild(p);
}
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function validateSignup() {
  let ok = true;
  const name = document.getElementById("signup-name");
  const email = document.getElementById("signup-email");
  const pass = document.getElementById("signup-password");
  const pass2 = document.getElementById("signup-confirm-password");
  const studentId = document.getElementById("signup-id");
  const course = document.getElementById("signup-course");
  const year = document.getElementById("signup-year");
  const section = document.getElementById("signup-section");
  const terms = document.getElementById("agree-terms");

  [name, email, pass, pass2, studentId, course, year, section].forEach(
    clearError
  );
  document.querySelector(".terms-checkbox")?.classList.remove("is-invalid");

  if (!name.value.trim()) {
    showError(name, "");
    ok = false;
  }
  if (!studentId.value.trim()) {
    showError(studentId, "");
    ok = false;
  }
  if (!email.value.trim()) {
    showError(email, "");
    ok = false;
  }
  if (!course.value) {
    showError(course, "");
    ok = false;
  }
  if (!year.value) {
    showError(year, "");
    ok = false;
  }
  if (!section.value) {
    showError(section, "");
    ok = false;
  }
  if (!pass.value) {
    showError(pass, "");
    ok = false;
  }
  if (!pass2.value) {
    showError(pass2, "");
    ok = false;
  }

  if (email.value && !validEmail(email.value.trim())) {
    showError(email, "Enter a valid email");
    ok = false;
  }
  if (studentId.value && !/^[0-9\-]{5,20}$/.test(studentId.value.trim())) {
    showError(studentId, "Use digits and dashes only");
    ok = false;
  }
  if (pass.value && pass.value.length < 8) {
    showError(pass, "Use at least 8 characters");
    ok = false;
  }
  if (pass.value && pass2.value && pass.value !== pass2.value) {
    showError(pass2, "Passwords do not match");
    ok = false;
  }
  if (!terms.checked) {
    document.querySelector(".terms-checkbox")?.classList.add("is-invalid");
    ok = false;
  }
  return ok;
}

document.querySelectorAll("#signup-form .form-control").forEach((el) => {
  el.addEventListener("input", () => {
    if (el.classList.contains("is-invalid")) clearError(el);
  });
  el.addEventListener("change", () => {
    if (el.classList.contains("is-invalid")) clearError(el);
  });
});
document.getElementById("agree-terms")?.addEventListener("change", (e) => {
  const box = document.querySelector(".terms-checkbox");
  if (box && e.target.checked) box.classList.remove("is-invalid");
});

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateSignup()) {
      signupForm.querySelector(".is-invalid")?.focus();
      return;
    }

    const nameRaw = document.getElementById("signup-name")?.value ?? "";
    const emailRaw = document.getElementById("signup-email")?.value ?? "";
    const pass = document.getElementById("signup-password")?.value ?? "";
    const studentIdRaw = document.getElementById("signup-id")?.value ?? "";
    const courseEl = document.getElementById("signup-course");
    const courseRaw = courseEl?.value ?? "";
    const yearRaw = document.getElementById("signup-year")?.value ?? "";
    const sectionRaw = document.getElementById("signup-section")?.value ?? "";

    const name = nameRaw.trim();
    const email = emailRaw.trim();
    const studentId = studentIdRaw.trim();

    // Course: kunin muna value, kung empty fallback sa label
    let course = courseRaw.trim();
    if (!course && courseEl) {
      const opt = courseEl.options[courseEl.selectedIndex];
      if (opt) {
        course = (opt.textContent || opt.innerText || "").trim();
      }
    }

    const year = String(yearRaw).trim();
    const section = sectionRaw.trim().toUpperCase();

    // Flag: nagsi-signup → huwag auto-redirect sa onAuthStateChanged
    try {
      sessionStorage.setItem(SIGNUP_SUPPRESS_KEY, "1");
    } catch {}

    showLoading();

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);

      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }

      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          uid: cred.user.uid,
          role: "student",
          name,
          email,
          studentId,
          studentIdNumber: studentId,
          course,
          program: course,
          year,
          yearLevel: year,
          section,
          classSection: section,
          searchName: name.toLowerCase(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Logout after signup para hindi siya "logged in"
      await signOut(auth).catch(() => {});

      // Clear suppress flag
      try {
        sessionStorage.removeItem(SIGNUP_SUPPRESS_KEY);
      } catch {}

      hideLoading();

      // Show "Ready to log in" modal sa gitna
      openReadyModal();
    } catch (err) {
      console.error("[auth.js] signup error:", err?.code, err?.message);
      hideLoading();
      try {
        sessionStorage.removeItem(SIGNUP_SUPPRESS_KEY);
      } catch {}
      alert(err?.message || "Sign up failed. Please try again.");
    }
  });
}

/* ================================ Login banner helpers ================================ */
let loginBannerTimer = null;
let loginBannerSticky = false;
const LOGIN_BANNER_KEY = "__loginBannerMsg";

function setLoginBanner(message, { persistMs = 0, sticky = false } = {}) {
  const host = document.getElementById("login-banner-host");
  if (!host) return;

  if (loginBannerTimer) {
    clearTimeout(loginBannerTimer);
    loginBannerTimer = null;
  }

  loginBannerSticky = Boolean(sticky);

  if (message && String(message).trim()) {
    host.textContent = message;
    host.hidden = false;

    try {
      sessionStorage.setItem(LOGIN_BANNER_KEY, message);
    } catch {}

    if (persistMs > 0) {
      loginBannerTimer = setTimeout(() => {
        if (!loginBannerSticky) {
          host.hidden = true;
          host.textContent = "";
          try {
            sessionStorage.removeItem(LOGIN_BANNER_KEY);
          } catch {}
        }
        loginBannerTimer = null;
      }, persistMs);
    }
  } else {
    host.hidden = true;
    host.textContent = "";
    loginBannerSticky = false;
    try {
      sessionStorage.removeItem(LOGIN_BANNER_KEY);
    } catch {}
  }
}

function clearLoginBanner({ force = false } = {}) {
  if (loginBannerSticky && !force) return;
  setLoginBanner("");
}

(function restoreLoginBanner() {
  const host = document.getElementById("login-banner-host");
  if (!host) return;
  try {
    const saved = sessionStorage.getItem(LOGIN_BANNER_KEY);
    if (saved) {
      setLoginBanner(saved, { persistMs: 0, sticky: false });
    }
  } catch {}
})();

/* ================================ LOGIN ================================ */
const loginForm = document.getElementById("login-form");
let loginBusy = false;

if (loginForm) {
  const loginSubmitBtn = loginForm.querySelector('button[type="submit"]');

  // Prevent Enter from re-submitting while busy
  loginForm.addEventListener("keydown", (e) => {
    if (loginBusy && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (loginBusy) return;
    loginBusy = true;
    loginSubmitBtn?.setAttribute("disabled", "true");

    const emailEl = document.getElementById("login-email");
    const passEl = document.getElementById("login-password");
    const email = emailEl?.value.trim() || "";
    const pass = passEl?.value || "";

    [emailEl, passEl].forEach((el) => el && clearError(el));
    clearLoginBanner();

    const remember = document.getElementById("remember-me");
    if (remember?.checked) {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (err) {
        console.warn(
          "[auth.js] setPersistence failed:",
          err?.message || err
        );
      }
    }

    showLoading();

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);

      const wantedRole = getWantedRole();
      const actualRole = await getEffectiveRole(cred.user);
      if (actualRole !== wantedRole) {
        await signOut(auth).catch(() => {});
        hideLoading();
        setLoginBanner(
          `This account is for ${actualRole.toUpperCase()}. Please use the ${actualRole} tab to log in.`,
          { persistMs: 8000 }
        );
        return;
      }

      // NOTE: redirect + portal animation happens inside redirectByRole()
      await goToDashboard(cred.user);
    } catch (err) {
      hideLoading();

      const code = String(err?.code || "");
      let bannerMsg = "";
      let focused = false;
      const flag = (el, msg) => {
        if (!el) return;
        showError(el, msg);
        el.classList.remove("shake");
        el.offsetHeight;
        el.classList.add("shake");
        if (!focused) {
          el.focus();
          focused = true;
        }
      };

      switch (code) {
        case "auth/invalid-email":
          flag(emailEl, "Enter a valid email address");
          bannerMsg = "Please check your email format.";
          break;
        case "auth/missing-password":
          flag(passEl, "Password is required");
          bannerMsg = "Please enter your password.";
          break;
        case "auth/invalid-credential":
        case "auth/wrong-password":
          flag(passEl, "Incorrect email or password");
          bannerMsg =
            "Incorrect email or password. Please try again.";
          break;
        case "auth/user-not-found":
          flag(emailEl, "No account found with that email");
          bannerMsg = "We couldn't find an account with that email.";
          break;
        case "auth/too-many-requests":
          flag(passEl, "Too many attempts. Try again later.");
          bannerMsg =
            "Your account is temporarily locked due to too many failed attempts. Try again later or reset your password.";
          break;
        case "auth/network-request-failed":
          bannerMsg =
            "Network error. Check your internet connection and try again.";
          break;
        default:
          if (!email) flag(emailEl, "Enter your email");
          if (!pass) flag(passEl, "Enter your password");
          if (email && pass)
            flag(
              passEl,
              "Unable to log in. Please check your credentials."
            );
          bannerMsg = err?.message || "Login failed. Please try again.";
      }

      setLoginBanner(bannerMsg, { persistMs: 8000 });
      console.error("[auth.js] login error:", code, err?.message);
    } finally {
      loginBusy = false;
      loginSubmitBtn?.removeAttribute("disabled");
    }
  });
}

/* ================================ Auto-redirect on auth page ================================ */
onAuthStateChanged(auth, async (user) => {
  const path = location.pathname.toLowerCase();
  const isAuthPage =
    path.endsWith("auth.html") ||
    path.endsWith("/") ||
    path.endsWith("index.html");

  if (!isAuthPage) return;

  // Check kung naka-suppress redirect (signup flow)
  let suppress = false;
  try {
    suppress = sessionStorage.getItem(SIGNUP_SUPPRESS_KEY) === "1";
  } catch {
    suppress = false;
  }

  // Kung nasa signup flow tayo, huwag auto-redirect kahit may user
  if (suppress) {
    hideLoading();
    return;
  }

  // Normal behavior: kapag may user at nasa auth page → diretso portal
  if (user) {
    showLoading();
    // Redirect + portal animation handled inside goToDashboard / redirectByRole
    await goToDashboard(user);
  }
});

/* ================================ Tabs (role selector) ================================ */
const tabs = document.querySelectorAll(".auth-tab");
tabs.forEach((t) =>
  t.addEventListener("click", () => setActiveRole(t.dataset.role))
);
// default: student
setActiveRole("student");

/* ================================ Signup modal (open/close) ================================ */
document.getElementById("open-signup")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!signupFloat) return;
  signupFloat.hidden = false;
  setTimeout(() => signupFloat.classList.add("active"), 10);
});

signupFloat
  ?.querySelectorAll(".close-float")
  .forEach((btn) =>
    btn.addEventListener("click", () => {
      closeSignupFloat();
    })
  );

/* ================================ Password toggles ================================ */
document.querySelectorAll(".password-wrapper").forEach((wrapper) => {
  const btns = wrapper.querySelectorAll(".icon-btn");
  if (btns.length > 1)
    btns.forEach((b, i) => {
      if (i > 0) b.remove();
    });

  const input = wrapper.querySelector("input");
  const btn = wrapper.querySelector(".icon-btn");
  if (!input || !btn) return;

  let icon = btn.querySelector("i");
  if (!icon) {
    icon = document.createElement("i");
    icon.className = "fas fa-eye";
    btn.appendChild(icon);
  } else {
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }

  const updateVisibility = () =>
    btn.classList.toggle("invisible", input.value.trim().length === 0);
  updateVisibility();
  input.addEventListener("input", updateVisibility);
  input.addEventListener("blur", updateVisibility);
  input.addEventListener("focus", updateVisibility);

  btn.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    icon.classList.toggle("fa-eye", !show);
    icon.classList.toggle("fa-eye-slash", show);
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute(
      "aria-label",
      show ? "Hide password" : "Show password"
    );
    input.focus();
  });
});

/* ================================ Forgot Password Modal ================================ */
const forgotModal = document.getElementById("forgot-modal");

document.querySelector(".link-primary")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!forgotModal) return;
  forgotModal.hidden = false;
  setTimeout(() => forgotModal.classList.add("active"), 10);
});

forgotModal
  ?.querySelectorAll(".close-forgot")
  .forEach((btn) =>
    btn.addEventListener("click", () => {
      forgotModal.classList.remove("active");
      setTimeout(() => (forgotModal.hidden = true), 300);
    })
  );

/* ================================ Forgot Password Form ================================ */
const forgotForm = document.getElementById("forgot-form");
if (forgotForm) {
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emailEl = document.getElementById("forgot-email");
    const email = emailEl?.value.trim();

    if (!email) {
      emailEl.classList.add("is-invalid");
      return;
    }

    showLoading();

    try {
      await sendPasswordResetEmail(auth, email);

      showSuccessThenHide(600);

      alert("A password reset link has been sent to your email.");

      forgotModal.classList.remove("active");
      setTimeout(() => (forgotModal.hidden = true), 300);
    } catch (err) {
      hideLoading();

      console.error("Reset error:", err?.code, err?.message);

      if (err.code === "auth/user-not-found") {
        alert("No account exists with that email.");
      } else if (err.code === "auth/invalid-email") {
        alert("Please enter a valid email.");
      } else {
        alert("Failed to send reset email. Try again.");
      }
    }
  });
}
