// js/teacher.js
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");
const pageTitle = document.getElementById("pageTitle");
const logoutBtn = document.getElementById("logoutBtn");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");

function showToast(msg, isErr = false) {
  if (!toast) {
    alert(msg);
    return;
  }
  toastMessage.textContent = msg;
  toast.classList.add("show");
  if (isErr) toast.classList.add("error");
  setTimeout(() => {
    toast.classList.remove("show", "error");
  }, 3000);
}

// nav
navItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const page = item.dataset.page;
    navItems.forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    pages.forEach((p) => p.classList.remove("active"));
    const el = document.getElementById(page);
    if (el) el.classList.add("active");
    if (pageTitle) pageTitle.textContent = item.textContent.trim();
  });
});

async function loadStudents() {
  const body = document.getElementById("studentsTableBody");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
  try {
    const snap = await getDocs(collection(db, "users"));
    let html = "";
    snap.forEach((d) => {
      const u = d.data();
      if (u.role !== "student") return;
      html += `
        <tr>
          <td>${u.studentId || u.uid}</td>
          <td>${u.name || "—"}</td>
          <td>${u.email || "—"}</td>
          <td>${u.yearLevel || "—"}</td>
          <td>${u.avgGrade || "—"}</td>
          <td><span class="badge badge-success">Active</span></td>
          <td><button class="btn btn-secondary btn-sm">View</button></td>
        </tr>
      `;
    });
    if (!html) html = `<tr><td colspan="7">No students.</td></tr>`;
    body.innerHTML = html;
  } catch (err) {
    console.error("loadStudents:", err);
    body.innerHTML = `<tr><td colspan="7">Failed to load (offline?)</td></tr>`;
    showToast("Cannot load students. Check internet / Firestore rules.", true);
  }
}

async function loadTeacherGrades(teacherId) {
  const body = document.getElementById("gradesTableBody");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
  try {
    const q = query(collection(db, "grades"), where("teacherId", "==", teacherId));
    const snap = await getDocs(q);
    let html = "";
    snap.forEach((d) => {
      const g = d.data();
      html += `
        <tr>
          <td>${g.studentName || g.studentId || "—"}</td>
          <td>${g.subject || "—"}</td>
          <td>${g.assignment || "—"}</td>
          <td>${g.year || "—"}</td>
          <td>${g.date ? new Date(g.date.seconds * 1000).toLocaleDateString() : "—"}</td>
          <td><span class="badge ${g.status === "Graded" ? "badge-success" : "badge-warning"}">${g.status || "Pending"}</span></td>
          <td><button class="btn btn-secondary btn-sm">Edit</button></td>
        </tr>
      `;
    });
    if (!html) html = `<tr><td colspan="7">No grades.</td></tr>`;
    body.innerHTML = html;
  } catch (err) {
    console.error("loadTeacherGrades:", err);
    body.innerHTML = `<tr><td colspan="7">Failed to load (offline?)</td></tr>`;
    showToast("Cannot load grades. Check internet / Firestore rules.", true);
  }
}

// logout
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
}

// protect
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || snap.data().role !== "teacher") {
      window.location.href = "student-dashboard.html";
      return;
    }
    await loadStudents();
    await loadTeacherGrades(user.uid);
    showToast("Welcome, " + (snap.data().name || "Teacher"));
  } catch (err) {
    console.error("teacher auth:", err);
    showToast("Offline: cannot verify account", true);
  }
});
