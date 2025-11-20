// js/teacher.js
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  getCountFromServer,
  onSnapshot,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* -------------------- tiny helpers -------------------- */
const $ = (s) => document.querySelector(s);
const escapeHTML = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c])
  );
const yearKey = (label) => {
  const v = String(label ?? "");
  const m = v.match(/^(\d)/);
  if (m) return m[1];
  const low = v.toLowerCase();
  if (low.includes("first")) return "1";
  if (low.includes("second")) return "2";
  if (low.includes("third")) return "3";
  if (low.includes("fourth")) return "4";
  if (low.includes("fifth")) return "5";
  return v.replace(/[^0-9]/g, "") || "";
};
const prettyYear = (y) =>
  (
    {
      "1": "1st Year",
      "2": "2nd Year",
      "3": "3rd Year",
      "4": "4th Year",
      "5": "5th Year",
    }[String(y)] || (y ? `Year ${y}` : "—")
  );
const semKey = (label) => {
  const v = String(label || "").toLowerCase();
  if (v.startsWith("1")) return "1st";
  if (v.startsWith("2")) return "2nd";
  return "Summer";
};
const initialsOf = (name, fallback = "S") =>
  (name || fallback)
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const formatWhen = (tsMs) => new Date(tsMs).toLocaleString();

/* -------------------- DOM refs -------------------- */
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");
const pageTitle = $("#pageTitle");
const toggleSidebarBtn = $("#toggleSidebar");
const sidebar = $("#sidebar");

const sidebarName = $("#sidebarName");
const sidebarRole = $("#sidebarRole");
const sidebarAvatar = $("#sidebarAvatar");

const sectionsTableBody = $("#sectionsTableBody");
const sectionMembersBody = $("#sectionMembersBody");
const studentsTableBody = $("#studentsTableBody");
const studentsSearch = $("#studentsSearch");

const sdTitle = $("#sdTitle");
const sdCourse = $("#sdCourse");
const sdSection = $("#sdSection");
const sdYear = $("#sdYear");
const backToSectionsLink = $("#backToSectionsLink");

const stName = $("#stName");
const stId = $("#stId");
const filterYear = $("#filterYear");
const filterSem = $("#filterSem");
const sogTableBody = $("#sogTableBody");
const exportSoGBtn = $("#exportSoGBtn");
const addSoGBtn = $("#addSoGBtn");
const amgStudentName = $("#amgStudentName");

/* student-detail tabs */
const studentTabs = document.querySelectorAll(".student-tab");
const studentTabPanels = document.querySelectorAll(".student-tab-panel");
const stSubjectsBody = $("#stSubjectsBody");

/* modal: Add Grade */
const addSoGModal = $("#addSoGModal");
const addSoGForm = $("#addSoGForm");
const amgClose = $("#amgClose");
const amgCancel = $("#amgCancel");
const sogSubject = $("#sogSubject");
const sogYear = $("#sogYear");
const sogSem = $("#sogSem");
const sogCourseName = $("#sogCourseName");
const sogCourseCode = $("#sogCourseCode");
const sogUnits = $("#sogUnits");
const sogMark = $("#sogMark");

/* profile */
const profileInitials = $("#profileInitials");
const profileName = $("#profileName");
const profileEmail = $("#profileEmail");
const p_name = $("#p_name");
const p_email = $("#p_email");
const p_uid = $("#p_uid");
const p_sections = $("#p_sections");

/* Messages page */
const threadList = $("#threadList");
const threadEmpty = $("#threadEmpty");
const chatTitle = $("#chatTitle");
const chatBody = $("#chatBody");
const chatInput = $("#chatInput");
const chatSend = $("#chatSend");

/* Notifications UI */
const openNotifsBtn = $("#openNotifs");
const notifBadge = $("#notifBadge");
const notifMenu = $("#notifMenu");
const notifList = $("#notifList");
const notifEmpty = $("#notifEmpty");
const notifViewAll = $("#notifViewAll");
const notifMarkRead = $("#notifMarkRead");

/* auth/logout */
const logoutBtn = $("#logoutBtn");

