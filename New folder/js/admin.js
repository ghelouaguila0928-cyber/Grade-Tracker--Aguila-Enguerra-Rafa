// js/admin.js (complete)
// Robust Student/Section management + Summary of Grades (edit/delete)
// Realtime Admin Messages: subscribes to "threads" and renders newest first

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where, orderBy,
  serverTimestamp, onSnapshot,
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

// Normalize "1st Year"/"1"/"First Year" -> "1"
function yearKey(label) {
  const v = String(label ?? "");
  const m = v.match(/^(\d)/);
  if (m) return m[1];
  const low = v.toLowerCase();
  if (low.includes("first")) return "1";
  if (low.includes("second")) return "2";
  if (low.includes("third")) return "3";
  if (low.includes("fourth")) return "4";
  if (low.includes("fifth")) return "5";
  return v.replace(/[^0-9]/g,"") || "";
}
function prettyYear(y) {
  const k = yearKey(y);
  return ({ "1":"1st Year", "2":"2nd Year", "3":"3rd Year", "4":"4th Year", "5":"5th Year" }[k] || (k ? `Year ${k}` : "—"));
}

function semKey(label) {
  const v = String(label||"").toLowerCase();
  if (v.startsWith("1")) return "1st";
  if (v.startsWith("2")) return "2nd";
  return "Summer";
}

const downloadFile = (filename, text, mimetype = "text/csv;charset=utf-8") => {
  const blob = new Blob([text], { type: mimetype });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
};

