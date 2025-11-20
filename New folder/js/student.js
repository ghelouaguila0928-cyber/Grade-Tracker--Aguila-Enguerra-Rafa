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
  updateDoc,
  deleteDoc,
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

// Chat
const chatThread = document.getElementById("chatThread");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

/* -------------------- helpers -------------------- */
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
  if (pageTitle) {
    const titleText = {
      grades: "My Grades",
      subjects: "Subjects Taken",
      messages: "Chat",
      profile: "Profile",
    }[id] || id;
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
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  targetEls.forEach((el) => el && (el.textContent = initials));
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }
    )[c]
  );
}
const coerceStr = (v) => (v === undefined || v === null ? "" : String(v));

/* ----- shared helpers for year + thread id ----- */
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

const threadIdFor = (a, b) =>
  String(a) < String(b) ? `${a}__${b}` : `${b}__${a}`;

/* -------------------- Summary of Grades -------------------- */
function computeGWA(rows) {
  let wsum = 0,
    units = 0;
  rows.forEach((r) => {
    const u = Number(r.units);
    const g = Number(r.grade);
    if (!isNaN(u) && !isNaN(g)) {
      wsum += u * g;
      units += u;
    }
  });
  if (units === 0) return null;
  return wsum / units;
}

function normalizeGrade(rec) {
  return {
    code:
      rec.code ||
      rec.subjectCode ||
      rec.courseCode ||
      rec.subject ||
      "—",
    title:
      rec.title ||
      rec.subjectTitle ||
      rec.courseName ||
      rec.subject ||
      "—",
    units: Number(rec.units ?? rec.creditUnits ?? 0) || 0,
    grade: rec.grade ?? rec.final ?? rec.finalGrade ?? rec.mark ?? "—",
    remarks: rec.remarks ?? rec.remark ?? "",
    yearLevel: String(rec.yearLevel ?? rec.year ?? ""),
    semester: rec.semester || rec.term || rec.sem || "",
  };
}

async function fetchGradesForTerm(user, yearLevel, sem) {
  const qGrades = query(
    collection(db, "users", user.uid, "grades"),
    where("yearLevel", "==", String(yearLevel)),
    where("semester", "==", String(sem))
  );
  const snap = await getDocs(qGrades);
  return snap.docs.map((d) => normalizeGrade(d.data()));
}

