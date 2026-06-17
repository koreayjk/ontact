/* global React, COURSES, INSTRUCTORS, SUBJECTS, Icon, useApp, formatKRW, findInstructor, findSubject */
// ──────────────────────────────────────────────────────────────────
//  관리자 · 강의(VOD) 관리
//   · 강좌별 대표사진 업로드 + Vimeo 쇼케이스 링크 연결 + 판매/무료 설정
//   · 새 강좌 개설 · 삭제(개설한 강좌만)
// ──────────────────────────────────────────────────────────────────
const { useState: useStV } = React;

// 업로드 이미지 → 가로 720px 로 축소한 JPEG dataURL (localStorage 절약)
function vodFileToThumb(file, cb) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxW = 720;
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      try { cb(cv.toDataURL("image/jpeg", 0.82)); } catch (e) { cb(reader.result); }
    };
    img.onerror = () => cb(reader.result);
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

const VOD_COLORS = ["ink", "cream", "accent", "deep"];

function VodManager() {
  const { showToast } = useApp();
  const [, setTick] = useStV(0);
  const refresh = () => setTick((t) => t + 1);
  const [editId, setEditId] = useStV(null);
  const [adding, setAdding] = useStV(false);

  const courses = window.COURSES || [];
  const connected = courses.filter((c) => c.showcaseId).length;

  return (
    <div>
      <style>{`.vod-lab{display:block;font-size:11.5px;font-weight:800;color:var(--ci-muted);margin-bottom:6px;letter-spacing:.01em;}`}</style>
      <window.CiHead title="강의 관리 · VOD" api="Vimeo Showcase"
        sub="강좌마다 대표사진과 Vimeo 쇼케이스 링크를 연결하면, 그 강좌 페이지에 강의 영상이 자동으로 나열됩니다 · 등록생은 무료, 그 외에는 구매 후 시청"
        action={<button className="ci-act navy" onClick={() => { setAdding(true); setEditId(null); }}><Icon name="plus" size={13} /> 강좌 개설</button>} />

      {/* 요약 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <span className="ci-badge neutral"><Icon name="book" size={11} /> 전체 강좌 {courses.length}</span>
        <span className="ci-badge ok"><Icon name="check" size={11} /> 쇼케이스 연결 {connected}</span>
        <span className="ci-badge warn"><Icon name="clock" size={11} /> 미연결 {courses.length - connected}</span>
      </div>

      {adding && <VodAddForm onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); refresh(); setEditId(id); showToast("강좌가 개설되었습니다"); }} />}

      <div style={{ display: "grid", gap: 12 }}>
        {courses.map((c) => (
          <VodCourseRow key={c.id} course={c} open={editId === c.id}
            onToggle={() => setEditId(editId === c.id ? null : c.id)}
            onChange={() => { refresh(); }} showToast={showToast} />
        ))}
      </div>

      <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--ci-muted)", lineHeight: 1.7 }}>
        · <strong>등록생 무료</strong>는 <strong>학생 관리</strong> 탭에서 해당 학생에게 강좌를 배정하면 적용됩니다.<br />
        · 쇼케이스 안 강의 <strong>순서 변경</strong>은 Vimeo 쇼케이스에서 하면 사이트에 그대로 반영됩니다.<br />
        · Vimeo 영상 설정에서 <strong>도메인 제한</strong>을 걸면 우리 사이트에서만 재생됩니다.
      </p>
    </div>
  );
}

function VodCourseRow({ course, open, onToggle, onChange, showToast }) {
  const ins = findInstructor(course.instructor);
  const subj = findSubject(course.subject);
  const custom = window.isCustomCourse(course.id);
  const showcaseId = course.showcaseId || "";

  const [form, setForm] = useStV({
    showcaseInput: showcaseId ? window.showcaseUrl(showcaseId) : "",
    thumb: course.thumb || "",
    title: course.title || "",
    level: course.level || "",
    salePrice: course.salePrice || course.recordingPrice || 0,
    isFree: !!course.isFree,
  });
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const parsedId = window.parseShowcaseId(form.showcaseInput);

  const save = () => {
    const patch = {
      showcaseId: parsedId,
      thumb: form.thumb || undefined,
      title: form.title.trim() || course.title,
      level: form.level.trim(),
      salePrice: Number(form.salePrice) || 0,
      price: Number(form.salePrice) || 0,
      recordingPrice: Number(form.salePrice) || 0,
      isFree: !!form.isFree,
    };
    window.setCourseOverride(course.id, patch);
    onChange();
    showToast("저장되었습니다");
    onToggle();
  };
  const del = () => {
    if (!confirm("이 강좌를 삭제할까요? (개설한 강좌만 삭제됩니다)")) return;
    window.removeCustomCourse(course.id);
    onChange();
    showToast("강좌가 삭제되었습니다");
  };

  return (
    <div className="ci-card" style={{ overflow: "hidden" }}>
      {/* 요약 행 */}
      <div style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", gap: 16, alignItems: "center", padding: 14 }}>
        <div style={{ width: 92, height: 62, borderRadius: 8, overflow: "hidden", background: "var(--ci-bg-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {course.thumb
            ? <img src={course.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <Icon name="image" size={18} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontWeight: 800, fontSize: 15.5, letterSpacing: "-0.02em" }}>{course.title}</strong>
            {subj && <span className="ci-badge navy" style={{ fontSize: 10.5 }}>{subj.ko}</span>}
            {custom && <span className="ci-badge neutral" style={{ fontSize: 10.5 }}>개설</span>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {course.showcaseId
              ? <span className="ci-badge ok" style={{ fontSize: 10.5 }}><Icon name="check" size={10} /> 쇼케이스 연결됨</span>
              : <span className="ci-badge warn" style={{ fontSize: 10.5 }}>쇼케이스 미연결</span>}
            {course.isFree
              ? <span className="ci-badge ok" style={{ fontSize: 10.5 }}>전체 무료</span>
              : <span className="ci-badge neutral" style={{ fontSize: 10.5 }}>{formatKRW(course.salePrice || course.recordingPrice || 0)}</span>}
            <span style={{ fontSize: 12, color: "var(--ci-muted)" }}>{ins?.name || "강사 미지정"}</span>
          </div>
        </div>
        <button className="ci-act" onClick={onToggle}>{open ? "닫기" : <><Icon name="edit" size={12} /> 편집</>}</button>
      </div>

      {/* 편집 패널 */}
      {open && (
        <div style={{ borderTop: "1px solid var(--ci-line)", padding: 18, display: "grid", gridTemplateColumns: "260px 1fr", gap: 22, background: "var(--ci-bg)" }}>
          {/* 대표사진 */}
          <div>
            <label className="vod-lab">대표사진</label>
            <div style={{ aspectRatio: "16 / 10", borderRadius: 10, overflow: "hidden", background: "var(--ci-bg-2)", border: "1px solid var(--ci-line)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {form.thumb
                ? <img src={form.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ color: "var(--ci-muted)", fontSize: 12.5, textAlign: "center", padding: 12 }}><Icon name="image" size={22} /><br />이미지를 올려주세요</span>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <label className="ci-act" style={{ cursor: "pointer", flex: 1, justifyContent: "center" }}>
                <Icon name="upload" size={12} /> 사진 업로드
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files[0]; if (f) vodFileToThumb(f, (url) => up("thumb", url)); }} />
              </label>
              {form.thumb && <button className="ci-act" onClick={() => up("thumb", "")}><Icon name="trash" size={12} /></button>}
            </div>
            <p style={{ fontSize: 11, color: "var(--ci-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>강좌 카드·플레이어에 쓰입니다 · 가로형 권장</p>
          </div>

          {/* 필드 */}
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label className="vod-lab">Vimeo 쇼케이스 링크</label>
              <input value={form.showcaseInput} onChange={(e) => up("showcaseInput", e.target.value)}
                placeholder="https://vimeo.com/showcase/12345678 (또는 임베드 코드 붙여넣기)"
                style={inStyle} />
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {form.showcaseInput
                  ? (parsedId
                    ? <span style={{ color: "var(--ci-ok)" }}><Icon name="check" size={11} /> 인식됨 · ID {parsedId} — <a href={window.showcaseUrl(parsedId)} target="_blank" rel="noreferrer" style={{ color: "var(--ci-navy)", fontWeight: 700 }}>미리보기</a></span>
                    : <span style={{ color: "var(--ci-bad)" }}>링크에서 쇼케이스 ID를 찾지 못했어요 · vimeo.com/showcase/숫자 형태인지 확인</span>)
                  : <span style={{ color: "var(--ci-muted)" }}>쇼케이스 링크를 붙여넣으면 그 안의 강의들이 자동으로 나열됩니다</span>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="vod-lab">강좌명</label>
                <input value={form.title} onChange={(e) => up("title", e.target.value)} style={inStyle} />
              </div>
              <div>
                <label className="vod-lab">레벨 · 대상</label>
                <input value={form.level} onChange={(e) => up("level", e.target.value)} placeholder="예: 고졸 검정고시" style={inStyle} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
              <div>
                <label className="vod-lab">판매가 (원)</label>
                <input type="number" value={form.salePrice} onChange={(e) => up("salePrice", e.target.value)} disabled={form.isFree}
                  style={{ ...inStyle, opacity: form.isFree ? 0.5 : 1 }} />
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: "var(--ci-navy)", height: 40 }}>
                <input type="checkbox" checked={form.isFree} onChange={(e) => up("isFree", e.target.checked)} /> 전체 무료 공개
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              {custom
                ? <button className="ci-act" onClick={del} style={{ color: "var(--ci-bad)" }}><Icon name="trash" size={12} /> 강좌 삭제</button>
                : <span style={{ fontSize: 11.5, color: "var(--ci-muted)" }}>기본 제공 강좌 (삭제 불가)</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ci-act" onClick={onToggle}>취소</button>
                <button className="ci-act navy" onClick={save}><Icon name="check" size={13} /> 저장</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VodAddForm({ onClose, onAdded }) {
  const [f, setF] = useStV({ title: "", subject: (SUBJECTS[0] || {}).id || "", instructor: (INSTRUCTORS[0] || {}).id || "", level: "", salePrice: 0, showcaseInput: "" });
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const parsedId = window.parseShowcaseId(f.showcaseInput);

  const create = () => {
    if (!f.title.trim()) { alert("강좌명을 입력하세요"); return; }
    const id = "vod-" + Date.now().toString(36);
    const n = String((window.COURSES || []).length + 1).padStart(2, "0");
    const course = {
      id, no: n, title: f.title.trim(),
      subtitle: "", instructor: f.instructor, subject: f.subject,
      level: f.level.trim() || "전체", format: "VOD",
      lessons: 0, hours: 0, weeks: 0,
      price: Number(f.salePrice) || 0, salePrice: Number(f.salePrice) || 0, recordingPrice: Number(f.salePrice) || 0,
      rating: 0, reviews: 0, enrolled: 0,
      color: VOD_COLORS[(window.COURSES || []).length % VOD_COLORS.length],
      isFree: false, showcaseId: parsedId,
      description: "", syllabus: [], includes: [],
    };
    window.addCustomCourse(course);
    onAdded(id);
  };

  return (
    <div className="ci-card ci-card-pad" style={{ marginBottom: 16, border: "1.5px solid var(--ci-navy)" }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}><Icon name="plus" size={14} /> 새 강좌 개설</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="vod-lab">강좌명</label>
          <input value={f.title} onChange={(e) => up("title", e.target.value)} placeholder="예: 고졸 검정고시 국어" style={inStyle} autoFocus />
        </div>
        <div>
          <label className="vod-lab">과목</label>
          <select value={f.subject} onChange={(e) => up("subject", e.target.value)} style={inStyle}>
            {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.ko}</option>)}
          </select>
        </div>
        <div>
          <label className="vod-lab">담당 강사</label>
          <select value={f.instructor} onChange={(e) => up("instructor", e.target.value)} style={inStyle}>
            {INSTRUCTORS.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div>
          <label className="vod-lab">레벨 · 대상</label>
          <input value={f.level} onChange={(e) => up("level", e.target.value)} placeholder="예: 고졸 검정고시" style={inStyle} />
        </div>
        <div>
          <label className="vod-lab">판매가 (원)</label>
          <input type="number" value={f.salePrice} onChange={(e) => up("salePrice", e.target.value)} style={inStyle} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="vod-lab">Vimeo 쇼케이스 링크 (선택 — 나중에 넣어도 됨)</label>
          <input value={f.showcaseInput} onChange={(e) => up("showcaseInput", e.target.value)} placeholder="https://vimeo.com/showcase/12345678" style={inStyle} />
          {f.showcaseInput && <div style={{ marginTop: 6, fontSize: 12, color: parsedId ? "var(--ci-ok)" : "var(--ci-bad)" }}>{parsedId ? "✓ 인식됨 · ID " + parsedId : "쇼케이스 ID를 찾지 못했어요"}</div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button className="ci-act" onClick={onClose}>취소</button>
        <button className="ci-act navy" onClick={create}><Icon name="check" size={13} /> 개설하기</button>
      </div>
    </div>
  );
}

const inStyle = { width: "100%", height: 40, borderRadius: 8, border: "1px solid var(--ci-line)", padding: "0 12px", fontSize: 14, fontFamily: "var(--font-kr)" };

Object.assign(window, { VodManager });
