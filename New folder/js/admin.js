// js/admin.js
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, collectionGroup, getDocs, query, where,
  serverTimestamp, getCountFromServer, onSnapshot,
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
    const fileUploadInput = document.getElementById("fileUploadInput");
const uploadFileBtn = document.getElementById("uploadFileBtn");
const uploadedFilesList = document.getElementById("uploadedFilesList");

uploadFileBtn?.addEventListener("click", async () => {
  if (!CURRENT_STUDENT || !fileUploadInput.files.length) {
    alert("Select a file and open a student first.");
    return;
  }

  const file = fileUploadInput.files[0];
  const fileRef = storageRef(storage, `student_files/${CURRENT_STUDENT.uid}/${file.name}`);

  try {
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    alert("File uploaded successfully!");

    // Add to UI
    const li = document.createElement("li");
    li.innerHTML = `<a href="${url}" target="_blank">${file.name}</a> <button data-name="${file.name}">Delete</button>`;
    uploadedFilesList.appendChild(li);

    li.querySelector("button")?.addEventListener("click", async (e) => {
      const name = e.target.dataset.name;
      const delRef = storageRef(storage, `student_files/${CURRENT_STUDENT.uid}/${name}`);
      await deleteObject(delRef);
      li.remove();
      alert("File deleted.");
    });

  } catch (err) {
    console.error("Upload failed:", err);
    alert("Failed to upload file.");
  }
});

  });
})();

/* ============== HELPERS ============== */
const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const semKey  = (label) => { const v = String(label||"").toLowerCase(); if (v.startsWith("1")) return "1st"; if (v.startsWith("2")) return "2nd"; return "Summer"; };

function yearKey(label) {
  const v = String(label ?? "");
  const m = v.match(/^(\d)/); if (m) return m[1];
  const low = v.toLowerCase();
  if (low.includes("first")) return "1";
  if (low.includes("second")) return "2";
  if (low.includes("third")) return "3";
  if (low.includes("fourth")) return "4";
  if (low.includes("fifth")) return "5";
  return v.replace(/[^0-9]/g,"") || "";
}
const prettyYear = (y) => {
  const k = yearKey(y);
  return ({ "1":"1st Year","2":"2nd Year","3":"3rd Year","4":"4th Year","5":"5th Year" }[k] || (k ? `Year ${k}` : "—"));
};
const tsToLocal = (t) => t?.toDate ? new Date(t.toDate()).toLocaleString() : "";

const downloadFile = (filename, text, mimetype = "text/csv;charset=utf-8") => {
  const blob = new Blob([text], { type: mimetype });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
};
const confirmRun = async (msg, fn) => { if (!confirm(msg)) return false; await fn(); return true; };

const toNumberGrade = (g) => {
  const s = String(g ?? "").trim();
  if (!s) return null;
  const maybe = Number(s.replace(",", ".")); if (Number.isFinite(maybe)) return maybe;
  const L = s.toUpperCase();
  const map = { "A+":98,"A":95,"A-":90,"B+":88,"B":85,"B-":80,"C+":78,"C":75,"C-":70,"D":65,"F":55 };
  return map[L] ?? null;
};
const debounce = (fn, wait = 400) => { let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; };

