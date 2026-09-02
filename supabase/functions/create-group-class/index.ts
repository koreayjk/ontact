// ============================================================
// 온택 - 단체수업 생성 (관리자 → 강사+시간 → 줌 자동)
// 함수 이름: create-group-class
//
// 수정: 강사 개인 줌 컬럼명 정정(zoom_account_id 등) + PMI 우선.
// ============================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const looksAscii = (s) => /^[\x20-\x7E]+$/.test(s);

// 예약형(type 2) 단체 줌 미팅 생성 → {id, join, start} | null
async function createGroupZoom(ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET, start_at, duration, org_name) {
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
        topic: `ONTACT Group Class - ${org_name}`,
        type: 2, start_time: start_at,
        duration: duration || 40, timezone: "Asia/Seoul",
        settings: { join_before_host: true, waiting_room: false, host_video: true, participant_video: true, mute_upon_entry: true },
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
    const { org_name, teacher_id, start_at, duration_min, max_students } = await req.json();
    if (!org_name || !teacher_id || !start_at)
      return json({ error: "필수 정보 누락 (단체명·강사·시간)" }, 400);

    const admin = createClient(Deno.env.get("PROJECT_URL"), Deno.env.get("SERVICE_ROLE_KEY"));
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "로그인 필요" }, 401);
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "로그인 무효" }, 401);

    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (!me || me.role !== "admin") return json({ error: "관리자 권한 필요" }, 403);

    // ─── 줌: 강사 PMI 우선 → 강사 OAuth → 공용(env) ───
    const { data: tz } = await admin.from("teacher_zoom")
      .select("pmi_url, zoom_account_id, zoom_client_id, zoom_client_secret")
      .eq("teacher_id", teacher_id).maybeSingle();
    let z = null;
    if (tz?.pmi_url) z = { id: null, join: tz.pmi_url, start: tz.pmi_url };
    if (!z && tz) z = await createGroupZoom(tz.zoom_account_id, tz.zoom_client_id, tz.zoom_client_secret, start_at, duration_min, org_name);
    if (!z) z = await createGroupZoom(
      Deno.env.get("ZOOM_ACCOUNT_ID"), Deno.env.get("ZOOM_CLIENT_ID"), Deno.env.get("ZOOM_CLIENT_SECRET"),
      start_at, duration_min, org_name,
    );

    const { data: gc, error } = await admin.from("group_classes").insert({
      org_name, teacher_id, start_at,
      duration_min: duration_min || 40,
      max_students: max_students || 4,
      zoom_meeting_id: z?.id || null, zoom_join_url: z?.join || null, zoom_start_url: z?.start || null,
      created_by: user.id,
    }).select().single();
    if (error) return json({ error: "저장 실패: " + error.message }, 400);

    return json({ ok: true, id: gc.id, zoom_join_url: z?.join || null, zoom_start_url: z?.start || null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
