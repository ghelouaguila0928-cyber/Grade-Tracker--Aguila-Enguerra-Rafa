// js/student.js
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  setDoc,
  serverTimestamp,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* -------------------- UI refs -------------------- */
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");
const pageTitle = document.getElementById("pageTitle");
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebar");

const sidebarName = document.getElementById("sidebarName");
const sidebarRole = document.getElementById("sidebarRole");
const profileInitials = document.getElementById("profileInitials");
const profileStudentName = document.getElementById("profileStudentName");
const profileStudentId = document.getElementById("profileStudentId");

// Profile table fields
const p_name = document.getElementById("p_name");
const p_email = document.getElementById("p_email");
const p_studentId = document.getElementById("p_studentId");
const p_course = document.getElementById("p_course");
const p_year = document.getElementById("p_year");
const p_section = document.getElementById("p_section");

// Toast + auth
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");
const logoutBtn = document.getElementById("logoutBtn");

// Summary (Year Level + Semester)
const selectYearLevel = document.getElementById("selectYearLevel");
const selectSem = document.getElementById("selectSem");
const generateSummaryBtn = document.getElementById("generateSummaryBtn");
const downloadSummaryBtn = document.getElementById("downloadSummaryBtn");
const printSummaryBtn = document.getElementById("printSummaryBtn");
const summaryTableBody = document.getElementById("summaryTableBody");
const totalUnitsEl = document.getElementById("totalUnits");
const gwaEl = document.getElementById("gwa");
const summaryMeta = document.getElementById("summaryMeta");

// Messages UI
const newMessageBtn = document.getElementById("newMessageBtn");
const newMessageForm = document.getElementById("newMessageForm");
const messagesList = document.getElementById("messagesList");
const messageThread = document.getElementById("messageThread");
const messageSearchInput = document.getElementById("messageSearchInput");

// Keep current student's ID number for flexible queries
let CURRENT_STUDENT_ID_NUMBER = null;

/* -------------------- helpers -------------------- */
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
    const titleText = { grades: "My Grades", messages: "Messages", profile: "Profile" }[id] || id;
    pageTitle.textContent = titleText;
  }
}

toggleSidebarBtn?.addEventListener("click", () => {
  sidebar?.classList.toggle("collapsed");
});

navItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    navItems.forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    showPage(item.dataset.page);
  });
});

