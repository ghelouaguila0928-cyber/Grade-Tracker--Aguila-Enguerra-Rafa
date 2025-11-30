// js/student.js
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  setDoc,
  serverTimestamp,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* -------------------- UI refs -------------------- */
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");
const pageTitle = document.getElementById("pageTitle");
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebar");

const sidebarName = document.getElementById("sidebarName");
const sidebarRole = document.getElementById("sidebarRole");
const profileInitials = document.getElementById("profileInitials");
const profileStudentName = document.getElementById("profileStudentName");
const profileStudentId = document.getElementById("profileStudentId");

// Profile table fields
const p_name = document.getElementById("p_name");
const p_email = document.getElementById("p_email");
const p_studentId = document.getElementById("p_studentId");
const p_course = document.getElementById("p_course");
const p_year = document.getElementById("p_year");
const p_section = document.getElementById("p_section");

// Profile edit controls
const editProfileBtn = document.getElementById("editProfileBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const cancelProfileBtn = document.getElementById("cancelProfileBtn");

// Toast + auth
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");
const logoutBtn = document.getElementById("logoutBtn");

// Summary (Year Level + Semester)
const selectYearLevel = document.getElementById("selectYearLevel");
const selectSem = document.getElementById("selectSem");
const generateSummaryBtn = document.getElementById("generateSummaryBtn");
const downloadSummaryBtn = document.getElementById("downloadSummaryBtn");
const printSummaryBtn = document.getElementById("printSummaryBtn");
const summaryTableBody = document.getElementById("summaryTableBody");
const totalUnitsEl = document.getElementById("totalUnits");
const gwaEl = document.getElementById("gwa");
const summaryMeta = document.getElementById("summaryMeta");

// Chat UI
const threadListEl = document.getElementById("threadList");
const threadEmptyEl = document.getElementById("threadEmpty");
const chatBody = document.getElementById("chatBody");
const chatTitle = document.getElementById("chatTitle");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");

// Nav items for notif indicators
const navGrades = document.querySelector('.nav-item[data-page="grades"]');
const navMessages = document.querySelector('.nav-item[data-page="messages"]');

// Header notifications (bell)
const notificationsBtn = document.getElementById("notificationsBtn");
const notificationsCount = document.getElementById("notificationsCount");

// Notification sidebar
const notifSidebar = document.getElementById("notifSidebar");
const notifBackdrop = document.getElementById("notifBackdrop");
const notifList = document.getElementById("notifList");
const notifCloseBtn = document.getElementById("notifCloseBtn");

/* -------------------- state -------------------- */
let currentPageId = null;
let currentProfile = null;
let currentAuthUser = null;

// notification counters
let unreadGradesCount = 0;
let unreadMessagesCount = 0;

// notification list for sidebar
let notifications = []; // [{ id, type: 'grade'|'message', text, createdAt, read }]
let notifIdCounter = 0;

// listeners
let gradesUnsubSubcollection = null;
let gradesUnsubRoot = null;
let gradesListenerReadySub = false;
let gradesListenerReadyRoot = false;

let threadUnsubAdmin = null;
let adminMessages = [];
let teacherMessages = [];
let TEACHER_FOR_CHAT = null;
let TEACHER_NAME_FOR_CHAT = null;
let teacherProfileUnsub = null; // teacher profile listener

// current conversation being shown: "admin" or "teacher"
let activeConversationKey = null;

// presence heartbeat interval
let presenceInterval = null;

/* -------------------- helpers -------------------- */
function showToast(msg, type = "success") {
  if (!toast) {
    alert(msg);
    return;
  }
  toastMessage.textContent = msg;
  toast.classList.remove("error");
  if (type === "error") toast.classList.add("error");
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show", "error");
  }, 2500);
}

function setNavNotification(navEl, on) {
  if (!navEl) return;
  navEl.classList.toggle("has-notif", !!on);
}

function updateNotificationsUI() {
  if (!notificationsCount) return;
  const total = unreadGradesCount + unreadMessagesCount;
  if (total > 0) {
    notificationsCount.textContent = String(total);
    notificationsCount.hidden = false;
  } else {
    notificationsCount.hidden = true;
  }
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }
    )[c]
  );
}

const coerceStr = (v) => (v === undefined || v === null ? "" : String(v));

function setInitials(targetEls, name) {
  const initials = (name || "ST")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  targetEls.forEach((el) => el && (el.textContent = initials));
}

/* normalize sender role (admin / teacher / prof / etc.) */
function getSenderRole(message) {
  const raw =
    message.senderRole ??
    message.role ??
    message.sender_type ??
    message.senderType ??
    message.fromRole ??
    message.userRole ??
    "";
  return String(raw).toLowerCase();
}

/* ----- shared helpers for year ----- */
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

