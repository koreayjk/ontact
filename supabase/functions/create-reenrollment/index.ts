// ============================================================
// 온택 - 재등록 (Re-enrollment)
// 함수 이름: create-reenrollment
//
// 수정: 강사 개인 줌 컬럼명 정정(zoom_account_id 등) + PMI 우선,
//       bookings 시각 PHT(+08:00) 정정.
// ============================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRICE_PER_MONTH = 60000;
const WEEKDAYS_TARGET = [1, 2, 4, 5]; // 월=1, 화=2, 목=4, 금=5
const looksAscii = (s) => /^[\x20-\x7E]+$/.test(s);

// 강사/공용 자격증명으로 1:1 반복 줌 미팅 생성 → {id, join, start} | null
async function createZoom(ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET) {
  ACCOUNT_ID = (ACCOUNT_ID || "").trim();
  CLIENT_ID = (CLIENT_ID || "").trim();
  CLIENT_SECRET = (CLIENT_SECRET || "").trim();
  if (!ACCOUNT_ID || !CLIENT_ID || !CLIENT_SECRET) return null;
  if (!looksAscii(ACCOUNT_ID) || !looksAscii(CLIENT_ID) || !looksAscii(CLIENT_SECRET)) return null;
  try {
    const bytes = new TextEncoder().encode(`${CLIENT_ID}:${CLIENT_SECRET}`);
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    const basic = btoa(bin);
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ACCOUNT_ID)}`,
      { method: "POST", headers: { Authorization: `Basic ${basic}` } },
    );
    const token = await tokenRes.json();
    if (!token.access_token) { console.error("ZOOM token failed:", token); return null; }
    const mRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "ONTACT 1:1 English Class",
        type: 3,
        timezone: "Asia/Seoul",
        duration: 20,
        settings: { join_before_host: true, waiting_room: false, host_video: true, participant_video: true, use_pmi: false },
      }),
    });
    const meeting = await mRes.json();
    if (!meeting.join_url) { console.error("ZOOM meeting create failed:", meeting); return null; }
    return { id: String(meeting.id), join: meeting.join_url, start: meeting.start_url };
  } catch (e) { console.error("ZOOM call threw:", e); return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const { months, teacher_id, times, start_date } = await req.json();
    if (!months || !teacher_id || !start_date || !Array.isArray(times) || times.length === 0)
      return json({ error: "필수 정보가 누락됐습니다." }, 400);
    if (months < 1 || months > 6) return json({ error: "수강 기간은 1~6개월입니다." }, 400);

    const admin = createClient(Deno.env.get("PROJECT_URL"), Deno.env.get("SERVICE_ROLE_KEY"));
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "로그인 필요" }, 401);
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "로그인 정보가 유효하지 않습니다." }, 401);
    const student_id = user.id;

    const { data: activeEnrolls } = await admin.from("enrollments")
      .select("id, teacher_id, months, start_date")
      .eq("student_id", student_id).eq("status", "active");
    if (!activeEnrolls || activeEnrolls.length === 0)
      return json({ error: "재등록 자격이 없습니다. 활성 수강이 있어야 합니다." }, 400);

    const { data: pendingEnrolls } = await admin.from("enrollments")
      .select("id").eq("student_id", student_id)
      .in("status", ["pending_levelcheck", "pending_schedule"]);
    if (pendingEnrolls && pendingEnrolls.length > 0)
      return json({ error: "이미 진행 중인 수강 등록이 있습니다." }, 409);

    const [Y, M, D] = start_date.split("-").map(Number);
    if (!Y || !M || !D) return json({ error: "시작일이 잘못됐습니다." }, 400);
    function kstDate(y, m, d) { return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); }

    const startDow = kstDate(Y, M, D).getUTCDay();
    if (!WEEKDAYS_TARGET.includes(startDow))
      return json({ error: "시작일은 월·화·목·금 중에서만 선택 가능합니다." }, 400);

    const { data: lastBooking } = await admin.from("bookings")
      .select("start_at").eq("student_id", student_id).eq("is_cancelled", false)
      .order("start_at", { ascending: false }).limit(1).maybeSingle();
    if (lastBooking) {
      const lastDate = new Date(lastBooking.start_at);
      const newStartDate = kstDate(Y, M, D);
      const diffDays = (newStartDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 0) return json({ error: "시작일은 현재 수업이 끝난 후로 선택해주세요." }, 400);
      if (diffDays > 8) return json({ error: "시작일은 현재 수업 종료 후 7일 이내여야 합니다." }, 400);
    }

    const { data: existingTimes } = await admin
      .from("enrollments").select("slot_hm, student_id")
      .eq("teacher_id", teacher_id).eq("status", "active")
      .in("slot_hm", times).neq("student_id", student_id);
    if (existingTimes && existingTimes.length > 0)
      return json({ error: "이미 다른 학생이 신청한 시간대가 있습니다: " + existingTimes.map(e=>e.slot_hm).join(", ") }, 409);

    // ─── 줌: PMI 우선 → 강사 OAuth → 공용(env) ───
    let stz = null;
    const { data: existingZoom } = await admin.from("student_teacher_zoom")
      .select("zoom_meeting_id, zoom_join_url, zoom_start_url")
      .eq("student_id", student_id).eq("teacher_id", teacher_id).maybeSingle();
    if (existingZoom && existingZoom.zoom_join_url) {
      stz = existingZoom;
    } else {
      const { data: tz } = await admin.from("teacher_zoom")
        .select("pmi_url, zoom_account_id, zoom_client_id, zoom_client_secret")
        .eq("teacher_id", teacher_id).maybeSingle();
      let z = null;
      if (tz?.pmi_url) z = { id: null, join: tz.pmi_url, start: tz.pmi_url };
      if (!z && tz) z = await createZoom(tz.zoom_account_id, tz.zoom_client_id, tz.zoom_client_secret);
      if (!z) z = await createZoom(
        Deno.env.get("ZOOM_ACCOUNT_ID"), Deno.env.get("ZOOM_CLIENT_ID"), Deno.env.get("ZOOM_CLIENT_SECRET"),
      );
      const { data: inserted } = await admin.from("student_teacher_zoom").insert({
        student_id, teacher_id,
        zoom_meeting_id: z?.id || null, zoom_join_url: z?.join || null, zoom_start_url: z?.start || null,
      }).select().single();
      stz = inserted;
    }

    const totalPrice = months * PRICE_PER_MONTH;
    const totalDays = months * 4 * 7;
    const enrollments_out = [];
    let totalBookings = 0;
    let firstEnrollmentId = null;

    for (let i = 0; i < times.length; i++) {
      const hm = times[i];
      const [h, m] = hm.split(":").map(Number);

      const { data: enr, error: eErr } = await admin.from("enrollments").insert({
        student_id, teacher_id, months, start_date, slot_hm: hm,
        status: "active", payment_status: "paid",
        price: i === 0 ? months * PRICE_PER_MONTH : 0,
        leveltest_required: false, leveltest_done: true,
      }).select().single();
      if (eErr) { console.error("Enrollment insert error:", eErr); return json({ error: "수강 등록 실패: " + eErr.message }, 400); }
      enrollments_out.push(enr);
      if (i === 0) firstEnrollmentId = enr.id;

      const rows = [];
      for (let offset = 0; offset < totalDays; offset++) {
        const d = kstDate(Y, M, D + offset);
        const dow = d.getUTCDay();
        if (!WEEKDAYS_TARGET.includes(dow)) continue;
        const yy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const hh = String(h).padStart(2, "0");
        const mi = String(m).padStart(2, "0");
        // slot_hm 은 필리핀 시간(PHT, UTC+8) → 반드시 +08:00
        const iso = new Date(`${yy}-${mm}-${dd}T${hh}:${mi}:00+08:00`).toISOString();
        rows.push({
          enrollment_id: enr.id, student_id, teacher_id,
          start_at: iso, status: "reserved", payment_status: "paid", price: 0,
          zoom_meeting_id: stz?.zoom_meeting_id || null,
          zoom_join_url:   stz?.zoom_join_url   || null,
          zoom_start_url:  stz?.zoom_start_url  || null,
        });
      }
      if (rows.length > 0) {
        const { data: bks, error: bErr } = await admin.from("bookings").insert(rows).select("id");
        if (bErr) { console.error("Bookings insert error:", bErr); return json({ error: "수업 생성 실패: " + bErr.message }, 400); }
        totalBookings += bks.length;
      }
    }

    await admin.from("payments").insert({
      enrollment_id: firstEnrollmentId, student_id,
      amount: totalPrice, method: "test", status: "paid", paid_at: new Date().toISOString(),
    });

    return json({ ok: true, enrollments: enrollments_out.length, bookings: totalBookings, total_price: totalPrice, is_reenrollment: true });
  } catch (e) {
    console.error("Function error:", e);
    return json({ error: String(e) }, 500);
  }
});
