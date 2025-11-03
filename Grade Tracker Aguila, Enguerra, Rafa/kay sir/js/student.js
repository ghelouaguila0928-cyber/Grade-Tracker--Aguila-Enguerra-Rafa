// js/student.js
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// UI refs
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");
const pageTitle = document.getElementById("pageTitle");
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const modalOverlay = document.getElementById("modalOverlay");
const gradeDetailsModal = document.getElementById("gradeDetailsModal");
const gradeDetailsContent = document.getElementById("gradeDetailsContent");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");
const logoutBtn = document.getElementById("logoutBtn");

function showToast(msg, type = "success") {
  if (!toast) {
    alert(msg);
    return;
  }
  toastMessage.textContent = msg;
  toast.classList.remove("error");
  if (type === "error") toast.classList.add("error");
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show", "error");
  }, 2500);
}

function showPage(id) {
  pages.forEach((p) => p.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  if (pageTitle) pageTitle.textContent = el ? el.querySelector(".section-title")?.textContent || id : id;
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

// nav events
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

// load recent grades
async function loadRecentGrades(uid) {
  const tbody = document.getElementById("recentGradesTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  try {
    const q = query(
      collection(db, "grades"),
      where("studentId", "==", uid),
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
          <td><span class="badge ${g.status === "Passed" ? "badge-success" : "badge-warning"}">${g.status || "—"}</span></td>
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
    gradeDetailsContent.innerHTML = `
      <p><strong>Subject:</strong> ${g.subject || "-"}</p>
      <p><strong>Assignment:</strong> ${g.assignment || "-"}</p>
      <p><strong>Grade:</strong> ${g.grade ?? "-"}</p>
      <p><strong>Status:</strong> ${g.status || "-"}</p>
      <p><strong>Date:</strong> ${formatDate(g.date)}</p>
      <p><strong>Comments:</strong> ${g.comments || "—"}</p>
    `;
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
      where("studentId", "==", uid),
      orderBy("dueDate", "asc"),
      limit(5)
    );
    const snap = await getDocs(q);
    let html = "";
    snap.forEach((d) => {
      const a = d.data();
      const cls =
        a.priority === "High"
          ? "badge-danger"
          : a.priority === "Medium"
          ? "badge-warning"
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

// logout
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
}

// auth guard
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // load profile
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      const profileName = document.getElementById("profileStudentName");
      const sideName = document.querySelector(".user-name");
      if (profileName) profileName.textContent = data.name || user.displayName || "Student";
      if (sideName) sideName.textContent = data.name || user.displayName || "Student";
      const gpaEl = document.getElementById("currentGpa");
      if (gpaEl && data.currentGpa) gpaEl.textContent = data.currentGpa;
    }
  } catch (err) {
    console.error("get profile:", err);
    showToast("Offline: cannot load profile", "error");
  }

  await loadRecentGrades(user.uid);
  await loadUpcomingAssignments(user.uid);
});
