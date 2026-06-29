// ============================================================
// 온택 - 회원 탈퇴(계정 삭제) — 총관리자 전용
// 함수 이름: admin-delete-user
// 역할: admin.html 에서 호출. 호출자가 총관리자인지 확인 후
//       · 결제(수강) 진행 중이면 차단 (409)
//       · 관련 데이터 정리 후 auth 계정까지 완전 삭제
//
// 보안: SERVICE_ROLE_KEY 는 Supabase 가 Edge Function 에 자동 주입합니다
//       (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY)
//       → 별도 시크릿 설정 불필요. 대시보드 편집기로 바로 배포 가능.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";

// 서비스 롤로 REST 호출
const svcHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
};

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init.headers || {}) } });
}
// 의존 데이터 삭제 (실패해도 무시 — 테이블/컬럼이 없을 수 있음)
async function tryDelete(table: string, col: string, id: string) {
  try { await rest(`${table}?${col}=eq.${id}`, { method: "DELETE" }); } catch (_) { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (!URL || !SERVICE) return json({ ok: false, error: "서버 설정 오류(SERVICE_ROLE 미주입)" }, 500);

  // 1) 호출자 인증 — 총관리자만 허용
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return json({ ok: false, error: "로그인이 필요합니다." }, 401);

  const meRes = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: authHeader },
  });
  if (!meRes.ok) return json({ ok: false, error: "인증 실패" }, 401);
  const me = await meRes.json();
  const callerId = me?.id;
  if (!callerId) return json({ ok: false, error: "인증 실패" }, 401);

  const roleRes = await rest(`profiles?id=eq.${callerId}&select=role`);
  const roleRows = await roleRes.json().catch(() => []);
  if (!Array.isArray(roleRows) || roleRows[0]?.role !== "admin") {
    return json({ ok: false, error: "총관리자만 회원을 탈퇴시킬 수 있습니다." }, 403);
  }

  // 2) 대상 확인
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
  const userId = String(body.user_id || "");
  if (!userId) return json({ ok: false, error: "user_id 필요" }, 400);
  if (userId === callerId) return json({ ok: false, error: "본인 계정은 이 기능으로 탈퇴할 수 없습니다." }, 400);

  // 3) 결제(수강) 진행 중이면 차단
  const actRes = await rest(`enrollments?student_id=eq.${userId}&status=eq.active&select=id`);
  const active = await actRes.json().catch(() => []);
  if (Array.isArray(active) && active.length > 0) {
    return json({
      ok: false,
      blocked: true,
      error: "결제(수강)가 진행 중인 회원은 탈퇴할 수 없습니다. 수강 종료 또는 환불 처리 후 다시 시도해 주세요.",
    }, 409);
  }

  // 4) 의존 데이터 정리 (FK 순서 고려, 실패는 무시)
  // 학생으로서 참조
  await tryDelete("payments", "student_id", userId);
  await tryDelete("absences", "student_id", userId);
  await tryDelete("makeup_classes", "student_id", userId);
  await tryDelete("message_reads", "user_id", userId);
  await tryDelete("messages", "sender_id", userId);
  await tryDelete("announcement_reads", "user_id", userId);
  await tryDelete("leveltest_bookings", "student_id", userId);
  await tryDelete("level_test_results", "student_id", userId);
  await tryDelete("placement_tests", "student_id", userId);
  await tryDelete("student_notes", "student_id", userId);
  await tryDelete("student_feedback", "student_id", userId);
  await tryDelete("feedback", "student_id", userId);
  await tryDelete("bookings", "student_id", userId);
  await tryDelete("enrollments", "student_id", userId);
  // 강사로서 참조
  await tryDelete("bookings", "teacher_id", userId);
  await tryDelete("enrollments", "teacher_id", userId);
  await tryDelete("leveltest_slots", "teacher_id", userId);
  await tryDelete("group_classes", "teacher_id", userId);
  await tryDelete("teacher_zoom", "teacher_id", userId);
  await tryDelete("teacher_hours", "teacher_id", userId);
  await tryDelete("teacher_notes", "teacher_id", userId);
  await tryDelete("teachers", "id", userId);
  // 프로필
  await tryDelete("profiles", "id", userId);

  // 5) auth 계정 삭제
  const delRes = await fetch(`${URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!delRes.ok) {
    const t = await delRes.text().catch(() => "");
    return json({ ok: false, error: "계정 삭제 실패: " + t }, 502);
  }

  return json({ ok: true });
});
