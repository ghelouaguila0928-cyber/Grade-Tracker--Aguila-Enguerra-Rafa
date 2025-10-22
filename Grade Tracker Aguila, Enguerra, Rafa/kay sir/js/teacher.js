// Teacher Dashboard JavaScript
document.addEventListener("DOMContentLoaded", () => {
  // Initialize the dashboard
  initDashboard();
});

function initDashboard() {
  // Initialize all components
  initNavigation();
  initModals();
  initForms();
  loadSampleData();
  initAnimations();
  initEventListeners();
}

// Navigation
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');
  const pageTitle = document.getElementById('pageTitle');
  const toggleSidebar = document.getElementById('toggleSidebar');
  const sidebar = document.querySelector('.sidebar');

  // Page navigation
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Remove active class from all nav items
      navItems.forEach(i => i.classList.remove('active'));
      
      // Add active class to clicked item
      item.classList.add('active');
      
      // Get target page
      const pageId = item.dataset.page;
      
      // Hide all pages
      pages.forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });
      
      // Show target page with animation
      const targetPage = document.getElementById(pageId);
      if (targetPage) {
        targetPage.style.display = 'block';
        setTimeout(() => {
          targetPage.classList.add('active');
        }, 50);
      }
      
      // Update page title
      pageTitle.textContent = item.querySelector('span').textContent;
      
      // Close sidebar on mobile after navigation
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('active');
      }
    });
  });

  // Toggle sidebar
  if (toggleSidebar) {
    toggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      
      // Update toggle button icon
      const icon = toggleSidebar.querySelector('i');
      if (sidebar.classList.contains('collapsed')) {
        icon.className = 'fas fa-chevron-right';
      } else {
        icon.className = 'fas fa-bars';
      }
    });
  }

  // Auto-close sidebar on mobile when clicking outside
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        !sidebar.contains(e.target) && 
        !toggleSidebar.contains(e.target)) {
      sidebar.classList.remove('active');
    }
  });
}

// Modal Management
function initModals() {
  const modals = document.querySelectorAll('.modal');
  const closeModalButtons = document.querySelectorAll('.close-modal');
  
  // Add Student Modal
  const addStudentBtn = document.getElementById('addStudentBtn');
  const addStudentModal = document.getElementById('addStudentModal');
  
  if (addStudentBtn) {
    addStudentBtn.addEventListener('click', () => {
      showModal(addStudentModal);
    });
  }

  // Add Grade Modal
  const addGradeBtn = document.getElementById('addGradeBtn');
  const addGradeModal = document.getElementById('addGradeModal');
  
  if (addGradeBtn) {
    addGradeBtn.addEventListener('click', () => {
      populateGradeModal();
      showModal(addGradeModal);
    });
  }

  // Close modals
  closeModalButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      hideAllModals();
    });
  });

  // Close modal when clicking outside
  modals.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideAllModals();
      }
    });
  });

  // Cancel buttons
  const cancelAddStudent = document.getElementById('cancelAddStudent');
  const cancelAddGrade = document.getElementById('cancelAddGrade');
  
  if (cancelAddStudent) {
    cancelAddStudent.addEventListener('click', () => {
      hideAllModals();
    });
  }
  
  if (cancelAddGrade) {
    cancelAddGrade.addEventListener('click', () => {
      hideAllModals();
    });
  }
}

function showModal(modal) {
  hideAllModals();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function hideAllModals() {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => modal.classList.remove('active'));
  document.body.style.overflow = 'auto';
}

function populateGradeModal() {
  const studentSelect = document.getElementById('gradeStudent');
  const subjectSelect = document.getElementById('gradeSubject');
  
  // Clear existing options
  studentSelect.innerHTML = '<option value="">Select Student</option>';
  subjectSelect.innerHTML = '<option value="">Select Subject</option>';
  
  // Populate students
  sampleData.students.forEach(student => {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = student.name;
    studentSelect.appendChild(option);
  });
  
  // Populate subjects
  sampleData.subjects.forEach(subject => {
    const option = document.createElement('option');
    option.value = subject.code;
    option.textContent = subject.name;
    subjectSelect.appendChild(option);
  });
  
  // Set today's date as default
  document.getElementById('gradeDate').value = new Date().toISOString().split('T')[0];
}

