// =========================
// State & Persistence Utils
// =========================
const LS = {
  students: 'gv_students',
  sections: 'gv_sections',
  sectionMembers: 'gv_section_members', // map: sectionId -> members[]
  summaries: 'gv_student_summaries',    // map: studentId -> entries[]
  sidebarOpen: 'gv_sidebar_open',
};
const parseLS = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const saveLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// in-memory (hydrated from LS)
let students = parseLS(LS.students, []); // array of {id,name,email,year,avg,status}
let sections = parseLS(LS.sections, []); // array of {id,course,name,year,notes,count}
let sectionMembers = parseLS(LS.sectionMembers, {}); // { [sectionId]: [{id,name,email,year}] }
let studentSummaries = new Map(Object.entries(parseLS(LS.summaries, {}))); // Map studentId -> entries[]

function persistAll() {
  saveLS(LS.students, students);
  saveLS(LS.sections, sections);
  saveLS(LS.sectionMembers, sectionMembers);
  // convert Map to plain object
  const obj = {};
  for (const [k, v] of studentSummaries.entries()) obj[k] = v;
  saveLS(LS.summaries, obj);
}

// ==============
// DOM Shortcuts
// ==============
const navLinks = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('pageTitle');
const overlay = document.getElementById('sidebarOverlay');

const TITLES = {
  students: 'Student Management',
  'student-detail': 'Student Detail',
  sections: 'Sections',
  'section-detail': 'Section Details',
  schedule: 'Schedule',
  messages: 'Messages',
  settings: 'Account Settings',
};

// ==============
// Nav + Sidebar
// ==============
function showPage(key) {
  pages.forEach(p => p.classList.toggle('active', p.id === key));
  navLinks.forEach(a => a.classList.toggle('active', a.dataset.page === key));
  pageTitle.textContent = TITLES[key] || 'Admin Portal';
  window.scrollTo({ top: 0, behavior: 'instant' });
}

navLinks.forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  showPage(a.dataset.page);
  document.body.classList.remove('sidebar-open');
  overlay.classList.remove('show');
}));

// Sidebar toggle (persist)
const toggleSidebarBtn = document.getElementById('toggleSidebar');
toggleSidebarBtn?.addEventListener('click', () => {
  const open = !document.body.classList.contains('sidebar-open');
  document.body.classList.toggle('sidebar-open', open);
  overlay.classList.toggle('show', open);
  localStorage.setItem(LS.sidebarOpen, open ? '1' : '0');
});
overlay?.addEventListener('click', () => {
  document.body.classList.remove('sidebar-open');
  overlay.classList.remove('show');
  localStorage.setItem(LS.sidebarOpen, '0');
});

// Restore sidebar state
(function restoreSidebar() {
  const open = localStorage.getItem(LS.sidebarOpen) === '1';
  if (open) {
    document.body.classList.add('sidebar-open');
    overlay.classList.add('show');
  }
})();

// Initial page
showPage('students');

