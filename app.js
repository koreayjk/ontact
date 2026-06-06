// ============================================================
// 온택 메인(외부 소개용) - 간단 라우팅만
// 로그인/회원가입/예약은 login.html 이후의 역할별 페이지에서 처리
// ============================================================

// 로그인 버튼 → login.html 로 보내기 (옛 모달 차단)
const authBtn = document.getElementById("authBtn");
if (authBtn) {
  authBtn.setAttribute("href", "login.html");
  authBtn.onclick = (e) => {
    e.preventDefault();
    location.href = "login.html";
  };
}

// 옛 회원가입/예약/모달 트리거가 남아 있을 경우 모두 login.html 로
document.querySelectorAll("[data-open-auth], #signupBtn, #loginBtn").forEach(el => {
  el.onclick = (e) => { e.preventDefault(); location.href = "login.html"; };
});

// 옛 로그인 모달이 떠 있으면 강제로 닫기
const oldModal = document.getElementById("authModal");
if (oldModal) oldModal.style.display = "none";