function renderSummary(rows, yearLevel, sem) {
  if (!summaryTableBody) return;
  const prettyYearMap = {
    "1": "1st Year",
    "2": "2nd Year",
    "3": "3rd Year",
    "4": "4th Year",
    "5": "5th Year",
  };
  const prettyYear =
    prettyYearMap[String(yearLevel)] || `Year ${yearLevel}`;

  if (!rows || rows.length === 0) {
    summaryTableBody.innerHTML = `<tr><td colspan="4" class="muted">No grades found for ${escapeHTML(
      prettyYear
    )} • ${escapeHTML(sem)}</td></tr>`;
    totalUnitsEl && (totalUnitsEl.textContent = "0");
    gwaEl && (gwaEl.textContent = "—");
    summaryMeta &&
      (summaryMeta.textContent = `Summary for ${prettyYear} • ${sem}`);
    return;
  }

  summaryTableBody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${escapeHTML(r.title || "—")}</td>
      <td>${escapeHTML(r.code || "—")}</td>
      <td>${Number(r.units) || 0}</td>
      <td>${escapeHTML(r.grade ?? "—")}</td>
    </tr>
  `
    )
    .join("");

  const totalUnits = rows.reduce(
    (s, r) => s + (Number(r.units) || 0),
    0
  );
  totalUnitsEl && (totalUnitsEl.textContent = String(totalUnits));

  const gwa = computeGWA(rows);
  gwaEl && (gwaEl.textContent = gwa == null ? "—" : gwa.toFixed(3));

  summaryMeta &&
    (summaryMeta.textContent = `Summary for ${prettyYear} • ${sem}`);
}

function toCSV(rows, meta) {
  const header = ["Course Name", "Course Code", "Units", "Mark"];
  const lines = [header.join(",")];
  rows.forEach((r) => {
    const vals = [
      r.title || "—",
      r.code || "—",
      Number(r.units) || 0,
      r.grade ?? "—",
    ];
    lines.push(
      vals.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")
    );
  });
  lines.push("");
  lines.push(`"Total Units",${meta.totalUnits},"GWA",${meta.gwa ?? ""}`);
  return lines.join("\n");
}

function download(filename, text) {
  const blob = new Blob([text], {
    type: "text/csv;charset=utf-8",
  });
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

async function handleGenerate(user) {
  if (!selectYearLevel || !selectSem) return;
  const yearLevel = selectYearLevel.value;
  const sem = selectSem.value;
  if (summaryTableBody)
    summaryTableBody.innerHTML = `<tr><td colspan="4">Loading…</td></tr>`;
  try {
    const rows = await fetchGradesForTerm(user, yearLevel, sem);
    renderSummary(rows, yearLevel, sem);

    downloadSummaryBtn?.addEventListener(
      "click",
      () => {
        const csv = toCSV(rows, {
          totalUnits: rows.reduce(
            (s, r) => s + (Number(r.units) || 0),
            0
          ),
          gwa: (() => {
            const g = computeGWA(rows);
            return g == null ? "" : g.toFixed(3);
          })(),
        });
        const prettyYearMap = {
          "1": "1stYear",
          "2": "2ndYear",
          "3": "3rdYear",
          "4": "4thYear",
          "5": "5thYear",
        };
        const prettyYear =
          prettyYearMap[String(yearLevel)] || `Year${yearLevel}`;
        download(`Summary_${prettyYear}_${sem}.csv`, csv);
      },
      { once: true }
    );
  } catch (err) {
    console.error("[student] fetch grades failed:", err);
    if (summaryTableBody)
      summaryTableBody.innerHTML = `<tr><td colspan="4" class="muted">Error fetching grades.</td></tr>`;
    totalUnitsEl && (totalUnitsEl.textContent = "0");
    gwaEl && (gwaEl.textContent = "—");
    const prettyYearMap = {
      "1": "1st Year",
      "2": "2nd Year",
      "3": "3rd Year",
      "4": "4th Year",
      "5": "5th Year",
    };
    const prettyYear =
      prettyYearMap[String(selectYearLevel.value)] ||
      `Year ${selectYearLevel.value}`;
    summaryMeta &&
      (summaryMeta.textContent = `Summary for ${prettyYear} • ${selectSem.value}`);
  }
}

/* -------------------- Chat (Student ↔ Admin/Teacher) -------------------- */

let threadUnsubAdmin = null;
let threadUnsubTeacher = null;
let adminMessages = [];
let teacherMessages = [];
let TEACHER_FOR_CHAT = null;

/* 🔴 NEW: store current profile para magamit sa subjectsTaken */
let currentProfile = null;

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
      ${messages
        .map((m) => {
          const mine =
            m.senderId === currentUid ||
            m.senderUid === currentUid ||
            m.senderRole === "student";
          const whenSrc = m.createdAt?.toDate
            ? m.createdAt.toDate()
            : new Date();
          const when = whenSrc.toLocaleString();
          return `
          <div class="bubble ${mine ? "me" : "them"}">
            <div class="bubble-body">${escapeHTML(
              m.text || ""
            ).replace(/\n/g, "<br/>")}</div>
            <div class="bubble-meta">${when}</div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;
  chatThread.scrollTop = chatThread.scrollHeight;
}

async function ensureThreadDoc(user, subjectText = "Conversation with Admin") {
  const tRef = doc(db, "threads", user.uid);
  const tSnap = await getDoc(tRef);
  if (!tSnap.exists()) {
    await setDoc(
      tRef,
      {
        studentUid: user.uid,
        studentEmail: user.email || "",
        studentName: user.displayName || "",
        lastMessage: { subject: subjectText, text: "", sender: user.uid },
        updatedAt: serverTimestamp(),
        lastSender: user.uid,
        unread: false,
      },
      { merge: true }
    );
  }
  return tRef;
}