// ===== Helpers =====
function openModal(m){ m?.classList.add('show'); m?.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
function closeModal(m){ m?.classList.remove('show'); m?.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
function tableToCSV(table) {
  const rows = [...table.querySelectorAll('tr')];
  return rows.map(row => {
    const cells = [...row.querySelectorAll('th,td')].map(c => {
      const txt = c.textContent.replace(/\s+/g,' ').trim();
      const safe = /[",\n]/.test(txt) ? `"${txt.replace(/"/g,'""')}"` : txt;
      return safe;
    });
    return cells.join(',');
  }).join('\n');
}
function triggerDownload(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ========================
// Students List + Filters
// ========================
const studentsTableBody = document.getElementById('studentsTableBody');
const addStudentModal = document.getElementById('addStudentModal');
const addStudentBtn = document.getElementById('addStudentBtn');
const cancelAddStudent = document.getElementById('cancelAddStudent');
const cancelAddStudent2 = document.getElementById('cancelAddStudent2');
const addStudentForm = document.getElementById('addStudentForm');

const studentsSearch = document.getElementById('studentsSearch');
const studentsYearFilter = document.getElementById('studentsYearFilter');

addStudentBtn?.addEventListener('click', () => openModal(addStudentModal));
cancelAddStudent?.addEventListener('click', () => closeModal(addStudentModal));
cancelAddStudent2?.addEventListener('click', () => closeModal(addStudentModal));

addStudentForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('studentName').value.trim();
  const email = document.getElementById('studentEmail').value.trim();
  const year  = document.getElementById('studentGrade').value.trim();
  const id    = document.getElementById('studentId').value.trim();

  // upsert by ID
  const idx = students.findIndex(s => s.id === id);
  if (idx >= 0) {
    students[idx] = { ...students[idx], name, email, year };
  } else {
    students.push({ id, name, email, year, avg: '—', status: 'Active' });
  }
  persistAll();
  addStudentForm.reset();
  closeModal(addStudentModal);
  renderStudents();
  refreshStudentChoices(); // for section add-member
});

function renderStudents() {
  const term = (studentsSearch?.value || '').toLowerCase().trim();
  const yr = studentsYearFilter?.value || '__ALL__';

  let data = [...students];

  // filter by year
  if (yr && yr !== '__ALL__') data = data.filter(s => (s.year || '').toLowerCase() === yr.toLowerCase());

  // search by name/id/email
  if (term) {
    data = data.filter(s =>
      (s.name || '').toLowerCase().includes(term) ||
      (s.id || '').toLowerCase().includes(term) ||
      (s.email || '').toLowerCase().includes(term)
    );
  }

  // sort by year (1st -> 4th), then name
  const yearOrder = { '1st Year': 1, '2nd Year': 2, '3rd Year': 3, '4th Year': 4 };
  data.sort((a, b) => {
    const ya = yearOrder[a.year] || 99;
    const yb = yearOrder[b.year] || 99;
    if (ya !== yb) return ya - yb;
    return (a.name || '').localeCompare(b.name || '');
  });

  if (!data.length) {
    studentsTableBody.innerHTML = '<tr><td colspan="7">No students found.</td></tr>';
    return;
  }

  studentsTableBody.innerHTML = '';
  for (const s of data) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-id>${s.id}</td>
      <td data-name class="linkable" style="cursor:pointer; text-decoration:underline;">${s.name}</td>
      <td data-email>${s.email || ''}</td>
      <td data-year>${s.year || ''}</td>
      <td>${s.avg ?? '—'}</td>
      <td>${s.status ?? 'Active'}</td>
      <td>
        <button class="btn btn-secondary btn-xs" data-action="view">View</button>
        <button class="btn btn-secondary btn-xs" data-action="edit">Edit</button>
        <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
      </td>
    `;
    studentsTableBody.appendChild(tr);
  }
}
studentsSearch?.addEventListener('input', renderStudents);
studentsYearFilter?.addEventListener('change', renderStudents);

studentsTableBody?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  const nameCell = e.target.closest('td.linkable');
  const row = e.target.closest('tr');
  if (!row) return;

  const id = row.querySelector('[data-id]')?.textContent.trim();
  const name = row.querySelector('[data-name]')?.textContent.trim();
  const email = row.querySelector('[data-email]')?.textContent.trim();
  const year  = row.querySelector('[data-year]')?.textContent.trim();

  if (btn) {
    const action = btn.dataset.action;
    if (action === 'delete') {
      // delete from students + also remove from sectionMembers (every section)
      students = students.filter(s => s.id !== id);
      for (const sid of Object.keys(sectionMembers)) {
        sectionMembers[sid] = (sectionMembers[sid] || []).filter(m => m.id !== id);
      }
      // remove summaries
      studentSummaries.delete(id);
      persistAll();
      renderStudents();
      if (currentSectionId) renderSectionMembers();
      return;
    }
    if (action === 'view') { openStudentDetail({id, name, email, year}); return; }
    if (action === 'edit') {
      // prefill modal
      document.getElementById('studentName').value = name || '';
      document.getElementById('studentEmail').value = email || '';
      document.getElementById('studentGrade').value = year || '';
      document.getElementById('studentId').value = id || '';
      openModal(addStudentModal);
      return;
    }
  }
  if (nameCell) openStudentDetail({id, name, email, year});
});

// initial render
renderStudents();

// export students
document.getElementById('exportStudentsBtn')?.addEventListener('click', () => {
  triggerDownload('students.csv', tableToCSV(document.querySelector('#students table')));
});

// ================================
// Student Detail + Summary (SoG)
// ================================
const stName = document.getElementById('stName');
const stId   = document.getElementById('stId');
const sogTableBody = document.getElementById('sogTableBody');
const addSoGBtn = document.getElementById('addSoGBtn');
const exportSoGBtn = document.getElementById('exportSoGBtn');

const filterYear = document.getElementById('filterYear');
const filterSem  = document.getElementById('filterSem');

const addSoGModal = document.getElementById('addSoGModal');
const closeAddSoG = document.getElementById('closeAddSoG');
const cancelAddSoG = document.getElementById('cancelAddSoG');
const addSoGForm = document.getElementById('addSoGForm');
let sogAutoIdx = 1;

let currentStudentId = null;

function openStudentDetail(student){
  currentStudentId = student.id;
  stName.textContent = student.name || '—';
  stId.textContent   = student.id || '—';
  // default filters: show all
  filterYear.value = '__ALL__';
  filterSem.value  = '__ALL__';
  renderStudentSummary();
  showPage('student-detail');
}

function currentEntriesAll() {
  if (!currentStudentId) return [];
  const list = studentSummaries.get(currentStudentId) || [];
  return list;
}

function renderStudentSummary(){
  const entries = currentEntriesAll().filter(ent => {
    const okYear = filterYear.value === '__ALL__' || ent.year === filterYear.value;
    const okSem  = filterSem.value  === '__ALL__' || ent.sem  === filterSem.value;
    return okYear && okSem;
  });
  if (!entries.length){
    sogTableBody.innerHTML = '<tr><td colspan="7">No summary entries yet.</td></tr>';
    return;
  }
  sogTableBody.innerHTML = '';
  for (const ent of entries){
    const tr = document.createElement('tr');
    tr.dataset.idx = ent._idx;
    tr.innerHTML = `
      <td>${ent.year}</td>
      <td>${ent.sem}</td>
      <td>${ent.courseName}</td>
      <td>${ent.courseCode}</td>
      <td>${ent.units}</td>
      <td>${ent.mark}</td>
      <td><button class="btn btn-danger btn-xs" data-action="remove">Remove</button></td>
    `;
    sogTableBody.appendChild(tr);
  }
}

filterYear?.addEventListener('change', renderStudentSummary);
filterSem?.addEventListener('change', renderStudentSummary);

sogTableBody?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="remove"]');
  if (!btn) return;
  const row = btn.closest('tr');
  const idx = parseInt(row?.dataset.idx ?? '-1', 10);
  if (idx < 0) return;
  const all = currentEntriesAll();
  const i = all.findIndex(x => x._idx === idx);
  if (i >= 0) all.splice(i,1);
  studentSummaries.set(currentStudentId, all);
  persistAll();
  renderStudentSummary();
});

addSoGBtn?.addEventListener('click', () => {
  if (!currentStudentId){ alert('Open a student first.'); return; }
  addSoGForm.reset();
  // prefill with current filters if not ALL
  const fy = filterYear.value, fs = filterSem.value;
  if (fy !== '__ALL__') document.getElementById('sogYear').value = fy;
  if (fs !== '__ALL__') document.getElementById('sogSem').value  = fs;
  openModal(addSoGModal);
});
closeAddSoG?.addEventListener('click', () => closeModal(addSoGModal));
cancelAddSoG?.addEventListener('click', () => closeModal(addSoGModal));

addSoGForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const year = document.getElementById('sogYear').value.trim();
  const sem  = document.getElementById('sogSem').value.trim();
  const courseName = document.getElementById('sogCourseName').value.trim();
  const courseCode = document.getElementById('sogCourseCode').value.trim();
  const units = document.getElementById('sogUnits').value.trim();
  const mark  = document.getElementById('sogMark').value.trim();

  const ent = { _idx: sogAutoIdx++, year, sem, courseName, courseCode, units, mark };
  const list = currentEntriesAll();
  list.push(ent);
  studentSummaries.set(currentStudentId, list);
  persistAll();
  renderStudentSummary();
  closeModal(addSoGModal);
});

exportSoGBtn?.addEventListener('click', () => {
  const table = document.querySelector('#student-detail table');
  const csv = tableToCSV(table);
  const yr = filterYear.value === '__ALL__' ? 'ALL' : filterYear.value.replace(/\s+/g,'');
  const sm = filterSem.value  === '__ALL__' ? 'ALL' : filterSem.value.replace(/\s+/g,'');
  triggerDownload(`${stId.textContent || 'student'}_summary_${yr}_${sm}.csv`, csv);
});

// ===================
// Sections + Members
// ===================
const addSectionModal = document.getElementById('addSectionModal');
const addSectionBtn = document.getElementById('addSectionBtn');
const closeAddSection = document.getElementById('closeAddSection');
const cancelAddSection = document.getElementById('cancelAddSection');
const addSectionForm = document.getElementById('addSectionForm');
const sectionsTableBody = document.getElementById('sectionsTableBody');

function makeSectionId(course, name, year) { return `${course}__${name}__${year}`.replace(/\s+/g,'_').toUpperCase(); }

addSectionBtn?.addEventListener('click', () => openModal(addSectionModal));
closeAddSection?.addEventListener('click', () => closeModal(addSectionModal));
cancelAddSection?.addEventListener('click', () => closeModal(addSectionModal));

addSectionForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const course = document.getElementById('sectionCourse').value.trim();
  const name   = document.getElementById('sectionName').value.trim();
  const year   = document.getElementById('sectionYear').value.trim();
  const notes  = document.getElementById('sectionNotes').value.trim();

  const id = makeSectionId(course, name, year);
  if (sections.some(s => s.id === id)) { alert('Section already exists.'); return; }
  sections.push({ id, course, name, year, notes, count: 0 });
  sectionMembers[id] = [];
  persistAll();

  addSectionForm.reset();
  closeModal(addSectionModal);
  renderSections();
});