/* -------------------- Nav behavior -------------------- */
function showPage(key) {
  pages.forEach((p) => {
    const isActive = p.id === key;
    p.classList.toggle("active", isActive);
    p.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
  navItems.forEach((a) =>
    a.classList.toggle("active", a.dataset.page === key)
  );
  const TITLES = {
    sections: "My Sections",
    "section-detail": "Section Detail",
    students: "All My Students",
    "student-detail": "Student Detail",
    messages: "Messages",
    profile: "Profile",
  };
  pageTitle.textContent = TITLES[key] || "Teacher Portal";
  window.scrollTo({ top: 0, behavior: "instant" });

  if (key === "messages") {
    renderThreadsListFromCache();
  }
}
navItems.forEach((a) =>
  a.addEventListener("click", (e) => {
    if (!a.dataset.page) return;
    e.preventDefault();
    showPage(a.dataset.page);
  })
);
toggleSidebarBtn?.addEventListener("click", () =>
  sidebar?.classList.toggle("collapsed")
);

/* -------------------- State -------------------- */
let ME = null;
let MY_SECTIONS = []; // sections assigned via "teaching"
let MEMBERS_BY_SECTION = new Map(); // sectionId -> members[]
let ALL_MY_STUDENTS = []; // union of all members

// chat / notifications
let THREADS_CACHE = []; // threads for my students only
let MSG_UNSUB = null; // messages listener for current student
let THREADS_UNSUB = null; // global threads watcher
let CURRENT_SECTION = null;
let CURRENT_STUDENT = null;
let CURRENT_THREAD_STUDENT_UID = null;

// subjects taken cache for CURRENT_STUDENT
let CURRENT_STUDENT_SUBJECTS = [];

/* -------------------- Auth guard (Teacher only) -------------------- */
(async function guardTeacher() {
  document.documentElement.style.visibility = "hidden";

  await new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          location.href = "auth.html";
          return;
        }

        const token = await user.getIdTokenResult(true);
        let isTeacher = token?.claims?.teacher === true;
        let role = "student";

        if (!isTeacher) {
          try {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
              role = (snap.data().role || "student").toLowerCase();
              isTeacher = ["teacher", "instructor", "professor"].includes(
                role
              );
            }
          } catch {
            isTeacher = false;
          }
        }

        if (!isTeacher) {
          // redirect by role
          if (
            role === "admin" ||
            role === "administrator" ||
            role === "superadmin"
          ) {
            location.href = "admin-dashboard.html";
          } else {
            location.href = "student-dashboard.html";
          }
          return;
        }

        ME = user;

        await hydrateProfile(user);
        await loadMySections(); // from "teaching"
        await buildAllMyStudents(); // from members of those sections
        renderSections();
        renderStudents();
        startThreadsWatcher(); // watch `threads` for my students

        showPage("sections");
        document.documentElement.style.visibility = "visible";
      } catch (e) {
        console.error("[teacher guard] error:", e);
        location.href = "auth.html";
      } finally {
        resolve();
      }
    });
  });
})();

/* -------------------- Profile hydrate -------------------- */
async function hydrateProfile(user) {
  const name = user.displayName || "Teacher";
  const email = user.email || "—";

  sidebarName.textContent = name;
  sidebarRole.textContent = email;
  sidebarAvatar.textContent = initialsOf(name, "TC");

  profileName.textContent = name;
  profileEmail.textContent = email;
  profileInitials.textContent = initialsOf(name, "TC");

  p_name.textContent = name;
  p_email.textContent = email;
  p_uid.textContent = user.uid;
}

/* -------------------- Sections (from "teaching") -------------------- */
/**
 * Supports BOTH:
 * 1) Random doc IDs + field  sectionId: "sectionsDocId"
 * 2) Composite doc ID   teacherUid_sectionId   with/without sectionId field
 */
async function loadMySections() {
  if (!ME?.uid) return;

  const teachQ = query(
    collection(db, "teaching"),
    where("teacherUid", "==", ME.uid)
  );
  const teachSnap = await getDocs(teachQ).catch(() => ({ docs: [] }));

  const sectionIdSet = new Set();

  for (const d of teachSnap.docs) {
    const data = d.data() || {};

    let secId =
      data.sectionId ||
      data.sectionIdRef ||
      data.section ||
      null;

    if (!secId) {
      const docId = d.id || "";
      if (docId.includes("_")) {
        const parts = docId.split("_");
        if (parts.length >= 2 && parts[0] === ME.uid) {
          secId = parts.slice(1).join("_");
        }
      }
    }

    if (!secId) {
      const docId = d.id || "";
      if (docId) {
        secId = docId;
      }
    }

    if (secId) {
      sectionIdSet.add(secId);
    }
  }

  const sectionIds = [...sectionIdSet];

  if (!sectionIds.length) {
    MY_SECTIONS = [];
    p_sections.textContent = "—";
    return;
  }

  const sections = [];
  for (const sid of sectionIds) {
    try {
      const sSnap = await getDoc(doc(db, "sections", sid));
      if (sSnap.exists()) {
        const data = sSnap.data();
        sections.push({ id: sid, ...data });
      }
    } catch (e) {
      console.warn("[teacher] load section failed:", sid, e);
    }
  }

  for (const s of sections) {
    try {
      const res = await getCountFromServer(
        collection(db, "sections", s.id, "members")
      );
      s.memberCount = res.data().count || 0;
    } catch {
      s.memberCount = 0;
    }
  }

  MY_SECTIONS = sections;

  p_sections.textContent = MY_SECTIONS.length
    ? MY_SECTIONS.map((s) => `${s.course || "—"} ${s.name || ""}`.trim()).join(
        " • "
      )
    : "—";
}

