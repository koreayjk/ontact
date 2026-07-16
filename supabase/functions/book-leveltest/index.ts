// ============================================================
// 온택 - 레벨테스트 예약 (학생이 매니저 슬롯 선택 시 자동 줌)
// 함수 이름: book-leveltest
//
// 줌 미팅: 슬롯 담당 '매니저 본인 줌 키(teacher_zoom)'로 먼저 시도,
//         실패하거나 키가 없으면 공용(env ZOOM_*)으로 자동 폴백.
// ============================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const looksAscii = (s) => /^[\x20-\x7E]+$/.test(s);

// 주어진 자격증명으로 줌 미팅 생성 시도 → 성공 시 {id, join, start}, 실패 시 null
async function createZoom(ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET, slot) {
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
    if (!token.access_token) return null;
    const mRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "ONTACT Free Level Test",
        type: 2,
        start_time: slot.start_at,
        duration: slot.duration_min || 20,
        timezone: "Asia/Seoul",
        settings: { join_before_host: true, waiting_room: false, host_video: true, participant_video: true },
      }),
    });
    const meeting = await mRes.json();
    if (!meeting.join_url) return null;
    return { id: String(meeting.id), join: meeting.join_url, start: meeting.start_url };
  } catch (_) {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const { slot_id } = await req.json();
    if (!slot_id) return json({ error: "슬롯 ID 누락" }, 400);

    const admin = createClient(Deno.env.get("PROJECT_URL"), Deno.env.get("SERVICE_ROLE_KEY"));
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "로그인 필요" }, 401);
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "로그인 정보 무효" }, 401);
    const student_id = user.id;

    const { data: slot, error: sErr } = await admin
      .from("leveltest_slots").select("*").eq("id", slot_id).single();
    if (sErr || !slot) return json({ error: "슬롯을 찾을 수 없습니다." }, 400);
    if (slot.status !== "open") return json({ error: "이미 예약된 슬롯입니다." }, 409);

    // 1) 매니저 본인 줌 키(teacher_zoom)로 먼저 시도
    let z = null;
    if (slot.manager_id) {
      const { data: mz } = await admin
        .from("teacher_zoom")
        .select("zoom_account_id, zoom_client_id, zoom_client_secret")
        .eq("teacher_id", slot.manager_id)
        .maybeSingle();
      if (mz) z = await createZoom(mz.zoom_account_id, mz.zoom_client_id, mz.zoom_client_secret, slot);
    }
    // 2) 실패/부재 시 공용(env) 줌으로 폴백
    if (!z) {
      z = await createZoom(
        Deno.env.get("ZOOM_ACCOUNT_ID"),
        Deno.env.get("ZOOM_CLIENT_ID"),
        Deno.env.get("ZOOM_CLIENT_SECRET"),
        slot,
      );
    }

    // 예약 생성
    const { data: bk, error: bErr } = await admin.from("leveltest_bookings").insert({
      slot_id: slot.id,
      student_id,
      manager_id: slot.manager_id,
      start_at: slot.start_at,
      zoom_meeting_id: z?.id || null,
      zoom_join_url: z?.join || null,
      zoom_start_url: z?.start || null,
    }).select().single();
    if (bErr) return json({ error: "예약 실패: " + bErr.message }, 400);

    // 슬롯 잠금
    await admin.from("leveltest_slots").update({ status: "booked" }).eq("id", slot.id);

    return json({ ok: true, booking_id: bk.id, zoom_join_url: z?.join || null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
