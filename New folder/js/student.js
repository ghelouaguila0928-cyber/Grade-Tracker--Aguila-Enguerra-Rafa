// js/student.js
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// -------------------- UI refs --------------------
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");
const pageTitle = document.getElementById("pageTitle");
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebar");

const sidebarNameEl = document.getElementById("sidebarName");
const sidebarRoleEl = document.getElementById("sidebarRole"); // shows "ID: ..."

const profileNameEl = document.getElementById("profileStudentName");
const profileIdSubtitleEl = document.getElementById("profileStudentIdSubtitle");
const profileIdInputEl = document.getElementById("profileStudentIdInput");
const profileNameInputEl = document.getElementById("profileName");
const profileEmailInputEl = document.getElementById("profileEmail");

const modalOverlay = document.getElementById("modalOverlay");
const gradeDetailsModal = document.getElementById("gradeDetailsModal");
const gradeDetailsContent = document.getElementById("gradeDetailsContent");

const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");
const logoutBtn = document.getElementById("logoutBtn");

// Password form
const passwordForm = document.getElementById("passwordForm");
const currentPasswordEl = document.getElementById("currentPassword");
const newPasswordEl = document.getElementById("newPassword");
const confirmPasswordEl = document.getElementById("confirmPassword");

function showToast(msg, type = "success") {
  if (!toast) { alert(msg); return; }
  toastMessage.textContent = msg;
  toast.classList.remove("error");
  if (type === "error") toast.classList.add("error");
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show", "error"); }, 2500);
}

function showPage(id) {
  pages.forEach((p) => p.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  if (pageTitle) {
    const titleText = {
      grades: 'My Grades',
      schedule: 'Class Schedule',
      messages: 'Messages',
      profile: 'Profile & Settings'
    }[id] || id;
    pageTitle.textContent = titleText;
  }
}

function openModal(el) {
  if (!el) return;
  el.classList.add("active");
  if (modalOverlay) modalOverlay.classList.add("active");
}
function closeModals() {
  document.querySelectorAll(".modal.active").forEach((m) => m.classList.remove("active"));
  if (modalOverlay) modalOverlay.classList.remove("active");
}

// -------------------- nav events --------------------
navItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    navItems.forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    showPage(item.dataset.page);
  });
});

// sidebar toggle
if (toggleSidebarBtn && sidebar) {
  toggleSidebarBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });
}

// modal close
document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", closeModals);
});
if (modalOverlay) {
  modalOverlay.addEventListener("click", closeModals);
}

function formatDate(ts) {
  if (!ts) return "—";
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString();
  return new Date(ts).toLocaleDateString();
}

// -------------------- helpers: name & studentId --------------------
function applyNameToUI(name) {
  const displayName = name || "Student";

  document.querySelectorAll(".user-name").forEach(el => el.textContent = displayName);
  if (profileNameEl) profileNameEl.textContent = displayName;

  // avatars (sidebar + profile) with initials
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  document.querySelectorAll(".user-avatar, .avatar-large").forEach(el => {
    el.textContent = initials || "ST";
  });
}

function applyStudentIdToUI(studentId) {
  const idText = studentId ? `ID: ${studentId}` : "ID: —";
  if (sidebarRoleEl) sidebarRoleEl.textContent = idText;
  if (profileIdSubtitleEl) profileIdSubtitleEl.textContent = idText.replace("ID: ", "Student ID: ");
  if (profileIdInputEl && studentId) profileIdInputEl.value = studentId;
}

// Prefer a single canonical field, but accept legacy names too
function extractStudentId(docData) {
  if (!docData) return null;
  return (
    docData.studentId ||
    docData.student_id ||
    docData.idNumber ||
    docData.id_number ||
    (docData.profile && (docData.profile.studentId || docData.profile.idNumber)) ||
    null
  );
}

// -------------------- data loaders --------------------
async function loadRecentGrades(uid) {
  const tbody = document.getElementById("recentGradesTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  try {
    const q = query(
      collection(db, "grades"),
      where("studentId", "==", uid), // if you actually store by UID; change to studentIdNumber if needed
      orderBy("date", "desc"),
      limit(5)
    );
    const snap = await getDocs(q);
    let html = "";
    snap.forEach((d) => {
      const g = d.data();
      html += `
        <tr>
          <td>${g.subject || "-"}</td>
          <td>${g.assignment || "-"}</td>
          <td>${g.grade ?? "-"}</td>
          <td>${formatDate(g.date)}</td>
          <td><span class="badge ${g.status === "Passed" || g.status === "Graded" ? "badge-success" : "badge-warning"}">${g.status || "—"}</span></td>
          <td><button class="btn btn-secondary btn-sm" data-grade-id="${d.id}"><i class="fas fa-eye"></i> View</button></td>
        </tr>
      `;
    });
    if (!html) html = `<tr><td colspan="6">No grades yet.</td></tr>`;
    tbody.innerHTML = html;
    tbody.querySelectorAll("[data-grade-id]").forEach((btn) => {
      btn.addEventListener("click", () => openGradeDetails(btn.dataset.gradeId));
    });
  } catch (err) {
    console.error("loadRecentGrades:", err);
    tbody.innerHTML = `<tr><td colspan="6">Failed to load (offline?)</td></tr>`;
    showToast("Cannot load grades. Check internet / Firestore rules.", "error");
  }
}

