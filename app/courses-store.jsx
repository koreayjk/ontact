/* global window */
// ──────────────────────────────────────────────────────────────────
//  강좌 미디어 · 개설 저장소
//   · 관리자 페이지에서 강좌별 [쇼케이스 링크 + 대표사진 + 판매설정] 편집
//   · 새 강좌 개설(custom)
//   · localStorage 저장 → COURSES 배열에 제자리 병합(다른 모듈이 같은 참조 사용)
//  실서버에서는 Supabase 로 이관 예정.
// ──────────────────────────────────────────────────────────────────
const RJ_COURSES_KEY = "rj_courses_store_v1";

function loadCoursesStore() {
  try {
    const s = JSON.parse(localStorage.getItem(RJ_COURSES_KEY) || "null");
    if (s && s.overrides && Array.isArray(s.custom)) return s;
  } catch (e) {}
  return { overrides: {}, custom: [] };
}
function saveCoursesStore(s) { try { localStorage.setItem(RJ_COURSES_KEY, JSON.stringify(s)); } catch (e) {} }

// 쇼케이스 ID 추출 — URL / 임베드코드 / 숫자 무엇이든 허용
//   https://vimeo.com/showcase/12345678  ·  .../showcase/12345678/embed
//   <iframe src="https://vimeo.com/showcase/12345678/embed" …>  ·  12345678
function parseShowcaseId(input) {
  if (!input) return "";
  const s = String(input).trim();
  const m = s.match(/showcase\/(\d+)/);
  if (m) return m[1];
  if (/^\d{5,}$/.test(s)) return s;
  return "";
}
function showcaseEmbedSrc(id) { return "https://vimeo.com/showcase/" + id + "/embed"; }
function showcaseUrl(id) { return "https://vimeo.com/showcase/" + id; }

// COURSES 에 저장값 병합 (제자리 mutate)
function applyCoursesStore() {
  const C = window.COURSES;
  if (!Array.isArray(C)) return;
  for (let i = C.length - 1; i >= 0; i--) if (C[i].__custom) C.splice(i, 1); // 이전 custom 제거
  const store = loadCoursesStore();
  for (const c of C) { const ov = store.overrides[c.id]; if (ov) Object.assign(c, ov); }
  for (const cc of store.custom) C.push({ __custom: true, ...cc, ...(store.overrides[cc.id] || {}) });
}

function setCourseOverride(id, patch) {
  const s = loadCoursesStore();
  s.overrides[id] = { ...(s.overrides[id] || {}), ...patch };
  saveCoursesStore(s); applyCoursesStore();
}
function addCustomCourse(course) {
  const s = loadCoursesStore();
  s.custom.push(course); saveCoursesStore(s); applyCoursesStore();
}
function removeCustomCourse(id) {
  const s = loadCoursesStore();
  s.custom = s.custom.filter((c) => c.id !== id);
  delete s.overrides[id];
  saveCoursesStore(s); applyCoursesStore();
}
function isCustomCourse(id) {
  return loadCoursesStore().custom.some((c) => c.id === id);
}

applyCoursesStore();

Object.assign(window, {
  loadCoursesStore, saveCoursesStore, parseShowcaseId, showcaseEmbedSrc, showcaseUrl,
  applyCoursesStore, setCourseOverride, addCustomCourse, removeCustomCourse, isCustomCourse,
});
