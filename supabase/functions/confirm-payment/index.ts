// ============================================================
// 온택 - 토스페이먼츠 결제 승인 (Payment SDK / requestPayment 플로우)
// 함수 이름: confirm-payment
// 역할: 클라이언트가 받은 {paymentKey, orderId, amount}를 토스 승인 API로 확정.
//       (시크릿 키는 여기서만 사용 — 절대 프론트엔드 금지)
//   · 이 함수는 "승인만" 합니다. 수강 생성(enrollment/bookings)은
//     프론트가 승인 성공 후 기존 create-enrollment/create-reenrollment를 호출합니다.
//
// 배포 전 설정 (Supabase):
//   supabase secrets set TOSS_SECRET_KEY=test_sk_xxxxxxxxxxxxxxxx
//   (라이브 전환 시 live_sk_... 로 교체)
// ============================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const SECRET = Deno.env.get("TOSS_SECRET_KEY") || "";
  if (!SECRET) return json({ ok: false, error: "TOSS_SECRET_KEY not set" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }

  const paymentKey = String(body.paymentKey || "");
  const orderId = String(body.orderId || "");
  const amount = Number(body.amount || 0);
  if (!paymentKey || !orderId || !amount) {
    return json({ ok: false, error: "paymentKey, orderId, amount 필요" }, 400);
  }

  // 토스 승인 API — Basic 인증: base64(secretKey + ":")
  const auth = "Basic " + btoa(SECRET + ":");
  let tossRes: Response;
  try {
    tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: { "Authorization": auth, "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
  } catch (e) {
    return json({ ok: false, error: "토스 승인 요청 실패: " + (e as Error).message }, 502);
  }

  const data = await tossRes.json().catch(() => ({}));
  if (!tossRes.ok) {
    // 토스 에러: { code, message }
    return json({ ok: false, error: data?.message || "결제 승인 거절", code: data?.code, toss: data }, 400);
  }

  // 승인 성공 — 핵심 결과만 반환
  return json({
    ok: true,
    paymentKey: data.paymentKey,
    orderId: data.orderId,
    amount: data.totalAmount,
    method: data.method,        // 카드/간편결제 등
    approvedAt: data.approvedAt,
    status: data.status,        // DONE
  });
});