function renderSections() {
  if (!sectionsTableBody) return;

  if (!MY_SECTIONS.length) {
    sectionsTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          No sections assigned. Ask the Admin to assign you to a section.
        </td>
      </tr>`;
    return;
  }

  sectionsTableBody.innerHTML = MY_SECTIONS.map(
    (s) => `
    <tr data-id="${escapeHTML(s.id)}">
      <td>${escapeHTML(s.course || "—")}</td>
      <td>${escapeHTML(s.name || "—")}</td>
      <td>${escapeHTML(prettyYear(s.year))}</td>
      <td>${Number(s.memberCount ?? 0)}</td>
      <td class="nowrap">
        <button class="btn btn-secondary btn-xs" data-action="open">Open</button>
      </td>
    </tr>`
  ).join("");
}

sectionsTableBody?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action='open']");
  if (!btn) return;
  const row = btn.closest("tr");
  const id = row?.getAttribute("data-id");
  const sec = MY_SECTIONS.find((x) => x.id === id);
  if (!sec) return;
  await openSectionDetail(sec);
});

async function openSectionDetail(sec) {
  CURRENT_SECTION = sec;
  sdTitle.textContent = `${sec.course || "—"} • ${sec.name || "—"}`;
  sdCourse.textContent = sec.course || "—";
  sdSection.textContent = sec.name || "—";
  sdYear.textContent = prettyYear(sec.year || "—");
  await loadSectionMembers();
  showPage("section-detail");
}

backToSectionsLink?.addEventListener("click", (e) => {
  e.preventDefault();
  showPage("sections");
});

async function loadSectionMembers() {
  if (!CURRENT_SECTION) return;
  const qs = await getDocs(
    collection(db, "sections", CURRENT_SECTION.id, "members")
  ).catch(() => ({ docs: [] }));

  const rows = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
  MEMBERS_BY_SECTION.set(CURRENT_SECTION.id, rows);
  renderSectionMembers(rows);
}

function renderSectionMembers(rows) {
  if (!sectionMembersBody) return;

  if (!rows.length) {
    sectionMembersBody.innerHTML = `
      <tr><td colspan="5">No members yet.</td></tr>`;
    return;
  }

  sectionMembersBody.innerHTML = rows
    .map(
      (m) => `
    <tr
      data-uid="${escapeHTML(m.studentUid || "")}"
      data-name="${escapeHTML(m.name || "")}"
      data-id="${escapeHTML(m.studentId || "")}"
      data-email="${escapeHTML(m.email || "")}"
      data-year="${escapeHTML(yearKey(m.year || ""))}">
      <td>${escapeHTML(m.studentId || "—")}</td>
      <td>${escapeHTML(m.name || "—")}</td>
      <td>${escapeHTML(m.email || "—")}</td>
      <td>${escapeHTML(prettyYear(m.year || ""))}</td>
      <td class="nowrap">
        <button class="btn btn-secondary btn-xs" data-action="view">View</button>
        <button class="btn btn-primary btn-xs" data-action="add-grade">Add Grade</button>
        <button class="btn btn-secondary btn-xs" data-action="message">
          <i class="fas fa-comment"></i> Message
        </button>
      </td>
    </tr>`
    )
    .join("");
}

sectionMembersBody?.addEventListener("click", async (e) => {
  const row = e.target.closest("tr");
  if (!row) return;

  const student = {
    uid: row.getAttribute("data-uid"),
    name: row.getAttribute("data-name") || "Student",
    id: row.getAttribute("data-id") || "",
    email: row.getAttribute("data-email") || "",
    year: row.getAttribute("data-year") || "",
  };

  if (e.target.closest("button[data-action='view']")) {
    openStudentDetail(student);
    return;
  }
  if (e.target.closest("button[data-action='add-grade']")) {
    openAddSoGModal(student);
    return;
  }
  if (e.target.closest("button[data-action='message']")) {
    showPage("messages");
    openChatWith(student);
    return;
  }
});

/* -------------------- “All My Students” (union) -------------------- */
async function buildAllMyStudents() {
  const bag = new Map();

  for (const s of MY_SECTIONS) {
    const qs = await getDocs(
      collection(db, "sections", s.id, "members")
    ).catch(() => ({ docs: [] }));

    for (const d of qs.docs) {
      const m = d.data() || {};
      const key = m.studentUid || `${m.email}|${m.studentId}`;
      if (!key) continue;
      if (!bag.has(key)) {
        bag.set(key, {
          uid: m.studentUid || "",
          id: m.studentId || "",
          name: m.name || "",
          email: m.email || "",
          year: yearKey(m.year || ""),
        });
      }
    }
  }

  ALL_MY_STUDENTS = [...bag.values()];
}

function renderStudents() {
  if (!studentsTableBody) return;
  let rows = [...ALL_MY_STUDENTS];
  const term = (studentsSearch?.value || "").toLowerCase().trim();

  if (term) {
    rows = rows.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(term) ||
        (s.id || "").toLowerCase().includes(term) ||
        (s.email || "").toLowerCase().includes(term)
    );
  }

  if (!rows.length) {
    studentsTableBody.innerHTML = `
      <tr><td colspan="5">No students found.</td></tr>`;
    return;
  }

  studentsTableBody.innerHTML = rows
    .map(
      (s) => `
    <tr
      data-uid="${escapeHTML(s.uid)}"
      data-name="${escapeHTML(s.name)}"
      data-id="${escapeHTML(s.id)}"
      data-email="${escapeHTML(s.email)}"
      data-year="${escapeHTML(s.year)}">
      <td>${escapeHTML(s.id || "—")}</td>
      <td>${escapeHTML(s.name || "—")}</td>
      <td>${escapeHTML(s.email || "—")}</td>
      <td>${escapeHTML(prettyYear(s.year))}</td>
      <td class="nowrap">
        <button class="btn btn-secondary btn-xs" data-action="view">View</button>
        <button class="btn btn-primary btn-xs" data-action="add-grade">Add Grade</button>
        <button class="btn btn-secondary btn-xs" data-action="message">
          <i class="fas fa-comment"></i> Message
        </button>
      </td>
    </tr>`
    )
    .join("");
}
studentsSearch?.addEventListener("input", renderStudents);

studentsTableBody?.addEventListener("click", (e) => {
  const row = e.target.closest("tr");
  if (!row) return;

  const student = {
    uid: row.getAttribute("data-uid"),
    name: row.getAttribute("data-name") || "Student",
    id: row.getAttribute("data-id") || "",
    email: row.getAttribute("data-email") || "",
    year: row.getAttribute("data-year") || "",
  };

  if (e.target.closest("button[data-action='view']")) {
    openStudentDetail(student);
    return;
  }
  if (e.target.closest("button[data-action='add-grade']")) {
    openAddSoGModal(student);
    return;
  }
  if (e.target.closest("button[data-action='message']")) {
    showPage("messages");
    openChatWith(student);
    return;
  }
});

/* -------------------- Student Detail + Summary of Grades -------------------- */
function openStudentDetail(s) {
  CURRENT_STUDENT = s;
  CURRENT_STUDENT_SUBJECTS = [];
  stName.textContent = s.name || "—";
  stId.textContent = s.id || "—";

  // Default: Grades tab
  if (studentTabs?.length) {
    studentTabs.forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === "grades")
    );
  }
  if (studentTabPanels?.length) {
    studentTabPanels.forEach((panel) =>
      panel.classList.toggle("active", panel.dataset.tab === "grades")
    );
  }

  if (filterYear) filterYear.value = "__ALL__";
  if (filterSem) filterSem.value = "__ALL__";

  renderStudentSummary().catch(console.error);
  renderStudentSubjects().catch(console.error);

  showPage("student-detail");
}

$("#backToStudentsLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (CURRENT_SECTION) showPage("section-detail");
  else showPage("students");
});

async function fetchAllGrades(uid) {
  const snap = await getDocs(collection(db, "users", uid, "grades")).catch(
    () => ({ docs: [] })
  );
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => {
    const ya = String(a.yearLevel || "");
    const yb = String(b.yearLevel || "");
    if (ya !== yb) return ya.localeCompare(yb);
    const sa = String(a.semester || "");
    const sb = String(b.semester || "");
    return sa.localeCompare(sb);
  });
  return rows;
}

function toNumberGrade(g) {
  const s = String(g ?? "").trim();
  if (!s) return null;
  const maybe = Number(s.replace(",", "."));
  if (Number.isFinite(maybe)) return maybe;
  const L = s.toUpperCase();
  const map = {
    "A+": 98,
    A: 95,
    "A-": 90,
    "B+": 88,
    B: 85,
    "B-": 80,
    "C+": 78,
    C: 75,
    "C-": 70,
    D: 65,
    F: 55,
  };
  return map[L] ?? null;
}

async function renderStudentSummary() {
  if (!CURRENT_STUDENT?.uid) {
    sogTableBody.innerHTML = '<tr><td colspan="6">No grades.</td></tr>';
    return;
  }
  try {
    const all = await fetchAllGrades(CURRENT_STUDENT.uid);

    const yearFilterKey =
      !filterYear || filterYear.value === "__ALL__"
        ? "__ALL__"
        : yearKey(filterYear.value);
    const semFilterKey =
      !filterSem || filterSem.value === "__ALL__"
        ? "__ALL__"
        : semKey(filterSem.value);

    const entries = all.filter((ent) => {
      const okYear =
        yearFilterKey === "__ALL__" ||
        String(ent.yearLevel) === String(yearFilterKey);
      const okSem =
        semFilterKey === "__ALL__" ||
        String(ent.semester).toLowerCase() ===
          String(semFilterKey).toLowerCase();
      return okYear && okSem;
    });

    const groups = {};
    for (const ent of entries) {
      const n = toNumberGrade(ent.grade ?? ent.mark);
      if (!Number.isFinite(n)) continue;
      const y = String(ent.yearLevel ?? "").trim();
      const s = String(ent.semester ?? "").trim();
      const key = `Y${y}-${s}`;
      if (!groups[key]) groups[key] = { sum: 0, count: 0, year: y, sem: s };
      groups[key].sum += n;
      groups[key].count += 1;
    }
    const bar = $("#semAvgBar");
    if (bar) {
      const items = Object.values(groups)
        .sort(
          (a, b) =>
            String(a.year).localeCompare(String(b.year)) ||
            String(a.sem).localeCompare(String(b.sem))
        )
        .map(
          (g) =>
            `<span class="badge badge-primary" style="margin-right:6px;">
               Y${escapeHTML(g.year)} ${escapeHTML(g.sem)}:
               <b>${(g.sum / g.count).toFixed(2)}</b>
             </span>`
        );
      bar.innerHTML = items.length ? items.join("") : `<span>—</span>`;
    }

    if (!entries.length) {
      sogTableBody.innerHTML = '<tr><td colspan="6">No grades yet.</td></tr>';
      return;
    }
    sogTableBody.innerHTML = entries
      .map(
        (ent) => `
      <tr>
        <td>${escapeHTML(ent.yearLevel ?? "")}</td>
        <td>${escapeHTML(ent.semester ?? "")}</td>
        <td>${escapeHTML(ent.courseName || ent.title || "—")}</td>
        <td>${escapeHTML(ent.courseCode || ent.code || "—")}</td>
        <td>${Number(ent.units ?? 0)}</td>
        <td>${escapeHTML(ent.grade ?? ent.mark ?? "—")}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    console.error("[teacher] load grades failed:", err);
    sogTableBody.innerHTML =
      '<tr><td colspan="6">Failed to load grades.</td></tr>';
  }
}
filterYear?.addEventListener("change", () =>
  renderStudentSummary().catch(console.error)
);
filterSem?.addEventListener("change", () =>
  renderStudentSummary().catch(console.error)
);

