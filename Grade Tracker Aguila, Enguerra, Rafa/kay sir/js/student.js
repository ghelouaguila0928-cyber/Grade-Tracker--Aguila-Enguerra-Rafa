// Student Dashboard JavaScript
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
  initEventListeners();
  initAnimations();
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
      
      // Load page-specific data
      loadPageData(pageId);
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

// Load page-specific data
function loadPageData(pageId) {
  switch (pageId) {
    case 'dashboard':
      loadDashboardData();
      break;
    case 'grades':
      loadGradesData();
      break;
    case 'assignments':
      loadAssignmentsData();
      break;
    case 'schedule':
      loadScheduleData();
      break;
    case 'messages':
      loadMessagesData();
      break;
    case 'profile':
      loadProfileData();
      break;
  }
}

// Modal Management
function initModals() {
  const modals = document.querySelectorAll('.modal');
  const closeModalButtons = document.querySelectorAll('.close-modal');
  
  // Grade Details Modal
  const gradeDetailsModal = document.getElementById('gradeDetailsModal');
  
  // New Message Modal
  const newMessageBtn = document.getElementById('newMessageBtn');
  const newMessageModal = document.getElementById('newMessageModal');
  
  if (newMessageBtn) {
    newMessageBtn.addEventListener('click', () => {
      populateInstructors();
      showModal(newMessageModal);
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

  // Modal specific buttons
  const closeGradeDetails = document.getElementById('closeGradeDetails');
  const requestGradeReview = document.getElementById('requestGradeReview');
  const cancelMessage = document.getElementById('cancelMessage');
  
  if (closeGradeDetails) {
    closeGradeDetails.addEventListener('click', () => {
      hideAllModals();
    });
  }
  
  if (requestGradeReview) {
    requestGradeReview.addEventListener('click', () => {
      handleGradeReviewRequest();
    });
  }
  
  if (cancelMessage) {
    cancelMessage.addEventListener('click', () => {
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

function populateInstructors() {
  const recipientSelect = document.getElementById('messageRecipient');
  recipientSelect.innerHTML = '<option value="">Select Instructor</option>';
  
  sampleData.instructors.forEach(instructor => {
    const option = document.createElement('option');
    option.value = instructor.id;
    option.textContent = `${instructor.name} - ${instructor.subject}`;
    recipientSelect.appendChild(option);
  });
}

// Form Handling
function initForms() {
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

  // New Message Form
  const newMessageForm = document.getElementById('newMessageForm');
  if (newMessageForm) {
    newMessageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleNewMessage();
    });
  }

  // Load Grades Button
  const loadGradesBtn = document.getElementById('loadGradesBtn');
  if (loadGradesBtn) {
    loadGradesBtn.addEventListener('click', loadGradesData);
  }
}

function handleProfileUpdate() {
  // Simulate profile update
  setTimeout(() => {
    showToast('Profile updated successfully!');
    
    // Update profile display
    const studentName = document.getElementById('profileName').value;
    document.getElementById('profileStudentName').textContent = studentName;
    
    // Update user info in sidebar
    document.querySelector('.user-name').textContent = studentName;
    document.querySelector('.user-avatar').textContent = getInitials(studentName);
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

function handleNewMessage() {
  const form = document.getElementById('newMessageForm');
  const formData = new FormData(form);
  
  const message = {
    recipient: formData.get('messageRecipient'),
    subject: formData.get('messageSubject'),
    content: formData.get('messageContent'),
    date: new Date().toISOString(),
    status: 'sent'
  };
  
  // Simulate sending message
  setTimeout(() => {
    hideAllModals();
    form.reset();
    showToast('Message sent successfully!');
  }, 1000);
}

function handleGradeReviewRequest() {
  showToast('Grade review request submitted! Your instructor will review it soon.');
  hideAllModals();
}

// Sample Data
const sampleData = {
  student: {
    id: 'S1001',
    name: 'Alex Johnson',
    email: 'alex.johnson@student.edu',
    phone: '+1 (555) 123-4567',
    birthdate: '2004-05-15',
    address: '123 University Ave, Campus Town',
    course: 'BS Information Technology',
    year: '3rd Year',
    gpa: 3.75,
    attendance: 96
  },
  recentGrades: [
    { subject: 'Mathematics', assignment: 'Algebra Quiz', grade: 95, date: '2023-10-10', status: 'Graded' },
    { subject: 'Science', assignment: 'Lab Report', grade: 88, date: '2023-10-12', status: 'Graded' },
    { subject: 'English', assignment: 'Essay', grade: 91, date: '2023-10-15', status: 'Graded' },
    { subject: 'History', assignment: 'Research Paper', grade: 94, date: '2023-10-18', status: 'Graded' }
  ],
  upcomingAssignments: [
    { subject: 'Mathematics', assignment: 'Final Exam', dueDate: '2023-11-25', priority: 'High', progress: 0 },
    { subject: 'Science', assignment: 'Research Project', dueDate: '2023-11-22', priority: 'Medium', progress: 30 },
    { subject: 'English', assignment: 'Book Analysis', dueDate: '2023-11-18', priority: 'Medium', progress: 0 },
    { subject: 'History', assignment: 'Presentation', dueDate: '2023-11-20', priority: 'Low', progress: 75 }
  ],
  semesterGrades: [
    { code: 'MATH301', name: 'Advanced Algebra', instructor: 'Dr. Smith', grade: 95, units: 3, status: 'Passed' },
    { code: 'PHY302', name: 'Physics II', instructor: 'Prof. Johnson', grade: 88, units: 4, status: 'Passed' },
    { code: 'CHEM303', name: 'Organic Chemistry', instructor: 'Dr. Brown', grade: 92, units: 4, status: 'Passed' },
    { code: 'BIO304', name: 'Genetics', instructor: 'Prof. Davis', grade: 94, units: 3, status: 'Passed' },
    { code: 'CS305', name: 'Data Structures', instructor: 'Dr. Wilson', grade: 96, units: 3, status: 'Passed' },
    { code: 'ENG306', name: 'Technical Writing', instructor: 'Prof. Miller', grade: 89, units: 3, status: 'Passed' }
  ],
  assignments: {
    pending: [
      { id: 'A1001', subject: 'Mathematics', title: 'Final Exam', dueDate: '2023-11-25', priority: 'high', description: 'Comprehensive final exam covering all topics from the semester' },
      { id: 'A1002', subject: 'Science', title: 'Research Project', dueDate: '2023-11-22', priority: 'medium', description: 'Group research project on environmental science' },
      { id: 'A1003', subject: 'English', title: 'Book Analysis', dueDate: '2023-11-18', priority: 'medium', description: 'Analysis of "To Kill a Mockingbird"' }
    ],
    completed: [
      { id: 'A1004', subject: 'History', title: 'Research Paper', dueDate: '2023-10-18', priority: 'high', description: 'Research paper on World War II', grade: 94 },
      { id: 'A1005', subject: 'Mathematics', title: 'Algebra Quiz', dueDate: '2023-10-10', priority: 'medium', description: 'Quiz on algebraic equations', grade: 95 }
    ],
    overdue: [
      { id: 'A1006', subject: 'Art', title: 'Portfolio Submission', dueDate: '2023-10-05', priority: 'low', description: 'Art portfolio submission' }
    ]
  },
  schedule: [
    { day: 'Monday', time: '08:00-09:30', subject: 'Mathematics', instructor: 'Dr. Smith', room: '101' },
    { day: 'Monday', time: '10:00-11:30', subject: 'Physics', instructor: 'Prof. Johnson', room: '102' },
    { day: 'Tuesday', time: '09:00-10:30', subject: 'Chemistry', instructor: 'Dr. Brown', room: '103' },
    { day: 'Wednesday', time: '08:00-09:30', subject: 'Biology', instructor: 'Prof. Davis', room: '104' },
    { day: 'Wednesday', time: '11:00-12:30', subject: 'Computer Science', instructor: 'Dr. Wilson', room: '105' },
    { day: 'Thursday', time: '10:00-11:30', subject: 'English', instructor: 'Prof. Miller', room: '106' },
    { day: 'Friday', time: '09:00-10:30', subject: 'History', instructor: 'Dr. Anderson', room: '107' }
  ],
  messages: [
    { id: 'M1001', sender: 'Dr. Smith', subject: 'Algebra Quiz Results', preview: 'Your quiz results are now available...', time: '2 hours ago', unread: true },
    { id: 'M1002', sender: 'Prof. Johnson', subject: 'Lab Schedule Change', preview: 'There has been a change in the lab schedule...', time: '1 day ago', unread: true },
    { id: 'M1003', sender: 'Dr. Brown', subject: 'Office Hours', preview: 'I will be available for extra office hours...', time: '2 days ago', unread: false },
    { id: 'M1004', sender: 'Prof. Davis', subject: 'Project Submission', preview: 'Reminder about the upcoming project deadline...', time: '3 days ago', unread: false }
  ],
  instructors: [
    { id: 'I1001', name: 'Dr. Smith', subject: 'Mathematics' },
    { id: 'I1002', name: 'Prof. Johnson', subject: 'Physics' },
    { id: 'I1003', name: 'Dr. Brown', subject: 'Chemistry' },
    { id: 'I1004', name: 'Prof. Davis', subject: 'Biology' },
    { id: 'I1005', name: 'Dr. Wilson', subject: 'Computer Science' },
    { id: 'I1006', name: 'Prof. Miller', subject: 'English' }
  ]
};

function loadSampleData() {
  loadDashboardData();
}

function loadDashboardData() {
  populateRecentGrades();
  populateUpcomingAssignments();
}

function loadGradesData() {
  populateGradesTable();
  updateGradesSummary();
}

function loadAssignmentsData() {
  populateAssignmentsList('pending');
}

function loadScheduleData() {
  populateSchedule();
}

function loadMessagesData() {
  populateMessagesList();
}

function loadProfileData() {
  // Profile data is loaded from sampleData.student
}

// Data Population Functions
function populateRecentGrades() {
  const tbody = document.getElementById('recentGradesTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  sampleData.recentGrades.forEach(grade => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${grade.subject}</td>
      <td>${grade.assignment}</td>
      <td>${grade.grade}%</td>
      <td>${formatDate(grade.date)}</td>
      <td><span class="badge badge-success">${grade.status}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="viewGradeDetails('${grade.subject}', '${grade.assignment}')">
          <i class="fas fa-eye"></i>
          Details
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function populateUpcomingAssignments() {
  const tbody = document.getElementById('upcomingAssignmentsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  sampleData.upcomingAssignments.forEach(assignment => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${assignment.subject}</td>
      <td>${assignment.assignment}</td>
      <td>${formatDate(assignment.dueDate)}</td>
      <td><span class="badge ${getPriorityBadgeClass(assignment.priority)}">${assignment.priority}</span></td>
      <td>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${assignment.progress}%"></div>
        </div>
        <small>${assignment.progress}%</small>
      </td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="startAssignment('${assignment.subject}', '${assignment.assignment}')">
          <i class="fas fa-play"></i>
          Start
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function populateGradesTable() {
  const tbody = document.getElementById('gradesTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  sampleData.semesterGrades.forEach(grade => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${grade.code}</td>
      <td>${grade.name}</td>
      <td>${grade.instructor}</td>
      <td>${grade.grade}%</td>
      <td>${grade.units}</td>
      <td><span class="badge badge-success">${grade.status}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="viewGradeDetails('${grade.name}', '${grade.code}')">
          <i class="fas fa-chart-bar"></i>
          Details
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function updateGradesSummary() {
  const totalUnits = sampleData.semesterGrades.reduce((sum, grade) => sum + grade.units, 0);
  const passedSubjects = sampleData.semesterGrades.filter(grade => grade.status === 'Passed').length;
  
  document.getElementById('semesterGpa').textContent = sampleData.student.gpa;
  document.getElementById('totalUnits').textContent = totalUnits;
  document.getElementById('passedSubjects').textContent = passedSubjects;
}

function populateAssignmentsList(tab) {
  const container = document.getElementById('assignmentsList');
  if (!container) return;
  
  container.innerHTML = '';
  
  const assignments = sampleData.assignments[tab];
  
  if (!assignments || assignments.length === 0) {
    container.innerHTML = `
      <div class="no-assignments">
        <i class="fas fa-clipboard-check"></i>
        <h3>No ${tab} assignments</h3>
        <p>You're all caught up with ${tab} assignments!</p>
      </div>
    `;
    return;
  }
  
  assignments.forEach(assignment => {
    const item = document.createElement('div');
    item.className = 'assignment-item';
    item.innerHTML = `
      <div class="assignment-info">
        <h4>${assignment.title}</h4>
        <div class="assignment-meta">
          <span><i class="fas fa-book"></i> ${assignment.subject}</span>
          <span><i class="fas fa-calendar"></i> Due: ${formatDate(assignment.dueDate)}</span>
          ${assignment.grade ? `<span><i class="fas fa-star"></i> Grade: ${assignment.grade}%</span>` : ''}
        </div>
        <p>${assignment.description}</p>
      </div>
      <div class="assignment-actions">
        <span class="badge ${getPriorityBadgeClass(assignment.priority)}">${assignment.priority}</span>
        <button class="btn btn-primary btn-sm" onclick="viewAssignment('${assignment.id}')">
          ${tab === 'completed' ? 'View' : 'Work on it'}
        </button>
      </div>
    `;
    container.appendChild(item);
  });
}

function populateSchedule() {
  const grid = document.getElementById('scheduleGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  // Add time slots header
  const timeSlots = ['', '08:00-09:30', '10:00-11:30', '12:00-13:30', '14:00-15:30', '16:00-17:30'];
  const days = ['Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  
  // Add day headers
  days.forEach(day => {
    const header = document.createElement('div');
    header.className = 'schedule-day-header';
    header.textContent = day;
    grid.appendChild(header);
  });
  
  // Add time slots and classes
  for (let i = 1; i < timeSlots.length; i++) {
    const timeSlot = document.createElement('div');
    timeSlot.className = 'schedule-time-slot';
    timeSlot.textContent = timeSlots[i];
    grid.appendChild(timeSlot);
    
    for (let j = 1; j < days.length; j++) {
      const day = days[j];
      const classSlot = document.createElement('div');
      classSlot.className = 'schedule-class';
      
      const classInfo = sampleData.schedule.find(cls => 
        cls.day === day && cls.time === timeSlots[i]
      );
      
      if (classInfo) {
        classSlot.classList.add('has-class');
        classSlot.innerHTML = `
          <div class="class-info">
            <h5>${classInfo.subject}</h5>
            <div class="class-meta">
              <div>${classInfo.instructor}</div>
              <div>Room ${classInfo.room}</div>
            </div>
          </div>
        `;
      }
      
      grid.appendChild(classSlot);
    }
  }
}

function populateMessagesList() {
  const container = document.getElementById('messagesList');
  if (!container) return;
  
  container.innerHTML = '';
  
  sampleData.messages.forEach(message => {
    const item = document.createElement('div');
    item.className = `message-item ${message.unread ? 'unread' : ''}`;
    item.innerHTML = `
      <div class="message-header">
        <div class="message-sender">${message.sender}</div>
        <div class="message-time">${message.time}</div>
      </div>
      <div class="message-subject">${message.subject}</div>
      <div class="message-preview">${message.preview}</div>
    `;
    
    item.addEventListener('click', () => {
      document.querySelectorAll('.message-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      showMessageThread(message.id);
    });
    
    container.appendChild(item);
  });
}

// Utility Functions
function getInitials(name) {
  if (!name) return 'SN';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getPriorityBadgeClass(priority) {
  switch (priority.toLowerCase()) {
    case 'high': return 'badge-danger';
    case 'medium': return 'badge-warning';
    case 'low': return 'badge-info';
    default: return 'badge-primary';
  }
}

// Action Functions
function viewGradeDetails(subject, assignment) {
  const modal = document.getElementById('gradeDetailsModal');
  const content = document.getElementById('gradeDetailsContent');
  
  const grade = sampleData.recentGrades.find(g => 
    g.subject === subject && g.assignment === assignment
  ) || sampleData.semesterGrades.find(g => 
    g.name === subject || g.code === assignment
  );
  
  if (grade) {
    content.innerHTML = `
      <div class="grade-details-header">
        <h3>${grade.subject || grade.name}</h3>
        <p>${grade.assignment || grade.code}</p>
      </div>
      <div class="grade-info">
        <div class="grade-score">
          <div class="score-value">${grade.grade}%</div>
          <div class="score-label">Final Grade</div>
        </div>
        <div class="grade-meta">
          <p><strong>Instructor:</strong> ${grade.instructor || 'Not specified'}</p>
          <p><strong>Date Graded:</strong> ${formatDate(grade.date || new Date())}</p>
          <p><strong>Status:</strong> ${grade.status}</p>
          ${grade.units ? `<p><strong>Units:</strong> ${grade.units}</p>` : ''}
        </div>
      </div>
      <div class="grade-breakdown">
        <h4>Grade Breakdown</h4>
        <p>Detailed breakdown of how your grade was calculated would appear here.</p>
      </div>
    `;
    
    showModal(modal);
  }
}

function startAssignment(subject, assignment) {
  showToast(`Starting assignment: ${assignment} for ${subject}`);
  // In a real app, this would navigate to the assignment workspace
}

function viewAssignment(assignmentId) {
  showToast(`Viewing assignment ${assignmentId}`);
  // In a real app, this would open the assignment details
}

function showMessageThread(messageId) {
  const thread = document.getElementById('messageThread');
  const message = sampleData.messages.find(m => m.id === messageId);
  
  if (message) {
    thread.innerHTML = `
      <div class="message-thread-header">
        <h3>${message.subject}</h3>
        <p>From: ${message.sender} • ${message.time}</p>
      </div>
      <div class="message-content">
        <p>This is where the full message content would appear. In a real application, you would see the complete conversation thread here.</p>
        <p>${message.preview}</p>
      </div>
      <div class="message-reply">
        <textarea class="form-control" placeholder="Type your reply..." rows="3"></textarea>
        <button class="btn btn-primary" style="margin-top: 12px;">
          <i class="fas fa-reply"></i>
          Send Reply
        </button>
      </div>
    `;
  }
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

// Event Listeners
function initEventListeners() {
  // Notifications button
  const notificationsBtn = document.getElementById('notificationsBtn');
  if (notificationsBtn) {
    notificationsBtn.addEventListener('click', () => {
      showToast('You have 2 new notifications');
    });
  }

  // Search button
  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      showToast('Search functionality coming soon!');
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

  // Download grades button
  const downloadGradesBtn = document.getElementById('downloadGradesBtn');
  if (downloadGradesBtn) {
    downloadGradesBtn.addEventListener('click', () => {
      showToast('Downloading grade report...');
      // In a real app, this would trigger a file download
    });
  }

  // Print grades button
  const printGradesBtn = document.getElementById('printGradesBtn');
  if (printGradesBtn) {
    printGradesBtn.addEventListener('click', () => {
      window.print();
      showToast('Print dialog opened');
    });
  }

  // Assignment tabs
  const assignmentTabs = document.querySelectorAll('.assignments-tabs .tab');
  assignmentTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      assignmentTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      populateAssignmentsList(tab.dataset.tab);
    });
  });

  // Schedule navigation
  const prevWeekBtn = document.getElementById('prevWeekBtn');
  const nextWeekBtn = document.getElementById('nextWeekBtn');
  
  if (prevWeekBtn) {
    prevWeekBtn.addEventListener('click', () => {
      showToast('Loading previous week...');
    });
  }
  
  if (nextWeekBtn) {
    nextWeekBtn.addEventListener('click', () => {
      showToast('Loading next week...');
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

// Animations
function initAnimations() {
  // Add hover animations to cards
  const cards = document.querySelectorAll('.stat-card, .content-section, .chart-card, .summary-card');
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

  // Animate stat cards on load
  const statCards = document.querySelectorAll('.stat-card');
  statCards.forEach((card, index) => {
    card.style.animationDelay = `${index * 0.1}s`;
  });
}

// Export functions for global access
window.viewGradeDetails = viewGradeDetails;
window.startAssignment = startAssignment;
window.viewAssignment = viewAssignment;