/* --------- presence helper: set online / offline --------- */
async function setOnlineStatus(user, isOnline) {
  if (!user) return;
  try {
    await setDoc(
      doc(db, "users", user.uid),
      {
        online: !!isOnline,
        lastSeenAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("[student] setOnlineStatus failed:", e);
  }
}

/* -------------------- Notification sidebar -------------------- */

function renderNotifList() {
  if (!notifList) return;

  if (!notifications.length) {
    notifList.innerHTML =
      '<div class="notif-empty">No notifications yet.</div>';
    return;
  }

  notifList.innerHTML = notifications
    .map((n) => {
      const iconClass = n.type === "grade" ? "grade" : "message";
      const iconFa =
        n.type === "grade" ? "fa-clipboard-check" : "fa-comments";
      const when = n.createdAt
        ? new Date(n.createdAt).toLocaleString()
        : "";
      const unreadClass = n.read ? "" : "unread";

      return `
        <div class="notif-item ${unreadClass}" data-type="${n.type}">
          <div class="notif-icon ${iconClass}">
            <i class="fas ${iconFa}"></i>
          </div>
          <div class="notif-content">
            <div class="notif-text">${escapeHTML(n.text)}</div>
            <div class="notif-meta">${escapeHTML(when)}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function addNotification(type, text) {
  notifIdCounter += 1;
  notifications.unshift({
    id: notifIdCounter,
    type,
    text,
    createdAt: Date.now(),
    read: false,
  });
  renderNotifList();
}

function openNotifSidebar() {
  if (!notifSidebar || !notifBackdrop) return;
  notifSidebar.classList.add("active");
  notifBackdrop.classList.add("active");

  // mark all as read when opening
  notifications = notifications.map((n) => ({ ...n, read: true }));
  unreadGradesCount = 0;
  unreadMessagesCount = 0;
  setNavNotification(navGrades, false);
  setNavNotification(navMessages, false);
  updateNotificationsUI();
  renderNotifList();
}

function closeNotifSidebar() {
  if (!notifSidebar || !notifBackdrop) return;
  notifSidebar.classList.remove("active");
  notifBackdrop.classList.remove("active");
}

/* -------------------- Page / Nav -------------------- */

function showPage(id) {
  currentPageId = id;
  pages.forEach((p) => p.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  if (pageTitle) {
    const titleText = {
      grades: "My Grades",
      subjects: "Subjects",
      messages: "Messages",
      profile: "Profile",
    }[id] || id;
    pageTitle.textContent = titleText;
  }

  // Clear notifications for that page
  if (id === "grades") {
    unreadGradesCount = 0;
    setNavNotification(navGrades, false);
    updateNotificationsUI();
  }
  if (id === "messages") {
    unreadMessagesCount = 0;
    setNavNotification(navMessages, false);
    updateNotificationsUI();
  }
}

toggleSidebarBtn?.addEventListener("click", () => {
  sidebar?.classList.toggle("collapsed");
});

navItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    navItems.forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    showPage(item.dataset.page);
  });
});

// Bell & notif sidebar
notificationsBtn?.addEventListener("click", () => {
  openNotifSidebar();
});

notifCloseBtn?.addEventListener("click", () => {
  closeNotifSidebar();
});

notifBackdrop?.addEventListener("click", () => {
  closeNotifSidebar();
});

// click notif item -> jump to page
notifList?.addEventListener("click", (e) => {
  const item = e.target.closest(".notif-item");
  if (!item) return;

  const type = item.dataset.type;

  navItems.forEach((n) => n.classList.remove("active"));

  if (type === "message") {
    const chatNav = document.querySelector('.nav-item[data-page="messages"]');
    chatNav?.classList.add("active");
    showPage("messages");
  } else if (type === "grade") {
    const gradesNav = document.querySelector('.nav-item[data-page="grades"]');
    gradesNav?.classList.add("active");
    showPage("grades");
  }

  closeNotifSidebar();
});

/* -------------------- Summary of Grades -------------------- */

function computeGWA(rows) {
  let wsum = 0,
    units = 0;
  rows.forEach((r) => {
    const u = Number(r.units);
    const g = Number(r.grade);
    if (!isNaN(u) && !isNaN(g)) {
      wsum += u * g;
      units += u;
    }
  });
  if (units === 0) return null;
  return wsum / units;
}

function normalizeGrade(rec) {
  return {
    code:
      rec.code ||
      rec.subjectCode ||
      rec.courseCode ||
      rec.subject ||
      "—",
    title:
      rec.title ||
      rec.subjectTitle ||
      rec.courseName ||
      rec.subject ||
      "—",
    units: Number(rec.units ?? rec.creditUnits ?? 0) || 0,
    grade: rec.grade ?? rec.final ?? rec.finalGrade ?? rec.mark ?? "—",
    remarks: rec.remarks ?? rec.remark ?? "",
    yearLevel: String(rec.yearLevel ?? rec.year ?? ""),
    semester: rec.semester || rec.term || rec.sem || "",
  };
}

async function fetchGradesForTerm(user, yearLevel, sem) {
  const qGrades = query(
    collection(db, "users", user.uid, "grades"),
    where("yearLevel", "==", String(yearLevel)),
    where("semester", "==", String(sem))
  );
  const snap = await getDocs(qGrades);
  return snap.docs.map((d) => normalizeGrade(d.data()));
}

function renderSummary(rows, yearLevel, sem) {
  if (!summaryTableBody) return;
  const prettyYearMap = {
    "1": "1st Year",
    "2": "2nd Year",
    "3": "3rd Year",
    "4": "4th Year",
    "5": "5th Year",
  };
  const prettyYear =
    prettyYearMap[String(yearLevel)] || `Year ${yearLevel}`;

  if (!rows || rows.length === 0) {
    summaryTableBody.innerHTML = `<tr><td colspan="4" class="muted">No grades found for ${escapeHTML(
      prettyYear
    )} • ${escapeHTML(sem)}</td></tr>`;
    totalUnitsEl && (totalUnitsEl.textContent = "0");
    gwaEl && (gwaEl.textContent = "—");
    summaryMeta &&
      (summaryMeta.textContent = `Summary for ${prettyYear} • ${sem}`);
    return;
  }

  summaryTableBody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${escapeHTML(r.title || "—")}</td>
      <td>${escapeHTML(r.code || "—")}</td>
      <td>${Number(r.units) || 0}</td>
      <td>${escapeHTML(r.grade ?? "—")}</td>
    </tr>
  `
    )
    .join("");

  const totalUnits = rows.reduce(
    (s, r) => s + (Number(r.units) || 0),
    0
  );
  totalUnitsEl && (totalUnitsEl.textContent = String(totalUnits));

  const gwa = computeGWA(rows);
  gwaEl && (gwaEl.textContent = gwa == null ? "—" : gwa.toFixed(3));

  summaryMeta &&
    (summaryMeta.textContent = `Summary for ${prettyYear} • ${sem}`);
}

function toCSV(rows, meta) {
  const header = ["Course Name", "Course Code", "Units", "Mark"];
  const lines = [header.join(",")];
  rows.forEach((r) => {
    const vals = [
      r.title || "—",
      r.code || "—",
      Number(r.units) || 0,
      r.grade ?? "—",
    ];
    lines.push(
      vals.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")
    );
  });
  lines.push("");
  lines.push(`"Total Units",${meta.totalUnits},"GWA",${meta.gwa ?? ""}`);
  return lines.join("\n");
}

function download(filename, text) {
  const blob = new Blob([text], {
    type: "text/csv;charset=utf-8",
  });
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

async function handleGenerate(user) {
  if (!selectYearLevel || !selectSem) return;
  const yearLevel = selectYearLevel.value;
  const sem = selectSem.value;
  if (summaryTableBody)
    summaryTableBody.innerHTML = `<tr><td colspan="4">Loading…</td></tr>`;
  try {
    const rows = await fetchGradesForTerm(user, yearLevel, sem);
    renderSummary(rows, yearLevel, sem);

    downloadSummaryBtn?.addEventListener(
      "click",
      () => {
        const csv = toCSV(rows, {
          totalUnits: rows.reduce(
            (s, r) => s + (Number(r.units) || 0),
            0
          ),
          gwa: (() => {
            const g = computeGWA(rows);
            return g == null ? "" : g.toFixed(3);
          })(),
        });
        const prettyYearMap = {
          "1": "1stYear",
          "2": "2ndYear",
          "3": "3rdYear",
          "4": "4thYear",
          "5": "5thYear",
        };
        const prettyYear =
          prettyYearMap[String(yearLevel)] || `Year${yearLevel}`;
        download(`Summary_${prettyYear}_${sem}.csv`, csv);
      },
      { once: true }
    );
  } catch (err) {
    console.error("[student] fetch grades failed:", err);
    if (summaryTableBody)
      summaryTableBody.innerHTML = `<tr><td colspan="4" class="muted">Error fetching grades.</td></tr>`;
    totalUnitsEl && (totalUnitsEl.textContent = "0");
    gwaEl && (gwaEl.textContent = "—");
    const prettyYearMap = {
      "1": "1st Year",
      "2": "2nd Year",
      "3": "3rd Year",
      "4": "4th Year",
      "5": "5th Year",
    };
    const prettyYear =
      prettyYearMap[String(selectYearLevel.value)] ||
      `Year ${selectYearLevel.value}`;
    summaryMeta &&
      (summaryMeta.textContent = `Summary for ${prettyYear} • ${selectSem.value}`);
  }
}

/* -------------------- Chat (Student ↔ Admin / Teacher) -------------------- */

async function getTeacherName(uid) {
  if (!uid) return "Teacher";
  try {
    const s = await getDoc(doc(db, "users", uid));
    if (s.exists()) {
      const d = s.data();
      return (
        coerceStr(
          d.name ||
            d.fullName ||
            d.displayName ||
            d.email ||
            "Teacher"
        ).trim() || "Teacher"
      );
    }
  } catch (e) {
    console.warn("[student] getTeacherName failed:", e);
  }
  return "Teacher";
}

// real-time listener for teacher profile
function subscribeToTeacherProfile(uid) {
  if (teacherProfileUnsub) {
    teacherProfileUnsub();
    teacherProfileUnsub = null;
  }

  if (!uid) return;

  const ref = doc(db, "users", uid);
  teacherProfileUnsub = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() || {};
      TEACHER_NAME_FOR_CHAT =
        coerceStr(
          d.name ||
            d.fullName ||
            d.displayName ||
            d.email ||
            "Teacher"
        ).trim() || "Teacher";

      // refresh chat UI
      syncChatUI();
    },
    (err) => {
      console.warn("[student] teacher profile onSnapshot error:", err);
    }
  );
}

// no status text element in this HTML, keep as no-op
function updateChatStatus() {}

function renderActiveConversationThread() {
  if (!chatBody) return;

  let msgs = [];
  if (activeConversationKey === "teacher") {
    msgs = teacherMessages;
  } else if (activeConversationKey === "admin") {
    msgs = adminMessages;
  } else {
    chatBody.innerHTML = `
      <div class="muted" style="padding:12px;">
        No thread selected.
      </div>`;
    return;
  }

  if (!msgs.length) {
    chatBody.innerHTML = `
      <div class="muted" style="padding:12px;">
        No messages yet. Type a message below to start the conversation.
      </div>`;
    return;
  }

  const currentUid = auth.currentUser?.uid;

  chatBody.innerHTML = `
    <div class="thread">
      ${msgs
        .map((m) => {
          const role = getSenderRole(m);
          const mine =
            m.senderId === currentUid ||
            m.senderUid === currentUid ||
            role === "student";

          const isTeacherSender =
            TEACHER_FOR_CHAT &&
            (m.senderId === TEACHER_FOR_CHAT ||
              m.senderUid === TEACHER_FOR_CHAT);

          const whenSrc = m.createdAt?.toDate
            ? m.createdAt.toDate()
            : new Date();
          const when = whenSrc.toLocaleString();

          let senderLabel = "User";

          if (mine) {
            senderLabel = "You";
          } else if (isTeacherSender || role === "teacher" || role === "prof") {
            senderLabel = TEACHER_NAME_FOR_CHAT || m.senderName || "Teacher";
          } else if (role === "admin") {
            senderLabel = "Admin";
          } else {
            senderLabel = "Staff";
          }

          return `
            <div class="bubble ${mine ? "me" : "them"}">
              <div class="bubble-header">${escapeHTML(senderLabel)}</div>
              <div class="bubble-body">${escapeHTML(
                m.text || ""
              ).replace(/\n/g, "<br/>")}</div>
              <div class="bubble-meta">${when}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  chatBody.scrollTop = chatBody.scrollHeight;
}

function setActiveConversation(key) {
  activeConversationKey = key;

  if (threadListEl) {
    const items = threadListEl.querySelectorAll(".thread-item");
    items.forEach((item) => {
      item.classList.toggle("active", item.dataset.key === key);
    });
  }

  if (chatTitle) {
    if (key === "teacher") {
      chatTitle.textContent = TEACHER_NAME_FOR_CHAT || "Teacher";
    } else if (key === "admin") {
      chatTitle.textContent = "Admin";
    } else {
      chatTitle.textContent = "No thread selected";
    }
  }

  updateChatStatus();
  renderActiveConversationThread();
}

function renderChatContacts() {
  if (!threadListEl) return;

  const contacts = [];

  const lastAdmin = adminMessages[adminMessages.length - 1] || null;
  contacts.push({
    key: "admin",
    label: "Admin",
    type: "admin",
    lastText: lastAdmin?.text || "",
    lastAt: lastAdmin?.createdAt?.toDate
      ? lastAdmin.createdAt.toDate()
      : null,
  });

  if (TEACHER_FOR_CHAT || teacherMessages.length > 0) {
    const lastTeacher =
      teacherMessages[teacherMessages.length - 1] || null;
    contacts.push({
      key: "teacher",
      label: TEACHER_NAME_FOR_CHAT || "Teacher",
      type: "teacher",
      lastText: lastTeacher?.text || "",
      lastAt: lastTeacher?.createdAt?.toDate
        ? lastTeacher.createdAt.toDate()
        : null,
    });
  }

  contacts.sort(
    (a, b) => (b.lastAt?.getTime() || 0) - (a.lastAt?.getTime() || 0)
  );

  threadListEl.innerHTML = "";

  if (threadEmptyEl) {
    threadEmptyEl.style.display = contacts.length ? "none" : "";
  }

  if (!contacts.length) {
    if (threadEmptyEl) {
      threadListEl.appendChild(threadEmptyEl);
    } else {
      const div = document.createElement("div");
      div.className = "muted";
      div.textContent = "No conversations yet.";
      threadListEl.appendChild(div);
    }
    return;
  }

  contacts.forEach((c) => {
    const div = document.createElement("div");
    div.className = "thread-item";
    if (
      activeConversationKey === c.key ||
      (!activeConversationKey && c.key === "admin")
    ) {
      div.classList.add("active");
    }
    div.dataset.key = c.key;
    div.dataset.type = c.type;

    const time = c.lastAt
      ? c.lastAt.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";

    const preview = c.lastText
      ? escapeHTML(c.lastText.slice(0, 60))
      : "No messages yet";

    div.innerHTML = `
      <div class="message-header">
        <div class="message-sender">${escapeHTML(c.label)}</div>
        <div class="message-time">${escapeHTML(time)}</div>
      </div>
      <div class="message-preview">${preview}</div>
    `;

    div.addEventListener("click", () => {
      setActiveConversation(c.key);
    });

    threadListEl.appendChild(div);
  });

  if (!activeConversationKey && contacts.length) {
    setActiveConversation(contacts[0].key);
  } else {
    renderActiveConversationThread();
  }
}

function syncChatUI() {
  renderChatContacts();
}

/* Firestore thread helpers */

async function ensureAdminThreadDoc(
  user,
  subjectText = "Conversation"
) {
  const tRef = doc(db, "threads", user.uid);
  const tSnap = await getDoc(tRef);
  if (!tSnap.exists()) {
    await setDoc(
      tRef,
      {
        studentUid: user.uid,
        studentEmail: user.email || "",
        studentName: user.displayName || "",
        lastMessage: {
          subject: subjectText,
          text: "",
          senderId: user.uid,
          senderRole: "student",
        },
        updatedAt: serverTimestamp(),
        lastSender: user.uid,
        lastSenderRole: "student",
        unread: false,
      },
      { merge: true }
    );
  }
  return tRef;
}

async function sendMessageToAdmin(user, text) {
  const tRef = await ensureAdminThreadDoc(user);

  await addDoc(collection(tRef, "messages"), {
    senderId: user.uid,
    senderRole: "student",
    text,
    createdAt: serverTimestamp(),
  });

  await setDoc(
    tRef,
    {
      lastMessage: {
        subject: "Message",
        text,
        senderId: user.uid,
        senderRole: "student",
      },
      lastSender: user.uid,
      lastSenderRole: "student",
      updatedAt: serverTimestamp(),
      unread: true,
    },
    { merge: true }
  );
}

// Teacher convo uses same thread
async function sendMessageToTeacher(user, text) {
  return sendMessageToAdmin(user, text);
}

function bindRealtimeThreads(user) {
  if (!user) return;

  if (threadUnsubAdmin) threadUnsubAdmin();
  adminMessages = [];
  teacherMessages = [];

  const msgsQ = query(
    collection(db, "threads", user.uid, "messages"),
    orderBy("createdAt", "asc")
  );

  threadUnsubAdmin = onSnapshot(
    msgsQ,
    (qs) => {
      const all = qs.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      adminMessages = all.filter((m) => {
        const role = getSenderRole(m);
        return role === "admin" || role === "student" || !role;
      });

      teacherMessages = all.filter((m) => {
        const role = getSenderRole(m);
        return role === "teacher" || role === "prof" || role === "student";
      });

      if (!TEACHER_FOR_CHAT) {
        teacherMessages = all;
      }

      // 🔔 CHAT NOTIFICATIONS
      const changes = qs.docChanges();
      const currentUid = auth.currentUser?.uid;
      changes.forEach((change) => {
        if (change.type !== "added") return;
        const m = { id: change.doc.id, ...change.doc.data() };
        const role = getSenderRole(m);
        const fromTeacherOrAdmin =
          role === "teacher" || role === "prof" || role === "admin";
        const fromMe =
          m.senderId === currentUid || m.senderUid === currentUid;
        if (!fromTeacherOrAdmin || fromMe) return;

        let fromLabel = "Admin";
        if (role === "teacher" || role === "prof") {
          fromLabel = TEACHER_NAME_FOR_CHAT || "Teacher";
        }

        if (currentPageId !== "messages") {
          unreadMessagesCount++;
          setNavNotification(navMessages, unreadMessagesCount > 0);
          updateNotificationsUI();
          addNotification("message", `New message from ${fromLabel}`);
          showToast(`New message from ${fromLabel}`);
        } else {
          if (
            (activeConversationKey === "admin" &&
              (role === "teacher" || role === "prof")) ||
            (activeConversationKey === "teacher" && role === "admin")
          ) {
            unreadMessagesCount++;
            setNavNotification(navMessages, unreadMessagesCount > 0);
            updateNotificationsUI();
            addNotification("message", `New message from ${fromLabel}`);
            showToast(`New message from ${fromLabel}`);
          }
        }
      });

      syncChatUI();
    },
    (err) => {
      console.error("[student] thread snapshot error:", err);
    }
  );
}

/* -------------------- Assigned Teacher lookup -------------------- */

async function findAssignedTeacherForStudent(profileData) {
  const course = profileData.course || profileData.program || "";
  const section = profileData.section || profileData.classSection || "";
  const yearRaw = profileData.year || profileData.yearLevel || "";
  const year = yearKey(yearRaw);

  if (!course || !section || !year) return null;

  try {
    const qSec = query(
      collection(db, "sections"),
      where("course", "==", course),
      where("name", "==", section),
      where("year", "==", year)
    );
    const secSnap = await getDocs(qSec);
    if (secSnap.empty) return null;
    const secDoc = secSnap.docs[0];
    const sectionId = secDoc.id;

    const qTeach = query(
      collection(db, "teaching"),
      where("sectionId", "==", sectionId)
    );
    const tSnap = await getDocs(qTeach);
    if (tSnap.empty) return null;

    const tDoc = tSnap.docs[0].data();
    return {
      teacherUid: tDoc.teacherUid,
      sectionId,
    };
  } catch (err) {
    console.error(
      "[student] findAssignedTeacherForStudent error:",
      err
    );
    return null;
  }
}

/* -------------------- Profile hydrate -------------------- */

async function backfillEmptyProfile(user, data) {
  if (data) return null;

  const patch = {
    uid: user.uid,
    role: "student",
    name: user.displayName || "Student",
    email: user.email || "",
  };
  try {
    await setDoc(doc(db, "users", user.uid), patch, { merge: true });
    return patch;
  } catch (e) {
    console.warn("[student.js] backfill failed:", e);
    return null;
  }
}

function applyProfileToUI(data, user) {
  const name = coerceStr(
    data?.name || user?.displayName || "Student"
  ).trim();
  const email = coerceStr(user?.email || data?.email || "—").trim();
  const studentId = coerceStr(
    data?.studentId ?? data?.studentIdNumber ?? data?.id ?? "—"
  ).trim();

  const KNOWN_COURSES = [
    "Computer Programming",
    "Food Service Management",
    "Electrical Technology",
    "Electronics Technology",
    "Automotive Technology",
    "CP",
    "FSM",
    "ET",
    "ELECTRICAL TECHNOLOGY",
    "ELECTRONICS TECHNOLOGY",
    "AUTOMOTIVE TECHNOLOGY",
  ].map((c) => c.trim());

  let course = "";

  if (data) {
    course = coerceStr(data.course ?? data.program ?? "").trim();
  }

  if (!course && data && typeof data === "object") {
    const keys = Object.keys(data);
    for (const k of keys) {
      const kl = k.toLowerCase();
      if (
        kl.includes("course") ||
        kl.includes("program") ||
        kl.includes("strand") ||
        kl.includes("track") ||
        kl.includes("major")
      ) {
        const val = coerceStr(data[k]).trim();
        if (val) {
          course = val;
          break;
        }
      }
    }
  }

  if (!course && data && typeof data === "object") {
    const lowerKnown = KNOWN_COURSES.map((c) => c.toLowerCase());
    for (const val of Object.values(data)) {
      if (typeof val === "string") {
        const vTrim = val.trim();
        const idx = lowerKnown.indexOf(vTrim.toLowerCase());
        if (idx !== -1) {
          course = KNOWN_COURSES[idx];
          break;
        }
      }
    }
  }

  if (course) {
    const courseMap = {
      cp: "Computer Programming",
      "computer programming": "Computer Programming",

      fsm: "Food Service Management",
      "food service management": "Food Service Management",

      et: "Electronics Technology",
      "electronics technology": "Electronics Technology",

      "electrical technology": "Electrical Technology",
      "elect tech": "Electrical Technology",
      "electrical tech": "Electrical Technology",

      at: "Automotive Technology",
      auto: "Automotive Technology",
      "auto tech": "Automotive Technology",
      "automotive technology": "Automotive Technology",
    };

    const norm = course.trim().toLowerCase();
    if (courseMap[norm]) {
      course = courseMap[norm];
    }
  }

  if (!course) course = "—";

  const rawYear = coerceStr(
    data?.year ?? data?.yearLevel ?? ""
  ).trim();
  const year = rawYear ? String(rawYear) : "";
  const section = coerceStr(
    data?.section ?? data?.classSection ?? "—"
  ).trim();

  sidebarName && (sidebarName.textContent = name || "Student");
  sidebarRole &&
    (sidebarRole.textContent = `ID: ${studentId || "—"}`);

  profileStudentName &&
    (profileStudentName.textContent = name || "Student");
  profileStudentId &&
    (profileStudentId.textContent = `Student ID: ${
      studentId || "—"
    }`);
  setInitials(
    [document.getElementById("sidebarAvatar"), profileInitials],
    name || "Student"
  );

  p_name && (p_name.textContent = name || "—");
  p_email && (p_email.textContent = email || "—");
  p_studentId && (p_studentId.textContent = studentId || "—");
  p_course && (p_course.textContent = course || "—");
  p_year && (p_year.textContent = year || "—");
  p_section && (p_section.textContent = section || "—");

  if (
    selectYearLevel &&
    year &&
    ["1", "2", "3", "4", "5"].includes(year)
  ) {
    selectYearLevel.value = year;
  }

  currentProfile = {
    ...(data || {}),
    name,
    email,
    course,
    year,
    section,
    studentId,
  };
}

/* -------------------- Profile Edit -------------------- */

let profileEditMode = false;

function enterProfileEdit() {
  if (!currentProfile || profileEditMode) return;
  profileEditMode = true;

  if (p_name) {
    p_name.innerHTML = `<input type="text" id="edit_name" class="form-control" value="${escapeHTML(
      currentProfile.name || ""
    )}" />`;
  }
  if (p_studentId) {
    p_studentId.innerHTML = `<input type="text" id="edit_studentId" class="form-control" value="${escapeHTML(
      currentProfile.studentId || ""
    )}" />`;
  }
  if (p_course) {
    p_course.innerHTML = `<input type="text" id="edit_course" class="form-control" value="${escapeHTML(
      currentProfile.course || ""
    )}" />`;
  }
  if (p_year) {
    p_year.innerHTML = `<input type="text" id="edit_year" class="form-control" value="${escapeHTML(
      currentProfile.year || ""
    )}" />`;
  }
  if (p_section) {
    p_section.innerHTML = `<input type="text" id="edit_section" class="form-control" value="${escapeHTML(
      currentProfile.section || ""
    )}" />`;
  }

  if (editProfileBtn) editProfileBtn.style.display = "none";
  if (saveProfileBtn) saveProfileBtn.style.display = "";
  if (cancelProfileBtn) cancelProfileBtn.style.display = "";
}

function exitProfileEdit(reset = false) {
  profileEditMode = false;

  if (reset && currentProfile && currentAuthUser) {
    applyProfileToUI(currentProfile, currentAuthUser);
  }

  if (editProfileBtn) editProfileBtn.style.display = "";
  if (saveProfileBtn) saveProfileBtn.style.display = "none";
  if (cancelProfileBtn) cancelProfileBtn.style.display = "none";
}

async function saveProfileChanges() {
  if (!currentProfile || !currentAuthUser) return;

  const nameInput = document.getElementById("edit_name");
  const idInput = document.getElementById("edit_studentId");
  const courseInput = document.getElementById("edit_course");
  const yearInput = document.getElementById("edit_year");
  const sectionInput = document.getElementById("edit_section");

  const name = (nameInput?.value || "").trim() || "Student";
  const studentId = (idInput?.value || "").trim();
  const course = (courseInput?.value || "").trim();
  const year = (yearInput?.value || "").trim();
  const section = (sectionInput?.value || "").trim();

  try {
    const ref = doc(db, "users", currentAuthUser.uid);
    await setDoc(
      ref,
      {
        name,
        studentId,
        studentIdNumber: studentId,
        course,
        program: course,
        year,
        yearLevel: year,
        section,
        classSection: section,
      },
      { merge: true }
    );

    try {
      await updateProfile(currentAuthUser, { displayName: name });
    } catch (e) {
      console.warn("updateProfile failed:", e);
    }

    currentProfile = {
      ...currentProfile,
      name,
      studentId,
      course,
      year,
      section,
    };

    applyProfileToUI(currentProfile, currentAuthUser);
    showToast("Profile updated.");
    exitProfileEdit(false);
  } catch (err) {
    console.error("saveProfileChanges error:", err);
    showToast("Failed to update profile.", "error");
  }
}

editProfileBtn?.addEventListener("click", () => {
  enterProfileEdit();
});
saveProfileBtn?.addEventListener("click", () => {
  saveProfileChanges();
});
cancelProfileBtn?.addEventListener("click", () => {
  exitProfileEdit(true);
});

/* -------------------- SUBJECTS TAKEN (filter + edit/delete) -------------------- */

let subjectsFeatureInitialized = false;

function initSubjectsTakenFeature(user) {
  if (subjectsFeatureInitialized) return;
  subjectsFeatureInitialized = true;

  const subjectsYearLevel =
    document.getElementById("subjectsYearLevel");
  const subjectsSem = document.getElementById("subjectsSem");
  const subjectsTableBody =
    document.getElementById("subjectsTableBody");
  const addSubjectRowBtn =
    document.getElementById("addSubjectRowBtn");
  const clearSubjectsBtn =
    document.getElementById("clearSubjectsBtn");
  const saveSubjectsBtn =
    document.getElementById("saveSubjectsBtn");

  if (!subjectsTableBody || !subjectsYearLevel || !subjectsSem)
    return;

  const getEmptyRowHtml = () => `
    <tr data-empty="true">
      <td colspan="6" class="muted">
        Click "Add Subject" para maglagay ng subject sa napiling year at sem.
      </td>
    </tr>
  `;

  addSubjectRowBtn?.addEventListener("click", () => {
    const emptyRow =
      subjectsTableBody.querySelector('tr[data-empty="true"]');
    if (emptyRow) emptyRow.remove();

    const currentYear = subjectsYearLevel.value;
    const currentSem = subjectsSem.value;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <input type="text" class="form-control" placeholder="Course Name" />
      </td>
      <td>
        <input type="text" class="form-control" placeholder="Course Code" />
      </td>
      <td>
        <input type="number" class="form-control" min="0" step="0.5" placeholder="Units" />
      </td>
      <td class="subjects-year">${escapeHTML(currentYear)}</td>
      <td class="subjects-sem">${escapeHTML(currentSem)}</td>
      <td class="subjects-actions">
        <button type="button" class="btn-icon btn-delete" title="Remove row">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    subjectsTableBody.appendChild(tr);
  });

  clearSubjectsBtn?.addEventListener("click", () => {
    subjectsTableBody.innerHTML = getEmptyRowHtml();
    showToast("Subjects list cleared.");
  });

  saveSubjectsBtn?.addEventListener("click", async () => {
    const rows = Array.from(
      subjectsTableBody.querySelectorAll("tr")
    );
    const batchSubjects = [];

    rows.forEach((row) => {
      if (row.dataset.empty === "true") return;

      const inputs = row.querySelectorAll("input");
      if (!inputs.length) return;

      const courseName = inputs[0].value.trim();
      const courseCode = inputs[1].value.trim();
      const units = parseFloat(inputs[2].value) || 0;

      const year =
        row.querySelector(".subjects-year")?.textContent.trim() ||
        "";
      const sem =
        row.querySelector(".subjects-sem")?.textContent.trim() ||
        "";

      if (!courseName && !courseCode) return;

      const profile = currentProfile || {};
      const studentCourse = profile.course || profile.program || "";
      const studentSection =
        profile.section || profile.classSection || "";
      const studentYear =
        profile.year || profile.yearLevel || year || "";

      batchSubjects.push({
        courseName,
        courseCode,
        units,
        yearLevel: year || studentYear,
        semester: sem,
        year: year || studentYear,
        sem,
        createdAt: serverTimestamp(),
        studentUid: user.uid,
        studentName:
          user.displayName || profile.name || "",
        course: studentCourse,
        section: studentSection,
        studentId: profile.studentId || "",
        status: "Pending",
      });
    });

    if (!batchSubjects.length) {
      showToast("Walang subjects na ise-save.", "error");
      return;
    }

    try {
      const colRef = collection(
        db,
        "users",
        user.uid,
        "subjectsTaken"
      );
      for (const subj of batchSubjects) {
        await addDoc(colRef, subj);
      }
      showToast("Subjects saved.");
      await loadSubjects();
    } catch (err) {
      console.error("Error saving subjects:", err);
      showToast("Error saving subjects.", "error");
    }
  });

  async function loadSubjects() {
    const selectedYear = subjectsYearLevel.value;
    const selectedSem = subjectsSem.value;

    const colRef = collection(
      db,
      "users",
      user.uid,
      "subjectsTaken"
    );
    const qRef = query(
      colRef,
      where("year", "==", selectedYear),
      where("sem", "==", selectedSem)
    );

    const snap = await getDocs(qRef);

    subjectsTableBody.innerHTML = "";

    if (snap.empty) {
      subjectsTableBody.innerHTML = getEmptyRowHtml();
      return;
    }

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const tr = document.createElement("tr");
      tr.dataset.id = docSnap.id;
      tr.innerHTML = `
        <td class="cell-name">${escapeHTML(
          d.courseName || ""
        )}</td>
        <td class="cell-code">${escapeHTML(
          d.courseCode || ""
        )}</td>
        <td class="cell-units">${d.units ?? ""}</td>
        <td class="subjects-year">${escapeHTML(
          d.year || d.yearLevel || ""
        )}</td>
        <td class="subjects-sem">${escapeHTML(
          d.sem || d.semester || ""
        )}</td>
        <td class="subjects-actions">
          <button type="button" class="btn-icon btn-edit" title="Edit">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" class="btn-icon btn-delete" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      subjectsTableBody.appendChild(tr);
    });
  }

  subjectsTableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const tr = btn.closest("tr");
    if (!tr || tr.dataset.empty === "true") return;

    if (btn.classList.contains("btn-delete")) {
      const docId = tr.dataset.id;

      if (!docId) {
        tr.remove();
        if (!subjectsTableBody.querySelector("tr")) {
          subjectsTableBody.innerHTML = getEmptyRowHtml();
        }
        return;
      }

      const ok = confirm("Delete this subject?");
      if (!ok) return;

      try {
        const subjRef = doc(
          db,
          "users",
          user.uid,
          "subjectsTaken",
          docId
        );
        await deleteDoc(subjRef);
        showToast("Subject deleted.");
        await loadSubjects();
      } catch (err) {
        console.error("Error deleting subject:", err);
        showToast("Error deleting subject.", "error");
      }
      return;
    }

    if (btn.classList.contains("btn-edit")) {
      const nameCell = tr.querySelector(".cell-name");
      const codeCell = tr.querySelector(".cell-code");
      const unitsCell = tr.querySelector(".cell-units");

      const nameVal = nameCell.textContent.trim();
      const codeVal = codeCell.textContent.trim();
      const unitsVal = unitsCell.textContent.trim();

      nameCell.innerHTML = `<input type="text" class="form-control" value="${escapeHTML(
        nameVal
      )}" />`;
      codeCell.innerHTML = `<input type="text" class="form-control" value="${escapeHTML(
        codeVal
      )}" />`;
      unitsCell.innerHTML = `<input type="number" class="form-control" min="0" step="0.5" value="${escapeHTML(
        unitsVal
      )}" />`;

      btn.classList.remove("btn-edit");
      btn.classList.add("btn-save");
      btn.title = "Save";
      btn.innerHTML = `<i class="fas fa-save"></i>`;
      return;
    }

    if (btn.classList.contains("btn-save")) {
      const docId = tr.dataset.id;
      if (!docId) return;

      const nameInput =
        tr.querySelector(".cell-name input");
      const codeInput =
        tr.querySelector(".cell-code input");
      const unitsInput =
        tr.querySelector(".cell-units input");
      const yearCell = tr.querySelector(".subjects-year");
      const semCell = tr.querySelector(".subjects-sem");

      const courseName = nameInput.value.trim();
      const courseCode = codeInput.value.trim();
      const units = parseFloat(unitsInput.value) || 0;
      const year = yearCell.textContent.trim();
      const sem = semCell.textContent.trim();

      try {
        const subjRef = doc(
          db,
          "users",
          user.uid,
          "subjectsTaken",
          docId
        );
        await updateDoc(subjRef, {
          courseName,
          courseCode,
          units,
          yearLevel: year,
          semester: sem,
          year,
          sem,
        });
        showToast("Subject updated.");
        await loadSubjects();
      } catch (err) {
        console.error("Error updating subject:", err);
        showToast("Error updating subject.", "error");
      }
    }
  });

  subjectsYearLevel.addEventListener("change", () => {
    loadSubjects().catch(console.error);
  });
  subjectsSem.addEventListener("change", () => {
    loadSubjects().catch(console.error);
  });

  loadSubjects().catch(console.error);
}

