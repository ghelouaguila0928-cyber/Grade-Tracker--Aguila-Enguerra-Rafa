// ====== Default Users Setup ======
if (!localStorage.getItem("gradetracker_users")) {
    const defaultUsers = [
        { username: "newstudent", password: "1234", role: "student" },
        { username: "teacher1", password: "abcd", role: "teacher" }
    ];
    localStorage.setItem("gradetracker_users", JSON.stringify(defaultUsers));
    console.log("✅ Default users added:", defaultUsers);
}
// ====== End Default Users Setup ======


// temporary storage
class GradeTracker {
    constructor() {
       
    }
 
}

// Data Storage and Management
class GradeTracker {
    constructor() {
        this.users = JSON.parse(localStorage.getItem('gradetracker_users')) || [];
        this.students = JSON.parse(localStorage.getItem('gradetracker_students')) || this.initializeSampleStudents();
        this.teachers = JSON.parse(localStorage.getItem('gradetracker_teachers')) || this.initializeSampleTeachers();
        this.grades = JSON.parse(localStorage.getItem('gradetracker_grades')) || this.initializeSampleGrades();
        this.assignments = JSON.parse(localStorage.getItem('gradetracker_assignments')) || this.initializeSampleAssignments();
        this.currentUser = JSON.parse(localStorage.getItem('gradetracker_currentUser')) || null;
        
        this.initializeEventListeners();
        this.checkAutoLogin();
    }
    
    initializeSampleStudents() {
        const sampleStudents = [
            { id: 'S1001', name: 'Alex Johnson', email: 'alex.johnson@student.school.edu', gradeLevel: '10', avatar: 'AJ' },
            { id: 'S1002', name: 'Sarah Miller', email: 'sarah.miller@student.school.edu', gradeLevel: '10', avatar: 'SM' },
            { id: 'S1003', name: 'Thomas Wilson', email: 'thomas.wilson@student.school.edu', gradeLevel: '10', avatar: 'TW' },
            { id: 'S1004', name: 'Emily Chen', email: 'emily.chen@student.school.edu', gradeLevel: '10', avatar: 'EC' }
        ];
        localStorage.setItem('gradetracker_students', JSON.stringify(sampleStudents));
        return sampleStudents;
    }
    
    initializeSampleTeachers() {
        const sampleTeachers = [
            { id: 'T2001', name: 'Mr. Anderson', email: 'anderson@school.edu', subject: 'Mathematics', department: 'Math', avatar: 'MA' },
            { id: 'T2002', name: 'Ms. Parker', email: 'parker@school.edu', subject: 'English Literature', department: 'English', avatar: 'MP' }
           
        ];
        localStorage.setItem('gradetracker_teachers', JSON.stringify(sampleTeachers));
        return sampleTeachers;
    }
    
    initializeSampleGrades() {
        const sampleGrades = [
            { id: 'G3001', studentId: 'S1001', assignmentId: 'A4001', score: 94, maxScore: 100, percentage: 94, letterGrade: 'A', date: '2023-10-15', notes: 'Excellent work' },
            { id: 'G3002', studentId: 'S1002', assignmentId: 'A4001', score: 88, maxScore: 100, percentage: 88, letterGrade: 'B+', date: '2023-10-15', notes: 'Good effort' },
            { id: 'G3003', studentId: 'S1001', assignmentId: 'A4002', score: 92, maxScore: 100, percentage: 92, letterGrade: 'A-', date: '2023-10-10', notes: 'Well done' },
            { id: 'G3004', studentId: 'S1003', assignmentId: 'A4001', score: 78, maxScore: 100, percentage: 78, letterGrade: 'C+', date: '2023-10-15', notes: 'Needs improvement' }
        ];
        localStorage.setItem('gradetracker_grades', JSON.stringify(sampleGrades));
        return sampleGrades;
    }
    