// Form Handling
function initForms() {
  // Add Student Form
  const addStudentForm = document.getElementById('addStudentForm');
  if (addStudentForm) {
    addStudentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAddStudent();
    });
  }

  // Add Grade Form
  const addGradeForm = document.getElementById('addGradeForm');
  if (addGradeForm) {
    addGradeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAddGrade();
    });
  }

  // Profile Form
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleProfileUpdate();
    });
  }

  // Password Form
  const passwordForm = document.getElementById('passwordForm');
  if (passwordForm) {
    passwordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handlePasswordUpdate();
    });
  }
}

function handleAddStudent() {
  const form = document.getElementById('addStudentForm');
  const formData = new FormData(form);
  
  const student = {
    id: formData.get('studentId') || `S${1000 + sampleData.students.length + 1}`,
    name: formData.get('studentName'),
    email: formData.get('studentEmail'),
    grade: formData.get('studentGrade') + 'th Grade',
    average: 0,
    status: 'Active'
  };
  
  sampleData.students.push(student);
  populateStudentsTable();
  hideAllModals();
  form.reset();
  
  showToast('Student added successfully!');
}

function handleAddGrade() {
  const form = document.getElementById('addGradeForm');
  const formData = new FormData(form);
  
  const grade = {
    student: formData.get('gradeStudent'),
    subject: formData.get('gradeSubject'),
    assignment: formData.get('gradeAssignment'),
    grade: parseInt(formData.get('gradeScore')),
    date: formData.get('gradeDate'),
    status: 'Graded'
  };
  
  sampleData.grades.push(grade);
  populateGradesTable();
  hideAllModals();
  form.reset();
  
  showToast('Grade added successfully!');
}

function handleProfileUpdate() {
  // Simulate profile update
  setTimeout(() => {
    showToast('Profile updated successfully!');
  }, 1000);
}

function handlePasswordUpdate() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  if (newPassword !== confirmPassword) {
    showToast('Passwords do not match!', true);
    return;
  }
  
  if (newPassword.length < 6) {
    showToast('Password must be at least 6 characters long!', true);
    return;
  }
  
  // Simulate password update
  setTimeout(() => {
    document.getElementById('passwordForm').reset();
    showToast('Password updated successfully!');
  }, 1000);
}

// Sample Data
const sampleData = {
  students: [
    { id: 'S1001', name: 'Alex Johnson', email: 'alex.johnson@student.edu', grade: '11th Grade', average: 92, status: 'Active' },
    { id: 'S1002', name: 'Sarah Miller', email: 'sarah.miller@student.edu', grade: '11th Grade', average: 88, status: 'Active' },
    { id: 'S1003', name: 'Michael Brown', email: 'michael.brown@student.edu', grade: '11th Grade', average: 76, status: 'At Risk' },
    { id: 'S1004', name: 'Emily Davis', email: 'emily.davis@student.edu', grade: '11th Grade', average: 95, status: 'Active' }
  ],
  subjects: [
    { code: 'MATH101', name: 'Algebra I', gradeLevel: '11th Grade', students: 24, average: 87 },
    { code: 'PHY102', name: 'Physics', gradeLevel: '11th Grade', students: 18, average: 82 },
    { code: 'CHEM103', name: 'Chemistry', gradeLevel: '11th Grade', students: 22, average: 79 },
    { code: 'BIO104', name: 'Biology', gradeLevel: '11th Grade', students: 20, average: 85 }
  ],
  grades: [
    { student: 'S1001', subject: 'MATH101', assignment: 'Algebra Quiz', grade: 95, date: '2023-10-10', status: 'Graded' },
    { student: 'S1002', subject: 'PHY102', assignment: 'Lab Report', grade: 88, date: '2023-10-12', status: 'Graded' },
    { student: 'S1003', subject: 'CHEM103', assignment: 'Periodic Table Test', grade: 72, date: '2023-10-14', status: 'Needs Review' },
    { student: 'S1004', subject: 'BIO104', assignment: 'Cell Structure Essay', grade: null, date: '2023-10-15', status: 'Not Graded' }
  ],
  analytics: [
    { student: 'Alex Johnson', math: 95, physics: 88, chemistry: 92, biology: 94, average: 92, trend: 'up' },
    { student: 'Sarah Miller', math: 87, physics: 92, chemistry: 85, biology: 88, average: 88, trend: 'up' },
    { student: 'Michael Brown', math: 72, physics: 68, chemistry: 75, biology: 70, average: 71, trend: 'down' },
    { student: 'Emily Davis', math: 98, physics: 94, chemistry: 96, biology: 92, average: 95, trend: 'up' }
  ],
  messages: [
    { from: 'Alex Johnson', subject: 'Grade Inquiry', message: 'Can you please review my last quiz grade?', date: '2023-10-15', status: 'New' },
    { from: 'Sarah Miller', subject: 'Assignment Question', message: 'I have a question about problem #3...', date: '2023-10-14', status: 'Replied' },
    { from: 'Michael Brown', subject: 'Grade Concern', message: 'I\'m concerned about my current grade...', date: '2023-10-13', status: 'Replied' }
  ]
};