async function sendMessageToAdmin(user, text) {
  const tRef = await ensureThreadDoc(user);

  await addDoc(collection(tRef, "messages"), {
    senderId: user.uid,
    senderRole: "student",
    text,
    createdAt: serverTimestamp(),
  });

  await setDoc(
    tRef,
    {
      lastMessage: { subject: "Message", text, sender: user.uid },
      lastSender: user.uid,
      updatedAt: serverTimestamp(),
      unread: true,
    },
    { merge: true }
  );
}

async function sendMessageToTeacher(user, text) {
  if (!TEACHER_FOR_CHAT) {
    console.warn("No assigned teacher for this student.");
    return;
  }

  const tid = threadIdFor(user.uid, TEACHER_FOR_CHAT);
  const tRef = doc(db, "dmThreads", tid);

  await setDoc(
    tRef,
    {
      participants: [user.uid, TEACHER_FOR_CHAT],
      teacherUid: TEACHER_FOR_CHAT,
      studentUid: user.uid,
      studentName: user.displayName || "",
      lastAt: serverTimestamp(),
      lastMessage: text,
      lastSenderUid: user.uid,
    },
    { merge: true }
  );

  await addDoc(collection(db, "dmThreads", tid, "messages"), {
    text,
    createdAt: serverTimestamp(),
    senderUid: user.uid,
    senderRole: "student",
  });
}

function bindRealtimeThread(user) {
  if (!user) return;

  if (threadUnsubAdmin) threadUnsubAdmin();
  if (threadUnsubTeacher) threadUnsubTeacher();
  adminMessages = [];
  teacherMessages = [];

  const mergeAndRender = () => {
    const all = [...adminMessages, ...teacherMessages].sort(
      (a, b) =>
        (a.createdAt?.toMillis?.() ?? 0) -
        (b.createdAt?.toMillis?.() ?? 0)
    );
    renderChat(all, user.uid);
  };

  const msgsAdminQ = query(
    collection(db, "threads", user.uid, "messages"),
    orderBy("createdAt", "asc")
  );
  threadUnsubAdmin = onSnapshot(
    msgsAdminQ,
    (qs) => {
      adminMessages = qs.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      mergeAndRender();
    },
    (err) => {
      console.error("[student] admin thread snapshot error:", err);
    }
  );

  if (TEACHER_FOR_CHAT) {
    const tid = threadIdFor(user.uid, TEACHER_FOR_CHAT);
    const msgsTeacherQ = query(
      collection(db, "dmThreads", tid, "messages"),
      orderBy("createdAt", "asc")
    );
    threadUnsubTeacher = onSnapshot(
      msgsTeacherQ,
      (qs) => {
        teacherMessages = qs.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        mergeAndRender();
      },
      (err) => {
        console.error(
          "[student] teacher thread snapshot error:",
          err
        );
      }
    );
  } else {
    teacherMessages = [];
    mergeAndRender();
  }
}

/* -------------------- Assigned Teacher lookup -------------------- */

async function findAssignedTeacherForStudent(profileData) {
  const course = profileData.course || profileData.program || "";
  const section = profileData.section || profileData.classSection || "";
  const yearRaw = profileData.year || profileData.yearLevel || "";
  const year = yearKey(yearRaw);

  if (!course || !section || !year) return null;

  try {
    const qSec = query(
      collection(db, "sections"),
      where("course", "==", course),
      where("name", "==", section),
      where("year", "==", year)
    );
    const secSnap = await getDocs(qSec);
    if (secSnap.empty) return null;
    const secDoc = secSnap.docs[0];
    const sectionId = secDoc.id;

    const qTeach = query(
      collection(db, "teaching"),
      where("sectionId", "==", sectionId)
    );
    const tSnap = await getDocs(qTeach);
    if (tSnap.empty) return null;

    const tDoc = tSnap.docs[0].data();
    return {
      teacherUid: tDoc.teacherUid,
      sectionId,
    };
  } catch (err) {
    console.error(
      "[student] findAssignedTeacherForStudent error:",
      err
    );
    return null;
  }
}