// Delete all docs under a collection ref
async function deleteAllDocs(colRef) {
  const snap = await getDocs(colRef);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

// Safe Firestore Timestamp -> locale string
function tsToLocaleString(x) {
  try {
    if (!x) return "";
    if (typeof x.toDate === "function") return x.toDate().toLocaleString();
    if (x instanceof Date) return x.toLocaleString();
    return "";
  } catch { return ""; }
}

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

  // Robust mapper for different schemas/capitalizations
  function mapUserDoc(d) {
    const v = d.data();
    const studentId =
      v.studentId ?? v.studentID ?? v.student_id ?? v.studentIdNumber ?? v.studentNumber ?? "";
    const yearRaw =
      v.year ?? v.yearLevel ?? v.gradeLevel ?? v.level ?? "";

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

  async function loadStudents() {
    const snap = await getDocs(collection(db, "users"));
    const all = snap.docs.map(mapUserDoc);
    // include: explicit students OR docs with studentId present (fallback)
    STUDENTS = all.filter(s => s.role === "student" || !!s.id);
    renderStudents();
    refreshMemberSelect();
  }

  function sortStudents(arr) {
    const key = studentsSort?.value || "year";
    const byYear = (a) => parseInt(yearKey(a.year) || "999", 10);
    if (key === "name") return arr.sort((a,b)=> String(a.name).localeCompare(String(b.name)));
    if (key === "id")   return arr.sort((a,b)=> String(a.id).localeCompare(String(b.id)));
    return arr.sort((a,b)=> byYear(a) - byYear(b));
  }

  function renderStudents() {
    const yrFilter = studentsFilterYear?.value || "__ALL__";
    const yrKeyFilter = yrFilter === "__ALL__" ? "__ALL__" : yearKey(yrFilter);
    const term = (studentsSearch?.value || "").toLowerCase().trim();

    let data = [...STUDENTS];

    if (yrKeyFilter !== "__ALL__") {
      data = data.filter(s => yearKey(s.year) === yrKeyFilter);
    }
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
        <td>${escapeHTML(s.id || "—")}</td>
        <td class="linkable" style="cursor:pointer;text-decoration:underline;">${escapeHTML(s.name || "—")}</td>
        <td>${escapeHTML(s.email || "—")}</td>
        <td>${escapeHTML(prettyYear(s.year))}</td>
        <td>—</td>
        <td>Active</td>
        <td class="nowrap">
          <button class="btn btn-secondary btn-xs" data-action="view">View</button>
          <button class="btn btn-secondary btn-xs" data-action="edit">Edit</button>
          <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
        </td>
      </tr>
    `).join("");
  }

  studentsFilterYear?.addEventListener("change", renderStudents);
  studentsSearch?.addEventListener("input", renderStudents);
  studentsSort?.addEventListener("change", renderStudents);

  studentsTableBody?.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const uid = row.dataset.uid;
    const s = STUDENTS.find(x => x.uid === uid);
    if (!s) return;

    if (e.target.closest("button[data-action='view']") || e.target.closest("td.linkable")) {
      openStudentDetail(s);
      return;
    }
    if (e.target.closest("button[data-action='edit']")) {
      openAddStudentModal(s); // prefill for edit
      return;
    }
    if (e.target.closest("button[data-action='delete']")) {
      await deleteStudentDeep(s);
      return;
    }
  });

  function openAddStudentModal(student = null) {
    addStudentForm?.reset();
    addStudentForm.dataset.mode = student ? 'edit' : 'create';
    addStudentForm.dataset.uid = student?.uid || '';

    document.getElementById("studentName").value  = student?.name  || '';
    document.getElementById("studentEmail").value = student?.email || '';
    document.getElementById("studentGrade").value = student?.year ? prettyYear(student.year) : '';
    const idInput = document.getElementById("studentId");
    idInput.value = student?.id || '';
    idInput.disabled = !!student; // keep studentId immutable in edit

    addStudentModal?.classList.add("show");
    addStudentModal?.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
  }
  function closeAddStudentModal() {
    addStudentModal?.classList.remove("show");
    addStudentModal?.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
  }
  addStudentBtn?.addEventListener("click", () => openAddStudentModal());
  cancelAddStudent?.addEventListener("click", closeAddStudentModal);
  cancelAddStudent2?.addEventListener("click", closeAddStudentModal);

  addStudentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("studentName")?.value.trim();
    const email = document.getElementById("studentEmail")?.value.trim();
    const yearLabel = document.getElementById("studentGrade")?.value.trim();
    const year = yearKey(yearLabel);
    const studentId = document.getElementById("studentId")?.value.trim();

    try {
      const mode = addStudentForm.dataset.mode || 'create';
      if (mode === 'edit') {
        const uid = addStudentForm.dataset.uid;
        if (!uid) throw new Error('Missing uid for edit');
        await updateDoc(doc(db, 'users', uid), { name, email, year });
      } else {
        const uref = doc(collection(db, "users")); // random id for profile
        await setDoc(uref, {
          name, email, year, studentId, role: "student",
          createdAt: serverTimestamp(),
        }, { merge: true });
      }
      closeAddStudentModal();
      await loadStudents();
      alert(mode === 'edit' ? "Student updated." : "Student added.");
    } catch (err) {
      console.error("save student failed:", err);
      alert("Failed to save student. Check rules/permissions and try again.");
    }
  });

  async function deleteStudentDeep(student) {
    if (!confirm(`Sigurado ka bang i-dedelete si ${student.name || student.id || student.uid}? Hindi na ito maibabalik.`)) return;
    try {
      // 1) delete grades subcollection
      await deleteAllDocs(collection(db, 'users', student.uid, 'grades'));
      // 2) remove from each section members subcollection
      const secs = await getDocs(collection(db, 'sections'));
      await Promise.all(secs.docs.map(async sd => {
        const ms = await getDocs(query(collection(db, 'sections', sd.id, 'members'), where('studentUid','==', student.uid)));
        await Promise.all(ms.docs.map(m => deleteDoc(m.ref)));
      }));
      // 3) delete user doc
      await deleteDoc(doc(db, 'users', student.uid));
      // reload ui
      await Promise.all([loadStudents(), loadSections()]);
      alert('Student deleted.');
    } catch (err) {
      console.error('delete student failed:', err);
      alert('Failed to delete student. Check rules/permissions.');
    }
  }

  exportStudentsBtn?.addEventListener("click", () => {
    if (!STUDENTS.length) { alert("No students to export."); return; }
    const lines = [["Student ID","Name","Email","Year","Course","Section"].join(",")];
    sortStudents(STUDENTS).forEach(s => {
      const vals = [s.id, s.name, s.email, prettyYear(s.year), s.course, s.section]
        .map(v => `"${String(v ?? "").replaceAll('"','""')}"`);
      lines.push(vals.join(","));
    });
    downloadFile("students.csv", lines.join("\n"));
  });

  /* ============== STUDENT DETAIL + GRADES (with Edit/Delete) ============== */
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
        <tr data-id="${ent.id}">
          <td>${escapeHTML(String(ent.yearLevel ?? ""))}</td>
          <td>${escapeHTML(String(ent.semester ?? ""))}</td>
          <td>${escapeHTML(ent.courseName || ent.title || "—")}</td>
          <td>${escapeHTML(ent.courseCode || ent.code || "—")}</td>
          <td>${Number(ent.units ?? 0)}</td>
          <td>${escapeHTML(ent.grade ?? ent.mark ?? "—")}</td>
          <td class="nowrap">
            <button class="btn btn-secondary btn-xs" data-action="edit-grade">Edit</button>
            <button class="btn btn-danger btn-xs" data-action="delete-grade">Delete</button>
          </td>
        </tr>
      `).join("");
    } catch (err) {
      console.error("fetch/render grades failed:", err);
      sogTableBody.innerHTML = '<tr><td colspan="7">Failed to load grades.</td></tr>';
    }
  }
  filterYear?.addEventListener("change", () => renderStudentSummary().catch(console.error));
  filterSem?.addEventListener("change", () => renderStudentSummary().catch(console.error));

  // Grade actions (edit/delete)
  sogTableBody?.addEventListener('click', async (e) => {
    const row = e.target.closest('tr');
    if (!row || !CURRENT_STUDENT) return;
    const gid = row.getAttribute('data-id');
    if (e.target.closest("button[data-action='edit-grade']")) {
      const tds = row.querySelectorAll('td');
      document.getElementById('sogYear').value = tds[0].textContent.trim();
      document.getElementById('sogSem').value = tds[1].textContent.trim();
      document.getElementById('sogCourseName').value = tds[2].textContent.trim();
      document.getElementById('sogCourseCode').value = tds[3].textContent.trim();
      document.getElementById('sogUnits').value = tds[4].textContent.trim();
      document.getElementById('sogMark').value = tds[5].textContent.trim();
      addSoGForm.dataset.mode = 'edit';
      addSoGForm.dataset.docId = gid;
      addSoGModal?.classList.add('show');
      addSoGModal?.setAttribute('aria-hidden','false');
      document.body.classList.add('modal-open');
      return;
    }
    if (e.target.closest("button[data-action='delete-grade']")) {
      if (!confirm('Tanggalin ang entry na ito ng grado?')) return;
      try {
        await deleteDoc(doc(db, 'users', CURRENT_STUDENT.uid, 'grades', gid));
        await renderStudentSummary();
        alert('Grade deleted.');
      } catch (err) {
        console.error('delete grade failed:', err);
        alert('Failed to delete grade.');
      }
    }
  });

  function openAddSoGModal() {
    if (!CURRENT_STUDENT) { alert("Open a student first."); return; }
    addSoGForm?.reset();
    addSoGForm.dataset.mode = 'create';
    addSoGForm.dataset.docId = '';
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
      const mode = addSoGForm.dataset.mode || 'create';
      if (mode === 'edit') {
        const gid = addSoGForm.dataset.docId;
        await updateDoc(doc(db, 'users', CURRENT_STUDENT.uid, 'grades', gid), {
          yearLevel, semester, courseName, courseCode, units, grade,
        });
      } else {
        await addDoc(collection(db, "users", CURRENT_STUDENT.uid, "grades"), {
          yearLevel, semester, courseName, courseCode, units, grade,
          createdAt: serverTimestamp(),
        });
      }
      closeAddSoGModal();
      await renderStudentSummary();
      alert(mode === 'edit' ? 'Entry updated.' : 'Summary entry added.');
    } catch (err) {
      console.error("save SoG failed:", err);
      alert("Failed to save entry.");
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

  /* ============== SECTIONS (Open/Edit/Delete) & MEMBERS ============== */
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
        <td>${escapeHTML(prettyYear(s.year))}</td>
        <td>—</td>
        <td>${escapeHTML(s.notes || "—")}</td>
        <td class="nowrap">
          <button class="btn btn-secondary btn-xs" data-action="open">Open</button>
          <button class="btn btn-secondary btn-xs" data-action="edit">Edit</button>
          <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
        </td>
      </tr>
    `).join("");
  }

  sectionsTableBody?.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const id = row.getAttribute("data-id");
    const sec = SECTIONS.find(x => x.id === id);
    if (!sec) return;

    if (e.target.closest("button[data-action='open']")) { await openSectionDetail(sec); return; }
    if (e.target.closest("button[data-action='edit']")) { openAddSectionModal(sec); return; }
    if (e.target.closest("button[data-action='delete']")) { await deleteSectionDeep(sec); return; }
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

  async function loadSectionMembers() {
    if (!CURRENT_SECTION) return;
    const qs = await getDocs(collection(db, "sections", CURRENT_SECTION.id, "members"));
    SECTION_MEMBERS = qs.docs.map(d => ({ id: d.id, ...d.data() })); // keep doc id for removal
    renderMembers(SECTION_MEMBERS);
  }

  function renderMembers(rows) {
    if (!sectionMembersBody) return;
    if (!rows.length) {
      sectionMembersBody.innerHTML = `<tr><td colspan="5">No members yet.</td></tr>`;
      return;
    }
    sectionMembersBody.innerHTML = rows.map(m => `
      <tr data-doc="${escapeHTML(m.id)}" data-uid="${escapeHTML(m.studentUid || "")}" data-name="${escapeHTML(m.name || "")}" data-id="${escapeHTML(m.studentId || "")}" data-email="${escapeHTML(m.email || "")}" data-year="${escapeHTML(yearKey(m.year || ""))}">
        <td>${escapeHTML(m.studentId || "—")}</td>
        <td>${escapeHTML(m.name || "—")}</td>
        <td>${escapeHTML(m.email || "—")}</td>
        <td>${escapeHTML(prettyYear(m.year || ""))}</td>
        <td class="nowrap">
          <button class="btn btn-secondary btn-xs" data-action="view-student">View</button>
          <button class="btn btn-primary btn-xs" data-action="add-grade">Add Grade</button>
          <button class="btn btn-danger btn-xs" data-action="remove-member">Remove</button>
        </td>
      </tr>
    `).join("");
  }

  sectionMembersBody?.addEventListener("click", async (e) => {
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
      return;
    }
    if (btn.dataset.action === "add-grade") {
      CURRENT_MEMBER_FOR_GRADE = { uid, name, id: sid, email, year };
      openAddMemberGradeModal();
      return;
    }
    if (btn.dataset.action === "remove-member") {
      if (!CURRENT_SECTION) return;
      const memberDocId = row.getAttribute("data-doc");
      const ok = confirm(`Tanggalin si ${name} (${sid}) mula sa seksyon?`);
      if (!ok) return;
      try {
        await deleteDoc(doc(db, 'sections', CURRENT_SECTION.id, 'members', memberDocId));
        await loadSectionMembers();
        alert('Natanggal ang estudyante sa seksyon.');
      } catch (err) {
        console.error('remove member failed:', err);
        alert('Hindi natanggal ang miyembro. Suriin ang permissions.');
      }
      return;
    }
  });

  function openAddSectionModal(sec = null) {
    addSectionForm?.reset();
    addSectionForm.dataset.mode = sec ? 'edit' : 'create';
    addSectionForm.dataset.id = sec?.id || '';
    document.getElementById("sectionCourse").value = sec?.course || '';
    document.getElementById("sectionName").value = sec?.name || '';
    document.getElementById("sectionYear").value = prettyYear(sec?.year || '');
    document.getElementById("sectionNotes").value = sec?.notes || '';
    addSectionModal?.classList.add("show");
    addSectionModal?.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
  }
  function closeAddSectionModal() {
    addSectionModal?.classList.remove("show");
    addSectionModal?.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
  }
  addSectionBtn?.addEventListener("click", () => openAddSectionModal());
  closeAddSection?.addEventListener("click", closeAddSectionModal);
  cancelAddSection?.addEventListener("click", closeAddSectionModal);

  addSectionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const course = document.getElementById("sectionCourse")?.value.trim();
    const name = document.getElementById("sectionName")?.value.trim();
    const yearLabel = document.getElementById("sectionYear")?.value.trim();
    const year = yearKey(yearLabel);
    const notes = document.getElementById("sectionNotes")?.value.trim();
    try {
      const mode = addSectionForm.dataset.mode || 'create';
      if (mode === 'edit') {
        const id = addSectionForm.dataset.id;
        await updateDoc(doc(db, 'sections', id), { course, name, year, notes });
        closeAddSectionModal();
        await loadSections();
        alert('Section updated.');
      } else {
        const sref = await addDoc(collection(db, "sections"), { course, name, year, notes, createdAt: serverTimestamp() });
        closeAddSectionModal();
        await loadSections();
        const sec = { id: sref.id, course, name, year, notes };
        await openSectionDetail(sec);
        alert("Section saved.");
      }
    } catch (err) {
      console.error("save section failed:", err);
      alert("Failed to save section. Check rules/permissions.");
    }
  });

  async function deleteSectionDeep(sec) {
    if (!confirm(`Sigurado ka bang i-dedelete ang seksyong ${sec.course || ''} – ${sec.name || ''}? Hindi na ito maibabalik.`)) return;
    try {
      await deleteAllDocs(collection(db, 'sections', sec.id, 'members'));
      await deleteDoc(doc(db, 'sections', sec.id));
      if (CURRENT_SECTION?.id === sec.id) CURRENT_SECTION = null;
      await loadSections();
      alert('Section deleted.');
    } catch (err) {
      console.error('delete section failed:', err);
      alert('Failed to delete section. Check rules/permissions.');
    }
  }

  function refreshMemberSelect() {
    if (!memberSelect) return;
    const opts = ['<option value="">— Select from Students —</option>']
      .concat(STUDENTS.map(s => `<option value="${s.uid}" data-id="${escapeHTML(s.id)}" data-name="${escapeHTML(s.name)}" data-email="${escapeHTML(s.email)}" data-year="${escapeHTML(s.year)}">${escapeHTML(s.name)} (${escapeHTML(s.id || "—")})</option>`));
    memberSelect.innerHTML = opts.join("");
  }

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

  addMemberForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_SECTION) return;

    const memberSelect = document.getElementById('memberSelect');
    const selectedUid = memberSelect?.value || "";
    let uid = selectedUid;

    let sId = document.getElementById('memberId')?.value.trim();
    let sName = document.getElementById('memberName')?.value.trim();
    let sEmail = document.getElementById('memberEmail')?.value.trim();
    let sYear = yearKey(document.getElementById('memberYear')?.value.trim());

    try {
      if (!uid) {
        if (!sName || !sEmail || !sId || !sYear) {
          alert("Fill in Student ID, Name, Email, Year — or select an existing student.");
          return;
        }
        const uref = doc(collection(db, "users"));
        await setDoc(uref, { name: sName, email: sEmail, studentId: sId, year: sYear, role: "student", createdAt: serverTimestamp() }, { merge: true });
        uid = uref.id;
        await loadStudents();
      }

      const pick = (prop, fallback) => (prop ?? fallback ?? "");

      await addDoc(collection(db, "sections", CURRENT_SECTION.id, "members"), {
        studentUid: uid,
        studentId: sId || pick(STUDENTS.find(x => x.uid === uid)?.id, ""),
        name: sName || pick(STUDENTS.find(x => x.uid === uid)?.name, ""),
        email: sEmail || pick(STUDENTS.find(x => x.uid === uid)?.email, ""),
        year: sYear || pick(STUDENTS.find(x => x.uid === uid)?.year, ""),
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

  // Per-member Quick Add Grade modal (optional)
  const addMemberGradeModal = document.getElementById("addMemberGradeModal");
  const addMemberGradeForm = document.getElementById("addMemberGradeForm");
  const amgClose = document.getElementById("amgClose");
  const amgCancel = document.getElementById("amgCancel");
  const amgStudentName = document.getElementById("amgStudentName");

  function openAddMemberGradeModal() {
    if (!CURRENT_MEMBER_FOR_GRADE) { alert("Select a member first."); return; }
    addMemberGradeForm?.reset();
    amgStudentName.textContent = CURRENT_MEMBER_FOR_GRADE.name || "Student";
    const yr = document.getElementById("amgYear");
    if (yr && CURRENT_MEMBER_FOR_GRADE.year) yr.value = prettyYear(CURRENT_MEMBER_FOR_GRADE.year);
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

  /* ============== MESSAGES (Admin) — REALTIME THREADS TABLE ============== */
  const messagesTableBody = document.getElementById("messagesTableBody");
  let threadsUnsub = null;

  function renderThreadsTable(rows) {
    if (!messagesTableBody) return;
    if (!rows.length) {
      messagesTableBody.innerHTML = `<tr><td colspan="6">No messages.</td></tr>`;
      return;
    }
    messagesTableBody.innerHTML = rows.map(r => `
      <tr data-uid="${escapeHTML(r.studentUid || "")}">
        <td>${escapeHTML(r.studentName || r.studentEmail || r.studentUid || "")}</td>
        <td>${escapeHTML(r.lastMessage?.subject || "—")}</td>
        <td>${escapeHTML((r.lastMessage?.text || "—").slice(0,120))}</td>
        <td>${tsToLocaleString(r.updatedAt)}</td>
        <td>${r.lastSender && r.studentUid && r.lastSender === r.studentUid ? "New" : "—"}</td>
        <td>
          <button class="btn btn-secondary btn-xs" data-action="open">Open</button>
          <button class="btn btn-primary btn-xs" data-action="reply">Reply</button>
        </td>
      </tr>
    `).join("");
  }

  function subscribeThreads() {
    threadsUnsub?.();
    const qy = query(collection(db, "threads"), orderBy("updatedAt", "desc"));
    threadsUnsub = onSnapshot(qy, (qs) => {
      const rows = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      renderThreadsTable(rows);
    }, (err) => {
      console.warn("[threads onSnapshot] error:", err?.message || err);
      renderThreadsTable([]);
    });
  }

  // Example row handlers (wire to your message view workflow)
  messagesTableBody?.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");   
    const uid = row?.getAttribute("data-uid");
    if (!row || !uid) return;

    if (e.target.closest("button[data-action='open']")) {
      const s = STUDENTS.find(x => x.uid === uid) || { uid, name: "Student" };
      openStudentDetail(s);
      showPage("student-detail");
      return;
    }
    if (e.target.closest("button[data-action='reply']")) {
      alert("Open your admin reply UI here (compose modal) and send to threads/" + uid);
    }
  });

  /* ============== LOGOUT & INITIAL LOAD ============== */
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "auth.html";
  });

  Promise.all([loadStudents(), loadSections()]).catch(console.error);
  subscribeThreads();
}