function renderSections() {
  if (!sections.length) {
    sectionsTableBody.innerHTML = '<tr><td colspan="6">No sections yet.</td></tr>';
    return;
  }
  sectionsTableBody.innerHTML = '';
  for (const s of sections) {
    const tr = document.createElement('tr');
    tr.dataset.sectionId = s.id;
    tr.innerHTML = `
      <td>${s.course}</td>
      <td>${s.name}</td>
      <td>${s.year}</td>
      <td><span class="sec-count">${(sectionMembers[s.id] || []).length}</span></td>
      <td>${s.notes || ''}</td>
      <td>
        <button class="btn btn-secondary btn-xs" data-action="manage">Manage</button>
        <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
      </td>
    `;
    sectionsTableBody.appendChild(tr);
  }
}
renderSections();

sectionsTableBody?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]'); if (!btn) return;
  const row = btn.closest('tr'); const id = row?.dataset.sectionId; if (!id) return;

  if (btn.dataset.action === 'delete'){
    if (confirm('Delete this section?')){
      sections = sections.filter(s => s.id !== id);
      delete sectionMembers[id];
      persistAll();
      renderSections();
    }
    return;
  }
  if (btn.dataset.action === 'manage'){ openSectionDetail(id); }
});

// Section detail
const sdTitle = document.getElementById('sdTitle');
const sdCourse= document.getElementById('sdCourse');
const sdSection= document.getElementById('sdSection');
const sdYear = document.getElementById('sdYear');
const sectionMembersBody = document.getElementById('sectionMembersBody');

