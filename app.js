/* =========================================================
   온택잉글리쉬 - Supabase 연결 (3단계: 로그인/회원가입)
   index.html 과 같은 폴더에 두세요.
   ========================================================= */

/* ▼▼▼ 여기 두 줄을 본인 값으로 바꾸세요 (Settings > API) ▼▼▼ */
const SUPABASE_URL      = "https://nhydhyolgrhsykdcqfzb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeWRoeW9sZ3Joc3lrZGNxZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTk1OTAsImV4cCI6MjA5NTk5NTU5MH0.s3qPFFN-4zMLAt-dtkOwzakCj-pkglKgbhyUR9uu4xs";
/* ▲▲▲ 위 두 줄만 바꾸면 됩니다 ▲▲▲ */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- 모달 열기/닫기 ---------- */
const modal = document.getElementById("authModal");
function openAuth(tab) { showTab(tab || "login"); modal.classList.add("show"); modal.style.display = "flex"; }
function closeAuth()  { modal.classList.remove("show"); modal.style.display = "none"; msg(""); }

function showTab(tab) {
  document.getElementById("tab-login").classList.toggle("on", tab === "login");
  document.getElementById("tab-signup").classList.toggle("on", tab === "signup");
  document.getElementById("nameRow").style.display = tab === "signup" ? "block" : "none";
  document.getElementById("authSubmit").textContent = tab === "signup" ? "회원가입" : "로그인";
  modal.dataset.tab = tab;
  msg("");
}
function msg(t, ok) {
  const m = document.getElementById("authMsg");
  m.textContent = t; m.style.color = ok ? "#2c7a73" : "#d4512c";
}

/* ---------- 회원가입 / 로그인 제출 ---------- */
async function submitAuth() {
  const email = document.getElementById("authEmail").value.trim();
  const pw    = document.getElementById("authPw").value;
  const name  = document.getElementById("authName").value.trim();
  if (!email || !pw) { msg("이메일과 비밀번호를 입력하세요."); return; }

  if (modal.dataset.tab === "signup") {
    const { error } = await sb.auth.signUp({
      email, password: pw,
      options: { data: { full_name: name } }   // profiles 트리거가 이 이름을 사용
    });
    if (error) { msg("가입 실패: " + error.message); return; }
    msg("가입 완료! 바로 이용하실 수 있어요.", true);
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) { msg("로그인 실패: " + error.message); return; }
    msg("로그인 성공!", true);
  }
  setTimeout(closeAuth, 700);
}

async function logout() { await sb.auth.signOut(); }

/* ---------- 로그인 상태에 따라 버튼 바꾸기 ---------- */
async function refreshAuthUI() {
  const { data: { user } } = await sb.auth.getUser();
  const btn = document.getElementById("authBtn");
  if (!btn) return;
  if (user) {
    const name = user.user_metadata?.full_name || user.email.split("@")[0];
    btn.textContent = name + " 님 · 로그아웃";
    btn.onclick = (e) => { e.preventDefault(); logout(); };
  } else {
    btn.textContent = "로그인";
    btn.onclick = (e) => { e.preventDefault(); openAuth("login"); };
  }
}

/* ---------- 초기화 ---------- */
document.addEventListener("DOMContentLoaded", () => {
  refreshAuthUI();
  sb.auth.onAuthStateChange(() => refreshAuthUI());

  document.getElementById("tab-login").onclick  = () => showTab("login");
  document.getElementById("tab-signup").onclick = () => showTab("signup");
  document.getElementById("authSubmit").onclick = submitAuth;
  document.getElementById("authClose").onclick  = closeAuth;
  modal.addEventListener("click", (e) => { if (e.target === modal) closeAuth(); });

  // "무료 레벨테스트 / 수강신청" 버튼을 누르면 로그인 안 했을 때 가입창 열기
  document.querySelectorAll('a[href="#cta"], a[href="#book"]').forEach(a => {
    // (예약은 4단계에서 연결합니다. 지금은 그대로 둬도 됩니다.)
  });
});