/* -------------------- Grades real-time notifications -------------------- */

// central handler kapag may nakita tayong change sa kahit anong grades source
async function handleGradeChange(user, recRaw) {
  const rec = normalizeGrade(recRaw || {});
  const subj =
    (rec.title && rec.title !== "—" && rec.title) ||
    rec.code ||
    "a subject";

  // 🔔 laging mag-add ng notification + toast
  addNotification("grade", `Your grade in ${subj} was updated.`);
  showToast(`Your grade in ${subj} was updated.`);

  // badge sa bell + sidebar only kapag HINDI nasa "My Grades" page
  if (currentPageId !== "grades") {
    unreadGradesCount++;
    setNavNotification(navGrades, unreadGradesCount > 0);
    updateNotificationsUI();
  }

  // auto-refresh summary table kung same year & sem ang kasalukuyang view
  if (selectYearLevel && selectSem && currentPageId === "grades") {
    const curYear = selectYearLevel.value;
    const curSem = selectSem.value;
    if (rec.yearLevel && rec.semester) {
      if (
        String(rec.yearLevel) === String(curYear) &&
        String(rec.semester) === String(curSem)
      ) {
        try {
          const rows = await fetchGradesForTerm(
            user,
            rec.yearLevel,
            rec.semester
          );
          renderSummary(rows, rec.yearLevel, rec.semester);
        } catch (e) {
          console.warn("auto-refresh summary failed:", e);
        }
      }
    }
  }
}