/* ---- SUBJECTS TAKEN (teacher view tab) ---- */
async function fetchSubjectsTaken(uid) {
  const snap = await getDocs(
    collection(db, "users", uid, "subjectsTaken")
  ).catch(() => ({ docs: [] }));

  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  rows.sort((a, b) => {
    const ya = String(a.yearLevel || a.year || "");
    const yb = String(b.yearLevel || b.year || "");
    if (ya !== yb) return ya.localeCompare(yb);
    const sa = String(a.semester || a.sem || a.term || "");
    const sb = String(b.semester || b.sem || b.term || "");
    return sa.localeCompare(sb);
  });

  return rows;
}

async function renderStudentSubjects() {
  if (!stSubjectsBody) return;

  if (!CURRENT_STUDENT?.uid) {
    stSubjectsBody.innerHTML =
      '<tr><td colspan="6">No subjects taken.</td></tr>';
    return;
  }

  try {
    const all = await fetchSubjectsTaken(CURRENT_STUDENT.uid);
    CURRENT_STUDENT_SUBJECTS = all;

    if (!all.length) {
      stSubjectsBody.innerHTML =
        '<tr><td colspan="6">No subjects taken yet.</td></tr>';
      return;
    }

    stSubjectsBody.innerHTML = all
      .map((ent) => {
        const yearLevel = ent.yearLevel ?? ent.year ?? "";
        const semester = ent.semester ?? ent.sem ?? ent.term ?? "";
        const subjName =
          ent.subjectName || ent.courseName || ent.title || "—";
        const subjCode =
          ent.subjectCode || ent.courseCode || ent.code || "—";
        const units = Number(ent.units ?? 0);
        const status =
          ent.status ||
          ent.remarks ||
          ent.result ||
          ent.grade ||
          ent.mark ||
          "—";

        return `
          <tr>
            <td>${escapeHTML(yearLevel)}</td>
            <td>${escapeHTML(semester)}</td>
            <td>${escapeHTML(subjName)}</td>
            <td>${escapeHTML(subjCode)}</td>
            <td>${units}</td>
            <td>${escapeHTML(status)}</td>
          </tr>`;
      })
      .join("");
  } catch (err) {
    console.error("[teacher] load subjectsTaken failed:", err);
    stSubjectsBody.innerHTML =
      '<tr><td colspan="6">Failed to load subjects taken.</td></tr>';
  }
}

