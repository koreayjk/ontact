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

  // 내 강의실 섹션/메뉴 표시 토글
  const sec = document.getElementById("myclass");
  const link = document.getElementById("myclassLink");
  if (sec)  sec.style.display  = user ? "block" : "none";
  if (link) link.style.display = user ? "" : "none";
  if (user) loadMyBookings();

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

  initBooking();   // 4단계: 강사·예약 연결
});

/* =========================================================
   4단계 — 강사·예약 연결 (Supabase teachers / class_slots / bookings)
   ========================================================= */
const COLORS = ["c1", "c2", "c3", "c4"];
let selTeacher = null;     // {id, name}
let selSlot = null;        // {id, start_at}

function fmtSlot(iso) {
  const d = new Date(iso);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function initBooking() {
  const cardsBox = document.querySelector(".tcards");
  const tPills   = document.querySelector('.pills[data-group="t"]');
  if (!cardsBox || !tPills) return;   // 예약 섹션이 없으면 건너뜀

  // 요일 선택 칸은 사용하지 않으므로 숨김 (예약 가능 시간 목록으로 대체)
  const dPills = document.querySelector('.pills[data-group="d"]');
  if (dPills) { dPills.style.display = "none"; if (dPills.previousElementSibling) dPills.previousElementSibling.style.display = "none"; }
  const hPills = document.querySelector('.pills[data-group="h"]');
  if (hPills && hPills.previousElementSibling) hPills.previousElementSibling.textContent = "예약 가능 시간 (20분 집중수업)";

  // DB에서 강사 불러오기
  const { data: teachers, error } = await sb
    .from("teachers").select("id, display_name, intro, specialties")
    .eq("is_active", true).order("display_name");
  if (error) { console.error(error); return; }
  if (!teachers || !teachers.length) { cardsBox.innerHTML = "<p>등록된 강사가 없습니다.</p>"; return; }

  // 강사 카드 그리기
  cardsBox.innerHTML = teachers.map((t, i) => `
    <div class="tcard">
      <div class="av ${COLORS[i % 4]}"><span>${(t.display_name || "T").replace("Tr. ", "").charAt(0)}</span><span class="free">예약가능</span></div>
      <div class="meta"><b>${t.display_name || ""}</b><div class="role">${t.specialties || ""}</div><div class="rt">${t.intro || ""}</div></div>
    </div>`).join("");

  // 강사 선택 칩 그리기
  tPills.innerHTML = teachers.map((t, i) =>
    `<span class="pill-opt${i === 0 ? " sel" : ""}" data-id="${t.id}">${(t.display_name || "").replace("Tr. ", "")}</span>`
  ).join("");
  tPills.querySelectorAll(".pill-opt").forEach(p => {
    p.onclick = () => { tPills.querySelectorAll(".pill-opt").forEach(x => x.classList.remove("sel")); p.classList.add("sel"); pickTeacher(p.dataset.id, p.textContent); };
  });

  // 예약 버튼 연결
  const bookBtn = document.querySelector(".bk-panel a.btn-primary");
  if (bookBtn) bookBtn.onclick = (e) => { e.preventDefault(); doBooking(); };

  // 첫 강사 자동 선택
  pickTeacher(teachers[0].id, teachers[0].display_name);
}

async function pickTeacher(id, name) {
  selTeacher = { id, name }; selSlot = null;
  const hPills = document.querySelector('.pills[data-group="h"]');
  if (!hPills) return;
  hPills.innerHTML = "<span style='font-size:.85rem;color:#6b7785'>불러오는 중…</span>";

  const { data: slots, error } = await sb
    .from("class_slots").select("id, start_at")
    .eq("teacher_id", id).eq("status", "open")
    .gt("start_at", new Date().toISOString())
    .order("start_at").limit(12);
  if (error) { console.error(error); return; }

  if (!slots || !slots.length) { hPills.innerHTML = "<span style='font-size:.85rem;color:#6b7785'>예약 가능한 시간이 없습니다.</span>"; return; }
  hPills.innerHTML = slots.map(s => `<span class="pill-opt" data-id="${s.id}" data-start="${s.start_at}">${fmtSlot(s.start_at)}</span>`).join("");
  hPills.querySelectorAll(".pill-opt").forEach(p => {
    p.onclick = () => { hPills.querySelectorAll(".pill-opt").forEach(x => x.classList.remove("sel")); p.classList.add("sel"); selSlot = { id: p.dataset.id, start_at: p.dataset.start }; };
  });
}

async function doBooking() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { openAuth("login"); return; }            // 로그인 필요
  if (!selTeacher) { alert("강사를 선택하세요."); return; }
  if (!selSlot)    { alert("예약 가능한 시간을 선택하세요."); return; }

  const bookBtn = document.querySelector(".bk-panel a.btn-primary");
  const oldTxt = bookBtn ? bookBtn.textContent : "";
  if (bookBtn) { bookBtn.textContent = "예약 중…"; bookBtn.style.pointerEvents = "none"; }

  // 함수가 [중복확인 → 줌 생성 → 예약 저장 → 슬롯 잠금]을 한 번에 처리
  const { data, error } = await sb.functions.invoke("create-zoom-meeting", {
    body: {
      student_id: user.id,
      teacher_id: selTeacher.id,
      slot_id: Number(selSlot.id),
      start_at: selSlot.start_at,
      topic: `${selTeacher.name} 와의 1:1 영어수업`
    }
  });

  if (bookBtn) { bookBtn.textContent = oldTxt; bookBtn.style.pointerEvents = ""; }

  if ((error) || !data || data.error || !data.ok) {
    alert("예약 실패: " + (data?.error || error?.message || "알 수 없는 오류"));
    console.error(error || data);
    pickTeacher(selTeacher.id, selTeacher.name);   // 시간 목록 새로고침
    return;
  }

  alert(`예약 완료!\n${selTeacher.name} · ${fmtSlot(selSlot.start_at)}\n줌 수업방이 만들어졌어요. '내 강의실'에서 입장하세요.`);
  selSlot = null;
  pickTeacher(selTeacher.id, selTeacher.name);   // 예약된 시간은 목록에서 사라짐
  loadMyBookings();
}