/* ============== MAIN ============== */
function initDashboard() {
  const overlay = document.getElementById("sidebarOverlay");
  const toggleSidebarBtn = document.getElementById("toggleSidebar");
  const pageTitle = document.getElementById("pageTitle");
  const navLinks = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");
  const notifBtn = document.getElementById("notifBtn");
  const notifCountEl = document.getElementById("notifCount");

  const TITLES = {
    students: "Student Management",
    "student-detail": "Student Detail",
    sections: "Sections",
    "section-detail": "Section Details",
    messages: "Messages",
    "message-thread": "Message Thread",
  };

  /* ---------- Notifications ---------- */
  let notifCount = 0;
  const setNotif = (n) => {
    notifCount = Math.max(0, n);
    if (!notifCount) {
      notifCountEl.textContent = "0";
      notifCountEl.style.display = "none";
    } else {
      notifCountEl.textContent = String(notifCount);
      notifCountEl.style.display = "inline-block";
    }
  };
  const incNotif = (n=1)=> setNotif(notifCount + n);
  setNotif(0);
  notifBtn?.addEventListener("click", ()=> setNotif(0));

  /* ---------- Nav + pages ---------- */
  function showPage(key) {
    pages.forEach((p) => p.classList.toggle("active", p.id === key));
    navLinks.forEach((a) => a.classList.toggle("active", a.dataset.page === key));
    pageTitle.textContent = TITLES[key] || "Admin Portal";
    window.scrollTo({ top: 0, behavior: "instant" });
    if (key === "messages") {
      setNotif(0);
      renderThreadsTable(THREADS_CACHE);
    }
  }
  navLinks.forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showPage(a.dataset.page);
      document.body.classList.remove("sidebar-open");
      overlay?.classList.remove("show");
    })
  );

  // Sidebar toggle (button beside bell)
  toggleSidebarBtn?.addEventListener("click", () => {
    const open = !document.body.classList.contains("sidebar-open");
    document.body.classList.toggle("sidebar-open", open);
    overlay?.classList.toggle("show", open);
    overlay?.setAttribute("aria-hidden", open ? "false" : "true");
  });
  overlay?.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
    overlay?.classList.remove("show");
    overlay?.setAttribute("aria-hidden", "true");
  });

  document.getElementById("backToStudentsLink")?.addEventListener("click", (e) => { e.preventDefault(); showPage("students"); });
  document.getElementById("backToSectionsLink")?.addEventListener("click", (e) => { e.preventDefault(); showPage("sections"); });

  showPage("students");

  /* ---------- Global state ---------- */
  let STUDENTS = [];
  let SECTIONS = [];
  let CURRENT_STUDENT = null;
  let CURRENT_SECTION = null;
  let SECTION_MEMBERS = [];
  let CURRENT_MEMBER_FOR_GRADE = null;
  let STUDENT_AVG = new Map();

  let THREADS_CACHE = [];
  let CURRENT_THREAD_ID = null;
  let CURRENT_THREAD_META = null; // {studentUid,name,email,subject?}

  /* ---------- Realtime subscriptions ---------- */
  let unsubUsers = null;
  let unsubThreads = null;

  function mapUserDoc(d) {
    const v = d.data() || {};
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
      role: (v.role || "").toLowerCase(),
    };
  }

  function subscribeStudents() {
    if (unsubUsers) unsubUsers();
    const usersRef = collection(db, "users");
    const refreshAveragesDebounced = debounce(() => {
      loadStudentAverages().catch(console.error);
    }, 500);

    unsubUsers = onSnapshot(usersRef, (snap) => {
      const all = snap.docs.map(mapUserDoc);
      STUDENTS = all.filter(s => s.role === "student" || !!s.id);
      renderStudents();
      refreshMemberSelect();
      refreshAveragesDebounced();
    }, (err) => {
      console.error("[students] onSnapshot error:", err);
      STUDENTS = [];
      renderStudents();
    });
  }

  function subscribeThreads() {
    if (unsubThreads) unsubThreads();
    const tRef = collection(db, "threads");
    let firstThreadsSnap = true;

    unsubThreads = onSnapshot(tRef, (qs) => {
      if (!firstThreadsSnap) {
        qs.docChanges().forEach((ch) => {
          if (ch.type === "added" || ch.type === "modified") {
            const r = { id: ch.doc.id, ...ch.doc.data() };
            const isNewFromStudent = r.lastSender === r.studentUid;
            const isViewingSame = CURRENT_THREAD_ID && CURRENT_THREAD_ID === r.id;
            if (isNewFromStudent && !isViewingSame) incNotif(1);
          }
        });
      }
      firstThreadsSnap = false;

      const rows = qs.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b?.updatedAt?.toMillis?.() ?? 0) - (a?.updatedAt?.toMillis?.() ?? 0));
      THREADS_CACHE = rows;
      renderThreadsTable(rows);
    }, (e) => {
      console.warn("[messages] threads onSnapshot error:", e);
      THREADS_CACHE = [];
      renderThreadsTable([]);
    });
  }

  window.addEventListener("beforeunload", () => {
    if (unsubUsers) unsubUsers();
    if (unsubThreads) unsubThreads();
  });

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
    const snap = await getDocs(collection(db, "users"));
    const all = snap.docs.map(mapUserDoc);
    STUDENTS = all.filter(s => s.role === "student" || !!s.id);
    renderStudents();
    refreshMemberSelect();
  }

  async function loadStudentAverages() {
    const pairs = await Promise.all(
      STUDENTS.map(async (s) => {
        try {
          const snap = await getDocs(collection(db, "users", s.uid, "grades"));
          const nums = snap.docs
            .map(d => toNumberGrade(d.data().grade ?? d.data().mark))
            .filter(n => Number.isFinite(n));
          const avg = nums.length ? (nums.reduce((a,b)=>a+b,0) / nums.length) : null;
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
    const byYear = (a) => parseInt(yearKey(a.year) || "999", 10);
    if (key === "name") return arr.sort((a,b)=> String(a.name).localeCompare(String(b.name)));
    if (key === "id")   return arr.sort((a,b)=> String(a.id).localeCompare(String(b.id)));
    return arr.sort((a,b)=> byYear(a) - byYear(b));
  }

  function renderStudents() {
    const yrFilter = studentsFilterYear?.value || "__ALL__";
    const term = (studentsSearch?.value || "").toLowerCase().trim();

    let data = [...STUDENTS];

    if (yrFilter !== "__ALL__") {
      const yk = yearKey(yrFilter);
      data = data.filter(s => yearKey(s.year) === yk);
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
        <td>${STUDENT_AVG.get(s.uid) == null ? "—" : STUDENT_AVG.get(s.uid).toFixed(2)}</td>
        <td>Active</td>
        <td class="nowrap">
          <button class="btn btn-secondary btn-xs" data-action="view">View</button>
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

    const viewBtn = e.target.closest("button[data-action='view']");
    const nameCell = e.target.closest("td.linkable");
    const delBtn  = e.target.closest("button[data-action='delete']");

    if (viewBtn || nameCell) {
      openStudentDetail(s);
      return;
    }

    if (delBtn) {
      await confirmRun(
        `Delete student "${s.name || s.email || s.id}"?\nThis will remove their grades and section memberships.`,
        async () => {
          try {
            await deleteStudent(uid);
            await Promise.all([loadStudents(), loadSections()]);
            await loadStudentAverages();
            alert("Student deleted.");
          } catch (err) {
            console.error("delete student failed:", err);
            alert("Failed to delete student. Check rules/permissions.");
          }
        }
      );
    }
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

      const groups = {};
      for (const ent of entries) {
        const n = toNumberGrade(ent.grade ?? ent.mark);
        if (!Number.isFinite(n)) continue;
        const y = String(ent.yearLevel ?? "").trim();
        const s = String(ent.semester ?? "").trim();
        const key = `Y${y}-${s}`;
        if (!groups[key]) groups[key] = { sum: 0, count: 0, year: y, sem: s };
        groups[key].sum += n; groups[key].count += 1;
      }
      const semAvgBar = document.getElementById("semAvgBar");
      if (semAvgBar) {
        const items = Object.values(groups)
          .sort((a,b) => (String(a.year).localeCompare(String(b.year)) || String(a.sem).localeCompare(String(b.sem))))
          .map(g => {
            const avg = (g.sum / g.count).toFixed(2);
            return `<span class="tag" style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border-radius:12px;background:#eef;">Y${escapeHTML(g.year)} ${escapeHTML(g.sem)}: <b>${avg}</b></span>`;
          });
        semAvgBar.innerHTML = items.length ? items.join("") : `<span>—</span>`;
      }

      if (!entries.length) {
        sogTableBody.innerHTML = '<tr><td colspan="7">No summary entries yet.</td></tr>';
        return;
      }
      sogTableBody.innerHTML = entries.map(ent => `
        <tr data-id="${ent.id}">
          <td>${escapeHTML(ent.yearLevel ?? "")}</td>
          <td>${escapeHTML(ent.semester ?? "")}</td>
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
      await confirmRun('Delete this grade entry?', async () => {
        await deleteDoc(doc(db, 'users', CURRENT_STUDENT.uid, 'grades', gid));
        await renderStudentSummary();
        await loadStudentAverages();
        alert('Grade deleted.');
      });
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
      await loadStudentAverages();
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

  /* ============== SECTIONS & MEMBERS ============== */
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

  // per-member grade modal
  const addMemberGradeModal = document.getElementById("addMemberGradeModal");
  const addMemberGradeForm = document.getElementById("addMemberGradeForm");
  const amgClose = document.getElementById("amgClose");
  const amgCancel = document.getElementById("amgCancel");
  const amgStudentName = document.getElementById("amgStudentName");

  async function loadSections() {
    const snap = await getDocs(collection(db, "sections"));
    const base = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const withCounts = await Promise.all(base.map(async s => {
      try {
        const qMembers = query(collection(db, "sections", s.id, "members"));
        const res = await getCountFromServer(qMembers);
        const cnt = res.data().count || 0;
        return { ...s, memberCount: cnt };
      } catch {
        return { ...s, memberCount: 0 };
      }
    }));

    SECTIONS = withCounts;
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
        <td>${Number(s.memberCount ?? 0)}</td>
        <td>${escapeHTML(s.notes || "—")}</td>
        <td class="nowrap">
          <button class="btn btn-secondary btn-xs" data-action="open">Open</button>
          <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
        </td>
      </tr>
    `).join("");
  }

  sectionsTableBody?.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    const openBtn = e.target.closest("button[data-action='open']");
    const delBtn  = e.target.closest("button[data-action='delete']");
    if (!row) return;

    const id = row.getAttribute("data-id");
    const sec = SECTIONS.find(x => x.id === id);
    if (!sec) return;

    if (openBtn) {
      await openSectionDetail(sec);
      return;
    }

    if (delBtn) {
      await confirmRun(
        `Delete section "${sec.course || "—"} • ${sec.name || "—"}"?\nAll its member records will also be removed (students remain intact).`,
        async () => {
          try {
            const deletingCurrent = CURRENT_SECTION?.id === sec.id;
            await deleteSection(sec.id);
            await loadSections();
            if (deletingCurrent) showPage("sections");
            alert("Section deleted.");
          } catch (err) {
            console.error("delete section failed:", err);
            alert("Failed to delete section. Check rules/permissions.");
          }
        }
      );
    }
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
      const ok = confirm(`Remove ${name} (${sid}) from section?`);
      if (!ok) return;
      try {
        await deleteDoc(doc(db, 'sections', CURRENT_SECTION.id, 'members', memberDocId));
        await loadSectionMembers();
        await loadSections();
        alert('Member removed.');
      } catch (err) {
        console.error('remove member failed:', err);
        alert('Failed to remove member. Check permissions.');
      }
      return;
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
    const yearLabel = document.getElementById("sectionYear")?.value.trim();
    const year = yearKey(yearLabel);
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
    memberYear.value = prettyYear(opt.getAttribute("data-year") || "");
  });

  function openAddMemberGradeModal() {
    addMemberGradeForm?.reset();
    if (amgStudentName) amgStudentName.textContent = (CURRENT_MEMBER_FOR_GRADE?.name || "Student");
    const yr = document.getElementById("amgYear");
    if (yr && CURRENT_MEMBER_FOR_GRADE?.year) yr.value = prettyYear(CURRENT_MEMBER_FOR_GRADE.year);
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
      await loadStudentAverages();
    } catch (err) {
      console.error("add member grade failed:", err);
      alert("Failed to add grade. Check rules/permissions.");
    }
  });

  /* ========= DELETE HELPERS ========= */
  async function deleteSubcollection(path) {
    const [c1, id1, c2] = path;
    const ref = collection(db, c1, id1, c2);
    const snap = await getDocs(ref);
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, c1, id1, c2, d.id))));
  }
  async function deleteMembershipsForStudent(uid) {
    const qy = query(collectionGroup(db, "members"), where("studentUid", "==", uid));
    const snap = await getDocs(qy);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }
  async function deleteStudent(uid) {
    await deleteSubcollection(["users", uid, "grades"]).catch(() => {});
    await deleteMembershipsForStudent(uid).catch(() => {});
    await deleteDoc(doc(db, "users", uid));
  }
  async function deleteSection(sectionId) {
    await deleteSubcollection(["sections", sectionId, "members"]).catch(() => {});
    await deleteDoc(doc(db, "sections", sectionId));
  }
  async function deleteThread(threadId) {
    await deleteSubcollection(["threads", threadId, "messages"]).catch(() => {});
    await deleteDoc(doc(db, "threads", threadId));
  }

  /* ============== MESSAGES (Admin) + CHAT VIEW ============== */
  const messagesTableBody = document.getElementById("messagesTableBody");
  const messagesSearch = document.getElementById("messagesSearch");
  const messagesShow = document.getElementById("messagesShow");
  const backToMessagesLink = document.getElementById("backToMessagesLink");
  const mtStudentName = document.getElementById("mtStudentName");
  const mtStudentEmail = document.getElementById("mtStudentEmail");
  const chatBox = document.getElementById("chatBox");
  const chatMessages = document.getElementById("chatMessages");
  const chatEmpty = document.getElementById("chatEmpty");
  const chatForm = document.getElementById("chatForm");
  const chatText = document.getElementById("chatText");
  const markUnreadBtn = document.getElementById("markUnreadBtn");
  const deleteThreadBtn = document.getElementById("deleteThreadBtn");

  async function loadThreads() {
    try {
      const qs = await getDocs(collection(db, "threads"));
      const rows = qs.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b?.updatedAt?.toMillis?.() ?? 0) - (a?.updatedAt?.toMillis?.() ?? 0));
      THREADS_CACHE = rows;
      renderThreadsTable(rows);
    } catch (e) {
      console.warn("[messages] loadThreads error:", e?.message || e);
      THREADS_CACHE = [];
      renderThreadsTable([]);
    }
  }

  function renderThreadsTable(rows) {
    if (!messagesTableBody) return;

    const term = (messagesSearch?.value || "").toLowerCase().trim();
    const show = messagesShow?.value || "all";

    let list = rows.slice();

    if (term) {
      list = list.filter(r =>
        (r.studentName || "").toLowerCase().includes(term) ||
        (r.studentEmail || "").toLowerCase().includes(term)
      );
    }

    if (show === "unread") {
      list = list.filter(r => r.lastSender === r.studentUid);
    }

    if (!list.length) {
      messagesTableBody.innerHTML = `<tr><td colspan="4">No messages.</td></tr>`;
      return;
    }

    messagesTableBody.innerHTML = list.map(r => {
      const status = (r.lastSender === r.studentUid) ? "New" : "Seen";
      return `
        <tr data-id="${r.id}" data-uid="${escapeHTML(r.studentUid || "")}" data-name="${escapeHTML(r.studentName || "")}" data-email="${escapeHTML(r.studentEmail || "")}">
          <td>${escapeHTML(r.studentName || r.studentEmail || r.studentUid || "")}</td>
          <td>${r.updatedAt ? tsToLocal(r.updatedAt) : "—"}</td>
          <td>${status}</td>
          <td><button class="btn btn-secondary btn-xs" data-action="open">Open</button></td>
        </tr>
      `;
    }).join("");
  }

  messagesSearch?.addEventListener("input", () => renderThreadsTable(THREADS_CACHE));
  messagesShow?.addEventListener("change", () => renderThreadsTable(THREADS_CACHE));

  // open thread from messages table
  messagesTableBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='open']");
    const row = e.target.closest("tr");
    if (!btn || !row) return;

    const threadId = row.getAttribute("data-id");
    const studentUid = row.getAttribute("data-uid");
    const name = row.getAttribute("data-name") || "";
    const email = row.getAttribute("data-email") || "";

    try {
      await openThread(threadId, { studentUid, name, email });
    } catch (err) {
      console.error("[messages] openThread error:", err);
      alert("Failed to open thread.");
    }
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
    loadThreads().catch(console.error);
  });

  async function markThreadMessagesSeen(threadId) {
    try {
      const msgsSnap = await getDocs(collection(db, "threads", threadId, "messages"));
      const batch = [];
      for (const d of msgsSnap.docs) {
        const m = d.data() || {};
        const fromStudent = (m.senderRole === "student");
        if (fromStudent && !m.seenAt) {
          batch.push(updateDoc(doc(db, "threads", threadId, "messages", d.id), { seenAt: serverTimestamp() }));
        }
      }
      if (batch.length) await Promise.all(batch);
    } catch (e) {
      console.warn("[messages] markThreadMessagesSeen error:", e?.message || e);
    }
  }

  async function openThread(threadId, meta) {
    CURRENT_THREAD_ID = threadId;

    // If "New", decrement badge once when opening
    try {
      const row = THREADS_CACHE.find(r => r.id === threadId);
      if (row && row.lastSender === row.studentUid) {
        setNotif(notifCount - 1);
      }
    } catch {}

    openMessageThreadView(meta);

    // Mark read
    try {
      await updateDoc(doc(db, "threads", threadId), {
        lastOpenedBy: auth.currentUser?.uid || "admin",
        unread: false,
        lastSender: auth.currentUser?.uid || "admin",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[messages] mark as read failed:", e?.message || e);
    }

    // mark student messages as seen
    await markThreadMessagesSeen(threadId);

    await loadThreadMessages(threadId);
  }

  async function loadThreadMessages(threadId) {
    chatMessages.innerHTML = "";
    chatEmpty.style.display = "block";

    try {
      const msgsSnap = await getDocs(collection(db, "threads", threadId, "messages"));
      const items = msgsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (a?.createdAt?.toMillis?.() ?? 0) - (b?.createdAt?.toMillis?.() ?? 0));

    renderChat(items);
    } catch (e) {
      console.error("[messages] loadThreadMessages error:", e);
      chatMessages.innerHTML = `<div class="muted">Failed to load messages.</div>`;
    }
  }

  function renderChat(items) {
    const myUid = auth.currentUser?.uid;
    if (!items.length) {
      chatEmpty.style.display = "block";
      return;
    }
    chatEmpty.style.display = "none";

    chatMessages.innerHTML = items.map(m => {
      const isMine = (m.senderId && myUid && m.senderId === myUid) || (m.senderRole === "admin");
      const who = isMine ? "You" : (m.senderName || "Student");
      const when = m.createdAt ? tsToLocal(m.createdAt) : "";
      const delivered = m.deliveredAt ? `Delivered ${tsToLocal(m.deliveredAt)}` : "Delivering…";
      const seen = m.seenAt ? `Seen ${tsToLocal(m.seenAt)}` : null;
      const status = isMine ? (seen || delivered) : (seen ? `Seen by admin ${tsToLocal(m.seenAt)}` : delivered);

      return `
        <div style="margin:8px 0; display:flex; ${isMine ? "justify-content:flex-end" : "justify-content:flex-start"};">
          <div style="max-width:70%; border:1px solid #e5e7eb; border-radius:12px; padding:8px 10px; background:${isMine ? "#eef7ff" : "#fff"};">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">
              <b>${escapeHTML(who)}</b> • <span>${escapeHTML(when)}</span>
            </div>
            <div>${escapeHTML(m.text || "")}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:6px;">${escapeHTML(status || "")}</div>
          </div>
        </div>
      `;
    }).join("");

    chatBox.scrollTop = chatBox.scrollHeight;
  }

  chatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_THREAD_ID) return;
    const text = (chatText?.value || "").trim();
    if (!text) return;

    try {
      await addDoc(collection(db, "threads", CURRENT_THREAD_ID, "messages"), {
        text,
        senderId: auth.currentUser?.uid || "admin",
        senderRole: "admin",
        senderName: "Admin",
        createdAt: serverTimestamp(),
        deliveredAt: serverTimestamp(),
        seenAt: null,
      });

      await updateDoc(doc(db, "threads", CURRENT_THREAD_ID), {
        lastMessage: { text, subject: (CURRENT_THREAD_META?.subject || "") },
        lastSender: auth.currentUser?.uid || "admin",
        updatedAt: serverTimestamp(),
        unread: false,
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
        updatedAt: serverTimestamp(),
      });
      alert("Marked as unread. You can find it again in Messages.");
    } catch (e) {
      console.error("[messages] mark unread error:", e);
      alert("Failed to mark as unread.");
    }
  });

  deleteThreadBtn?.addEventListener("click", async () => {
    if (!CURRENT_THREAD_ID) return;
    const ok = confirm("Delete this conversation? This will remove all messages permanently.");
    if (!ok) return;
    try {
      await deleteThread(CURRENT_THREAD_ID);
      CURRENT_THREAD_ID = null;
      alert("Conversation deleted.");
      showPage("messages");
      await loadThreads();
    } catch (e) {
      console.error("[messages] delete thread error:", e);
      alert("Failed to delete conversation. Check permissions.");
    }
  });

  /* ============== LOGOUT & INITIAL LOAD ============== */
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "auth.html";
  });

  // 🔄 Realtime for students + threads; sections stay one-shot for now
  subscribeStudents();
  loadSections().catch(console.error);
  subscribeThreads();
}
