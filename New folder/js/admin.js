// js/admin.js
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc,
  collection, getDocs, query, where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ============== ROUTE GUARD ============== */
(async function guardAdmin() {
  document.documentElement.style.visibility = "hidden";
  await new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) { location.href = "auth.html"; return; }
        const token = await user.getIdTokenResult(true);
        let isAdmin = token?.claims?.admin === true;

        if (!isAdmin) {
          try {
            const snap = await getDoc(doc(db, "users", user.uid));
            const role = (snap.exists() ? (snap.data().role || "student") : "student").toLowerCase();
            isAdmin = ["admin","administrator","superadmin"].includes(role);
          } catch { isAdmin = false; }
        }

        if (!isAdmin) { alert("Not authorized."); location.href = "auth.html"; return; }

        document.documentElement.style.visibility = "visible";
        initDashboard();
      } catch (e) {
        console.error("[admin guard] error:", e);
        location.href = "auth.html";
      } finally { resolve(); }
    });
  });
})();

/* ============== HELPERS ============== */
const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
// Canonical keys we store in DB
const yearKey = (label) => { const m = String(label||"").match(/^(\d)/); return m? m[1] : String(label||""); }; // "1st Year" -> "1"
const semKey  = (label) => {
  const v = String(label||"").toLowerCase();
  if (v.startsWith("1")) return "1st";
  if (v.startsWith("2")) return "2nd";
  return "Summer";
};
const downloadFile = (filename, text, mimetype = "text/csv;charset=utf-8") => {
  const blob = new Blob([text], { type: mimetype });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
};