function bindGradesListener(user) {
  // clean existing listeners
  if (gradesUnsubSubcollection) gradesUnsubSubcollection();
  if (gradesUnsubRoot) gradesUnsubRoot();
  gradesListenerReadySub = false;
  gradesListenerReadyRoot = false;

  const subColRef = collection(db, "users", user.uid, "grades");
  const rootGradesRef = collection(db, "grades");

  // listener sa users/{uid}/grades
  gradesUnsubSubcollection = onSnapshot(
    subColRef,
    (snap) => {
      if (!gradesListenerReadySub) {
        gradesListenerReadySub = true;
        return;
      }
      snap.docChanges().forEach((change) => {
        if (change.type !== "added" && change.type !== "modified") return;
        const data = change.doc.data();
        handleGradeChange(user, data);
      });
    },
    (err) => {
      console.error("[student] grades subcollection snapshot error:", err);
    }
  );

  // listener sa root "grades" na may studentUid == current user
  const rootQuery = query(rootGradesRef, where("studentUid", "==", user.uid));
  gradesUnsubRoot = onSnapshot(
    rootQuery,
    (snap) => {
      if (!gradesListenerReadyRoot) {
        gradesListenerReadyRoot = true;
        return;
      }
      snap.docChanges().forEach((change) => {
        if (change.type !== "added" && change.type !== "modified") return;
        const data = change.doc.data();
        handleGradeChange(user, data);
      });
    },
    (err) => {
      console.error("[student] grades root snapshot error:", err);
    }
  );
}