async function openGradeDetails(gradeId) {
  try {
    const snap = await getDoc(doc(db, "grades", gradeId));
    if (!snap.exists()) {
      showToast("Grade not found", "error");
      return;
    }
    const g = snap.data();
    if (gradeDetailsContent) {
      gradeDetailsContent.innerHTML = `
        <p><strong>Subject:</strong> ${g.subject || "-"}</p>
        <p><strong>Assignment:</strong> ${g.assignment || "-"}</p>
        <p><strong>Grade:</strong> ${g.grade ?? "-"}</p>
        <p><strong>Status:</strong> ${g.status || "-"}</p>
        <p><strong>Date:</strong> ${formatDate(g.date)}</p>
        <p><strong>Comments:</strong> ${g.comments || "—"}</p>
      `;
    }
    openModal(gradeDetailsModal);
  } catch (err) {
    console.error("openGradeDetails:", err);
    showToast("Cannot load grade details (offline)", "error");
  }
}

async function loadUpcomingAssignments(uid) {
  const tbody = document.getElementById("upcomingAssignmentsTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  try {
    const q = query(
      collection(db, "assignments"),
      where("studentId", "==", uid), // adjust if you filter by studentIdNumber instead
      orderBy("dueDate", "asc"),
      limit(5)
    );
    const snap = await getDocs(q);
    let html = "";
    snap.forEach((d) => {
      const a = d.data();
      const cls =
        a.priority === "High" ? "badge-danger"
        : a.priority === "Medium" ? "badge-warning"
        : "badge-info";
      html += `
        <tr>
          <td>${a.subject || "-"}</td>
          <td>${a.title || "-"}</td>
          <td>${formatDate(a.dueDate)}</td>
          <td><span class="badge ${cls}">${a.priority || "Normal"}</span></td>
          <td>
            <div class="progress-bar" style="width:120px;">
              <div class="progress-fill" style="width:${a.progress || 0}%"></div>
            </div>
          </td>
          <td><button class="btn btn-secondary btn-sm">Details</button></td>
        </tr>
      `;
    });
    if (!html) html = `<tr><td colspan="6">No upcoming assignments.</td></tr>`;
    tbody.innerHTML = html;
  } catch (err) {
    console.error("loadUpcomingAssignments:", err);
    tbody.innerHTML = `<tr><td colspan="6">Failed to load (offline?)</td></tr>`;
    showToast("Cannot load assignments. Check internet / Firestore rules.", "error");
  }
}

// -------------------- auth, profile & password --------------------
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "auth.html";
  });
}

// Fill profile form & UI
function hydrateProfileUI(userDoc, user) {
  const name = userDoc?.name || user?.displayName || "Student";
  const email = user?.email || userDoc?.email || "";
  const studentId = extractStudentId(userDoc);

  applyNameToUI(name);
  applyStudentIdToUI(studentId);

  if (profileNameInputEl) profileNameInputEl.value = name;
  if (profileEmailInputEl && email) profileEmailInputEl.value = email;
  if (profileIdInputEl && studentId) profileIdInputEl.value = studentId;
}

// Save profile (name + studentId)
document.getElementById("profileForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  try {
    const name = profileNameInputEl?.value?.trim() || "Student";
    const idNumber = profileIdInputEl?.value?.trim() || "";

    await updateDoc(doc(db, "users", user.uid), {
      name,
      studentId: idNumber // <- canonical
    });

    applyNameToUI(name);
    applyStudentIdToUI(idNumber);
    showToast("Profile saved.");
  } catch (err) {
    console.error("Save profile:", err);
    showToast("Failed to save profile.", "error");
  }
});

// Change password
passwordForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  const currentPw = currentPasswordEl.value;
  const newPw = newPasswordEl.value;
  const confirmPw = confirmPasswordEl.value;

  if (newPw !== confirmPw) {
    showToast("New passwords do not match.", "error");
    return;
  }

  try {
    const cred = EmailAuthProvider.credential(user.email, currentPw);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPw);
    showToast("Password updated.");
    currentPasswordEl.value = "";
    newPasswordEl.value = "";
    confirmPasswordEl.value = "";
  } catch (err) {
    console.error("Update password:", err);
    showToast("Failed to update password (check current password).", "error");
  }
});

// -------------------- Auth state --------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : null;

    hydrateProfileUI(data, user);

    // Load student data
    await loadRecentGrades(user.uid);
    await loadUpcomingAssignments(user.uid);
  } catch (err) {
    console.error("student auth guard:", err);
    hydrateProfileUI(null, user);
    await loadRecentGrades(user.uid);
    await loadUpcomingAssignments(user.uid);
  }
});