function setInitials(targetEls, name) {
  const initials = (name || "ST")
    .split(" ")
    .filter(Boolean)
    .map(n => n[0])
    .join("")
    .substring(0,2)
    .toUpperCase();
  targetEls.forEach(el => el && (el.textContent = initials));
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

/* -------------------- Summary of Grades -------------------- */
function computeGWA(rows) {
  let wsum = 0, units = 0;
  rows.forEach((r) => {
    const u = Number(r.units);
    const g = Number(r.grade);
    if (!isNaN(u) && !isNaN(g)) {
      wsum += u * g;
      units += u;
    }
  });
  if (units === 0) return null;
  return (wsum / units);
}
function normalizeGrade(rec) {
  return {
    code: rec.code || rec.subjectCode || rec.courseCode || rec.subject || "—",
    title: rec.title || rec.subjectTitle || rec.courseName || rec.subject || "—",
    units: Number(rec.units ?? rec.creditUnits ?? 0) || 0,
    grade: rec.grade ?? rec.final ?? rec.finalGrade ?? rec.mark ?? "—",
    remarks: rec.remarks ?? rec.remark ?? "",
    yearLevel: String(rec.yearLevel ?? rec.year ?? ""),
    semester: rec.semester || rec.term || "",
  };
}

// Pull grades only from canonical place: users/{uid}/grades
async function fetchGradesForTerm(user, yearLevel, sem) {
  const q = query(
    collection(db, "users", user.uid, "grades"),
    where("yearLevel", "==", String(yearLevel)),
    where("semester", "==", String(sem))
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => normalizeGrade(d.data()));
}

function renderSummary(rows, yearLevel, sem) {
  if (!summaryTableBody) return;
  const prettyYear = ({ "1":"1st Year","2":"2nd Year","3":"3rd Year","4":"4th Year","5":"5th Year" })[String(yearLevel)] || `Year ${yearLevel}`;

  if (!rows || rows.length === 0) {
    summaryTableBody.innerHTML = `<tr><td colspan="4" class="muted">No grades found for ${escapeHTML(prettyYear)} • ${escapeHTML(sem)}</td></tr>`;
    totalUnitsEl && (totalUnitsEl.textContent = "0");
    gwaEl && (gwaEl.textContent = "—");
    summaryMeta && (summaryMeta.textContent = `Summary for ${prettyYear} • ${sem}`);
    return;
  }

  summaryTableBody.innerHTML = rows.map(r => (`
    <tr>
      <td>${escapeHTML(r.title || "—")}</td>
      <td>${escapeHTML(r.code || "—")}</td>
      <td>${Number(r.units) || 0}</td>
      <td>${escapeHTML(r.grade ?? "—")}</td>
    </tr>
  `)).join("");

  const totalUnits = rows.reduce((s, r) => s + (Number(r.units) || 0), 0);
  totalUnitsEl && (totalUnitsEl.textContent = String(totalUnits));

  const gwa = computeGWA(rows);
  gwaEl && (gwaEl.textContent = (gwa == null) ? "—" : gwa.toFixed(3));

  summaryMeta && (summaryMeta.textContent = `Summary for ${prettyYear} • ${sem}`);
}

function toCSV(rows, meta) {
  const header = ["Course Name","Course Code","Units","Mark"];
  const lines = [header.join(",")];
  rows.forEach(r => {
    const vals = [r.title || "—", r.code || "—", Number(r.units) || 0, r.grade ?? "—"];
    lines.push(vals.map(v => `"${String(v).replaceAll('"','""')}"`).join(","));
  });
  lines.push("");
  lines.push(`"Total Units",${meta.totalUnits},"GWA",${meta.gwa ?? ""}`);
  return lines.join("\n");
}
function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
async function handleGenerate(user) {
  if (!selectYearLevel || !selectSem) return;
  const yearLevel = selectYearLevel.value;
  const sem = selectSem.value;
  if (summaryTableBody) summaryTableBody.innerHTML = `<tr><td colspan="4">Loading…</td></tr>`;
  try {
    const rows = await fetchGradesForTerm(user, yearLevel, sem);
    renderSummary(rows, yearLevel, sem);

    downloadSummaryBtn?.addEventListener("click", () => {
      const csv = toCSV(rows, {
        totalUnits: rows.reduce((s, r) => s + (Number(r.units) || 0), 0),
        gwa: (function(){ const g = computeGWA(rows); return g == null ? "" : g.toFixed(3); })()
      });
      const prettyYear = ({ "1":"1stYear","2":"2ndYear","3":"3rdYear","4":"4thYear","5":"5thYear" })[String(yearLevel)] || `Year${yearLevel}`;
      download(`Summary_${prettyYear}_${sem}.csv`, csv);
    }, { once: true });

  } catch (err) {
    console.error("[student] fetch grades failed:", err);
    if (summaryTableBody) summaryTableBody.innerHTML = `<tr><td colspan="4" class="muted">Error fetching grades.</td></tr>`;
    totalUnitsEl && (totalUnitsEl.textContent = "0");
    gwaEl && (gwaEl.textContent = "—");
    const prettyYear = ({ "1":"1st Year","2":"2nd Year","3":"3rd Year","4":"4th Year","5":"5th Year" })[String(selectYearLevel.value)] || `Year ${selectYearLevel.value}`;
    summaryMeta && (summaryMeta.textContent = `Summary for ${prettyYear} • ${selectSem.value}`);
  }
}

/* -------------------- Messaging (student side) -------------------- */
let threadUnsub = null;
let msgsUnsub = null;

function renderMessagesList(lastMsg, updatedAt) {
  if (!messagesList) return;
  messagesList.innerHTML = `
    <div class="message-item active">
      <div class="message-title">${escapeHTML(lastMsg?.subject || "Conversation with Admin")}</div>
      <div class="message-snippet">${escapeHTML(lastMsg?.text || "—")}</div>
      <div class="message-time">${updatedAt ? new Date(updatedAt.toDate()).toLocaleString() : ""}</div>
    </div>
  `;
}
function renderThread(messages, searchTerm = "") {
  if (!messageThread) return;
  const term = (searchTerm || "").toLowerCase().trim();

  const filtered = term
    ? messages.filter(m => (m.text || "").toLowerCase().includes(term))
    : messages;

  if (!filtered.length) {
    messageThread.innerHTML = `
      <div class="no-message-selected">
        <i class="fas fa-comments"></i>
        <h3>${term ? "No matching messages" : "No messages yet"}</h3>
        <p>${term ? "Try a different search." : "Start the conversation using \"New Message\"."}</p>
      </div>`;
    return;
  }
  messageThread.innerHTML = `
    <div class="thread">
      ${filtered.map(m => {
        const mine = m.senderId === auth.currentUser?.uid;
        const when = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
        return `
          <div class="bubble ${mine ? 'me' : 'them'}">
            <div class="bubble-body">${escapeHTML(m.text || '').replace(/\n/g,'<br/>')}</div>
            <div class="bubble-meta">${when.toLocaleString()}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function ensureThread(user, subjectText) {
  const tRef = doc(db, "threads", user.uid);
  const tSnap = await getDoc(tRef);
  if (!tSnap.exists()) {
    await setDoc(tRef, {
      studentUid: user.uid,
      studentEmail: user.email || "",
      studentName: user.displayName || "",
      lastMessage: { subject: subjectText || "New Message", text: "", sender: user.uid },
      updatedAt: serverTimestamp(),
      lastSender: user.uid,
    });
  }
  return tRef;
}

function bindRealtimeThread(user) {
  const tRef = doc(db, "threads", user.uid);
  // Unsubscribe old listeners
  if (threadUnsub) threadUnsub();
  if (msgsUnsub) msgsUnsub();

  threadUnsub = onSnapshot(tRef, (snap) => {
    const data = snap.data();
    if (data) renderMessagesList(data.lastMessage, data.updatedAt);
    else messagesList.innerHTML = `<div class="message-item"><div class="message-title">Conversation with Admin</div><div class="message-snippet">—</div></div>`;
  });

  msgsUnsub = onSnapshot(
    query(collection(db, "threads", user.uid, "messages"), orderBy("createdAt", "asc")),
    (qs) => {
      const rows = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      renderThread(rows, messageSearchInput?.value);
    }
  );
}

// Search within thread
messageSearchInput?.addEventListener("input", async () => {
  // Re-render with current cached snapshot if available.
  // (We’ll re-pull quickly via the active onSnapshot anyway)
  // Just trigger a small repaint by changing innerHTML based on last messages cached
  // No separate cache kept here – onSnapshot handler rebuilds using input’s value.
  // So do nothing; the next onSnapshot will read the current value.
});

/* Compose new message */
newMessageBtn?.addEventListener("click", async () => {
  document.getElementById("newMessageModal")?.classList.add("active");
  document.getElementById("modalOverlay")?.classList.add("active");
});
newMessageForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  const subject = document.getElementById("messageSubject")?.value.trim() || "Message";
  const content = document.getElementById("messageContent")?.value.trim() || "";
  try {
    const tRef = await ensureThread(user, subject);
    await addDoc(collection(tRef, "messages"), {
      senderId: user.uid,
      text: content,
      createdAt: serverTimestamp(),
    });
    await setDoc(tRef, {
      lastMessage: { subject, text: content, sender: user.uid },
      lastSender: user.uid,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    document.querySelectorAll(".modal.active").forEach(m => m.classList.remove("active"));
    document.getElementById("modalOverlay")?.classList.remove("active");
    (document.getElementById("messageContent") || {}).value = "";
    showToast("Message sent.");
  } catch (err) {
    console.error("send message failed:", err);
    showToast("Failed to send message.", "error");
  }
});

// close modal via [data-close-modal]
document.querySelectorAll("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".modal.active").forEach((m) => m.classList.remove("active"));
    document.getElementById("modalOverlay")?.classList.remove("active");
  });
});