/* -------------------- Auth guard + presence -------------------- */

// LOGOUT BUTTON: mark offline muna bago signOut
logoutBtn?.addEventListener("click", async () => {
  if (auth.currentUser) {
    await setOnlineStatus(auth.currentUser, false);
  }
  await signOut(auth);
  window.location.href = "auth.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // user not signed in
    currentAuthUser = null;
    if (presenceInterval) {
      clearInterval(presenceInterval);
      presenceInterval = null;
    }
    window.location.href = "auth.html";
    return;
  }

  currentAuthUser = user;

  // 🔴 Presence: mark online + heartbeat
  await setOnlineStatus(user, true);

  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = setInterval(() => {
    // keep lastSeenAt fresh while page is open
    setOnlineStatus(auth.currentUser, true);
  }, 60 * 1000); // every 60s

  window.addEventListener("beforeunload", () => {
    if (presenceInterval) {
      clearInterval(presenceInterval);
      presenceInterval = null;
    }
    // best effort, may or may not finish on unload
    setOnlineStatus(auth.currentUser, false);
  });

  printSummaryBtn?.addEventListener("click", () => window.print());
  generateSummaryBtn?.addEventListener("click", async () => {
    await handleGenerate(user);
  });

  try {
    const ref = doc(db, "users", user.uid);
    let snap = await getDoc(ref);
    let data = snap.exists() ? snap.data() : null;

    const patched = await backfillEmptyProfile(user, data);
    if (patched) {
      snap = await getDoc(ref);
      data = snap.exists() ? snap.data() : null;
    }

    applyProfileToUI(data, user);

    initSubjectsTakenFeature(user);

    const assigned = await findAssignedTeacherForStudent(
      data || {}
    );
    TEACHER_FOR_CHAT = assigned?.teacherUid || null;

    if (TEACHER_FOR_CHAT) {
      TEACHER_NAME_FOR_CHAT = await getTeacherName(
        TEACHER_FOR_CHAT
      );
      subscribeToTeacherProfile(TEACHER_FOR_CHAT);
    }

    await ensureAdminThreadDoc(user);

    bindRealtimeThreads(user);
    bindGradesListener(user);

    const handleSend = async () => {
      const me = auth.currentUser;
      const text = (chatInput?.value || "").trim();

      if (!me) return showToast("You are not signed in.", "error");
      if (!text) return;

      try {
        if (
          activeConversationKey === "teacher" &&
          TEACHER_FOR_CHAT
        ) {
          await sendMessageToTeacher(me, text);
        } else {
          await sendMessageToAdmin(me, text);
        }
        chatInput.value = "";
      } catch (err) {
        console.error("send message failed:", err);
        showToast("Failed to send message.", "error");
      }
    };

    chatSend?.addEventListener("click", handleSend);
    chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  } catch (err) {
    console.error("student auth guard:", err);
    applyProfileToUI(null, user);

    try {
      await ensureAdminThreadDoc(user);
      bindRealtimeThreads(user);
      bindGradesListener(user);
    } catch (e) {
      console.error(e);
    }
  }

  if (!currentPageId) {
    showPage("grades");
  }

  renderNotifList();
});