/* ---- Tabs behavior (Grades / Subjects Taken) ---- */
studentTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (!tab) return;

    studentTabs.forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    studentTabPanels.forEach((panel) =>
      panel.classList.toggle("active", panel.dataset.tab === tab)
    );
  });
});

exportSoGBtn?.addEventListener("click", () => {
  const table = document.querySelector(
    "#student-detail table"
  );
  if (!table) return;
  const csv = [...table.querySelectorAll("tr")]
    .map((tr) =>
      [...tr.querySelectorAll("th,td")]
        .map((td) => {
          const txt = td.textContent.replace(/\s+/g, " ").trim();
          return /[",\n]/.test(txt)
            ? `"${txt.replace(/"/g, '""')}"`

            : txt;
        })
        .join(",")
    )
    .join("\n");
  const yr =
    (filterYear?.value === "__ALL__"
      ? "ALL"
      : filterYear?.value?.replace(/\s+/g, "")) || "ALL";
  const sm =
    (filterSem?.value === "__ALL__"
      ? "ALL"
      : filterSem?.value?.replace(/\s+/g, "")) || "ALL";
  const id = stId?.textContent || "student";
  downloadFile(`${id}_summary_${yr}_${sm}.csv`, csv);
});
function downloadFile(
  filename,
  text,
  mimetype = "text/csv;charset=utf-8"
) {
  const blob = new Blob([text], { type: mimetype });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

/* -------------------- Add Grade (Teacher) -------------------- */

async function populateSubjectsForCurrentStudent() {
  if (!CURRENT_STUDENT?.uid || !sogSubject) return;
  sogSubject.innerHTML =
    '<option value="">Loading subjects…</option>';

  try {
    const list =
      CURRENT_STUDENT_SUBJECTS.length
        ? CURRENT_STUDENT_SUBJECTS
        : await fetchSubjectsTaken(CURRENT_STUDENT.uid);

    CURRENT_STUDENT_SUBJECTS = list;

    if (!list.length) {
      sogSubject.innerHTML =
        '<option value="">No Subjects Taken found</option>';
      // Clear display fields
      if (sogYear) sogYear.value = "";
      if (sogSem) sogSem.value = "";
      if (sogCourseName) sogCourseName.value = "";
      if (sogCourseCode) sogCourseCode.value = "";
      if (sogUnits) sogUnits.value = "";
      return;
    }

    sogSubject.innerHTML =
      '<option value="">Select Subject</option>' +
      list
        .map((subj) => {
          const year =
            subj.yearLevel ??
            subj.year ??
            "";
          const sem =
            subj.semester ??
            subj.sem ??
            subj.term ??
            "";
          const name =
            subj.subjectName ??
            subj.courseName ??
            subj.title ??
            "Untitled";
          const code =
            subj.subjectCode ??
            subj.courseCode ??
            subj.code ??
            "";
          const label = `${name} (${code}) — Y${year} ${sem}`;
          return `<option value="${escapeHTML(
            subj.id
          )}">${escapeHTML(label)}</option>`;
        })
        .join("");
  } catch (err) {
    console.error(
      "[teacher] populateSubjectsForCurrentStudent error:",
      err
    );
    sogSubject.innerHTML =
      '<option value="">Failed to load subjects</option>';
  }
}

function fillFieldsFromSelectedSubject() {
  if (!sogSubject || !CURRENT_STUDENT_SUBJECTS.length) return;
  const id = sogSubject.value;
  const subj = CURRENT_STUDENT_SUBJECTS.find(
    (s) => s.id === id
  );
  if (!subj) {
    if (sogYear) sogYear.value = "";
    if (sogSem) sogSem.value = "";
    if (sogCourseName) sogCourseName.value = "";
    if (sogCourseCode) sogCourseCode.value = "";
    if (sogUnits) sogUnits.value = "";
    return;
  }

  const yearRaw = subj.yearLevel ?? subj.year ?? "";
  const semRaw = subj.semester ?? subj.sem ?? subj.term ?? "";
  const yKey = yearKey(yearRaw);
  const sKey = semKey(semRaw);

  if (sogYear) {
    const labelMap = {
      "1": "1st Year",
      "2": "2nd Year",
      "3": "3rd Year",
      "4": "4th Year",
      "5": "5th Year",
    };
    sogYear.value = labelMap[yKey] || "";
  }
  if (sogSem) {
    if (sKey === "1st") sogSem.value = "1st Sem";
    else if (sKey === "2nd") sogSem.value = "2nd Sem";
    else sogSem.value = "Summer";
  }
  if (sogCourseName) {
    sogCourseName.value =
      subj.subjectName ??
      subj.courseName ??
      subj.title ??
      "";
  }
  if (sogCourseCode) {
    sogCourseCode.value =
      subj.subjectCode ??
      subj.courseCode ??
      subj.code ??
      "";
  }
  if (sogUnits) {
    sogUnits.value = Number(subj.units ?? 0) || "";
  }
}

function openAddSoGModal(student) {
  CURRENT_STUDENT = student || CURRENT_STUDENT;
  if (!CURRENT_STUDENT?.uid) {
    alert("Open a student first.");
    return;
  }
  addSoGForm?.reset();
  amgStudentName.textContent =
    CURRENT_STUDENT.name || "Student";

  // populate subject dropdown based on student's Subjects Taken
  populateSubjectsForCurrentStudent().catch(console.error);

  addSoGModal?.classList.add("show");
  addSoGModal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}
function closeAddSoGModal() {
  addSoGModal?.classList.remove("show");
  addSoGModal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}
amgClose?.addEventListener("click", closeAddSoGModal);
amgCancel?.addEventListener("click", closeAddSoGModal);
addSoGBtn?.addEventListener("click", () =>
  openAddSoGModal()
);

// kapag pinili ang subject, auto-fill other fields
sogSubject?.addEventListener("change", fillFieldsFromSelectedSubject);

addSoGForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!CURRENT_STUDENT?.uid) return;

  const selectedSubjectId = sogSubject?.value || "";
  if (!selectedSubjectId) {
    alert("Please select a subject from Subjects Taken.");
    return;
  }

  const subj = CURRENT_STUDENT_SUBJECTS.find(
    (s) => s.id === selectedSubjectId
  );
  if (!subj) {
    alert("Selected subject not found. Try reloading.");
    return;
  }

  const grade = sogMark?.value?.trim();
  if (!grade) {
    alert("Please enter a mark/grade.");
    return;
  }

  const yearRaw = subj.yearLevel ?? subj.year ?? "";
  const semRaw = subj.semester ?? subj.sem ?? subj.term ?? "";
  const yearLevel = yearKey(yearRaw);
  const semester = semKey(semRaw);
  const courseName =
    subj.courseName ??
    subj.subjectName ??
    subj.title ??
    "";
  const courseCode =
    subj.courseCode ??
    subj.subjectCode ??
    subj.code ??
    "";
  const units = Number(subj.units ?? 0) || 0;

  if (!yearLevel || !semester || !courseName || !courseCode) {
    alert(
      "Incomplete subject info (year/sem/name/code). Please check student's Subjects Taken."
    );
    return;
  }

  try {
    await addDoc(
      collection(db, "users", CURRENT_STUDENT.uid, "grades"),
      {
        yearLevel,
        semester,
        courseName,
        courseCode,
        units,
        grade,
        createdAt: serverTimestamp(),
        addedBy: ME.uid,
        addedByRole: "teacher",
        subjectRefId: subj.id,
      }
    );
    closeAddSoGModal();
    alert("Grade added.");
    await renderStudentSummary();
  } catch (err) {
    console.error("[teacher] add grade failed:", err);
    alert("Failed to add grade. Check permissions.");
  }
});