/* -------------------- Auth + Profile hydrate -------------------- */
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "auth.html";
});

function applyProfileToUI(data, user) {
  const name = data?.name || user?.displayName || "Student";
  const email = user?.email || data?.email || "—";
  const studentId = data?.studentId || data?.studentIdNumber || "—";
  const course = data?.course || "—";
  const year = (data?.year || "").toString();
  const section = data?.section || "—";

  CURRENT_STUDENT_ID_NUMBER = (studentId && studentId !== "—") ? studentId : null;

  sidebarName && (sidebarName.textContent = name);
  sidebarRole && (sidebarRole.textContent = `ID: ${CURRENT_STUDENT_ID_NUMBER ?? "—"}`);

  profileStudentName && (profileStudentName.textContent = name);
  profileStudentId && (profileStudentId.textContent = `Student ID: ${CURRENT_STUDENT_ID_NUMBER ?? "—"}`);
  setInitials([document.getElementById("sidebarAvatar"), profileInitials], name);

  p_name && (p_name.textContent = name);
  p_email && (p_email.textContent = email);
  p_studentId && (p_studentId.textContent = CURRENT_STUDENT_ID_NUMBER ?? "—");
  p_course && (p_course.textContent = course);
  p_year && (p_year.textContent = year || "—");
  p_section && (p_section.textContent = section);

  if (selectYearLevel && year && ["1","2","3","4","5"].includes(year)) {
    selectYearLevel.value = year;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }
  printSummaryBtn?.addEventListener("click", () => window.print());
  generateSummaryBtn?.addEventListener("click", async () => { await handleGenerate(user); });

  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : null;
    applyProfileToUI(data, user);

    // Bind messaging realtime for this user
    bindRealtimeThread(user);
  } catch (err) {
    console.error("student auth guard:", err);
    applyProfileToUI(null, user);
    bindRealtimeThread(user);
  }
});