let currentSectionId = null;
function openSectionDetail(id){
  currentSectionId = id;
  const s = sections.find(x => x.id === id);
  if (!s){ alert('Section not found.'); return; }
  sdTitle.textContent = `${s.course} — ${s.name}`;
  sdCourse.textContent = s.course;
  sdSection.textContent = s.name;
  sdYear.textContent = s.year;
  renderSectionMembers();
  showPage('section-detail');
}

function renderSectionMembers(){
  const list = sectionMembers[currentSectionId] || [];
  if (!list.length){
    sectionMembersBody.innerHTML = '<tr><td colspan="5">No members yet.</td></tr>';
    updateSectionCount(0);
    return;
  }
  sectionMembersBody.innerHTML = '';
  list.forEach(m => {
    const tr = document.createElement('tr');
    tr.dataset.studentId = m.id;
    tr.innerHTML = `
      <td>${m.id}</td><td>${m.name}</td><td>${m.email || ''}</td><td>${m.year || ''}</td>
      <td><button class="btn btn-danger btn-xs" data-action="remove">Remove</button></td>`;
    sectionMembersBody.appendChild(tr);
  });
  updateSectionCount(list.length);
}
function updateSectionCount(n){
  const row = sectionsTableBody.querySelector(`tr[data-section-id="${currentSectionId}"]`);
  if (row) row.querySelector('.sec-count').textContent = n;
  const s = sections.find(x => x.id === currentSectionId); if (s) s.count = n;
  persistAll();
}
sectionMembersBody?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="remove"]'); if (!btn) return;
  const tr = btn.closest('tr'); const sid = tr?.dataset.studentId;
  const list = sectionMembers[currentSectionId] || [];
  const i = list.findIndex(x => x.id === sid);
  if (i>=0){
    list.splice(i,1);
    sectionMembers[currentSectionId] = list;
    persistAll();
    renderSectionMembers();
  }
});