/* ============== MAIN ============== */
function initDashboard() {
  const overlay = document.getElementById("sidebarOverlay");
  const toggleSidebarBtn = document.getElementById("toggleSidebar");
  const pageTitle = document.getElementById("pageTitle");
  const navLinks = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");

  const TITLES = {
    students: "Student Management",
    "student-detail": "Student Detail",
    sections: "Sections",
    "section-detail": "Section Details",
    messages: "Messages",
  };

  function showPage(key) {
    pages.forEach((p) => p.classList.toggle("active", p.id === key));
    navLinks.forEach((a) => a.classList.toggle("active", a.dataset.page === key));
    pageTitle.textContent = TITLES[key] || "Admin Portal";
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  navLinks.forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showPage(a.dataset.page);
      document.body.classList.remove("sidebar-open");
      overlay?.classList.remove("show");
    })
  );
  toggleSidebarBtn?.addEventListener("click", () => {
    const open = !document.body.classList.contains("sidebar-open");
    document.body.classList.toggle("sidebar-open", open);
    overlay?.classList.toggle("show", open);
  });
  overlay?.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
    overlay?.classList.remove("show");
  });

  document.getElementById("backToStudentsLink")?.addEventListener("click", (e) => { e.preventDefault(); showPage("students"); });
  document.getElementById("backToSectionsLink")?.addEventListener("click", (e) => { e.preventDefault(); showPage("sections"); });

  showPage("students");

  /* ---------- Global state ---------- */
  let STUDENTS = [];        // {uid, id, name, email, year, course, section}
  let SECTIONS = [];        // {id, course, name, year, notes}
  let CURRENT_STUDENT = null;
  let CURRENT_SECTION = null;
  let SECTION_MEMBERS = [];
  let CURRENT_MEMBER_FOR_GRADE = null;

  /* ============== STUDENTS LIST ============== */
  const studentsTableBody = document.getElementById("studentsTableBody");
  const studentsFilterYear = document.getElementById("studentsFilterYear");
  const studentsSearch = document.getElementById("studentsSearch");
  const studentsSort = document.getElementById("studentsSort");
  const addStudentBtn = document.getElementById("addStudentBtn");
  const exportStudentsBtn = document.getElementById("exportStudentsBtn");
  const addStudentModal = document.getElementById("addStudentModal");
  const addStudentForm = document.getElementById("addStudentForm");
  const cancelAddStudent = document.getElementById("cancelAddStudent");
  const cancelAddStudent2 = document.getElementById("cancelAddStudent2");

  async function loadStudents() {
    const qy = query(collection(db, "users"), where("role", "==", "student"));
    const snap = await getDocs(qy);
    STUDENTS = snap.docs.map(d => {
      const v = d.data();
      return {
        uid: d.id,
        id: v.studentId || v.studentIdNumber || "",
        name: v.name || v.displayName || "",
        email: v.email || "",
        year: v.year || "",
        course: v.course || "",
        section: v.section || "",
      };
    });
    renderStudents();
    refreshMemberSelect();
  }

  function sortStudents(arr) {
    const key = studentsSort?.value || "year";
    const byYear = (a) => parseInt(String(a.year).match(/\d/)?.[0] ?? "999", 10);
    if (key === "name") return arr.sort((a,b)=> String(a.name).localeCompare(String(b.name)));
    if (key === "id")   return arr.sort((a,b)=> String(a.id).localeCompare(String(b.id)));
    return arr.sort((a,b)=> byYear(a) - byYear(b));
  }

  function renderStudents() {
    const yr = studentsFilterYear?.value || "__ALL__";
    const term = (studentsSearch?.value || "").toLowerCase().trim();

    let data = [...STUDENTS];
    if (yr !== "__ALL__") data = data.filter(s => String(s.year).toLowerCase() === yr.toLowerCase());
    if (term) {
      data = data.filter(s =>
        (s.name || "").toLowerCase().includes(term) ||
        (s.id || "").toLowerCase().includes(term) ||
        (s.email || "").toLowerCase().includes(term)
      );
    }
    data = sortStudents(data);

    if (!data.length) {
      studentsTableBody.innerHTML = `<tr><td colspan="7">No students found.</td></tr>`;
      return;
    }

    studentsTableBody.innerHTML = data.map(s => `
      <tr data-uid="${s.uid}">
        <td>${escapeHTML(s.id)}</td>
        <td class="linkable" style="cursor:pointer;text-decoration:underline;">${escapeHTML(s.name)}</td>
        <td>${escapeHTML(s.email)}</td>
        <td>${escapeHTML(s.year)}</td>
        <td>—</td>
        <td>Active</td>
        <td><button class="btn btn-secondary btn-xs" data-action="view">View</button></td>
      </tr>
    `).join("");
  }

  studentsFilterYear?.addEventListener("change", renderStudents);
  studentsSearch?.addEventListener("input", renderStudents);
  studentsSort?.addEventListener("change", renderStudents);

  studentsTableBody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='view']");
    const nameCell = e.target.closest("td.linkable");
    const row = e.target.closest("tr");
    if (!row) return;
    const uid = row.dataset.uid;
    const s = STUDENTS.find(x => x.uid === uid);
    if (!s) return;
    if (btn || nameCell) openStudentDetail(s);
  });

  function openAddStudentModal() {
    addStudentForm?.reset();
    addStudentModal?.classList.add("show");
    addStudentModal?.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
  }
  function closeAddStudentModal() {
    addStudentModal?.classList.remove("show");
    addStudentModal?.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
  }
  addStudentBtn?.addEventListener("click", openAddStudentModal);
  cancelAddStudent?.addEventListener("click", closeAddStudentModal);
  cancelAddStudent2?.addEventListener("click", closeAddStudentModal);

  addStudentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("studentName")?.value.trim();
    const email = document.getElementById("studentEmail")?.value.trim();
    const year = document.getElementById("studentGrade")?.value.trim();
    const studentId = document.getElementById("studentId")?.value.trim();

    try {
      const uref = doc(collection(db, "users")); // random id for profile
      await setDoc(uref, {
        name, email, year, studentId, role: "student",
        createdAt: serverTimestamp(),
      }, { merge: true });

      closeAddStudentModal();
      await loadStudents();
      alert("Student added.");
    } catch (err) {
      console.error("add student failed:", err);
      alert("Failed to add student. Check rules/permissions and try again.");
    }
  });

  exportStudentsBtn?.addEventListener("click", () => {
    if (!STUDENTS.length) { alert("No students to export."); return; }
    const lines = [["Student ID","Name","Email","Year","Course","Section"].join(",")];
    sortStudents(STUDENTS).forEach(s => {
      const vals = [s.id, s.name, s.email, s.year, s.course, s.section]
        .map(v => `"${String(v ?? "").replaceAll('"','""')}"`);
      lines.push(vals.join(","));
    });
    downloadFile("students.csv", lines.join("\n"));
  });

  /* ============== STUDENT DETAIL + GRADES ============== */
  const stName = document.getElementById("stName");
  const stId   = document.getElementById("stId");
  const sogTableBody = document.getElementById("sogTableBody");
  const addSoGBtn = document.getElementById("addSoGBtn");
  const exportSoGBtn = document.getElementById("exportSoGBtn");
  const filterYear = document.getElementById("filterYear");
  const filterSem  = document.getElementById("filterSem");

  const addSoGModal = document.getElementById("addSoGModal");
  const closeAddSoG = document.getElementById("closeAddSoG");
  const cancelAddSoG = document.getElementById("cancelAddSoG");
  const addSoGForm = document.getElementById("addSoGForm");

  function openStudentDetail(s) {
    CURRENT_STUDENT = s;
    stName.textContent = s.name || "—";
    stId.textContent   = s.id || "—";
    if (filterYear) filterYear.value = "__ALL__";
    if (filterSem)  filterSem.value  = "__ALL__";
    renderStudentSummary().catch(console.error);
    showPage("student-detail");
  }

  // NOTE: no orderBy to avoid index requirements — sort client-side
  async function fetchAllGrades(uid) {
    const snap = await getDocs(collection(db, "users", uid, "grades"));
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => {
      const ya = String(a.yearLevel || ""); const yb = String(b.yearLevel || "");
      if (ya !== yb) return ya.localeCompare(yb);
      const sa = String(a.semester || ""); const sb = String(b.semester || "");
      return sa.localeCompare(sb);
    });
    return rows;
  }

  async function renderStudentSummary() {
    if (!CURRENT_STUDENT) {
      sogTableBody.innerHTML = '<tr><td colspan="7">No summary entries yet.</td></tr>'; 
      return;
    }
    try {
      const all = await fetchAllGrades(CURRENT_STUDENT.uid);

      // map filter labels -> canonical keys used in DB
      const yearFilterKey = (!filterYear || filterYear.value === "__ALL__") ? "__ALL__" : yearKey(filterYear.value);
      const semFilterKey  = (!filterSem  || filterSem.value  === "__ALL__") ? "__ALL__" : semKey(filterSem.value);

      const entries = all.filter(ent => {
        const okYear = yearFilterKey === "__ALL__" || String(ent.yearLevel) === yearFilterKey;
        const okSem  = semFilterKey  === "__ALL__" || String(ent.semester)  === semFilterKey;
        return okYear && okSem;
      });

      if (!entries.length) {
        sogTableBody.innerHTML = '<tr><td colspan="7">No summary entries yet.</td></tr>';
        return;
      }
      sogTableBody.innerHTML = entries.map(ent => `
        <tr>
          <td>${escapeHTML(ent.yearLevel ?? "")}</td>
          <td>${escapeHTML(ent.semester ?? "")}</td>
          <td>${escapeHTML(ent.courseName || ent.title || "—")}</td>
          <td>${escapeHTML(ent.courseCode || ent.code || "—")}</td>
          <td>${Number(ent.units ?? 0)}</td>
          <td>${escapeHTML(ent.grade ?? ent.mark ?? "—")}</td>
          <td></td>
        </tr>
      `).join("");
    } catch (err) {
      console.error("fetch/render grades failed:", err);
      sogTableBody.innerHTML = '<tr><td colspan="7">Failed to load grades.</td></tr>';
    }
  }
  filterYear?.addEventListener("change", () => renderStudentSummary().catch(console.error));
  filterSem?.addEventListener("change", () => renderStudentSummary().catch(console.error));

  function openAddSoGModal() {
    if (!CURRENT_STUDENT) { alert("Open a student first."); return; }
    addSoGForm?.reset();
    const fy = filterYear?.value, fs = filterSem?.value;
    if (fy && fy !== "__ALL__") document.getElementById("sogYear").value = fy;
    if (fs && fs !== "__ALL__") document.getElementById("sogSem").value  = fs;
    addSoGModal?.classList.add("show");
    addSoGModal?.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
  }
  function closeAddSoGModal() {
    addSoGModal?.classList.remove("show");
    addSoGModal?.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
  }
  addSoGBtn?.addEventListener("click", openAddSoGModal);
  closeAddSoG?.addEventListener("click", closeAddSoGModal);
  cancelAddSoG?.addEventListener("click", closeAddSoGModal);

  addSoGForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_STUDENT) return;
    const yearLevel = yearKey(document.getElementById("sogYear").value.trim());
    const semester  = semKey(document.getElementById("sogSem").value.trim());
    const courseName = document.getElementById("sogCourseName").value.trim();
    const courseCode = document.getElementById("sogCourseCode").value.trim();
    const units = Number(document.getElementById("sogUnits").value.trim() || "0");
    const grade  = document.getElementById("sogMark").value.trim();

    try {
      await addDoc(collection(db, "users", CURRENT_STUDENT.uid, "grades"), {
        yearLevel, semester, courseName, courseCode, units, grade,
        createdAt: serverTimestamp(),
      });
      closeAddSoGModal();
      await renderStudentSummary();
      alert("Summary entry added.");
    } catch (err) {
      console.error("add SoG failed:", err);
      alert("Failed to add entry.");
    }
  });

  exportSoGBtn?.addEventListener("click", () => {
    const table = document.querySelector("#student-detail table");
    if (!table) return;
    const csv = [...table.querySelectorAll("tr")].map(tr =>
      [...tr.querySelectorAll("th,td")].map(td => {
        const txt = td.textContent.replace(/\s+/g,' ').trim();
        return /[",\n]/.test(txt) ? `"${txt.replace(/"/g,'""')}"` : txt;
      }).join(",")
    ).join("\n");
    const yr = (filterYear?.value === "__ALL__" ? "ALL" : filterYear?.value?.replace(/\s+/g,'')) || "ALL";
    const sm = (filterSem?.value  === "__ALL__" ? "ALL" : filterSem?.value?.replace(/\s+/g,'')) || "ALL";
    const id = stId?.textContent || "student";
    downloadFile(`${id}_summary_${yr}_${sm}.csv`, csv);
  });

  /* ============== SECTIONS & MEMBERS (with per-member Add Grade) ============== */
  const sectionsTableBody = document.getElementById("sectionsTableBody");
  const addSectionBtn = document.getElementById("addSectionBtn");
  const exportSectionsBtn = document.getElementById("exportSectionsBtn");

  const addSectionModal = document.getElementById("addSectionModal");
  const addSectionForm = document.getElementById("addSectionForm");
  const closeAddSection = document.getElementById("closeAddSection");
  const cancelAddSection = document.getElementById("cancelAddSection");

  const sdTitle = document.getElementById("sdTitle");
  const sdCourse = document.getElementById("sdCourse");
  const sdSection = document.getElementById("sdSection");
  const sdYear = document.getElementById("sdYear");
  const sectionMembersBody = document.getElementById("sectionMembersBody");

  const addMemberBtn = document.getElementById("addMemberBtn");
  const exportSectionMembersBtn = document.getElementById("exportSectionMembersBtn");

  const addMemberModal = document.getElementById("addMemberModal");
  const addMemberForm = document.getElementById("addMemberForm");
  const closeAddMember = document.getElementById("closeAddMember");
  const cancelAddMember = document.getElementById("cancelAddMember");

  const memberSelect = document.getElementById("memberSelect");
  const memberId = document.getElementById("memberId");
  const memberName = document.getElementById("memberName");
  const memberEmail = document.getElementById("memberEmail");
  const memberYear = document.getElementById("memberYear");

  // modal for per-member grade
  const addMemberGradeModal = document.getElementById("addMemberGradeModal");
  const addMemberGradeForm = document.getElementById("addMemberGradeForm");
  const amgClose = document.getElementById("amgClose");
  const amgCancel = document.getElementById("amgCancel");
  const amgStudentName = document.getElementById("amgStudentName");

  async function loadSections() {
    const snap = await getDocs(collection(db, "sections"));
    SECTIONS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSections();
  }

  function renderSections() {
    if (!SECTIONS.length) {
      sectionsTableBody.innerHTML = `<tr><td colspan="6">No sections yet.</td></tr>`;
      return;
    }
    sectionsTableBody.innerHTML = SECTIONS.map(s => `
      <tr data-id="${s.id}">
        <td>${escapeHTML(s.course || "—")}</td>
        <td>${escapeHTML(s.name || "—")}</td>
        <td>${escapeHTML(s.year || "—")}</td>
        <td>—</td>
        <td>${escapeHTML(s.notes || "—")}</td>
        <td><button class="btn btn-secondary btn-xs" data-action="open">Open</button></td>
      </tr>
    `).join("");
  }

  sectionsTableBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='open']");
    const row = e.target.closest("tr");
    if (!btn || !row) return;
    const id = row.getAttribute("data-id");
    const sec = SECTIONS.find(x => x.id === id);
    if (!sec) return;
    await openSectionDetail(sec);
  });

  async function openSectionDetail(sec) {
    CURRENT_SECTION = sec;
    sdTitle.textContent = `${sec.course || "—"} • ${sec.name || "—"}`;
    sdCourse.textContent = sec.course || "—";
    sdSection.textContent = sec.name || "—";
    sdYear.textContent = sec.year || "—";
    await loadSectionMembers();
    showPage("section-detail");
  }

  async function loadSectionMembers() {
    if (!CURRENT_SECTION) return;
    const qs = await getDocs(collection(db, "sections", CURRENT_SECTION.id, "members"));
    SECTION_MEMBERS = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMembers(SECTION_MEMBERS);
  }

  function renderMembers(rows) {
    if (!sectionMembersBody) return;
    if (!rows.length) {
      sectionMembersBody.innerHTML = `<tr><td colspan="5">No members yet.</td></tr>`;
      return;
    }
    sectionMembersBody.innerHTML = rows.map(m => `
      <tr data-uid="${escapeHTML(m.studentUid || "")}" data-name="${escapeHTML(m.name || "")}" data-id="${escapeHTML(m.studentId || "")}" data-email="${escapeHTML(m.email || "")}" data-year="${escapeHTML(m.year || "")}">
        <td>${escapeHTML(m.studentId || "—")}</td>
        <td>${escapeHTML(m.name || "—")}</td>
        <td>${escapeHTML(m.email || "—")}</td>
        <td>${escapeHTML(m.year || "—")}</td>
        <td>
          <button class="btn btn-secondary btn-xs" data-action="view-student">View</button>
          <button class="btn btn-primary btn-xs" data-action="add-grade">Add Grade</button>
        </td>
      </tr>
    `).join("");
  }

  sectionMembersBody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    const row = e.target.closest("tr");
    if (!btn || !row) return;

    const uid = row.getAttribute("data-uid");
    const name = row.getAttribute("data-name") || "Student";
    const sid  = row.getAttribute("data-id") || "";
    const email= row.getAttribute("data-email") || "";
    const year = row.getAttribute("data-year") || "";

    if (btn.dataset.action === "view-student") {
      const s = STUDENTS.find(x => x.uid === uid) || { uid, name, id: sid, email, year };
      openStudentDetail(s);
    }
    if (btn.dataset.action === "add-grade") {
      CURRENT_MEMBER_FOR_GRADE = { uid, name, id: sid, email, year };
      openAddMemberGradeModal();
    }
  });

  function openAddSectionModal() {
    addSectionForm?.reset();
    addSectionModal?.classList.add("show");
    addSectionModal?.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
  }
  function closeAddSectionModal() {
    addSectionModal?.classList.remove("show");
    addSectionModal?.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
  }
  addSectionBtn?.addEventListener("click", openAddSectionModal);
  closeAddSection?.addEventListener("click", closeAddSectionModal);
  cancelAddSection?.addEventListener("click", closeAddSectionModal);

  addSectionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const course = document.getElementById("sectionCourse")?.value.trim();
    const name = document.getElementById("sectionName")?.value.trim();
    const year = document.getElementById("sectionYear")?.value.trim();
    const notes = document.getElementById("sectionNotes")?.value.trim();
    try {
      const sref = await addDoc(collection(db, "sections"), { course, name, year, notes, createdAt: serverTimestamp() });
      closeAddSectionModal();
      await loadSections();
      const sec = { id: sref.id, course, name, year, notes };
      await openSectionDetail(sec);
      alert("Section saved.");
    } catch (err) {
      console.error("add section failed:", err);
      alert("Failed to add section. Check rules/permissions.");
    }
  });

  function openAddMemberModal() {
    if (!CURRENT_SECTION) { alert("Open a section first."); return; }
    addMemberForm?.reset();
    refreshMemberSelect();
    addMemberModal?.classList.add("show");
    addMemberModal?.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
  }
  function closeAddMemberModal() {
    addMemberModal?.classList.remove("show");
    addMemberModal?.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
  }
  addMemberBtn?.addEventListener("click", openAddMemberModal);
  closeAddMember?.addEventListener("click", closeAddMemberModal);
  cancelAddMember?.addEventListener("click", closeAddMemberModal);

  function refreshMemberSelect() {
    if (!memberSelect) return;
    const opts = ['<option value="">— Select from Students —</option>']
      .concat(STUDENTS.map(s => `<option value="${s.uid}" data-id="${escapeHTML(s.id)}" data-name="${escapeHTML(s.name)}" data-email="${escapeHTML(s.email)}" data-year="${escapeHTML(s.year)}">${escapeHTML(s.name)} (${escapeHTML(s.id || "—")})</option>`));
    memberSelect.innerHTML = opts.join("");
  }

  memberSelect?.addEventListener("change", (e) => {
    const opt = e.target.selectedOptions?.[0];
    if (!opt) return;
    memberId.value = opt.getAttribute("data-id") || "";
    memberName.value = opt.getAttribute("data-name") || "";
    memberEmail.value = opt.getAttribute("data-email") || "";
    memberYear.value = opt.getAttribute("data-year") || "";
  });

  addMemberForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_SECTION) return;

    const selectedUid = memberSelect?.value || "";
    let uid = selectedUid;

    let sId = memberId?.value.trim();
    let sName = memberName?.value.trim();
    let sEmail = memberEmail?.value.trim();
    let sYear = memberYear?.value.trim();

    try {
      if (!uid) {
        if (!sName || !sEmail || !sId || !sYear) {
          alert("Fill in Student ID, Name, Email, Year — or select an existing student.");
          return;
        }
        const uref = doc(collection(db, "users"));
        await setDoc(uref, {
          name: sName, email: sEmail, studentId: sId, year: sYear, role: "student",
          createdAt: serverTimestamp(),
        }, { merge: true });
        uid = uref.id;
        await loadStudents();
      } else {
        const s = STUDENTS.find(x => x.uid === uid);
        if (s) {
          sId = sId || s.id || "";
          sName = sName || s.name || "";
          sEmail = sEmail || s.email || "";
          sYear = sYear || s.year || "";
        }
      }

      await addDoc(collection(db, "sections", CURRENT_SECTION.id, "members"), {
        studentUid: uid,
        studentId: sId || "",
        name: sName || "",
        email: sEmail || "",
        year: sYear || "",
        addedAt: serverTimestamp(),
      });

      closeAddMemberModal();
      await loadSectionMembers();
      alert("Member added to section.");
    } catch (err) {
      console.error("add member failed:", err);
      alert("Failed to add member. Check rules/permissions.");
    }
  });

  function openAddMemberGradeModal() {
    if (!CURRENT_MEMBER_FOR_GRADE) { alert("Select a member first."); return; }
    addMemberGradeForm?.reset();
    amgStudentName.textContent = CURRENT_MEMBER_FOR_GRADE.name || "Student";
    const yr = document.getElementById("amgYear");
    if (yr && CURRENT_MEMBER_FOR_GRADE.year) yr.value = CURRENT_MEMBER_FOR_GRADE.year;
    addMemberGradeModal?.classList.add("show");
    addMemberGradeModal?.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
  }
  function closeAddMemberGradeModal() {
    addMemberGradeModal?.classList.remove("show");
    addMemberGradeModal?.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
  }
  amgClose?.addEventListener("click", closeAddMemberGradeModal);
  amgCancel?.addEventListener("click", closeAddMemberGradeModal);

  addMemberGradeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_MEMBER_FOR_GRADE?.uid) { alert("Missing member."); return; }

    const yearLabel = document.getElementById("amgYear")?.value?.trim();
    const semLabel  = document.getElementById("amgSem")?.value?.trim();
    const courseName= document.getElementById("amgCourseName")?.value?.trim();
    const courseCode= document.getElementById("amgCourseCode")?.value?.trim();
    const units     = Number(document.getElementById("amgUnits")?.value?.trim() || "0");
    const grade     = document.getElementById("amgMark")?.value?.trim();

    const yearLevel = yearKey(yearLabel);
    const semester  = semKey(semLabel);

    if (!yearLevel || !semester || !courseName || !courseCode) {
      alert("Please complete the form.");
      return;
    }

    try {
      await addDoc(collection(db, "users", CURRENT_MEMBER_FOR_GRADE.uid, "grades"), {
        yearLevel, semester, courseName, courseCode, units, grade, createdAt: serverTimestamp()
      });
      closeAddMemberGradeModal();
      alert("Grade added.");
      if (CURRENT_STUDENT && CURRENT_STUDENT.uid === CURRENT_MEMBER_FOR_GRADE.uid) {
        await renderStudentSummary();
      }
    } catch (err) {
      console.error("add member grade failed:", err);
      alert("Failed to add grade. Check rules/permissions.");
    }
  });

  /* ============== MESSAGES (Admin) ============== */
  const messagesTableBody = document.getElementById("messagesTableBody");
  function renderThreadsTable(rows) {
    if (!messagesTableBody) return;
    if (!rows.length) {
      messagesTableBody.innerHTML = `<tr><td colspan="6">No messages.</td></tr>`;
      return;
    }
    messagesTableBody.innerHTML = rows.map(r => `
      <tr data-uid="${r.studentUid}">
        <td>${escapeHTML(r.studentName || r.studentEmail || r.studentUid || "")}</td>
        <td>${escapeHTML(r.lastMessage?.subject || "—")}</td>
        <td>${escapeHTML((r.lastMessage?.text || "—").slice(0,120))}</td>
        <td>${r.updatedAt ? new Date(r.updatedAt.toDate()).toLocaleString() : "—"}</td>
        <td>${r.lastSender === r.studentUid ? "New" : "—"}</td>
        <td>
          <button class="btn btn-secondary btn-xs" data-action="open">Open</button>
          <button class="btn btn-primary btn-xs" data-action="reply">Reply</button>
        </td>
      </tr>
    `).join("");
  }

  // If you also want admin-side thread list in realtime, you can add an onSnapshot
  // but it's optional for this fix.

  /* ============== LOGOUT & INITIAL LOAD ============== */
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "auth.html";
  });

  Promise.all([loadStudents(), loadSections()]).catch(console.error);
}