/* -------------------- Threads / Messaging (shared `threads` collection) -------------------- */

function renderNotifBadge(count) {
  if (!notifBadge) return;
  if (count <= 0) {
    notifBadge.setAttribute("hidden", "");
    return;
  }
  notifBadge.textContent = String(count);
  notifBadge.removeAttribute("hidden");
}

function renderNotifList(items) {
  if (!notifList) return;
  notifList.innerHTML = "";
  if (!items.length) {
    notifEmpty.style.display = "block";
    return;
  }
  notifEmpty.style.display = "none";

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "notif-item";
    row.innerHTML = `
      <div class="notif-ava">${escapeHTML(
        it.initials
      )}</div>
      <div>
        <div class="notif-title">${escapeHTML(
          it.title
        )}</div>
        <div class="notif-meta">
          ${escapeHTML(it.preview)} • ${escapeHTML(it.when)}
        </div>
      </div>`;
    row.addEventListener("click", () => {
      notifMenu.setAttribute("hidden", "");
      if (it.studentUid) {
        const student = ALL_MY_STUDENTS.find(
          (s) => s.uid === it.studentUid
        );
        if (student) {
          showPage("messages");
          openChatWith(student);
        }
      } else {
        showPage("messages");
        renderThreadsListFromCache();
      }
    });
    notifList.appendChild(row);
  }
}

openNotifsBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  const isHidden = notifMenu.hasAttribute("hidden");
  notifMenu.toggleAttribute("hidden", !isHidden);
  openNotifsBtn.setAttribute("aria-expanded", String(isHidden));
});
document.addEventListener("click", (e) => {
  if (!notifMenu || notifMenu.hasAttribute("hidden")) return;
  if (e.target.closest(".notif-wrap")) return;
  notifMenu.setAttribute("hidden", "");
  openNotifsBtn?.setAttribute("aria-expanded", "false");
});
notifViewAll?.addEventListener("click", () => {
  notifMenu.setAttribute("hidden", "");
  showPage("messages");
  renderThreadsListFromCache();
});
notifMarkRead?.addEventListener("click", () => {
  renderNotifBadge(0);
  renderNotifList([]);
});

function startThreadsWatcher() {
  if (THREADS_UNSUB) THREADS_UNSUB();

  const tRef = collection(db, "threads");

  THREADS_UNSUB = onSnapshot(
    tRef,
    (snap) => {
      const roster = new Set(
        ALL_MY_STUDENTS.map((s) => s.uid)
      );
      THREADS_CACHE = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => roster.has(t.studentUid));

      renderThreadsListFromCache();
      recomputeTeacherNotifications();
    },
    (err) => {
      console.warn(
        "[teacher] threads onSnapshot error:",
        err
      );
      THREADS_CACHE = [];
      renderThreadsListFromCache();
      renderNotifBadge(0);
      renderNotifList([]);
    }
  );
}

function recomputeTeacherNotifications() {
  if (!ME?.uid) {
    renderNotifBadge(0);
    renderNotifList([]);
    return;
  }

  const unread = [];

  for (const t of THREADS_CACHE) {
    const updatedAtMs = t.updatedAt?.toMillis?.() || 0;
    if (t.lastSender && t.studentUid && t.lastSender === t.studentUid) {
      unread.push({
        type: "dm",
        studentUid: t.studentUid,
        title: t.studentName || t.studentEmail || "Student",
        preview: t.lastMessage?.text || "New message",
        when: formatWhen(updatedAtMs),
        initials: initialsOf(
          t.studentName || t.studentEmail || "S"
        ),
      });
    }
  }

  unread.sort(
    (a, b) =>
      new Date(b.when).getTime() -
      new Date(a.when).getTime()
  );
  renderNotifBadge(unread.length);
  renderNotifList(unread.slice(0, 20));
}