/* ---------- 내 강의실: 내 예약 목록 ---------- */
async function loadMyBookings() {
  const box = document.getElementById("myBookings");
  if (!box) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const { data, error } = await sb
    .from("bookings")
    .select("id, start_at, status, payment_status, zoom_join_url, teachers(display_name)")
    .eq("student_id", user.id)
    .order("start_at");
  if (error) { console.error(error); return; }

  if (!data || !data.length) {
    box.innerHTML = '<div class="mc-empty">아직 예약한 수업이 없습니다. 위 \'강사·예약\'에서 첫 수업을 예약해 보세요.</div>';
    return;
  }

  const stLabel = { reserved: "예약됨", completed: "수업완료", cancelled: "취소됨", no_show: "노쇼" };
  const payLabel = { unpaid: "미결제", paid: "결제완료", free: "무료" };

  box.innerHTML = data.map(b => {
    const d = new Date(b.start_at);
    const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    const p = (n) => String(n).padStart(2, "0");
    const tname = b.teachers ? b.teachers.display_name : "강사";
    return `
      <div class="mc-card">
        <div class="mc-when">${d.getMonth() + 1}/${d.getDate()}<small>${wd} ${p(d.getHours())}:${p(d.getMinutes())}</small></div>
        <div class="mc-info">
          <b>${tname} 와의 1:1 수업</b>
          <div class="mc-sub">
            <span class="mc-badge b-reserved">${stLabel[b.status] || b.status}</span>
            <span class="mc-badge b-unpaid">${payLabel[b.payment_status] || b.payment_status}</span>
          </div>
        </div>
        ${b.zoom_join_url
          ? `<a class="mc-zoom" href="${b.zoom_join_url}" target="_blank" rel="noopener" style="opacity:1;text-decoration:none;display:inline-flex;align-items:center">줌 입장</a>`
          : `<button class="mc-zoom" title="줌 링크 준비중" disabled>줌 입장 (준비중)</button>`}
      </div>`;
  }).join("");
}