    initializeSampleAssignments() {
        const sampleAssignments = [
            { id: 'A4001', title: 'Algebra Quiz #3', subject: 'Mathematics', dueDate: '2023-10-14', maxScore: 100, description: 'Chapter 3 quiz on algebraic expressions' },
            { id: 'A4002', title: 'Essay: Shakespeare', subject: 'English Literature', dueDate: '2023-10-12', maxScore: 100, description: 'Analysis of Hamlet soliloquy' },
            { id: 'A4003', title: 'Lab Report: Chemistry', subject: 'Science', dueDate: '2023-10-16', maxScore: 100, description: 'Chemical reactions lab experiment' },
            { id: 'A4004', title: 'Calculus Problem Set', subject: 'Mathematics', dueDate: '2023-10-20', maxScore: 100, description: 'Problems on derivatives and limits' }
        ];
        localStorage.setItem('gradetracker_assignments', JSON.stringify(sampleAssignments));
        return sampleAssignments;
    }
    
    initializeEventListeners() {
        // Dashboard navigation
        document.querySelectorAll('.sidebar-menu a').forEach(link => {
            link.addEventListener('click', (e) => this.handleDashboardNavigation(e));
        });
        
        // Logout
        const studentLogout = document.getElementById('student-logout');
        const teacherLogout = document.getElementById('teacher-logout');
        
        if (studentLogout) {
            studentLogout.addEventListener('click', () => this.handleLogout());
        }
        
        if (teacherLogout) {
            teacherLogout.addEventListener('click', () => this.handleLogout());
        }
        
        // Social login buttons
        document.querySelectorAll('.social-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const platform = this.classList.contains('google-btn') ? 'Google' : 'Facebook';
                this.showAlert(`In a real application, this would connect to ${platform} authentication.`, 'success');
            });
        });
    }
    
    checkAutoLogin() {
    // Recheck localStorage to ensure user data is loaded
    if (!this.currentUser) {
        this.currentUser = JSON.parse(localStorage.getItem('gradetracker_currentUser'));
    }

    setTimeout(() => {
        if (this.currentUser) {
            this.updateDashboardWithUserData();
        } else {
            // Redirect to login only if actually on a dashboard page
            if (window.location.pathname.includes('student-dashboard') || 
                window.location.pathname.includes('teacher-dashboard')) {
                window.location.href = 'login.html';
            }
        }
    }, 300); // small delay to let localStorage sync
}

    
    handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        // Simple authentication - in a real app, this would be server-side
        let user = null;
        
        // Check if it's a teacher
        user = this.teachers.find(t => t.email === email);
        if (user) {
            user.role = 'teacher';
        } else {
            // Check if it's a student
            user = this.students.find(s => s.email === email);
            if (user) {
                user.role = 'student';
            }
        }
        
        if (user) {
            // For demo purposes, any password works
            this.currentUser = user;
            localStorage.setItem('gradetracker_currentUser', JSON.stringify(user));
            
            // Redirect to appropriate dashboard
            if (user.role === 'student') {
                window.location.href = 'student-dashboard.html';
            } else {
                window.location.href = 'teacher-dashboard.html';
            }
        } else {
            this.showAlert('Invalid email or password. Please try again.', 'error');
        }
    }
    
    handleSignup(e) {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const role = document.getElementById('signup-role').value;
        
        // Check if email already exists
        if (this.users.find(u => u.email === email) || 
            this.students.find(s => s.email === email) ||
            this.teachers.find(t => t.email === email)) {
            this.showAlert('An account with this email already exists.', 'error');
            return;
        }
        
        // Create new user
        let newUser = { name, email, password, role };
        
        if (role === 'student') {
            const studentId = 'S' + (1000 + this.students.length + 1);
            const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase();
            newUser = { ...newUser, id: studentId, gradeLevel: '9', avatar };
            this.students.push(newUser);
            localStorage.setItem('gradetracker_students', JSON.stringify(this.students));
        } else if (role === 'teacher') {
            const teacherId = 'T' + (2000 + this.teachers.length + 1);
            const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase();
            newUser = { ...newUser, id: teacherId, subject: 'General', department: 'General', avatar };
            this.teachers.push(newUser);
            localStorage.setItem('gradetracker_teachers', JSON.stringify(this.teachers));
        }
        
        this.users.push(newUser);
        localStorage.setItem('gradetracker_users', JSON.stringify(this.users));
        
        this.currentUser = newUser;
        localStorage.setItem('gradetracker_currentUser', JSON.stringify(newUser));
        
        // Redirect to appropriate dashboard
        if (role === 'student') {
            window.location.href = 'student-dashboard.html';
        } else {
            window.location.href = 'teacher-dashboard.html';
        }
    }
    
    handleLogout() {
        this.currentUser = null;
        localStorage.removeItem('gradetracker_currentUser');
        window.location.href = 'index.html';
    }
    
    updateDashboardWithUserData() {
        if (!this.currentUser) return;
        
        if (this.currentUser.role === 'student') {
            // Update student dashboard
            document.getElementById('student-name-display').textContent = this.currentUser.name;
            document.getElementById('student-avatar').textContent = this.currentUser.avatar;
            
            // Update student profile form
            document.getElementById('student-profile-name').value = this.currentUser.name;
            document.getElementById('student-profile-email').value = this.currentUser.email;
            document.getElementById('student-profile-id').value = this.currentUser.id;
            document.getElementById('student-profile-grade').value = this.currentUser.gradeLevel;
        } else if (this.currentUser.role === 'teacher') {
            // Update teacher dashboard
            document.getElementById('teacher-name-display').textContent = this.currentUser.name;
            document.getElementById('teacher-subject-display').textContent = `${this.currentUser.subject} Teacher`;
            document.getElementById('teacher-avatar').textContent = this.currentUser.avatar;
            
            // Update teacher profile form
            document.getElementById('teacher-profile-name').value = this.currentUser.name;
            document.getElementById('teacher-profile-email').value = this.currentUser.email;
            document.getElementById('teacher-profile-subject').value = this.currentUser.subject;
            document.getElementById('teacher-profile-department').value = this.currentUser.department;
        }
    }
    
    handleDashboardNavigation(e) {
        e.preventDefault();
        
        // Remove active class from all links
        document.querySelectorAll('.sidebar-menu a').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to clicked link
        e.target.classList.add('active');
        
        // Hide all pages
        document.querySelectorAll('.dashboard-page').forEach(page => {
            page.classList.remove('active');
        });
        
        // Show selected page
        const pageId = e.target.getAttribute('data-page');
        document.getElementById(pageId).classList.add('active');
    }
    
    getLetterGrade(percentage) {
        if (percentage >= 90) return 'A';
        if (percentage >= 80) return 'B';
        if (percentage >= 70) return 'C';
        if (percentage >= 60) return 'D';
        return 'F';
    }
    
    showAlert(message, type) {
        // Remove any existing alerts
        const existingAlerts = document.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());
        
        // Create new alert
        const alert = document.createElement('div');
        alert.className = `alert alert-${type === 'error' ? 'error' : 'success'}`;
        alert.textContent = message;
        
        // Add to the main content area of the current dashboard
        let mainContent;
        if (document.getElementById('student-dashboard')) {
            mainContent = document.querySelector('#student-dashboard .main-content');
        } else if (document.getElementById('teacher-dashboard')) {
            mainContent = document.querySelector('#teacher-dashboard .main-content');
        } else {
            mainContent = document.querySelector('.auth-body') || document.querySelector('.container');
        }
        
        if (mainContent) {
            mainContent.insertBefore(alert, mainContent.firstChild);
            
            // Auto remove after 5 seconds
            setTimeout(() => {
                alert.remove();
            }, 5000);
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const gradeTracker = new GradeTracker();
    
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => gradeTracker.handleLogin(e));
    }
    
    // Signup form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => gradeTracker.handleSignup(e));
    }
    
    // Download report button
    const downloadReportBtn = document.getElementById('download-report');
    if (downloadReportBtn) {
        downloadReportBtn.addEventListener('click', () => {
            gradeTracker.showAlert('Report download started. In a real application, this would generate a PDF report.', 'success');
        });
    }
});