function renderThreadsListFromCache() {
  if (!threadList) return;
  threadList.innerHTML = "";

  const rows = THREADS_CACHE.slice().sort(
    (a, b) =>
      (b.updatedAt?.toMillis?.() || 0) -
      (a.updatedAt?.toMillis?.() || 0)
  );

  if (!rows.length) {
    threadEmpty.style.display = "block";
    return;
  }
  threadEmpty.style.display = "none";

  for (const t of rows) {
    const el = document.createElement("div");
    el.className = "thread-item";
    const who =
      t.studentName ||
      t.studentEmail ||
      t.studentUid ||
      "Student";
    el.innerHTML = `
      <div style="font-weight:800">${escapeHTML(
        who
      )}</div>
      <div class="muted" style="font-size:.9rem">
        ${escapeHTML(t.lastMessage?.text || "")}
      </div>`;
    el.addEventListener("click", () => {
      const student =
        ALL_MY_STUDENTS.find(
          (s) => s.uid === t.studentUid
        ) || {
          uid: t.studentUid,
          name: t.studentName || who,
          email: t.studentEmail || "",
        };
      openChatWith(student);
    });
    threadList.appendChild(el);
  }
}

/* --- Ensure `threads/{studentUid}` exists --- */
async function ensureThreadDocForStudent(student) {
  const tRef = doc(db, "threads", student.uid);
  const tSnap = await getDoc(tRef);
  if (!tSnap.exists()) {
    await setDoc(
      tRef,
      {
        studentUid: student.uid,
        studentEmail: student.email || "",
        studentName: student.name || "",
        lastMessage: {
          subject: "Conversation",
          text: "",
          sender: student.uid,
        },
        updatedAt: serverTimestamp(),
        lastSender: student.uid,
        unread: false,
      },
      { merge: true }
    );
  } else {
    await setDoc(
      tRef,
      {
        studentUid: student.uid,
        studentEmail: student.email || "",
        studentName: student.name || "",
      },
      { merge: true }
    );
  }
  return tRef;
}

/* --- Open chat with student over `threads/{studentUid}/messages` --- */
async function openChatWith(student) {
  if (!ME?.uid || !student?.uid) return;

  CURRENT_STUDENT = student;
  CURRENT_THREAD_STUDENT_UID = student.uid;

  chatTitle.textContent = `Message: ${
    student.name || "Student"
  }`;
  chatBody.innerHTML =
    '<div class="muted" style="margin:8px 0;">Loading…</div>';

  const tRef = await ensureThreadDocForStudent(student);

  if (MSG_UNSUB) MSG_UNSUB();

  const msgsQ = query(
    collection(db, "threads", student.uid, "messages"),
    orderBy("createdAt", "asc")
  );

  MSG_UNSUB = onSnapshot(
    msgsQ,
    (snap) => {
      chatBody.innerHTML = "";
      if (!snap.docs.length) {
        chatBody.innerHTML =
          '<div class="muted" style="margin:8px 0;">No messages yet. Start the conversation!</div>';
        return;
      }
      snap.forEach((docSnap) => {
        const m = docSnap.data();
        const mine =
          m.senderId === ME.uid ||
          m.senderRole === "teacher";
        const time = m.createdAt?.toDate?.()
          ? new Date(m.createdAt.toDate())
          : null;

        const div = document.createElement("div");
        div.className =
          "chat-msg " + (mine ? "me" : "them");
        div.innerHTML = `
          <div>${escapeHTML(m.text || "")}</div>
          <div class="muted" style="font-size:.75rem;margin-top:4px;">
            ${time ? time.toLocaleString() : ""}
          </div>`;
        chatBody.appendChild(div);
      });
      chatBody.scrollTop = chatBody.scrollHeight;
      chatInput?.focus();
    },
    (err) => {
      console.error(
        "[teacher] messages onSnapshot error:",
        err
      );
      chatBody.innerHTML =
        '<div class="muted" style="margin:8px 0;">Failed to load messages.</div>';
    }
  );
}

async function sendChatMessage() {
  const text = (chatInput?.value || "").trim();
  if (!text || !CURRENT_THREAD_STUDENT_UID || !ME?.uid) return;

  const studentUid = CURRENT_THREAD_STUDENT_UID;
  chatInput.value = "";

  try {
    const tRef = doc(db, "threads", studentUid);
    await addDoc(collection(tRef, "messages"), {
      text,
      senderId: ME.uid,
      senderRole: "teacher",
      senderName: sidebarName?.textContent || "Teacher",
      createdAt: serverTimestamp(),
    });

    await setDoc(
      tRef,
      {
        lastMessage: {
          subject: "Message",
          text,
          sender: ME.uid,
        },
        lastSender: ME.uid,
        updatedAt: serverTimestamp(),
        unread: true,
      },
      { merge: true }
    );
  } catch (err) {
    console.error("[teacher] send message failed:", err);
    alert("Failed to send message.");
  }
}

chatSend?.addEventListener("click", sendChatMessage);
chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

/* -------------------- Logout -------------------- */
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "auth.html";
});
