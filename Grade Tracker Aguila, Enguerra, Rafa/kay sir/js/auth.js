document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");

    // Default demo accounts
    const defaultAccounts = [
        {
            email: "student@example.com",
            password: "1234",
            role: "student",
            name: "Juan Dela Cruz"
        },
        {
            email: "teacher@example.com",
            password: "1234",
            role: "teacher",
            name: "Prof. Maria Santos"
        }
    ];

    // Function to get all accounts (demo + saved)
    function getAllAccounts() {
        const saved = JSON.parse(localStorage.getItem("accounts")) || [];
        return [...defaultAccounts, ...saved];
    }

    // ============================
    // SIGN-UP FUNCTIONALITY
    // ============================
    if (signupForm) {
        // Role selection
        document.querySelectorAll('.role-option').forEach(option => {
            option.addEventListener('click', function() {
                document.querySelectorAll('.role-option').forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
                document.getElementById('signup-role').value = this.dataset.role;
            });
        });

        // Password strength checker
        const passwordInput = document.getElementById('signup-password');
        const strengthBar = document.querySelector('.strength-fill');
        const strengthText = document.querySelector('.strength-text');

        passwordInput.addEventListener('input', () => {
            const p = passwordInput.value;
            let s = 0;
            if (p.length >= 8) s += 25;
            if (/[A-Z]/.test(p)) s += 25;
            if (/[0-9]/.test(p)) s += 25;
            if (/[^A-Za-z0-9]/.test(p)) s += 25;

            strengthBar.style.width = s + '%';
            if (s < 50) {
                strengthBar.className = 'strength-fill weak';
                strengthText.textContent = 'Password strength: Weak';
            } else if (s < 75) {
                strengthBar.className = 'strength-fill medium';
                strengthText.textContent = 'Password strength: Medium';
            } else {
                strengthBar.className = 'strength-fill strong';
                strengthText.textContent = 'Password strength: Strong';
            }
        });

        signupForm.addEventListener("submit", (e) => {
            e.preventDefault();

            const name = document.getElementById("signup-name").value.trim();
            const email = document.getElementById("signup-email").value.trim();
            const password = document.getElementById("signup-password").value.trim();
            const confirm = document.getElementById("signup-confirm-password").value.trim();
            const role = document.getElementById("signup-role").value;

            if (password !== confirm) {
                alert("Passwords do not match.");
                return;
            }

            const accounts = JSON.parse(localStorage.getItem("accounts")) || [];

            if (accounts.some(acc => acc.email === email)) {
                alert("This email is already registered. Try logging in instead.");
                return;
            }

            const newUser = { name, email, password, role };
            accounts.push(newUser);
            localStorage.setItem("accounts", JSON.stringify(accounts));

            alert("Account created successfully! You can now log in.");
            window.location.href = "login.html";
        });
    }

    // ============================
    // LOGIN FUNCTIONALITY
    // ============================
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();

            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value.trim();

            const allAccounts = getAllAccounts();
            const foundUser = allAccounts.find(acc => acc.email === email && acc.password === password);

            if (!foundUser) {
                alert("Invalid email or password. Please try again or sign up first.");
                return;
            }

            localStorage.setItem("gradeTrackerUser", JSON.stringify(foundUser));

            if (foundUser.role === "student") {
                window.location.href = "student-dashboard.html";
            } else {
                window.location.href = "teacher-dashboard.html";
            }
        });
    }
});
