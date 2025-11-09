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

// Chat (Student ↔ Admin)
const chatThread = document.getElementById("chatThread");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

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
    const titleText = { grades: "My Grades", messages: "Chat", profile: "Profile" }[id] || id;
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
const coerceStr = (v) => (v === undefined || v === null) ? "" : String(v);

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

/* -------------------- Student ↔ Admin Chat (threads/{studentUid}/messages) -------------------- */
let threadUnsub = null;

function renderChat(messages, currentUid) {
  if (!chatThread) return;

  if (!messages.length) {
    chatThread.innerHTML = `
      <div class="no-message-selected">
        <i class="fas fa-comments"></i>
        <h3>No messages yet</h3>
        <p>Say hello 👋</p>
      </div>`;
    return;
  }

  chatThread.innerHTML = `
    <div class="thread">
      ${messages.map(m => {
        const mine = m.senderId === currentUid || m.senderRole === "student";
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
  chatThread.scrollTop = chatThread.scrollHeight;
}

async function ensureThreadDoc(user, subjectText = "Conversation with Admin") {
  const tRef = doc(db, "threads", user.uid);
  const tSnap = await getDoc(tRef);
  if (!tSnap.exists()) {
    await setDoc(tRef, {
      studentUid: user.uid,
      studentEmail: user.email || "",
      studentName: user.displayName || "",
      lastMessage: { subject: subjectText, text: "", sender: user.uid },
      updatedAt: serverTimestamp(),
      lastSender: user.uid,
      unread: false,
    }, { merge: true });
  }
  return tRef;
}

function bindRealtimeThread(user) {
  if (threadUnsub) { threadUnsub(); threadUnsub = null; }

  const msgsQ = query(
    collection(db, "threads", user.uid, "messages"),
    orderBy("createdAt", "asc")
  );

  threadUnsub = onSnapshot(msgsQ, (qs) => {
    const rows = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    renderChat(rows, user.uid);
  });
}

async function sendMessageToAdmin(user, text) {
  const tRef = await ensureThreadDoc(user);

  await addDoc(collection(tRef, "messages"), {
    senderId: user.uid,
    senderRole: "student",
    text,
    createdAt: serverTimestamp(),
  });

  await setDoc(tRef, {
    lastMessage: { subject: "Message", text, sender: user.uid },
    lastSender: user.uid,
    updatedAt: serverTimestamp(),
    unread: true, // admin sees as new
  }, { merge: true });
}

/* -------------------- SAFE Profile Backfill (no blank overwrites) -------------------- */
async function backfillEmptyProfile(user, data) {
  const patch = {};
  const has = (x) => x !== undefined && x !== null && String(x).trim() !== "";

  const ensure = (key, val) => {
    if (!has(data?.[key]) && has(val)) patch[key] = String(val).trim();
  };

  ensure("uid", user?.uid);
  ensure("role", data?.role || "student");

  ensure("name", data?.name || user?.displayName);
  ensure("email", data?.email || user?.email);

  ensure("studentId", data?.studentId ?? data?.studentIdNumber);
  ensure("studentIdNumber", data?.studentIdNumber ?? data?.studentId);

  ensure("course", data?.course);
  ensure("year", data?.year ? String(data.year) : "");
  ensure("section", data?.section);

  if (!Object.keys(patch).length) return null;

  try {
    await setDoc(doc(db, "users", user.uid), patch, { merge: true });
    console.log("[student.js] safe backfill wrote:", patch);
    return patch;
  } catch (e) {
    console.warn("[student.js] backfill failed:", e);
    return null;
  }
}

/* -------------------- Apply Profile to UI -------------------- */
function applyProfileToUI(data, user) {
  const name = coerceStr(data?.name || user?.displayName || "Student").trim();
  const email = coerceStr(user?.email || data?.email || "—").trim();

  const studentId = coerceStr(
    data?.studentId ?? data?.studentIdNumber ?? data?.id ?? "—"
  ).trim();

  const course = coerceStr(data?.course ?? data?.program ?? "—").trim();
  const rawYear = coerceStr(data?.year ?? data?.yearLevel ?? "").trim();
  const year = rawYear ? String(rawYear) : "";
  const section = coerceStr(data?.section ?? data?.classSection ?? "—").trim();

  console.log("[student.js] applyProfileToUI:", { studentId, course, year, section });

  sidebarName && (sidebarName.textContent = name || "Student");
  sidebarRole && (sidebarRole.textContent = `ID: ${studentId || "—"}`);

  profileStudentName && (profileStudentName.textContent = name || "Student");
  profileStudentId && (profileStudentId.textContent = `Student ID: ${studentId || "—"}`);
  setInitials([document.getElementById("sidebarAvatar"), profileInitials], name || "Student");

  p_name && (p_name.textContent = name || "—");
  p_email && (p_email.textContent = email || "—");
  p_studentId && (p_studentId.textContent = studentId || "—");
  p_course && (p_course.textContent = course || "—");
  p_year && (p_year.textContent = year || "—");
  p_section && (p_section.textContent = section || "—");

  if (selectYearLevel && year && ["1","2","3","4","5"].includes(year)) {
    selectYearLevel.value = year;
  }
}

/* -------------------- Auth guard -------------------- */
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "auth.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  printSummaryBtn?.addEventListener("click", () => window.print());
  generateSummaryBtn?.addEventListener("click", async () => { await handleGenerate(user); });

  try {
    const ref = doc(db, "users", user.uid);
    let snap = await getDoc(ref);
    let data = snap.exists() ? snap.data() : null;
    console.log("[student.js] loaded users doc:", data);

    // Safe backfill (won't overwrite with blanks)
    const patched = await backfillEmptyProfile(user, data);
    if (patched) {
      snap = await getDoc(ref);
      data = snap.exists() ? snap.data() : null;
      console.log("[student.js] reloaded after backfill:", data);
    }

    applyProfileToUI(data, user);

    // Chat
    await ensureThreadDoc(user);
    bindRealtimeThread(user);

    // Send handler (once)
    chatForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const me = auth.currentUser;
      const text = (chatInput?.value || "").trim();
      if (!me) return showToast("You are not signed in.", "error");
      if (!text) return;
      try {
        await sendMessageToAdmin(me, text);
        chatInput.value = "";
      } catch (err) {
        console.error("send message failed:", err);
        showToast("Failed to send message.", "error");
      }
    }, { once: true });

  } catch (err) {
    console.error("student auth guard:", err);
    applyProfileToUI(null, user);
    try { await ensureThreadDoc(user); bindRealtimeThread(user); } catch {}
  }
});
