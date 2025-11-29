import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
  serverTimestamp,
  getCountFromServer,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ================= ROUTE GUARD (Admin only) ================= */
(async function guardAdmin() {
  document.documentElement.style.visibility = "hidden";

  await new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          location.href = "auth.html";
          return;
        }

        const token = await user.getIdTokenResult(true);
        let isAdmin = token?.claims?.admin === true;

        if (!isAdmin) {
          try {
            const snap = await getDoc(doc(db, "users", user.uid));
            const role = (snap.exists() ? (snap.data().role || "student") : "student").toLowerCase();
            isAdmin = ["admin", "administrator", "superadmin"].includes(role);
          } catch {
            isAdmin = false;
          }
        }

        if (!isAdmin) {
          alert("Not authorized.");
          location.href = "auth.html";
          return;
        }

        document.documentElement.style.visibility = "visible";
        initDashboard();
      } catch (e) {
        console.error("[admin guard] error:", e);
        location.href = "auth.html";
      } finally {
        resolve();
      }
    });
  });
})();

/* ================= Helpers ================= */
const escapeHTML = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));

const semKey = (label) => {
  const v = String(label || "").toLowerCase();
  if (v.startsWith("1")) return "1st";
  if (v.startsWith("2")) return "2nd";
  return "Summer";
};

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
  ({
    "1": "1st Year",
    "2": "2nd Year",
    "3": "3rd Year",
    "4": "4th Year",
    "5": "5th Year"
  }[String(y)] || (y ? `Year ${y}` : "—"));

const toNumberGrade = (g) => {
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
    F: 55
  };
  return map[L] ?? null;
};

const tsToLocal = (t) =>
  t?.toDate ? new Date(t.toDate()).toLocaleString() : "";

const debounce = (fn, wait = 400) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};

const initials = (name, fb = "U") =>
  (name || fb)
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/* Small helper for deleting a whole subcollection */
async function deleteSubcollection([c1, id1, c2]) {
  const ref = collection(db, c1, id1, c2);
  const snap = await getDocs(ref);
  console.log(`[deleteSubcollection] ${c1}/${id1}/${c2} -> ${snap.size} docs`);
  await Promise.all(
    snap.docs.map((d) => {
      console.log("  deleting:", d.ref.path);
      return deleteDoc(d.ref);
    })
  );
}