/* -------------------- Profile hydrate -------------------- */

// only backfill if NO document yet; para hindi masapawan ang data galing signup
async function backfillEmptyProfile(user, data) {
  if (data) return null;

  const patch = {
    uid: user.uid,
    role: "student",
    name: user.displayName || "Student",
    email: user.email || "",
  };
  try {
    await setDoc(doc(db, "users", user.uid), patch, { merge: true });
    return patch;
  } catch (e) {
    console.warn("[student.js] backfill failed:", e);
    return null;
  }
}

function applyProfileToUI(data, user) {
  const name = coerceStr(
    data?.name || user?.displayName || "Student"
  ).trim();
  const email = coerceStr(user?.email || data?.email || "—").trim();
  const studentId = coerceStr(
    data?.studentId ?? data?.studentIdNumber ?? data?.id ?? "—"
  ).trim();

  // ---------- SMART COURSE DETECTION ----------
  const KNOWN_COURSES = [
    "Computer Programming",
    "Food Service Management",
    "Electrical Technology",
    "Electronics Technology",
    "Automotive Technology",
    "CP",
    "FSM",
    "ET",
    "ELECTRICAL TECHNOLOGY",
    "ELECTRONICS TECHNOLOGY",
    "AUTOMOTIVE TECHNOLOGY",
  ].map((c) => c.trim());

  let course = "";

  // 1) direct fields
  if (data) {
    course = coerceStr(data.course ?? data.program ?? "").trim();
  }

  // 2) by key name
  if (!course && data && typeof data === "object") {
    const keys = Object.keys(data);
    for (const k of keys) {
      const kl = k.toLowerCase();
      if (
        kl.includes("course") ||
        kl.includes("program") ||
        kl.includes("strand") ||
        kl.includes("track") ||
        kl.includes("major")
      ) {
        const val = coerceStr(data[k]).trim();
        if (val) {
          course = val;
          break;
        }
      }
    }
  }

  // 3) scan all values, match against known course list
  if (!course && data && typeof data === "object") {
    const lowerKnown = KNOWN_COURSES.map((c) => c.toLowerCase());
    for (const val of Object.values(data)) {
      if (typeof val === "string") {
        const vTrim = val.trim();
        const idx = lowerKnown.indexOf(vTrim.toLowerCase());
        if (idx !== -1) {
          course = KNOWN_COURSES[idx];
          break;
        }
      }
    }
  }

  // 🔧 normalize codes / variants to full course names
  if (course) {
    const courseMap = {
      "cp": "Computer Programming",
      "computer programming": "Computer Programming",

      "fsm": "Food Service Management",
      "food service management": "Food Service Management",

      "et": "Electronics Technology",
      "electronics technology": "Electronics Technology",

      "electrical technology": "Electrical Technology",
      "elect tech": "Electrical Technology",
      "electrical tech": "Electrical Technology",

      "at": "Automotive Technology",
      "auto": "Automotive Technology",
      "auto tech": "Automotive Technology",
      "automotive technology": "Automotive Technology",
    };

    const norm = course.trim().toLowerCase();
    if (courseMap[norm]) {
      course = courseMap[norm];
    }
  }

  if (!course) course = "—";

  const rawYear = coerceStr(
    data?.year ?? data?.yearLevel ?? ""
  ).trim();
  const year = rawYear ? String(rawYear) : "";
  const section = coerceStr(
    data?.section ?? data?.classSection ?? "—"
  ).trim();

  sidebarName && (sidebarName.textContent = name || "Student");
  sidebarRole &&
    (sidebarRole.textContent = `ID: ${studentId || "—"}`);

  profileStudentName &&
    (profileStudentName.textContent = name || "Student");
  profileStudentId &&
    (profileStudentId.textContent = `Student ID: ${
      studentId || "—"
    }`);
  setInitials(
    [document.getElementById("sidebarAvatar"), profileInitials],
    name || "Student"
  );

  p_name && (p_name.textContent = name || "—");
  p_email && (p_email.textContent = email || "—");
  p_studentId && (p_studentId.textContent = studentId || "—");
  p_course && (p_course.textContent = course || "—");
  p_year && (p_year.textContent = year || "—");
  p_section && (p_section.textContent = section || "—");

  if (
    selectYearLevel &&
    year &&
    ["1", "2", "3", "4", "5"].includes(year)
  ) {
    selectYearLevel.value = year;
  }

  // 🔴 store current profile for subjectsTaken metadata
  currentProfile = {
    ...(data || {}),
    name,
    email,
    course,
    year,
    section,
    studentId,
  };
}

