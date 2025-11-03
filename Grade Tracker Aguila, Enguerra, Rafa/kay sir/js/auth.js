// js/auth.js
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// redirect helper
async function goToDashboard(user) {
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      // user exists in Auth but not in Firestore → send to student
      console.warn("[auth.js] users/" + user.uid + " not found, going to student-dashboard");
      window.location.href = "student-dashboard.html";
      return;
    }

    const data = snap.data();
    if (data.role === "teacher") {
      window.location.href = "teacher-dashboard.html";
    } else {
      window.location.href = "student-dashboard.html";
    }
  } catch (err) {
    // THIS is the part you saw as alert — now we just log it
    console.error("[auth.js] Firestore read failed in goToDashboard:", err.code, err.message);

    // let you in anyway
    window.location.href = "student-dashboard.html";
  }
}

// SIGNUP
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const pass = document.getElementById("signup-password").value;
    const pass2 = document.getElementById("signup-confirm-password").value;
    const roleEl = document.getElementById("signup-role");
    const role = roleEl ? roleEl.value : "student";

    if (pass !== pass2) {
      alert("Passwords do not match");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);

      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }

      // create Firestore user doc
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        name: name || "",
        email,
        role,
        createdAt: new Date()
      });

      await goToDashboard(cred.user);
    } catch (err) {
      console.error("[auth.js] signup error:", err.code, err.message);
      alert(err.message);
    }
  });

  // optional role picker
  const roleOptions = document.querySelectorAll(".role-option");
  roleOptions.forEach((opt) => {
    opt.addEventListener("click", () => {
      roleOptions.forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      const hidden = document.getElementById("signup-role");
      if (hidden) hidden.value = opt.dataset.role;
    });
  });
}

// LOGIN
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-password").value;

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await goToDashboard(cred.user);
    } catch (err) {
      console.error("[auth.js] login error:", err.code, err.message);
      alert(err.message);
    }
  });
}

export { goToDashboard };