function loadSampleData() {
  populateStudentsTable();
  populateGradesTable();
  populateSubjectsTable();
  populateAnalyticsTable();
  populateMessagesTable();
}

function populateStudentsTable() {
  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  sampleData.students.forEach(student => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${student.id}</td>
      <td>${student.name}</td>
      <td>${student.email}</td>
      <td>${student.grade}</td>
      <td>${student.average}%</td>
      <td><span class="badge ${student.status === 'Active' ? 'badge-success' : 'badge-warning'}">${student.status}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="viewStudent('${student.id}')">View</button>
        <button class="btn btn-primary btn-sm" onclick="editStudent('${student.id}')">Edit</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function populateGradesTable() {
  const tbody = document.getElementById('gradesTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  sampleData.grades.forEach(grade => {
    const student = sampleData.students.find(s => s.id === grade.student);
    const subject = sampleData.subjects.find(s => s.code === grade.subject);
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${student ? student.name : grade.student}</td>
      <td>${subject ? subject.name : grade.subject}</td>
      <td>${grade.assignment}</td>
      <td>${grade.grade ? grade.grade + '%' : '--'}</td>
      <td>${new Date(grade.date).toLocaleDateString()}</td>
      <td><span class="badge ${getStatusBadgeClass(grade.status)}">${grade.status}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="viewGrade('${grade.student}', '${grade.subject}')">View</button>
        <button class="btn btn-primary btn-sm" onclick="editGrade('${grade.student}', '${grade.subject}')">${grade.grade ? 'Edit' : 'Grade'}</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function populateSubjectsTable() {
  const tbody = document.getElementById('subjectsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  sampleData.subjects.forEach(subject => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${subject.code}</td>
      <td>${subject.name}</td>
      <td>${subject.gradeLevel}</td>
      <td>${subject.students}</td>
      <td>${subject.average}%</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="viewSubject('${subject.code}')">View</button>
        <button class="btn btn-primary btn-sm" onclick="editSubject('${subject.code}')">Edit</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function populateAnalyticsTable() {
  const tbody = document.getElementById('analyticsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  sampleData.analytics.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.student}</td>
      <td>${item.math}%</td>
      <td>${item.physics}%</td>
      <td>${item.chemistry}%</td>
      <td>${item.biology}%</td>
      <td>${item.average}%</td>
      <td><i class="fas fa-arrow-${item.trend}" style="color: ${item.trend === 'up' ? 'var(--success)' : 'var(--danger)'};"></i></td>
    `;
    tbody.appendChild(row);
  });
}

function populateMessagesTable() {
  const tbody = document.getElementById('messagesTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  sampleData.messages.forEach(message => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${message.from}</td>
      <td>${message.subject}</td>
      <td>${message.message}</td>
      <td>${new Date(message.date).toLocaleDateString()}</td>
      <td><span class="badge ${message.status === 'New' ? 'badge-primary' : 'badge-success'}">${message.status}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="viewMessage('${message.from}')">View</button>
        <button class="btn btn-primary btn-sm" onclick="replyToMessage('${message.from}')">Reply</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'Graded': return 'badge-success';
    case 'Pending': return 'badge-warning';
    case 'Not Graded': return 'badge-danger';
    case 'Needs Review': return 'badge-warning';
    default: return 'badge-primary';
  }
}

// Action Functions
function viewStudent(studentId) {
  const student = sampleData.students.find(s => s.id === studentId);
  if (student) {
    showToast(`Viewing student: ${student.name}`);
    // In a real app, this would open a student details modal or page
  }
}

function editStudent(studentId) {
  const student = sampleData.students.find(s => s.id === studentId);
  if (student) {
    showToast(`Editing student: ${student.name}`);
    // In a real app, this would open an edit student modal
  }
}

function viewGrade(studentId, subjectCode) {
  showToast(`Viewing grade for student ${studentId} in ${subjectCode}`);
}

function editGrade(studentId, subjectCode) {
  showToast(`Editing grade for student ${studentId} in ${subjectCode}`);
}

function viewSubject(subjectCode) {
  const subject = sampleData.subjects.find(s => s.code === subjectCode);
  if (subject) {
    showToast(`Viewing subject: ${subject.name}`);
  }
}

function editSubject(subjectCode) {
  const subject = sampleData.subjects.find(s => s.code === subjectCode);
  if (subject) {
    showToast(`Editing subject: ${subject.name}`);
  }
}

function viewMessage(from) {
  showToast(`Viewing message from: ${from}`);
}

function replyToMessage(from) {
  showToast(`Replying to message from: ${from}`);
}

// Toast Notifications
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  
  if (!toast || !toastMessage) return;
  
  toastMessage.textContent = message;
  toast.classList.remove('error');
  
  if (isError) {
    toast.classList.add('error');
    toast.querySelector('i').className = 'fas fa-exclamation-circle';
  } else {
    toast.querySelector('i').className = 'fas fa-check-circle';
  }
  
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Animations
function initAnimations() {
  // Add hover animations to cards
  const cards = document.querySelectorAll('.stat-card, .content-section, .chart-card');
  cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-5px)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
    });
  });

  // Add loading animation to buttons when clicked
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(button => {
    button.addEventListener('click', function(e) {
      if (this.type === 'submit' || this.getAttribute('onclick')) {
        const originalText = this.innerHTML;
        this.innerHTML = '<div class="loading"></div> Processing...';
        this.disabled = true;
        
        setTimeout(() => {
          this.innerHTML = originalText;
          this.disabled = false;
        }, 1500);
      }
    });
  });
}

// Event Listeners
function initEventListeners() {
  // Notifications button
  const notificationsBtn = document.getElementById('notificationsBtn');
  if (notificationsBtn) {
    notificationsBtn.addEventListener('click', () => {
      showToast('You have 3 new notifications');
      // In a real app, this would open a notifications panel
    });
  }

  // Search button
  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      showToast('Search functionality coming soon!');
      // In a real app, this would open a search panel
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to log out?')) {
        showToast('Logging out...');
        setTimeout(() => {
          // In a real app, this would redirect to login page
          window.location.href = 'login.html';
        }, 1000);
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchBtn?.click();
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
      hideAllModals();
    }
  });

  // Window resize handling
  window.addEventListener('resize', () => {
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth > 768) {
      sidebar.classList.remove('active');
    }
  });
}

// Utility Functions
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function calculateAverage(grades) {
  if (!grades || grades.length === 0) return 0;
  const sum = grades.reduce((acc, grade) => acc + (grade.grade || 0), 0);
  return Math.round(sum / grades.length);
}

// Export functions for global access
window.viewStudent = viewStudent;
window.editStudent = editStudent;
window.viewGrade = viewGrade;
window.editGrade = editGrade;
window.viewSubject = viewSubject;
window.editSubject = editSubject;
window.viewMessage = viewMessage;
window.replyToMessage = replyToMessage;