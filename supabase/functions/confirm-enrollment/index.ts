// ============================================================
// 온택 - 수강 확정 (Step 2: 1:1 레벨테스트 후 강사·시간·시작일 확정)
// 함수 이름: confirm-enrollment
//
// 수정: 강사 개인 줌(teacher_zoom) 컬럼명 정정(zoom_account_id 등) +
//       강사키 실패 시 공용(env)으로 자동 폴백.
// ============================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WEEKDAYS_TARGET = [1, 2, 4, 5]; // 월=1, 화=2, 목=4, 금=5
const looksAscii = (s) => /^[\x20-\x7E]+$/.test(s);

// 주어진 자격증명으로 1:1 반복 줌 미팅 생성 → 성공 시 {id, join, start}, 실패 시 null
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
    const { enrollment_id, teacher_id, times, start_date } = await req.json();
    if (!enrollment_id || !teacher_id || !start_date || !Array.isArray(times) || times.length === 0)
      return json({ error: "필수 정보가 누락됐습니다." }, 400);

    const admin = createClient(Deno.env.get("PROJECT_URL"), Deno.env.get("SERVICE_ROLE_KEY"));
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "로그인 필요" }, 401);
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "로그인 정보가 유효하지 않습니다." }, 401);
    const student_id = user.id;

    // ─── enrollment 검증 ───
    const { data: enr, error: getEnrErr } = await admin.from("enrollments")
      .select("*")
      .eq("id", enrollment_id)
      .eq("student_id", student_id)
      .single();
    if (getEnrErr || !enr) {
      return json({ error: "수강 정보를 찾을 수 없습니다." }, 404);
    }
    if (!["pending_levelcheck", "pending_schedule"].includes(enr.status)) {
      return json({ error: "이미 처리된 수강 등록입니다." }, 409);
    }

    // 1:1 레벨테스트가 필수인 경우 — 예약 또는 완료 상태인지 확인
    if (enr.leveltest_required && !enr.leveltest_done) {
      const { data: ltb } = await admin.from("leveltest_bookings")
        .select("id")
        .eq("student_id", student_id)
        .order("start_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ltb) {
        return json({ error: "먼저 1:1 레벨테스트를 예약해주세요." }, 400);
      }
    }

    const months = enr.months;

    // ─── start_date 파싱 (KST 기준) ───
    const [Y, M, D] = start_date.split("-").map(Number);
    if (!Y || !M || !D) return json({ error: "시작일이 잘못됐습니다." }, 400);

    function kstDate(y, m, d) {
      return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    }

    // ─── 중복 시간대 검사 ───
    const { data: existing } = await admin
      .from("enrollments").select("slot_hm")
      .eq("teacher_id", teacher_id)
      .in("status", ["active"])
      .in("slot_hm", times)
      .neq("id", enrollment_id);
    if (existing && existing.length > 0)
      return json({ error: "이미 신청된 시간대가 있습니다: " + existing.map(e=>e.slot_hm).join(", ") }, 409);

    // ─── 학생-강사 페어의 줌 미팅 가져오거나 생성 ───
    let stz = null;
    const { data: existingZoom } = await admin
      .from("student_teacher_zoom")
      .select("zoom_meeting_id, zoom_join_url, zoom_start_url")
      .eq("student_id", student_id).eq("teacher_id", teacher_id).maybeSingle();

    if (existingZoom && existingZoom.zoom_join_url) {
      stz = existingZoom;
    } else {
      const { data: tz } = await admin.from("teacher_zoom")
        .select("pmi_url, zoom_account_id, zoom_client_id, zoom_client_secret")
        .eq("teacher_id", teacher_id).maybeSingle();

      // 1) 강사 개인 회의실 링크(PMI)가 있으면 그 링크 사용(강사=host)
      // 2) 없으면 OAuth 키로 자동 생성, 3) 그것도 없/실패면 공용(env) 폴백
      let z = null;
      if (tz?.pmi_url) z = { id: null, join: tz.pmi_url, start: tz.pmi_url };
      if (!z && tz) z = await createZoom(tz.zoom_account_id, tz.zoom_client_id, tz.zoom_client_secret);
      if (!z) z = await createZoom(
        Deno.env.get("ZOOM_ACCOUNT_ID"),
        Deno.env.get("ZOOM_CLIENT_ID"),
        Deno.env.get("ZOOM_CLIENT_SECRET"),
      );

      const { data: inserted } = await admin.from("student_teacher_zoom").insert({
        student_id, teacher_id,
        zoom_meeting_id: z?.id || null, zoom_join_url: z?.join || null, zoom_start_url: z?.start || null,
      }).select().single();
      stz = inserted;
    }

    // ─── 기존 enrollment 업데이트 + 추가 enrollment 생성 ───
    const enrollments_out = [];
    const totalDays = months * 4 * 7;
    let totalBookings = 0;

    for (let i = 0; i < times.length; i++) {
      const hm = times[i];
      const [h, m] = hm.split(":").map(Number);
      let currentEnr;

      if (i === 0) {
        const { data: updated, error: uErr } = await admin.from("enrollments").update({
          teacher_id, start_date, slot_hm: hm,
          status: "active",
        }).eq("id", enrollment_id).select().single();
        if (uErr) return json({ error: "수강 업데이트 실패: " + uErr.message }, 400);
        currentEnr = updated;
      } else {
        const { data: newEnr, error: nErr } = await admin.from("enrollments").insert({
          student_id, teacher_id, months,
          start_date, slot_hm: hm,
          status: "active",
          payment_status: "paid",
          price: 0,
          leveltest_required: false,
          leveltest_done: true,
        }).select().single();
        if (nErr) return json({ error: "추가 수강 등록 실패: " + nErr.message }, 400);
        currentEnr = newEnr;
      }
      enrollments_out.push(currentEnr);

      // ─── bookings 생성 ───
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
        // slot_hm 은 필리핀 시간(PHT, UTC+8) — 반드시 +08:00 으로 태그해야 함.
        // (+09:00 으로 하면 수업이 1시간 일찍 잡힘)
        const iso = new Date(`${yy}-${mm}-${dd}T${hh}:${mi}:00+08:00`).toISOString();

        rows.push({
          enrollment_id: currentEnr.id,
          student_id, teacher_id,
          start_at: iso,
          status: "reserved",
          payment_status: "paid",
          price: 0,
          zoom_meeting_id: stz?.zoom_meeting_id || null,
          zoom_join_url:   stz?.zoom_join_url   || null,
          zoom_start_url:  stz?.zoom_start_url  || null,
        });
      }

      if (rows.length > 0) {
        const { data: bks, error: bErr } = await admin.from("bookings").insert(rows).select("id");
        if (bErr) return json({ error: "수업 생성 실패: " + bErr.message }, 400);
        totalBookings += bks.length;
      }
    }

    return json({
      ok: true,
      enrollments: enrollments_out.length,
      bookings: totalBookings,
      zoom_shared: !!stz?.zoom_join_url,
    });
  } catch (e) {
    console.error("Function error:", e);
    return json({ error: String(e) }, 500);
  }
});