/* -------------------- SUBJECTS TAKEN (filter + edit/delete) -------------------- */

let subjectsFeatureInitialized = false;

function initSubjectsTakenFeature(user) {
  if (subjectsFeatureInitialized) return;
  subjectsFeatureInitialized = true;

  const subjectsYearLevel =
    document.getElementById("subjectsYearLevel");
  const subjectsSem = document.getElementById("subjectsSem");
  const subjectsTableBody =
    document.getElementById("subjectsTableBody");
  const addSubjectRowBtn =
    document.getElementById("addSubjectRowBtn");
  const clearSubjectsBtn =
    document.getElementById("clearSubjectsBtn");
  const saveSubjectsBtn =
    document.getElementById("saveSubjectsBtn");

  if (!subjectsTableBody || !subjectsYearLevel || !subjectsSem)
    return;

  const getEmptyRowHtml = () => `
    <tr data-empty="true">
      <td colspan="6" class="muted">
        Click "Add Subject" para maglagay ng subject sa napiling year at sem.
      </td>
    </tr>
  `;

  // Add Subject row (unsaved row, only in DOM)
  addSubjectRowBtn?.addEventListener("click", () => {
    const emptyRow =
      subjectsTableBody.querySelector('tr[data-empty="true"]');
    if (emptyRow) emptyRow.remove();

    const currentYear = subjectsYearLevel.value;
    const currentSem = subjectsSem.value;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <input type="text" class="form-control" placeholder="Course Name" />
      </td>
      <td>
        <input type="text" class="form-control" placeholder="Course Code" />
      </td>
      <td>
        <input type="number" class="form-control" min="0" step="0.5" placeholder="Units" />
      </td>
      <td class="subjects-year">${escapeHTML(currentYear)}</td>
      <td class="subjects-sem">${escapeHTML(currentSem)}</td>
      <td class="subjects-actions">
        <button type="button" class="btn-icon btn-delete" title="Remove row">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    subjectsTableBody.appendChild(tr);
  });

  // Clear button
  clearSubjectsBtn?.addEventListener("click", () => {
    subjectsTableBody.innerHTML = getEmptyRowHtml();
    showToast("Subjects list cleared.");
  });

  // SAVE to Firestore all input rows (no status field sa UI, pero may status sa DB)
  saveSubjectsBtn?.addEventListener("click", async () => {
    const rows = Array.from(
      subjectsTableBody.querySelectorAll("tr")
    );
    const batchSubjects = [];

    rows.forEach((row) => {
      if (row.dataset.empty === "true") return;

      const inputs = row.querySelectorAll("input");
      // If no inputs, it's already a saved row → skip
      if (!inputs.length) return;

      const courseName = inputs[0].value.trim();
      const courseCode = inputs[1].value.trim();
      const units = parseFloat(inputs[2].value) || 0;

      const year =
        row.querySelector(".subjects-year")?.textContent.trim() ||
        "";
      const sem =
        row.querySelector(".subjects-sem")?.textContent.trim() ||
        "";

      if (!courseName && !courseCode) return;

      const profile = currentProfile || {};
      const studentCourse = profile.course || profile.program || "";
      const studentSection =
        profile.section || profile.classSection || "";
      const studentYear =
        profile.year || profile.yearLevel || year || "";

      batchSubjects.push({
        courseName,
        courseCode,
        units,
        // main fields used by teacher portal
        yearLevel: year || studentYear,
        semester: sem,
        // duplicate for student-side filtering
        year: year || studentYear,
        sem,
        createdAt: serverTimestamp(),

        // 🔴 NEW: metadata para sa admin/teacher queries
        studentUid: user.uid,
        studentName:
          user.displayName || profile.name || "",
        course: studentCourse,
        section: studentSection,
        studentId: profile.studentId || "",
        status: "Pending", // hidden sa UI pero pwedeng i-filter ng admin/teacher
      });
    });

    if (!batchSubjects.length) {
      showToast("Walang subjects na ise-save.", "error");
      return;
    }

    try {
      const colRef = collection(
        db,
        "users",
        user.uid,
        "subjectsTaken"
      );
      for (const subj of batchSubjects) {
        await addDoc(colRef, subj);
      }
      showToast("Subjects saved.");
      await loadSubjects();
    } catch (err) {
      console.error("Error saving subjects:", err);
      showToast("Error saving subjects.", "error");
    }
  });

  // Load subjects filtered by year + sem
  async function loadSubjects() {
    const selectedYear = subjectsYearLevel.value;
    const selectedSem = subjectsSem.value;

    const colRef = collection(
      db,
      "users",
      user.uid,
      "subjectsTaken"
    );
    const qRef = query(
      colRef,
      where("year", "==", selectedYear),
      where("sem", "==", selectedSem)
    );

    const snap = await getDocs(qRef);

    subjectsTableBody.innerHTML = "";

    if (snap.empty) {
      subjectsTableBody.innerHTML = getEmptyRowHtml();
      return;
    }

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const tr = document.createElement("tr");
      tr.dataset.id = docSnap.id;
      tr.innerHTML = `
        <td class="cell-name">${escapeHTML(
          d.courseName || ""
        )}</td>
        <td class="cell-code">${escapeHTML(
          d.courseCode || ""
        )}</td>
        <td class="cell-units">${d.units ?? ""}</td>
        <td class="subjects-year">${escapeHTML(
          d.year || d.yearLevel || ""
        )}</td>
        <td class="subjects-sem">${escapeHTML(
          d.sem || d.semester || ""
        )}</td>
        <td class="subjects-actions">
          <button type="button" class="btn-icon btn-edit" title="Edit">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" class="btn-icon btn-delete" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      subjectsTableBody.appendChild(tr);
    });
  }

  // Event delegation for edit/delete
  subjectsTableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const tr = btn.closest("tr");
    if (!tr || tr.dataset.empty === "true") return;

    // DELETE (saved row or unsaved input row)
    if (btn.classList.contains("btn-delete")) {
      const docId = tr.dataset.id;

      // If no docId → unsaved row → just remove from DOM
      if (!docId) {
        tr.remove();
        if (!subjectsTableBody.querySelector("tr")) {
          subjectsTableBody.innerHTML = getEmptyRowHtml();
        }
        return;
      }

      const ok = confirm("Delete this subject?");
      if (!ok) return;

      try {
        const subjRef = doc(
          db,
          "users",
          user.uid,
          "subjectsTaken",
          docId
        );
        await deleteDoc(subjRef);
        showToast("Subject deleted.");
        await loadSubjects();
      } catch (err) {
        console.error("Error deleting subject:", err);
        showToast("Error deleting subject.", "error");
      }
      return;
    }

    // EDIT → convert cells to inputs (no status sa UI)
    if (btn.classList.contains("btn-edit")) {
      const nameCell = tr.querySelector(".cell-name");
      const codeCell = tr.querySelector(".cell-code");
      const unitsCell = tr.querySelector(".cell-units");

      const nameVal = nameCell.textContent.trim();
      const codeVal = codeCell.textContent.trim();
      const unitsVal = unitsCell.textContent.trim();

      nameCell.innerHTML = `<input type="text" class="form-control" value="${escapeHTML(
        nameVal
      )}" />`;
      codeCell.innerHTML = `<input type="text" class="form-control" value="${escapeHTML(
        codeVal
      )}" />`;
      unitsCell.innerHTML = `<input type="number" class="form-control" min="0" step="0.5" value="${escapeHTML(
        unitsVal
      )}" />`;

      btn.classList.remove("btn-edit");
      btn.classList.add("btn-save");
      btn.title = "Save";
      btn.innerHTML = `<i class="fas fa-save"></i>`;
      return;
    }

    // SAVE edited row (no status sa UI, pero status field pwede manatili sa DB)
    if (btn.classList.contains("btn-save")) {
      const docId = tr.dataset.id;
      if (!docId) return;

      const nameInput =
        tr.querySelector(".cell-name input");
      const codeInput =
        tr.querySelector(".cell-code input");
      const unitsInput =
        tr.querySelector(".cell-units input");
      const yearCell = tr.querySelector(".subjects-year");
      const semCell = tr.querySelector(".subjects-sem");

      const courseName = nameInput.value.trim();
      const courseCode = codeInput.value.trim();
      const units = parseFloat(unitsInput.value) || 0;
      const year = yearCell.textContent.trim();
      const sem = semCell.textContent.trim();

      try {
        const subjRef = doc(
          db,
          "users",
          user.uid,
          "subjectsTaken",
          docId
        );
        await updateDoc(subjRef, {
          courseName,
          courseCode,
          units,
          yearLevel: year,
          semester: sem,
          year,
          sem,
        });
        showToast("Subject updated.");
        await loadSubjects();
      } catch (err) {
        console.error("Error updating subject:", err);
        showToast("Error updating subject.", "error");
      }
    }
  });

  // Reload when filters change
  subjectsYearLevel.addEventListener("change", () => {
    loadSubjects().catch(console.error);
  });
  subjectsSem.addEventListener("change", () => {
    loadSubjects().catch(console.error);
  });

  // Initial load
  loadSubjects().catch(console.error);
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
  generateSummaryBtn?.addEventListener("click", async () => {
    await handleGenerate(user);
  });

  try {
    const ref = doc(db, "users", user.uid);
    let snap = await getDoc(ref);
    let data = snap.exists() ? snap.data() : null;

    const patched = await backfillEmptyProfile(user, data);
    if (patched) {
      snap = await getDoc(ref);
      data = snap.exists() ? snap.data() : null;
    }

    applyProfileToUI(data, user);

    // Init Subjects Taken feature
    initSubjectsTakenFeature(user);

    const assigned = await findAssignedTeacherForStudent(
      data || {}
    );
    TEACHER_FOR_CHAT = assigned?.teacherUid || null;

    await ensureThreadDoc(user);
    bindRealtimeThread(user);

    // multiple messages allowed
    chatForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const me = auth.currentUser;
      const text = (chatInput?.value || "").trim();

      if (!me)
        return showToast("You are not signed in.", "error");
      if (!text) return;

      try {
        await sendMessageToAdmin(me, text);
        if (TEACHER_FOR_CHAT) {
          await sendMessageToTeacher(me, text);
        }
        chatInput.value = "";
      } catch (err) {
        console.error("send message failed:", err);
        showToast("Failed to send message.", "error");
      }
    });
  } catch (err) {
    console.error("student auth guard:", err);
    applyProfileToUI(null, user);

    try {
      await ensureThreadDoc(user);
      bindRealtimeThread(user);
    } catch {}
  }
});