// Add member modal
const addMemberBtn = document.getElementById('addMemberBtn');
const addMemberModal = document.getElementById('addMemberModal');
const closeAddMember = document.getElementById('closeAddMember');
const cancelAddMember = document.getElementById('cancelAddMember');
const addMemberForm = document.getElementById('addMemberForm');
const memberSelect = document.getElementById('memberSelect');
const memberId = document.getElementById('memberId');
const memberName = document.getElementById('memberName');
const memberEmail = document.getElementById('memberEmail');
const memberYear = document.getElementById('memberYear');

addMemberBtn?.addEventListener('click', () => {
  refreshStudentChoices();
  memberSelect.value = ''; memberId.value = ''; memberName.value = ''; memberEmail.value = ''; memberYear.value = '';
  openModal(addMemberModal);
});
closeAddMember?.addEventListener('click', () => closeModal(addMemberModal));
cancelAddMember?.addEventListener('click', () => closeModal(addMemberModal));

memberSelect?.addEventListener('change', () => {
  const s = students.find(x => x.id === memberSelect.value); if (!s) return;
  memberId.value = s.id; memberName.value = s.name; memberEmail.value = s.email || ''; memberYear.value = s.year || '';
});

addMemberForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentSectionId) return;
  const id = (memberId.value || memberSelect.value || '').trim();
  const name = memberName.value.trim(); const email = memberEmail.value.trim(); const year = memberYear.value.trim();
  if (!id || !name){ alert('Student ID and Name are required.'); return; }
  const list = sectionMembers[currentSectionId] || [];
  if (list.some(m => m.id === id)){ alert('Student already in this section.'); return; }
  list.push({ id, name, email, year });
  sectionMembers[currentSectionId] = list;
  persistAll();
  renderSectionMembers();
  ensureStudentRowExists({ id, name, email, year });
  closeModal(addMemberModal);
});

function refreshStudentChoices(){
  memberSelect.innerHTML = '<option value="">— Select from Students —</option>';
  const sorted = [...students].sort((a,b)=> (a.name || '').localeCompare(b.name || ''));
  for (const s of sorted){
    const opt = document.createElement('option'); opt.value = s.id; opt.textContent = `${s.id} — ${s.name}`;
    memberSelect.appendChild(opt);
  }
}
function ensureStudentRowExists(s){
  if (!students.some(st => st.id === s.id)) {
    students.push({ id: s.id, name: s.name, email: s.email || '', year: s.year || '', avg: '—', status: 'Active' });
    persistAll();
    renderStudents();
  }
}

// ===================
// Robust Back Links
// ===================
function wireBackLink(el, targetPage){
  if (!el) return;
  const go = (ev) => {
    if (ev) ev.preventDefault();
    showPage(targetPage);
    document.querySelectorAll('.nav-item').forEach(a => {
      a.classList.toggle('active', a.dataset.page === targetPage);
    });
  };
  el.addEventListener('click', go);
  el.addEventListener('keydown', (e) => {
    const k = e.key?.toLowerCase();
    if (k === 'enter' || k === ' ') { e.preventDefault(); go(); }
  });
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
}
wireBackLink(document.getElementById('backToStudentsLink'), 'students');
wireBackLink(document.getElementById('backToSectionsLink'), 'sections');
wireBackLink(document.getElementById('backToSectionsLink2'), 'sections');

// ==========
// Exports
// ==========
document.getElementById('exportSectionsBtn')?.addEventListener('click', () => {
  triggerDownload('sections.csv', tableToCSV(document.querySelector('#sections table')));
});
document.getElementById('exportSectionMembersBtn')?.addEventListener('click', () => {
  triggerDownload('section_members.csv', tableToCSV(document.querySelector('#section-detail table')));
});

// ==========
// Logout (demo only; keeps data persistent as requested)
// ==========
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  alert('Logged out (demo). Data remains saved in this browser.');
});