/* ================= Main ================= */
function initDashboard() {
  /* ---------- DOM ---------- */
  const overlay = document.getElementById("sidebarOverlay");
  const toggleSidebarBtn = document.getElementById("toggleSidebar");
  const pageTitle = document.getElementById("pageTitle");
  const navLinks = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");

  // Notifications DOM
  const openNotifsBtn = document.getElementById("openNotifs");
  const notifBadge = document.getElementById("notifBadge");
  const notifMenu = document.getElementById("notifMenu");
  const notifList = document.getElementById("notifList");
  const notifEmpty = document.getElementById("notifEmpty");
  const notifViewAll = document.getElementById("notifViewAll");
  const notifMarkRead = document.getElementById("notifMarkRead");

  const TITLES = {
    students: "Student Management",
    "student-detail": "Student Detail",
    sections: "Sections",
    "section-detail": "Section Details",
    teachers: "Teachers",
    "teacher-detail": "Teacher Detail",
    messages: "Messages",
    "message-thread": "Message Thread"
  };

  /* ---------- Sidebar toggle ---------- */
  toggleSidebarBtn?.addEventListener("click", () => {
    const mobile = window.matchMedia("(max-width: 1024px)").matches;
    if (mobile) {
      const open = !document.body.classList.contains("sidebar-open");
      document.body.classList.toggle("sidebar-open", open);
      overlay?.classList.toggle("show", open);
      overlay?.setAttribute("aria-hidden", open ? "false" : "true");
    } else {
      document.getElementById("sidebar")?.classList.toggle("collapsed");
    }
  });

  overlay?.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
    overlay?.classList.remove("show");
    overlay?.setAttribute("aria-hidden", "true");
  });

  /* ---------- Nav + pages ---------- */
  function showPage(key) {
    pages.forEach((p) => p.classList.toggle("active", p.id === key));
    navLinks.forEach((a) =>
      a.classList.toggle("active", a.dataset.page === key)
    );
    pageTitle.textContent = TITLES[key] || "Admin Portal";
    window.scrollTo({ top: 0, behavior: "instant" });

    if (key === "messages") {
      markNotificationsSeen().catch(() => {});
      renderThreadsTable(THREADS_CACHE);
    }
  }

  navLinks.forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showPage(a.dataset.page);
      document.body.classList.remove("sidebar-open");
      overlay?.classList.remove("show");
      overlay?.setAttribute("aria-hidden", "true");
    })
  );

  showPage("students");

  /* ---------- Notifications ---------- */
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
      row.className =
        "notif-item " +
        (it.type === "admin" ? "notif-type-admin" : "notif-type-dm");
      row.innerHTML = `
        <div class="notif-ava">${escapeHTML(it.initials)}</div>
        <div>
          <div class="notif-title">${escapeHTML(it.title)}</div>
          <div class="notif-meta">${escapeHTML(it.preview)} • ${escapeHTML(
        it.when
      )}</div>
        </div>
      `;
      row.addEventListener("click", async () => {
        notifMenu.setAttribute("hidden", "");
        showPage("messages");
        await openThread(it.threadId, {
          studentUid: it.studentUid,
          name: it.title,
          email: it.email || ""
        });
        markNotificationsSeen().catch(() => {});
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
    renderThreadsTable(THREADS_CACHE);
    markNotificationsSeen().catch(() => {});
  });

  notifMarkRead?.addEventListener("click", () => {
    markNotificationsSeen().catch(() => {});
    renderNotifBadge(0);
    renderNotifList([]);
  });

  async function markNotificationsSeen() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await setDoc(
      doc(db, "adminMeta", uid),
      { lastOpenedAt: serverTimestamp() },
      { merge: true }
    );
  }

  function formatWhenMs(ms) {
    return new Date(ms).toLocaleString();
  }

  function startThreadsWatcher() {
    const tRef = collection(db, "threads");
    let lastOpened = 0;
    let cache = [];

    const recompute = async () => {
      try {
        const meta = await getDoc(
          doc(db, "adminMeta", auth.currentUser?.uid || "_")
        );
        lastOpened = meta?.exists()
          ? meta.data().lastOpenedAt?.toMillis?.() || 0
          : 0;
      } catch {
        lastOpened = 0;
      }

      const unread = [];
      for (const r of cache) {
        const upd = r.updatedAt?.toMillis?.() || 0;
        const isNewFromStudent =
          r.lastSender && r.studentUid && r.lastSender === r.studentUid;
        if (isNewFromStudent && upd > lastOpened) {
          unread.push({
            type: "dm",
            threadId: r.id,
            studentUid: r.studentUid,
            title:
              r.studentName ||
              r.studentEmail ||
              r.studentUid ||
              "Student",
            email: r.studentEmail || "",
            preview: r.lastMessage?.text || "New message",
            when: formatWhenMs(upd),
            initials: initials(r.studentName || r.studentEmail, "S")
          });
        }
      }

      unread.sort((a, b) => new Date(b.when) - new Date(a.when));
      renderNotifBadge(unread.length);
      renderNotifList(unread.slice(0, 20));
    };

    onSnapshot(
      tRef,
      (qs) => {
        cache = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
        THREADS_CACHE = cache
          .slice()
          .sort(
            (a, b) =>
              (b?.updatedAt?.toMillis?.() ?? 0) -
              (a?.updatedAt?.toMillis?.() ?? 0)
          );
        renderThreadsTable(THREADS_CACHE);
        recompute().catch(() => {});
      },
      (e) => {
        console.warn("[threads] onSnapshot error:", e);
        THREADS_CACHE = [];
        renderThreadsTable([]);
        renderNotifBadge(0);
        renderNotifList([]);
      }
    );
  }

  /* ---------- Global state ---------- */
  let STUDENTS = [];
  let SECTIONS = [];
  let CURRENT_STUDENT = null;
  let CURRENT_SECTION = null;
  let SECTION_MEMBERS = [];
  let STUDENT_AVG = new Map();

  let TEACHERS = [];
  let TEACHING = [];
  let TEACHING_BY_TEACHER = new Map();
  let CURRENT_TEACHER = null;

  let THREADS_CACHE = [];
  let CURRENT_THREAD_ID = null;
  let CURRENT_THREAD_META = null;

  // NEW: filter state for Students course chips
  let STUDENTS_COURSE_FILTER = "__ALL__";

  // NEW: filter state for teacher assigned sections
  let TEACHER_SECTIONS_YEAR_FILTER = "__ALL__";

  /* ---------- Realtime: users, teaching ---------- */
  let unsubUsers = null;
  let unsubTeaching = null;

  function mapUserDoc(d) {
    const v = d.data() || {};
    const studentId =
      v.studentId ??
      v.studentID ??
      v.student_id ??
      v.studentIdNumber ??
      v.studentNumber ??
      "";
    const yearRaw = v.year ?? v.yearLevel ?? v.gradeLevel ?? v.level ?? "";
    return {
      uid: d.id,
      id: String(studentId || "").trim(),
      name: v.name || v.displayName || "",
      email: v.email || "",
      year: yearKey(yearRaw),
      course: v.course || "",
      section: v.section || "",
      role: (v.role || "").toLowerCase()
    };
  }

  function subscribeStudents() {
    if (unsubUsers) unsubUsers();
    const usersRef = collection(db, "users");
    const refreshAveragesDebounced = debounce(() => {
      loadStudentAverages().catch(console.error);
    }, 500);

    unsubUsers = onSnapshot(
      usersRef,
      (snap) => {
        const all = snap.docs.map(mapUserDoc);
        STUDENTS = all.filter(
          (s) => s.role === "student" || !!s.id
        );
        TEACHERS = all.filter((s) => s.role === "teacher");

        renderStudents();
        refreshMemberSelect();
        renderTeachers();
        refreshAveragesDebounced();
      },
      (err) => {
        console.error("[students] onSnapshot error:", err);
        STUDENTS = [];
        TEACHERS = [];
        renderStudents();
        renderTeachers();
      }
    );
  }

  function subscribeTeaching() {
    if (unsubTeaching) unsubTeaching();

    unsubTeaching = onSnapshot(
      collection(db, "teaching"),
      async (snap) => {
        TEACHING = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        await ensureSectionsLoaded();

        TEACHING_BY_TEACHER = new Map();
        for (const t of TEACHING) {
          const s = SECTIONS.find((x) => x.id === t.sectionId);
          const label = s
            ? `${s.course || "—"} • ${s.name || "—"} (${prettyYear(
                s.year
              )})`
            : "(missing section)";
          const item = {
            sectionId: t.sectionId,
            label,
            course: s?.course || "",
            name: s?.name || "",
            year: s?.year || ""
          };
          const arr =
            TEACHING_BY_TEACHER.get(t.teacherUid) || [];
          arr.push(item);
          TEACHING_BY_TEACHER.set(t.teacherUid, arr);
        }

        renderTeachers();
        if (CURRENT_TEACHER)
          renderTeacherDetailAssignments(CURRENT_TEACHER.uid);
      },
      () => {
        TEACHING = [];
        TEACHING_BY_TEACHER = new Map();
        renderTeachers();
        if (CURRENT_TEACHER)
          renderTeacherDetailAssignments(CURRENT_TEACHER.uid);
      }
    );
  }

  window.addEventListener("beforeunload", () => {
    unsubUsers?.();
    unsubTeaching?.();
  });

  /* ================= STUDENTS LIST ================= */
  const studentsTableBody = document.getElementById("studentsTableBody");
  const studentsFilterYear = document.getElementById(
    "studentsFilterYear"
  );
  const studentsSearch = document.getElementById("studentsSearch");
  const studentsSort = document.getElementById("studentsSort");
  const studentsCourseButtons = document.getElementById("studentsCourseButtons"); // NEW

  async function loadStudentAverages() {
    const pairs = await Promise.all(
      STUDENTS.map(async (s) => {
        try {
          const snap = await getDocs(
            collection(db, "users", s.uid, "grades")
          );
          const nums = snap.docs
            .map((d) =>
              toNumberGrade(
                d.data().grade ?? d.data().mark
              )
            )
            .filter((n) => Number.isFinite(n));
          const avg = nums.length
            ? nums.reduce((a, b) => a + b, 0) / nums.length
            : null;
          return [s.uid, avg];
        } catch {
          return [s.uid, null];
        }
      })
    );
    STUDENT_AVG = new Map(pairs);
    renderStudents();
  }

  function sortStudents(arr) {
    const key = studentsSort?.value || "year";
    const byYear = (a) =>
      parseInt(yearKey(a.year) || "999", 10);

    if (key === "name")
      return arr.sort((a, b) =>
        String(a.name).localeCompare(String(b.name))
      );
    if (key === "id")
      return arr.sort((a, b) =>
        String(a.id).localeCompare(String(b.id))
      );
    return arr.sort((a, b) => byYear(a) - byYear(b));
  }

  function renderStudents() {
    const yrFilter = studentsFilterYear?.value || "__ALL__";
    const term = (studentsSearch?.value || "")
      .toLowerCase()
      .trim();

    let data = [...STUDENTS];

    // filter by year (existing)
    if (yrFilter !== "__ALL__") {
      const yk = yearKey(yrFilter);
      data = data.filter((s) => yearKey(s.year) === yk);
    }

    // NEW: filter by course based on chips
    if (STUDENTS_COURSE_FILTER && STUDENTS_COURSE_FILTER !== "__ALL__") {
      const key = STUDENTS_COURSE_FILTER.toUpperCase();
      data = data.filter((s) => {
        const c = (s.course || "").toUpperCase();
        return c === key || c.includes(key);
      });
    }

    // existing text search
    if (term) {
      data = data.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(term) ||
          (s.id || "").toLowerCase().includes(term) ||
          (s.email || "").toLowerCase().includes(term)
      );
    }

    data = sortStudents(data);

    if (!data.length) {
      studentsTableBody.innerHTML =
        `<tr><td colspan="7">No students found.</td></tr>`;
      return;
    }

    studentsTableBody.innerHTML = data
      .map(
        (s) => `
      <tr data-uid="${s.uid}">
        <td>${escapeHTML(s.id || "—")}</td>
        <td class="linkable" style="cursor:pointer;text-decoration:underline;">
          ${escapeHTML(s.name || "—")}
        </td>
        <td>${escapeHTML(s.email || "—")}</td>
        <td>${escapeHTML(prettyYear(s.year))}</td>
        <td>${
          STUDENT_AVG.get(s.uid) == null
            ? "—"
            : STUDENT_AVG.get(s.uid).toFixed(2)
        }</td>
        <td>Active</td>
        <td class="nowrap">
          <button class="btn btn-secondary btn-xs" data-action="view">View</button>
          <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  // UPDATED: more detailed, step-by-step delete with logging
  async function deleteStudent(uid) {
    const s = STUDENTS.find((st) => st.uid === uid);
    const label = s?.name || s?.email || s?.id || uid;

    const ok = confirm(
      `Delete student "${label}"?\nThis will remove their grades, subjects taken, section memberships, and message thread.`
    );
    if (!ok) return;

    console.log("[deleteStudent] START uid =", uid);
    const failures = [];

    // 1) delete grades
    try {
      await deleteSubcollection(["users", uid, "grades"]);
    } catch (err) {
      console.error("[deleteStudent] grades delete failed:", err);
      failures.push(`grades: ${err.code || err.message}`);
    }

    // 2) delete subjectsTaken
    try {
      await deleteSubcollection(["users", uid, "subjectsTaken"]);
    } catch (err) {
      console.error("[deleteStudent] subjectsTaken delete failed:", err);
      failures.push(`subjectsTaken: ${err.code || err.message}`);
    }

    // 3) remove from all sections/members
    try {
      console.log("[deleteStudent] querying members for studentUid =", uid);
      const cg = await getDocs(
        query(
          collectionGroup(db, "members"),
          where("studentUid", "==", uid)
        )
      );
      console.log("[deleteStudent] members found:", cg.size);
      await Promise.all(
        cg.docs.map((d) => {
          console.log("  deleting member doc:", d.ref.path);
          return deleteDoc(d.ref);
        })
      );
    } catch (err) {
      console.error("[deleteStudent] members delete failed:", err);
      failures.push(`section members: ${err.code || err.message}`);
    }

    // 4) delete message thread (threads/{uid} + messages)
    try {
      console.log("[deleteStudent] deleting thread/messages for uid =", uid);
      await deleteSubcollection(["threads", uid, "messages"]).catch((e) => {
        console.warn("[deleteStudent] thread messages delete failed (ignored):", e);
      });
      await deleteDoc(doc(db, "threads", uid)).catch((e) => {
        console.warn("[deleteStudent] thread doc delete failed (ignored):", e);
      });
    } catch (err) {
      console.error("[deleteStudent] thread delete outer error:", err);
      failures.push(`thread: ${err.code || err.message}`);
    }

    // 5) delete user doc
    try {
      console.log("[deleteStudent] deleting user doc users/" + uid);
      await deleteDoc(doc(db, "users", uid));
    } catch (err) {
      console.error("[deleteStudent] user doc delete failed:", err);
      failures.push(`user doc: ${err.code || err.message}`);
    }

    console.log("[deleteStudent] DONE uid =", uid, "failures:", failures);

    if (failures.length) {
      alert(
        "Student delete encountered errors:\n" +
        failures.join("\n") +
        "\n\nCheck the browser console for details."
      );
    } else {
      alert("Student deleted successfully.");
    }
  }

  studentsFilterYear?.addEventListener("change", renderStudents);
  studentsSearch?.addEventListener("input", renderStudents);
  studentsSort?.addEventListener("change", renderStudents);

  // NEW: course chips for Students
  studentsCourseButtons?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-course]");
    if (!btn) return;

    STUDENTS_COURSE_FILTER = btn.dataset.course || "__ALL__";

    studentsCourseButtons
      .querySelectorAll("button[data-course]")
      .forEach((b) => b.classList.toggle("active", b === btn));

    renderStudents();
  });

  studentsTableBody?.addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const uid = row.dataset.uid;
    const s = STUDENTS.find((x) => x.uid === uid);
    if (!s) return;

    if (
      e.target.closest("button[data-action='view']") ||
      e.target.closest("td.linkable")
    ) {
      openStudentDetail(s);
      return;
    }

    if (e.target.closest("button[data-action='delete']")) {
      deleteStudent(uid); // deleteStudent already handles its own errors
      return;
    }
  });

  /* ================= STUDENT DETAIL ================= */
  const stName = document.getElementById("stName");
  const stId = document.getElementById("stId");
  const sogTableBody = document.getElementById("sogTableBody");
  const exportSoGBtn = document.getElementById("exportSoGBtn");
  const filterYear = document.getElementById("filterYear");
  const filterSem = document.getElementById("filterSem");
  const backToStudentsLink = document.getElementById(
    "backToStudentsLink"
  );

  const stTabButtons = document.querySelectorAll("[data-st-tab]");
  const studentTabGrades = document.getElementById(
    "studentTabGrades"
  );
  const studentTabSubjects = document.getElementById(
    "studentTabSubjects"
  );
  const stSubjectsYear = document.getElementById("stSubjectsYear");
  const stSubjectsSem = document.getElementById("stSubjectsSem");
  const stSubjectsBody = document.getElementById("stSubjectsBody");

  stTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.stTab;
      stTabButtons.forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      if (studentTabGrades)
        studentTabGrades.style.display =
          target === "grades" ? "" : "none";
      if (studentTabSubjects)
        studentTabSubjects.style.display =
          target === "subjects" ? "" : "none";
    });
  });

  backToStudentsLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showPage("students");
  });

  function openStudentDetail(s) {
    CURRENT_STUDENT = s;
    stName.textContent = s.name || "—";
    stId.textContent = s.id || "—";

    if (filterYear) filterYear.value = "__ALL__";
    if (filterSem) filterSem.value = "__ALL__";
    if (stSubjectsYear) stSubjectsYear.value = "__ALL__";
    if (stSubjectsSem) stSubjectsSem.value = "__ALL__";

    stTabButtons.forEach((b) => {
      const isGrades = b.dataset.stTab === "grades";
      b.classList.toggle("active", isGrades);
    });
    if (studentTabGrades) studentTabGrades.style.display = "";
    if (studentTabSubjects) studentTabSubjects.style.display = "none";

    renderStudentSummary().catch(console.error);
    loadStudentSubjects().catch(console.error);

    showPage("student-detail");
  }

  async function fetchAllGrades(uid) {
    const snap = await getDocs(
      collection(db, "users", uid, "grades")
    );
    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));
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

  async function renderStudentSummary() {
    if (!CURRENT_STUDENT) {
      sogTableBody.innerHTML =
        '<tr><td colspan="6">No grades yet.</td></tr>';
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
          String(ent.yearLevel) === yearFilterKey;
        const okSem =
          semFilterKey === "__ALL__" ||
          String(ent.semester) === semFilterKey;
        return okYear && okSem;
      });

      const groups = {};
      for (const ent of entries) {
        const n = toNumberGrade(ent.grade ?? ent.mark);
        if (!Number.isFinite(n)) continue;
        const y = String(ent.yearLevel ?? "").trim();
        const s = String(ent.semester ?? "").trim();
        const key = `Y${y}-${s}`;
        if (!groups[key])
          groups[key] = { sum: 0, count: 0, year: y, sem: s };
        groups[key].sum += n;
        groups[key].count += 1;
      }

      const bar = document.getElementById("semAvgBar");
      if (bar) {
        const items = Object.values(groups)
          .sort(
            (a, b) =>
              String(a.year).localeCompare(String(b.year)) ||
              String(a.sem).localeCompare(String(b.sem))
          )
          .map(
            (g) =>
              `<span class="tag" style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border-radius:12px;background:#eef;">
                Y${escapeHTML(g.year)} ${escapeHTML(
                g.sem
              )}: <b>${(g.sum / g.count).toFixed(2)}</b>
               </span>`
          );
        bar.innerHTML = items.length ? items.join("") : `<span>—</span>`;
      }

      if (!entries.length) {
        sogTableBody.innerHTML =
          '<tr><td colspan="6">No grades yet.</td></tr>';
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
        </tr>
      `
        )
        .join("");
    } catch (err) {
      console.error("fetch/render grades failed:", err);
      sogTableBody.innerHTML =
        '<tr><td colspan="6">Failed to load grades.</td></tr>';
    }
  }

  async function loadStudentSubjects() {
    if (!CURRENT_STUDENT || !stSubjectsBody) return;

    try {
      const yearVal = stSubjectsYear?.value || "__ALL__";
      const semVal = stSubjectsSem?.value || "__ALL__";

      const baseRef = collection(
        db,
        "users",
        CURRENT_STUDENT.uid,
        "subjectsTaken"
      );
      const clauses = [];
      if (yearVal !== "__ALL__")
        clauses.push(where("year", "==", yearVal));
      if (semVal !== "__ALL__")
        clauses.push(where("sem", "==", semVal));

      const qRef = clauses.length ? query(baseRef, ...clauses) : baseRef;
      const snap = await getDocs(qRef);

      if (snap.empty) {
        stSubjectsBody.innerHTML =
          `<tr><td colspan="5">No subjects found for selected filters.</td></tr>`;
        return;
      }

      stSubjectsBody.innerHTML = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return `
          <tr>
            <td>${escapeHTML(d.courseName || "")}</td>
            <td>${escapeHTML(d.courseCode || "")}</td>
            <td>${d.units ?? ""}</td>
            <td>${escapeHTML(d.year || "")}</td>
            <td>${escapeHTML(d.sem || "")}</td>
          </tr>
        `;
        })
        .join("");
    } catch (err) {
      console.error("loadStudentSubjects failed:", err);
      stSubjectsBody.innerHTML =
        `<tr><td colspan="5">Failed to load subjects.</td></tr>`;
    }
  }

  stSubjectsYear?.addEventListener("change", () => {
    loadStudentSubjects().catch(console.error);
  });
  stSubjectsSem?.addEventListener("change", () => {
    loadStudentSubjects().catch(console.error);
  });

  filterYear?.addEventListener("change", () => {
    renderStudentSummary().catch(console.error);
  });
  filterSem?.addEventListener("change", () => {
    renderStudentSummary().catch(console.error);
  });

  // export SoG
  exportSoGBtn?.addEventListener("click", () => {
    const table = document.querySelector("#student-detail table");
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
    downloadFile(`${id}_grades_${yr}_${sm}.csv`, csv);
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

  /* ================= SECTIONS ================= */
  const sectionsTableBody = document.getElementById(
    "sectionsTableBody"
  );
  const addSectionBtn = document.getElementById("addSectionBtn");
  const exportSectionsBtn = document.getElementById(
    "exportSectionsBtn"
  );
  const sectionsFilterCourse = document.getElementById("sectionsFilterCourse"); // select
  const sectionsCourseButtons = document.getElementById("sectionsCourseButtons"); // optional buttons container

  // --- UI tweak: hide "Show All Courses" option in sections dropdown (value still usable) ---
  if (sectionsFilterCourse) {
    const allOpt = sectionsFilterCourse.querySelector('option[value="__ALL__"]');
    if (allOpt) {
      allOpt.hidden = true;
      allOpt.textContent = "";
    }
  }

  const sdTitle = document.getElementById("sdTitle");
  const sdCourse = document.getElementById("sdCourse");
  const sdSection = document.getElementById("sdSection");
  const sdYear = document.getElementById("sdYear");
  const sectionMembersBody = document.getElementById(
    "sectionMembersBody"
  );

  const addMemberBtn = document.getElementById("addMemberBtn");
  const exportSectionMembersBtn = document.getElementById(
    "exportSectionMembersBtn"
  );
  const backToSectionsLink = document.getElementById(
    "backToSectionsLink"
  );

  const addMemberModal = document.getElementById(
    "addMemberModal"
  );
  const addMemberForm = document.getElementById("addMemberForm");
  const closeAddMember = document.getElementById(
    "closeAddMember"
  );
  const cancelAddMember = document.getElementById(
    "cancelAddMember"
  );

  const addSectionModal = document.getElementById(
    "addSectionModal"
  );
  const addSectionForm = document.getElementById("addSectionForm");
  const closeAddSection = document.getElementById(
    "closeAddSection"
  );
  const cancelAddSection = document.getElementById(
    "cancelAddSection"
  );

  const memberSelect = document.getElementById("memberSelect");
  const memberId = document.getElementById("memberId");
  const memberName = document.getElementById("memberName");
  const memberEmail = document.getElementById("memberEmail");
  const memberYear = document.getElementById("memberYear");

  backToSectionsLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showPage("sections");
  });

  async function ensureSectionsLoaded() {
    if (SECTIONS.length) return;
    await loadSections();
  }

  async function loadSections() {
    const snap = await getDocs(collection(db, "sections"));
    const base = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const withCounts = await Promise.all(
      base.map(async (s) => {
        try {
          const res = await getCountFromServer(
            collection(db, "sections", s.id, "members")
          );
          return { ...s, memberCount: res.data().count || 0 };
        } catch {
          return { ...s, memberCount: 0 };
        }
      })
    );

    SECTIONS = withCounts;
    renderSections();
  }

  function renderSections() {
    let list = SECTIONS.slice();

    const courseFilter = sectionsFilterCourse?.value || "__ALL__";
    if (courseFilter !== "__ALL__") {
      const key = courseFilter.toUpperCase();
      list = list.filter((s) => {
        const c = (s.course || "").toUpperCase();
        return c === key || c.includes(key);
      });
    }

    if (!list.length) {
      sectionsTableBody.innerHTML =
        `<tr><td colspan="5">No sections yet for selected course.</td></tr>`;
      return;
    }

    sectionsTableBody.innerHTML = list
      .map(
        (s) => `
      <tr data-id="${s.id}">
        <td>${escapeHTML(s.course || "—")}</td>
        <td>${escapeHTML(s.name || "—")}</td>
        <td>${escapeHTML(prettyYear(s.year))}</td>
        <td>${Number(s.memberCount ?? 0)}</td>
        <td class="nowrap">
          <button class="btn btn-secondary btn-xs" data-action="open">Open</button>
          <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  sectionsTableBody?.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const id = row.getAttribute("data-id");
    const sec = SECTIONS.find((x) => x.id === id);
    if (!sec) return;

    if (e.target.closest("button[data-action='open']")) {
      await openSectionDetail(sec);
      return;
    }

    if (e.target.closest("button[data-action='delete']")) {
      const ok = confirm(
        `Delete section "${sec.course || "—"} • ${
          sec.name || "—"
        }"?\nAll its member records will also be removed (students remain intact).`
      );
      if (!ok) return;

      try {
        await deleteSubcollection(["sections", sec.id, "members"]);
        await deleteDoc(doc(db, "sections", sec.id));

        const qx = query(
          collection(db, "teaching"),
          where("sectionId", "==", sec.id)
        );
        const snap = await getDocs(qx);
        await Promise.all(
          snap.docs.map((d) => deleteDoc(d.ref))
        );

        SECTIONS = [];
        await loadSections();
        alert("Section deleted.");
      } catch (err) {
        console.error("delete section failed:", err);
        alert(
          "Failed to delete section. Check rules/permissions."
        );
      }
    }
  });

  sectionsFilterCourse?.addEventListener("change", () => {
    // sync buttons (if present)
    if (sectionsCourseButtons) {
      const v = sectionsFilterCourse.value;
      sectionsCourseButtons
        .querySelectorAll("button[data-course]")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.course === v)
        );
    }
    renderSections();
  });

  // Optional: sections course buttons → control select
  sectionsCourseButtons?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-course]");
    if (!btn) return;
    const value = btn.dataset.course || "__ALL__";

    if (sectionsFilterCourse) {
      sectionsFilterCourse.value = value;
    }

    sectionsCourseButtons
      .querySelectorAll("button[data-course]")
      .forEach((b) => b.classList.toggle("active", b === btn));

    renderSections();
  });

  async function openSectionDetail(sec) {
    CURRENT_SECTION = sec;
    sdTitle.textContent = `${sec.course || "—"} • ${
      sec.name || "—"
    }`;
    sdCourse.textContent = sec.course || "—";
    sdSection.textContent = sec.name || "—";
    sdYear.textContent = prettyYear(sec.year || "—");
    await loadSectionMembers();
    showPage("section-detail");
  }

  async function loadSectionMembers() {
    if (!CURRENT_SECTION) return;
    const qs = await getDocs(
      collection(db, "sections", CURRENT_SECTION.id, "members")
    );
    SECTION_MEMBERS = qs.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));
    renderMembers(SECTION_MEMBERS);
  }

  function renderMembers(rows) {
    if (!rows.length) {
      sectionMembersBody.innerHTML =
        `<tr><td colspan="5">No members yet.</td></tr>`;
      return;
    }

    sectionMembersBody.innerHTML = rows
      .map(
        (m) => `
      <tr
        data-doc="${escapeHTML(m.id)}"
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
          <button class="btn btn-secondary btn-xs" data-action="view-student">View</button>
          <button class="btn btn-danger btn-xs" data-action="remove-member">Remove</button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  sectionMembersBody?.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const uid = row.getAttribute("data-uid");
    const s = STUDENTS.find((x) => x.uid === uid);

    if (e.target.closest("button[data-action='view-student']")) {
      openStudentDetail(s || { uid });
      return;
    }

    if (e.target.closest("button[data-action='remove-member']")) {
      if (!CURRENT_SECTION) return;
      if (!confirm("Remove this student from the section?"))
        return;

      try {
        await deleteDoc(
          doc(
            db,
            "sections",
            CURRENT_SECTION.id,
            "members",
            row.getAttribute("data-doc")
          )
        );
        await loadSectionMembers();
        SECTIONS = [];
        await loadSections();
        alert("Member removed.");
      } catch (err) {
        console.error(err);
        alert("Failed to remove member.");
      }
    }
  });

  function openAddSectionModal() {
    addSectionForm?.reset();
    addSectionModal?.classList.add("show");
    addSectionModal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeAddSectionModal() {
    addSectionModal?.classList.remove("show");
    addSectionModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  addSectionBtn?.addEventListener("click", openAddSectionModal);
  closeAddSection?.addEventListener("click", closeAddSectionModal);
  cancelAddSection?.addEventListener(
    "click",
    closeAddSectionModal
  );

  addSectionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const course = document
      .getElementById("sectionCourse")
      ?.value.trim();
    const name = document
      .getElementById("sectionName")
      ?.value.trim();
    const yearLabel = document
      .getElementById("sectionYear")
      ?.value.trim();
    const year = yearKey(yearLabel);
    const notes = document
      .getElementById("sectionNotes")
      ?.value.trim();

    try {
      await addDoc(collection(db, "sections"), {
        course,
        name,
        year,
        notes,
        createdAt: serverTimestamp()
      });
      closeAddSectionModal();
      SECTIONS = [];
      await loadSections();
      alert("Section saved.");
    } catch (err) {
      console.error(err);
      alert("Failed to add section.");
    }
  });

  function openAddMemberModal() {
    if (!CURRENT_SECTION) {
      alert("Open a section first.");
      return;
    }
    addMemberForm?.reset();
    refreshMemberSelect();
    addMemberModal?.classList.add("show");
    addMemberModal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeAddMemberModal() {
    addMemberModal?.classList.remove("show");
    addMemberModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  addMemberBtn?.addEventListener("click", openAddMemberModal);
  closeAddMember?.addEventListener("click", closeAddMemberModal);
  cancelAddMember?.addEventListener(
    "click",
    closeAddMemberModal
  );

  // ✅ UPDATED: Only show students whose course AND year match CURRENT_SECTION
  function refreshMemberSelect() {
    if (!memberSelect) return;

    let list = STUDENTS;

    if (CURRENT_SECTION) {
      const secCourse = String(CURRENT_SECTION.course || "")
        .toUpperCase()
        .trim();
      const secYearKey = yearKey(CURRENT_SECTION.year || "");

      list = STUDENTS.filter((s) => {
        let okCourse = true;
        let okYear = true;

        if (secCourse) {
          const c = String(s.course || "").toUpperCase().trim();
          okCourse = c === secCourse || c.includes(secCourse);
        }

        if (secYearKey) {
          const sy = yearKey(s.year);
          okYear = sy === secYearKey;
        }

        return okCourse && okYear;
      });
    }

    const opts = [
      '<option value="">— Select from Students —</option>'
    ].concat(
      list.map(
        (s) =>
          `<option value="${s.uid}"
              data-id="${escapeHTML(s.id)}"
              data-name="${escapeHTML(s.name)}"
              data-email="${escapeHTML(s.email)}"
              data-year="${escapeHTML(s.year)}">
              ${escapeHTML(s.name)} (${escapeHTML(s.id || "—")})
           </option>`
      )
    );
    memberSelect.innerHTML = opts.join("");
  }

  memberSelect?.addEventListener("change", (e) => {
    const opt = e.target.selectedOptions?.[0];
    if (!opt) return;
    memberId.value = opt.getAttribute("data-id") || "";
    memberName.value = opt.getAttribute("data-name") || "";
    memberEmail.value = opt.getAttribute("data-email") || "";
    memberYear.value = prettyYear(
      opt.getAttribute("data-year") || ""
    );
  });

  // IMPORTANT: doc ID in members = studentUid (matches rules & teacherTeachesStudent)
  addMemberForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_SECTION) return;

    let uid = memberSelect.value || "";
    let name = memberName.value?.trim() || "";
    let email = memberEmail.value?.trim() || "";
    let sid = memberId.value?.trim() || "";
    let yearLabel = memberYear.value?.trim() || "";
    const yr = yearKey(yearLabel);

    try {
      // If no existing student selected, quick add
      if (!uid) {
        if (!name || !email || !sid || !yr) {
          alert(
            "Please select a student or complete quick-add fields."
          );
          return;
        }

        const uref = doc(collection(db, "users"));
        uid = uref.id;

        await setDoc(
          uref,
          {
            uid,
            role: "student",
            name,
            email,
            studentId: sid,
            year: yr,
            course: CURRENT_SECTION?.course || "", // ✅ tie quick-add student to section's course
            createdAt: serverTimestamp()
          },
          { merge: true }
        );
      } else {
        const s = STUDENTS.find((x) => x.uid === uid);
        name = s?.name || name;
        email = s?.email || email;
        sid = s?.id || sid;
        yearLabel = prettyYear(s?.year || yr);
      }

      // Add member doc with ID = studentUid
      const memberRef = doc(
        db,
        "sections",
        CURRENT_SECTION.id,
        "members",
        uid
      );

      await setDoc(
        memberRef,
        {
          studentUid: uid,
          name,
          email,
          studentId: sid,
          year: yr,
          addedAt: serverTimestamp()
        },
        { merge: true }
      );

      closeAddMemberModal();
      await loadSectionMembers();
      SECTIONS = [];
      await loadSections();
      alert("Student added to section.");
    } catch (err) {
      console.error(err);
      alert(
        "Failed to add student to section. Check permissions."
      );
    }
  });

  /* ================= TEACHERS ================= */
  const teachersTableBody = document.getElementById(
    "teachersTableBody"
  );
  const teachersSearch = document.getElementById("teachersSearch");
  const teachersFilterCourse = document.getElementById("teachersFilterCourse"); // select
  const teachersCourseButtons = document.getElementById("teachersCourseButtons"); // optional buttons
  const tdName = document.getElementById("tdName");
  const tdEmail = document.getElementById("tdEmail");
  const tdUid = document.getElementById("tdUid");
  const assignSectionSelect = document.getElementById(
    "assignSectionSelect"
  );
  const assignSectionBtn = document.getElementById(
    "assignSectionBtn"
  );
  const teacherSectionsBody = document.getElementById(
    "teacherSectionsBody"
  );
  const backToTeachersLink = document.getElementById(
    "backToTeachersLink"
  );
  const teacherYearFilter = document.getElementById("teacherYearFilter"); // optional buttons

  // UI tweak: hide "All Courses" dropdown in Teachers tab (chips na lang gagamitin)
  if (teachersFilterCourse) {
    teachersFilterCourse.style.display = "none";
  }

  function renderTeachers() {
    if (!teachersTableBody) return;
    const term = (teachersSearch?.value || "")
      .toLowerCase()
      .trim();

    const courseFilter = teachersFilterCourse?.value || "__ALL__";

    let rows = TEACHERS.slice();

    // filter by assigned sections' course (preferred)
    if (courseFilter !== "__ALL__") {
      const key = courseFilter.toUpperCase();
      rows = rows.filter((t) => {
        const assigned = TEACHING_BY_TEACHER.get(t.uid) || [];
        if (assigned.length) {
          return assigned.some((a) => {
            const c = (a.course || "").toUpperCase();
            return c === key || c.includes(key);
          });
        }
        // fallback to teacher.course if no assigned sections
        const c = (t.course || "").toUpperCase();
        return c === key || c.includes(key);
      });
    }

    // existing name/email search
    if (term) {
      rows = rows.filter(
        (t) =>
          (t.name || "").toLowerCase().includes(term) ||
          (t.email || "").toLowerCase().includes(term)
      );
    }

    if (!rows.length) {
      teachersTableBody.innerHTML =
        `<tr><td colspan="4">No teachers found.</td></tr>`;
      return;
    }

    teachersTableBody.innerHTML = rows
      .map((t) => {
        const assigned = TEACHING_BY_TEACHER.get(t.uid) || [];
        const label = assigned.length
          ? assigned.map((x) => x.label).join("; ")
          : "—";

        return `
        <tr data-uid="${t.uid}"
            data-name="${escapeHTML(t.name || "")}"
            data-email="${escapeHTML(t.email || "")}">
          <td>${escapeHTML(t.name || "—")}</td>
          <td>${escapeHTML(t.email || "—")}</td>
          <td>${escapeHTML(label)}</td>
          <td class="nowrap">
            <button class="btn btn-secondary btn-xs" data-action="open">Open</button>
            <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
          </td>
        </tr>
      `;
      })
      .join("");

    // UI tweak: hide "Assigned Sections" column (3rd col) – pwede na i-open si teacher para makita sections
    const teacherTable = teachersTableBody.closest("table");
    if (teacherTable) {
      const ths = teacherTable.querySelectorAll("thead th");
      if (ths[2]) ths[2].style.display = "none";
      teacherTable.querySelectorAll("tbody tr").forEach((tr) => {
        const cell = tr.children[2];
        if (cell) cell.style.display = "none";
      });
    }
  }

  teachersSearch?.addEventListener("input", renderTeachers);

  teachersFilterCourse?.addEventListener("change", () => {
    // sync buttons if present
    if (teachersCourseButtons) {
      const v = teachersFilterCourse.value;
      teachersCourseButtons
        .querySelectorAll("button[data-course]")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.course === v)
        );
    }
    renderTeachers();
  });

  // Optional: teachers course buttons → control select
  teachersCourseButtons?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-course]");
    if (!btn) return;

    const value = btn.dataset.course || "__ALL__";

    if (teachersFilterCourse) {
      teachersFilterCourse.value = value;
    }

    teachersCourseButtons
      .querySelectorAll("button[data-course]")
      .forEach((b) => b.classList.toggle("active", b === btn));

    renderTeachers();
  });

  backToTeachersLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showPage("teachers");
  });

  teachersTableBody?.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const uid = row.getAttribute("data-uid");
    const t = TEACHERS.find((x) => x.uid === uid);
    if (!t) return;

    if (e.target.closest("button[data-action='open']")) {
      await openTeacherDetail(t);
      return;
    }

    if (e.target.closest("button[data-action='delete']")) {
      if (
        !confirm(
          `Delete teacher "${t.name || t.email}"? This removes their profile and all section assignments.`
        )
      )
        return;

      try {
        const qx = query(
          collection(db, "teaching"),
          where("teacherUid", "==", uid)
        );
        const snap = await getDocs(qx);
        await Promise.all(
          snap.docs.map((d) => deleteDoc(d.ref))
        );
        await deleteDoc(doc(db, "users", uid));
        alert("Teacher deleted.");
      } catch (err) {
        console.error(err);
        alert("Failed to delete teacher.");
      }
    }
  });

  async function openTeacherDetail(t) {
    CURRENT_TEACHER = t;
    tdName.textContent = t.name || t.email || "—";
    tdEmail.textContent = t.email || "—";
    tdUid.textContent = t.uid || "—";

    // reset year filter
    TEACHER_SECTIONS_YEAR_FILTER = "__ALL__";
    if (teacherYearFilter) {
      teacherYearFilter
        .querySelectorAll("button[data-year]")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.year === "__ALL__")
        );
    }

    await loadSections();
    await populateAssignableSections(t.uid);
    renderTeacherDetailAssignments(t.uid);

    showPage("teacher-detail");
  }

  async function populateAssignableSections(teacherUid) {
    await ensureSectionsLoaded();
    const assignedIds = new Set(
      (TEACHING_BY_TEACHER.get(teacherUid) || []).map(
        (x) => x.sectionId
      )
    );

    assignSectionSelect.innerHTML = [
      `<option value="">— Select Section to Assign —</option>`
    ]
      .concat(
        SECTIONS.filter((s) => !assignedIds.has(s.id)).map(
          (s) =>
            `<option value="${s.id}">
              ${escapeHTML(
                `${s.course || "—"} • ${s.name || "—"} (${prettyYear(
                  s.year
                )})`
              )}
             </option>`
        )
      )
      .join("");
  }

  function renderTeacherDetailAssignments(teacherUid) {
    const listAll = TEACHING_BY_TEACHER.get(teacherUid) || [];

    let list = listAll;
    if (TEACHER_SECTIONS_YEAR_FILTER !== "__ALL__") {
      const key = TEACHER_SECTIONS_YEAR_FILTER;
      list = listAll.filter(
        (x) => String(yearKey(x.year)).trim() === key
      );
    }

    if (!list.length) {
      teacherSectionsBody.innerHTML =
        `<tr><td colspan="4">No assigned sections.</td></tr>`;
      return;
    }

    teacherSectionsBody.innerHTML = list
      .map(
        (x) => `
      <tr data-section="${escapeHTML(x.sectionId)}">
        <td>${escapeHTML(x.course || "—")}</td>
        <td>${escapeHTML(x.name || "—")}</td>
        <td>${escapeHTML(prettyYear(x.year || ""))}</td>
        <td class="nowrap">
          <button class="btn btn-danger btn-xs" data-action="unassign">Unassign</button>
          <button class="btn btn-secondary btn-xs" data-action="open-section">View</button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  // year filter buttons for assigned sections
  teacherYearFilter?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-year]");
    if (!btn) return;
    if (!CURRENT_TEACHER) return;

    const value = btn.dataset.year || "__ALL__";
    TEACHER_SECTIONS_YEAR_FILTER = value;

    teacherYearFilter
      .querySelectorAll("button[data-year]")
      .forEach((b) => b.classList.toggle("active", b === btn));

    renderTeacherDetailAssignments(CURRENT_TEACHER.uid);
  });

  // IMPORTANT: teaching docId = teacherUid_sectionId (matches rules)
  assignSectionBtn?.addEventListener("click", async () => {
    if (!CURRENT_TEACHER) return;

    const sectionId = assignSectionSelect.value;
    if (!sectionId) {
      alert("Pick a section to assign.");
      return;
    }

    try {
      const assignId = `${CURRENT_TEACHER.uid}_${sectionId}`;
      await setDoc(
        doc(db, "teaching", assignId),
        {
          teacherUid: CURRENT_TEACHER.uid,
          sectionId,
          createdAt: serverTimestamp()
        },
        { merge: true }
      );

      assignSectionSelect.value = "";
      await populateAssignableSections(CURRENT_TEACHER.uid);
      alert("Section assigned.");
    } catch (e) {
      console.error(e);
      alert("Failed to assign section.");
    }
  });

  teacherSectionsBody?.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    if (!row || !CURRENT_TEACHER) return;
    const sid = row.getAttribute("data-section");

    if (e.target.closest("button[data-action='unassign']")) {
      if (!confirm("Unassign this section from the teacher?"))
        return;

      try {
        const assignId = `${CURRENT_TEACHER.uid}_${sid}`;
        await deleteDoc(doc(db, "teaching", assignId));
        await populateAssignableSections(CURRENT_TEACHER.uid);
        alert("Unassigned.");
      } catch (err) {
        console.error(err);
        alert("Failed to unassign.");
      }
      return;
    }

    if (e.target.closest("button[data-action='open-section']")) {
      const sec = SECTIONS.find((s) => s.id === sid);
      if (sec) openSectionDetail(sec);
    }
  });

  /* ================= MESSAGES ================= */
  const messagesTableBody = document.getElementById(
    "messagesTableBody"
  );
  const messagesSearch = document.getElementById("messagesSearch");
  const messagesShow = document.getElementById("messagesShow");
  const backToMessagesLink = document.getElementById(
    "backToMessagesLink"
  );
  const mtStudentName = document.getElementById("mtStudentName");
  const mtStudentEmail = document.getElementById("mtStudentEmail");
  const chatBox = document.getElementById("chatBox");
  const chatMessages = document.getElementById("chatMessages");
  const chatEmpty = document.getElementById("chatEmpty");
  const chatForm = document.getElementById("chatForm");
  const chatText = document.getElementById("chatText");
  const markUnreadBtn = document.getElementById(
    "markUnreadBtn"
  );
  const deleteThreadBtn = document.getElementById(
    "deleteThreadBtn"
  );

  function renderThreadsTable(rows) {
    if (!messagesTableBody) return;

    const term = (messagesSearch?.value || "")
      .toLowerCase()
      .trim();
    const show = messagesShow?.value || "all";

    let list = rows.slice();
    if (term) {
      list = list.filter(
        (r) =>
          (r.studentName || "")
            .toLowerCase()
            .includes(term) ||
          (r.studentEmail || "")
            .toLowerCase()
            .includes(term)
      );
    }

    if (show === "unread") {
      list = list.filter(
        (r) => r.lastSender === r.studentUid
      );
    }

    if (!list.length) {
      messagesTableBody.innerHTML =
        `<tr><td colspan="4">No messages.</td></tr>`;
      return;
    }

    messagesTableBody.innerHTML = list
      .map((r) => {
        const status =
          r.lastSender === r.studentUid ? "New" : "Seen";
        return `
        <tr data-id="${r.id}"
            data-uid="${escapeHTML(r.studentUid || "")}"
            data-name="${escapeHTML(r.studentName || "")}"
            data-email="${escapeHTML(r.studentEmail || "")}">
          <td>${escapeHTML(
            r.studentName ||
              r.studentEmail ||
              r.studentUid ||
              ""
          )}</td>
          <td>${r.updatedAt ? tsToLocal(r.updatedAt) : "—"}</td>
          <td>${status}</td>
          <td>
            <button class="btn btn-secondary btn-xs" data-action="open">Open</button>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  messagesSearch?.addEventListener("input", () =>
    renderThreadsTable(THREADS_CACHE)
  );
  messagesShow?.addEventListener("change", () =>
    renderThreadsTable(THREADS_CACHE)
  );

  messagesTableBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='open']");
    const row = e.target.closest("tr");
    if (!btn || !row) return;

    const threadId = row.getAttribute("data-id");
    const studentUid = row.getAttribute("data-uid");
    const name = row.getAttribute("data-name") || "";
    const email = row.getAttribute("data-email") || "";

    await openThread(threadId, { studentUid, name, email });
  });

  function openMessageThreadView(meta) {
    CURRENT_THREAD_META = meta || null;
    mtStudentName.textContent = meta?.name || "—";
    mtStudentEmail.textContent = meta?.email || "—";
    showPage("message-thread");
  }

  backToMessagesLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showPage("messages");
  });

  async function openThread(threadId, meta) {
    CURRENT_THREAD_ID = threadId;
    openMessageThreadView(meta);

    try {
      await updateDoc(doc(db, "threads", threadId), {
        lastOpenedBy: auth.currentUser?.uid || "admin",
        unread: false,
        lastSender: auth.currentUser?.uid || "admin",
        updatedAt: serverTimestamp()
      });
      await markNotificationsSeen();
    } catch (e) {
      // ignore
    }

    await loadThreadMessages(threadId);
  }

  async function loadThreadMessages(threadId) {
    chatMessages.innerHTML = "";
    chatEmpty.style.display = "block";

    try {
      const msgsSnap = await getDocs(
        collection(db, "threads", threadId, "messages")
      );
      const items = msgsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            (a?.createdAt?.toMillis?.() ?? 0) -
            (b?.createdAt?.toMillis?.() ?? 0)
        );
      renderChat(items);
    } catch (e) {
      console.error("[messages] loadThreadMessages error:", e);
      chatMessages.innerHTML =
        `<div class="muted">Failed to load messages.</div>`;
    }
  }

  function renderChat(items) {
    const myUid = auth.currentUser?.uid;

    if (!items.length) {
      chatEmpty.style.display = "block";
      return;
    }

    chatEmpty.style.display = "none";
    chatMessages.innerHTML = items
      .map((m) => {
        const isMine =
          (m.senderId && myUid && m.senderId === myUid) ||
          m.senderRole === "admin";
        const who = isMine ? "You" : m.senderName || "Student";
        const when = m.createdAt ? tsToLocal(m.createdAt) : "";
        return `
        <div style="margin:8px 0; display:flex; ${
          isMine
            ? "justify-content:flex-end"
            : "justify-content:flex-start"
        };">
          <div style="max-width:70%; border:1px solid #e5e7eb; border-radius:12px; padding:8px 10px; background:${
            isMine ? "#eef7ff" : "#fff"
          };">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">
              <b>${escapeHTML(who)}</b> • <span>${escapeHTML(
          when
        )}</span>
            </div>
            <div>${escapeHTML(m.text || "")}</div>
          </div>
        </div>
      `;
      })
      .join("");

    chatBox.scrollTop = chatBox.scrollHeight;
  }

  chatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_THREAD_ID) return;

    const text = (chatText?.value || "").trim();
    if (!text) return;

    try {
      await addDoc(
        collection(db, "threads", CURRENT_THREAD_ID, "messages"),
        {
          text,
          senderId: auth.currentUser?.uid || "admin",
          senderRole: "admin",
          senderName: "Admin",
          createdAt: serverTimestamp()
        }
      );

      await updateDoc(doc(db, "threads", CURRENT_THREAD_ID), {
        lastMessage: { text },
        lastSender: auth.currentUser?.uid || "admin",
        updatedAt: serverTimestamp(),
        unread: false
      });

      chatText.value = "";
      await loadThreadMessages(CURRENT_THREAD_ID);
    } catch (err) {
      console.error("[messages] send failed:", err);
      alert("Failed to send message.");
    }
  });

  markUnreadBtn?.addEventListener("click", async () => {
    if (!CURRENT_THREAD_ID || !CURRENT_THREAD_META) return;

    try {
      await updateDoc(doc(db, "threads", CURRENT_THREAD_ID), {
        lastSender: CURRENT_THREAD_META.studentUid,
        unread: true,
        updatedAt: serverTimestamp()
      });
      alert("Marked as unread.");
    } catch (e) {
      console.error(e);
      alert("Failed to mark as unread.");
    }
  });

  deleteThreadBtn?.addEventListener("click", async () => {
    if (!CURRENT_THREAD_ID) return;
    if (
      !confirm(
        "Delete this conversation? This will remove all messages permanently."
      )
    )
      return;

    try {
      await deleteSubcollection([
        "threads",
        CURRENT_THREAD_ID,
        "messages"
      ]);
      await deleteDoc(doc(db, "threads", CURRENT_THREAD_ID));
      CURRENT_THREAD_ID = null;
      alert("Conversation deleted.");
      showPage("messages");
    } catch (e) {
      console.error(e);
      alert("Failed to delete conversation.");
    }
  });

  /* ================= LOGOUT & INIT ================= */
  document
    .getElementById("logoutBtn")
    ?.addEventListener("click", async () => {
      await signOut(auth);
      location.href = "auth.html";
    });

  subscribeStudents();
  subscribeTeaching();
  loadSections().catch(console.error);
  startThreadsWatcher();
}
