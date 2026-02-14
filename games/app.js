// app.js
// Deep Reflection Box Game + Special Session (subthemes + spin name + quota)
// Data saved in localStorage

// ---------- Utilities ----------
const $ = (id) => document.getElementById(id);
const KEY = "drbg_state_v2_special";

const now = () => new Date().toISOString();

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=> t.style.display="none", 2400);
}

function safeLines(text){
  return (text || "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

function uid(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function beep(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.28);
  }catch(e){}
}

function pickRandomFromArray(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- State ----------
function defaultState(){
  return {
    people: {
      count: 0,
      names: [],
      turnIndex: 0,
      updatedAt: now()
    },
    sessions: [], // normal + special
    activeSessionId: null,
    uiTheme: "deep",
    updatedAt: now()
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return defaultState();
    const s = JSON.parse(raw);

    s.people ??= {count:0,names:[],turnIndex:0,updatedAt:now()};
    s.sessions ??= [];
    s.uiTheme ??= "deep";
    s.activeSessionId ??= null;

    // normalize sessions
    for(const sess of s.sessions){
      sess.questions ??= [];
      sess.usedIdx ??= [];
      sess.theme ??= "deep";
      sess.special ??= null;
      // normalize special structure if exists
      if(sess.theme === "special"){
        sess.special ??= {
          quotaPerPerson: 2,
          subthemes: [], // {id,name,questions,usedIdx:[]}
          runtime: null  // runtime ephemeral but we store for persistence
        };
        sess.special.subthemes ??= [];
        for(const st of sess.special.subthemes){
          st.id ??= uid();
          st.name ??= "Subtema";
          st.questions ??= [];
          st.usedIdx ??= [];
        }
        sess.special.runtime ??= null;
      }
    }
    return s;
  }catch(e){
    console.warn(e);
    return defaultState();
  }
}

let state = loadState();

function saveState(){
  state.updatedAt = now();
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

// ---------- Derived ----------
function getActiveSession(){
  return state.sessions.find(s => s.id === state.activeSessionId) || null;
}

function ensurePeople(){
  if((state.people.count || 0) <= 0){
    toast("Isi jumlah peserta dulu.");
    return false;
  }
  return true;
}

function ensureSessionActive(){
  const sess = getActiveSession();
  if(!sess){
    toast("Pilih & aktifkan sesi dulu.");
    return false;
  }
  if(sess.theme !== "special" && (!sess.questions || sess.questions.length === 0)){
    toast("Sesi aktif belum punya pertanyaan.");
    return false;
  }
  if(sess.theme === "special"){
    if(!sess.special || !sess.special.subthemes || sess.special.subthemes.length === 0){
      toast("Sesi Special butuh minimal 1 subtema + pertanyaan.");
      return false;
    }
  }
  return true;
}

function currentTurnName(){
  if(!ensurePeopleSilent()) return "—";
  const idx = clamp(state.people.turnIndex || 0, 0, state.people.count-1);
  return state.people.names?.[idx] || `Peserta ${idx+1}`;
}

function ensurePeopleSilent(){
  return (state.people.count || 0) > 0;
}

// ---------- Timer ----------
let timer = { t:null, remain:0, running:false };

function fmtTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(sec/60)).padStart(2,"0");
  const ss = String(sec%60).padStart(2,"0");
  return `${mm}:${ss}`;
}

function stopTimer(){
  if(timer.t) clearInterval(timer.t);
  timer.t = null;
  timer.running = false;
  timer.remain = 0;
  $("timerLabel").textContent = "00:00";
}

function startTimer(seconds){
  seconds = Math.max(1, Math.floor(seconds));
  timer.remain = seconds;
  timer.running = true;
  $("timerLabel").textContent = fmtTime(timer.remain);

  if(timer.t) clearInterval(timer.t);
  timer.t = setInterval(()=>{
    timer.remain--;
    $("timerLabel").textContent = fmtTime(timer.remain);
    if(timer.remain <= 0){
      clearInterval(timer.t);
      timer.t = null;
      timer.running = false;
      toast("Waktu habis.");
      beep();
    }
  }, 1000);
}

// ---------- Normal Game Logic ----------
function nextTurn(){
  if(!ensurePeople()) return;
  state.people.turnIndex = (state.people.turnIndex + 1) % state.people.count;
  saveState();
}

function spinQuestion(){
  if(!ensurePeople() || !ensureSessionActive()) return;

  const sess = getActiveSession();
  if(sess.theme === "special"){
    toast("Sesi Special pakai tombol Special (Spin Nama/Subtema/Pertanyaan).");
    return;
  }

  const total = sess.questions.length;
  const used = new Set(sess.usedIdx);

  if(used.size >= total){
    toast("Semua pertanyaan sesi ini sudah keluar.");
    return;
  }

  let idx;
  let guard = 0;
  do{
    idx = Math.floor(Math.random()*total);
    guard++;
  }while(used.has(idx) && guard < 5000);

  used.add(idx);
  sess.usedIdx = Array.from(used);
  sess.lastQuestionIdx = idx;
  sess.updatedAt = now();

  animateSpin(sess.questions[idx], sess.questions);
  saveState();
}

function animateSpin(finalText, pool){
  const el = $("questionText");
  const rounds = 14;
  let i = 0;

  const fast = 55;
  const slow = 110;

  clearInterval(animateSpin._tm);
  animateSpin._tm = setInterval(()=>{
    i++;
    el.textContent = pickRandomFromArray(pool) || "…";
    if(i === Math.floor(rounds/2)) {
      clearInterval(animateSpin._tm);
      animateSpin._tm = setInterval(()=>{
        i++;
        el.textContent = pickRandomFromArray(pool) || "…";
        if(i >= rounds){
          clearInterval(animateSpin._tm);
          el.textContent = finalText;
        }
      }, slow);
    }
  }, fast);
}

function resetSessionUsed(){
  const sess = getActiveSession();
  if(!sess) return;
  if(sess.theme === "special"){
    toast("Reset pertanyaan sesi special dilakukan per subtema / runtime.");
    return;
  }
  sess.usedIdx = [];
  sess.lastQuestionIdx = null;
  sess.updatedAt = now();
  saveState();
  toast("Pertanyaan sesi direset.");
}

// ---------- Special Session Logic ----------
/**
Special rules:
- runtime holds: remainingPeopleIdx[], currentPersonIdx|null, currentSubthemeId|null, currentPersonAskedCount
- Spin Name chooses random from remainingPeopleIdx -> sets currentPersonIdx
- Participant chooses subtheme -> confirm locks it (currentSubthemeId)
- Spin Question: pick random unused from that subtheme; mark used in subtheme.usedIdx (shared across participants)
- After each spin question, increment currentPersonAskedCount
- When equals quotaPerPerson OR subtheme exhausted -> finish person:
  - remove person idx from remainingPeopleIdx
  - reset currentPersonIdx/currentSubthemeId/currentPersonAskedCount
- When remainingPeopleIdx empty -> session special done (host manually activate Closing session)
*/

function getSpecial(sess){
  if(!sess || sess.theme !== "special") return null;
  sess.special ??= { quotaPerPerson:2, subthemes:[], runtime:null };
  sess.special.subthemes ??= [];
  return sess.special;
}

function ensureSpecialRuntime(sess){
  const sp = getSpecial(sess);
  if(!sp) return null;

  if(!sp.runtime){
    // init runtime
    const allIdx = Array.from({length: state.people.count}, (_,i)=>i);
    sp.runtime = {
      remainingPeopleIdx: allIdx,
      currentPersonIdx: null,
      currentSubthemeId: null,
      currentPersonAskedCount: 0,
      log: [] // {time, personIdx, personName, subthemeName, question}
    };
  }else{
    // if people count changed, re-align remaining indexes conservatively
    sp.runtime.remainingPeopleIdx ??= Array.from({length: state.people.count}, (_,i)=>i);
    sp.runtime.log ??= [];
  }
  return sp.runtime;
}

function specialResetRuntime(){
  const sess = getActiveSession();
  if(!sess || sess.theme !== "special") return;
  const sp = getSpecial(sess);
  if(!sp) return;

  sp.runtime = null; // reset flow
  sess.special.runtime = null;

  // Do NOT reset usedIdx per subtheme here (kept), because user asked: used question won't appear again if same theme.
  // But they also want "per sesi" completion. If you want full reset of used questions too, do it manually via editor (delete session / edit).
  saveState();
  toast("Runtime Special direset (urutan peserta diulang).");
}

function specialSpinName(){
  if(!ensurePeople() || !ensureSessionActive()) return;
  const sess = getActiveSession();
  if(sess.theme !== "special"){
    toast("Aktifkan sesi bertema Special dulu.");
    return;
  }
  const rt = ensureSpecialRuntime(sess);
  if(!rt) return;

  if(rt.remainingPeopleIdx.length === 0){
    toast("Semua peserta sudah menjalani sesi Special. Lanjut ke sesi Closing.");
    return;
  }
  if(rt.currentPersonIdx !== null){
    toast("Peserta sedang berjalan. Selesaikan dulu kuotanya.");
    return;
  }

  // pick random remaining
  const picked = pickRandomFromArray(rt.remainingPeopleIdx);
  rt.currentPersonIdx = picked;
  rt.currentSubthemeId = null;
  rt.currentPersonAskedCount = 0;

  // update global turn display to this person
  state.people.turnIndex = picked;

  saveState();
  toast(`Terpilih: ${state.people.names[picked] || `Peserta ${picked+1}`}. Pilih subtema.`);
}

function specialConfirmSubtheme(){
  const sess = getActiveSession();
  if(!sess || sess.theme !== "special") return;

  const rt = ensureSpecialRuntime(sess);
  if(rt.currentPersonIdx === null){
    toast("Spin nama dulu untuk memilih peserta.");
    return;
  }

  const stId = $("spSubthemeSelect").value;
  if(!stId){
    toast("Pilih subtema dulu.");
    return;
  }

  rt.currentSubthemeId = stId;
  saveState();
  toast("Subtema dikunci. Silakan spin pertanyaan.");
}

function specialSpinQuestion(){
  if(!ensurePeople() || !ensureSessionActive()) return;
  const sess = getActiveSession();
  if(sess.theme !== "special"){
    toast("Aktifkan sesi Special dulu.");
    return;
  }

  const sp = getSpecial(sess);
  const rt = ensureSpecialRuntime(sess);
  if(!sp || !rt) return;

  if(rt.currentPersonIdx === null){
    toast("Spin nama dulu.");
    return;
  }
  if(!rt.currentSubthemeId){
    toast("Pilih lalu kunci subtema dulu.");
    return;
  }

  const quota = clamp(parseInt(sp.quotaPerPerson,10) || 1, 1, 10);
  const st = sp.subthemes.find(x => x.id === rt.currentSubthemeId);
  if(!st){
    toast("Subtema tidak ditemukan.");
    return;
  }

  const total = st.questions.length;
  const used = new Set(st.usedIdx);

  if(used.size >= total){
    // no more questions in this subtheme
    toast("Pertanyaan subtema ini sudah habis. Pilih subtema lain.");
    return;
  }

  if(rt.currentPersonAskedCount >= quota){
    toast("Kuota peserta ini sudah tercapai. Spin nama berikutnya.");
    return;
  }

  // pick random unused
  let idx;
  let guard = 0;
  do{
    idx = Math.floor(Math.random()*total);
    guard++;
  }while(used.has(idx) && guard < 5000);

  used.add(idx);
  st.usedIdx = Array.from(used);

  const qText = st.questions[idx];

  // Show on stage with spin animation using this subtheme pool
  animateSpin(qText, st.questions);

  // log
  const personName = state.people.names?.[rt.currentPersonIdx] || `Peserta ${rt.currentPersonIdx+1}`;
  const subthemeName = st.name;
  rt.log.push({
    time: now(),
    personIdx: rt.currentPersonIdx,
    personName,
    subthemeId: st.id,
    subthemeName,
    question: qText
  });

  rt.currentPersonAskedCount++;

  // If quota reached after asking, finish person
  if(rt.currentPersonAskedCount >= quota){
    specialFinishPerson(sess);
  }

  sess.updatedAt = now();
  saveState();
}

function specialFinishPerson(sess){
  const sp = getSpecial(sess);
  const rt = ensureSpecialRuntime(sess);
  if(!sp || !rt) return;

  const idx = rt.currentPersonIdx;
  if(idx === null) return;

  // remove from remaining
  rt.remainingPeopleIdx = rt.remainingPeopleIdx.filter(x => x !== idx);

  // reset current person state
  rt.currentPersonIdx = null;
  rt.currentSubthemeId = null;
  rt.currentPersonAskedCount = 0;

  toast("Selesai untuk peserta ini. Spin nama berikutnya.");
}

// ---------- Sessions CRUD ----------
function addSession(){
  const name = $("inpSessionName").value.trim();
  const theme = $("selSessionTheme").value;

  if(!name){
    toast("Nama sesi wajib diisi.");
    return;
  }

  const sess = {
    id: uid(),
    name,
    theme,
    questions: [],
    usedIdx: [],
    createdAt: now(),
    updatedAt: now()
  };

  if(theme === "special"){
    const quotaRaw = parseInt($("spQuotaInput").value, 10);
    const quota = clamp(Number.isFinite(quotaRaw) ? quotaRaw : 2, 1, 10);
    sess.special = {
      quotaPerPerson: quota,
      subthemes: [],
      runtime: null
    };
    // questions is unused for special
    sess.questions = [];
  }else{
    const questions = safeLines($("taQuestions").value);
    if(questions.length < 1){
      toast("Masukkan minimal 1 pertanyaan.");
      return;
    }
    sess.questions = questions;
  }

  state.sessions.push(sess);
  state.activeSessionId ??= sess.id;

  // clear inputs
  $("inpSessionName").value = "";
  if(theme !== "special") $("taQuestions").value = "";

  saveState();
  toast("Sesi ditambahkan.");
}

function getSelectedSessionId(){
  return $("selSessions")?.value || null;
}

function fillEditorFromSession(id){
  const sess = state.sessions.find(s => s.id === id);
  if(!sess) return;

  $("inpSessionName").value = sess.name || "";
  $("selSessionTheme").value = sess.theme || "deep";

  // toggle editor panels
  toggleSessionEditors(sess.theme);

  if(sess.theme === "special"){
    $("taQuestions").value = "";
    $("spQuotaInput").value = sess.special?.quotaPerPerson ?? 2;
    renderSpecialSubthemeList(sess);
  }else{
    $("taQuestions").value = (sess.questions || []).join("\n");
  }
}

function updateSelectedSession(){
  const id = getSelectedSessionId();
  if(!id) return;
  const sess = state.sessions.find(s => s.id === id);
  if(!sess) return;

  const name = $("inpSessionName").value.trim();
  const theme = $("selSessionTheme").value;
  if(!name){
    toast("Nama sesi wajib diisi.");
    return;
  }

  // If theme changed, we keep it simple: update in place but re-init structures safely.
  sess.name = name;
  sess.theme = theme;

  if(theme === "special"){
    const quotaRaw = parseInt($("spQuotaInput").value, 10);
    sess.special ??= { quotaPerPerson:2, subthemes:[], runtime:null };
    sess.special.quotaPerPerson = clamp(Number.isFinite(quotaRaw) ? quotaRaw : 2, 1, 10);
    sess.special.subthemes ??= [];
    // keep usedIdx/questions empty for special
    sess.questions = [];
    sess.usedIdx = [];
  }else{
    const questions = safeLines($("taQuestions").value);
    if(questions.length < 1){
      toast("Masukkan minimal 1 pertanyaan.");
      return;
    }
    sess.questions = questions;
    sess.usedIdx = (sess.usedIdx || []).filter(i => i >= 0 && i < sess.questions.length);
    sess.special = null; // drop special config if switching away
  }

  sess.updatedAt = now();
  saveState();
  toast("Sesi diupdate.");
}

function deleteSelectedSession(){
  const id = getSelectedSessionId();
  if(!id) return;

  const idx = state.sessions.findIndex(s => s.id === id);
  if(idx < 0) return;

  const wasActive = (state.activeSessionId === id);
  state.sessions.splice(idx, 1);

  if(wasActive){
    state.activeSessionId = state.sessions[0]?.id || null;
  }
  saveState();
  toast("Sesi dihapus.");
}

function setActiveSession(){
  const id = getSelectedSessionId();
  if(!id) return;

  state.activeSessionId = id;
  const sess = getActiveSession();
  if(sess){
    state.uiTheme = sess.theme || state.uiTheme;
  }
  saveState();
  toast("Sesi aktif diubah.");
}

// ---------- Special: Subthemes CRUD (inside selected session) ----------
function getEditingSession(){
  const id = getSelectedSessionId();
  return state.sessions.find(s => s.id === id) || null;
}

function renderSpecialSubthemeList(sess){
  const list = $("spSubthemeList");
  list.innerHTML = "";

  const sp = getSpecial(sess);
  if(!sp || sp.subthemes.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— belum ada subtema —";
    list.appendChild(opt);
    list.disabled = true;
    $("spUpdateSubtheme").disabled = true;
    $("spDeleteSubtheme").disabled = true;
    $("spSubthemeInfo").value = "—";
  }else{
    list.disabled = false;
    for(const st of sp.subthemes){
      const opt = document.createElement("option");
      opt.value = st.id;
      opt.textContent = st.name;
      list.appendChild(opt);
    }
    if(!list.value) list.value = sp.subthemes[0].id;
    fillSubthemeEditorFromSelected(sess);
  }
}

function fillSubthemeEditorFromSelected(sess){
  const sp = getSpecial(sess);
  if(!sp) return;

  const id = $("spSubthemeList").value;
  const st = sp.subthemes.find(x => x.id === id);
  if(!st){
    $("spSubthemeName").value = "";
    $("spSubthemeQuestions").value = "";
    $("spSubthemeInfo").value = "—";
    $("spUpdateSubtheme").disabled = true;
    $("spDeleteSubtheme").disabled = true;
    return;
  }

  $("spSubthemeName").value = st.name || "";
  $("spSubthemeQuestions").value = (st.questions || []).join("\n");
  $("spSubthemeInfo").value = `${st.questions.length} pertanyaan | used: ${st.usedIdx?.length || 0}`;
  $("spUpdateSubtheme").disabled = false;
  $("spDeleteSubtheme").disabled = false;
}

function addSubtheme(){
  const sess = getEditingSession();
  if(!sess || sess.theme !== "special"){
    toast("Pilih sesi bertema Special untuk tambah subtema.");
    return;
  }
  const sp = getSpecial(sess);

  const name = $("spSubthemeName").value.trim();
  const questions = safeLines($("spSubthemeQuestions").value);

  if(!name){
    toast("Nama subtema wajib diisi.");
    return;
  }
  if(questions.length < 1){
    toast("Masukkan minimal 1 pertanyaan untuk subtema.");
    return;
  }

  sp.subthemes.push({
    id: uid(),
    name,
    questions,
    usedIdx: []
  });

  sess.updatedAt = now();
  saveState();

  renderSpecialSubthemeList(sess);
  toast("Subtema ditambahkan.");
}

function updateSubtheme(){
  const sess = getEditingSession();
  if(!sess || sess.theme !== "special") return;
  const sp = getSpecial(sess);

  const id = $("spSubthemeList").value;
  const st = sp.subthemes.find(x => x.id === id);
  if(!st) return;

  const name = $("spSubthemeName").value.trim();
  const questions = safeLines($("spSubthemeQuestions").value);

  if(!name){
    toast("Nama subtema wajib diisi.");
    return;
  }
  if(questions.length < 1){
    toast("Minimal 1 pertanyaan.");
    return;
  }

  st.name = name;
  st.questions = questions;
  // adjust usedIdx if question list changed
  st.usedIdx = (st.usedIdx || []).filter(i => i >= 0 && i < st.questions.length);

  sess.updatedAt = now();
  saveState();

  renderSpecialSubthemeList(sess);
  toast("Subtema diupdate.");
}

function deleteSubtheme(){
  const sess = getEditingSession();
  if(!sess || sess.theme !== "special") return;
  const sp = getSpecial(sess);

  const id = $("spSubthemeList").value;
  const idx = sp.subthemes.findIndex(x => x.id === id);
  if(idx < 0) return;

  sp.subthemes.splice(idx, 1);
  sess.updatedAt = now();
  saveState();

  renderSpecialSubthemeList(sess);
  toast("Subtema dihapus.");
}

// ---------- People Save / Reset ----------
function savePeople(){
  const countRaw = parseInt($("inpCount").value, 10);
  const count = Number.isFinite(countRaw) ? clamp(countRaw, 1, 30) : 0;

  if(!count){
    toast("Isi jumlah peserta (1–30).");
    return;
  }

  const names = safeLines($("taNames").value);
  const finalNames = Array.from({length: count}, (_,i)=> names[i] || `Peserta ${i+1}`);

  state.people.count = count;
  state.people.names = finalNames;
  state.people.turnIndex = clamp(state.people.turnIndex || 0, 0, count-1);
  state.people.updatedAt = now();

  state.uiTheme = $("selTheme").value || "deep";

  // if there is active special session runtime, keep it but re-init if needed (render will adjust)
  saveState();
  toast("Peserta disimpan.");
}

function resetAll(){
  if(!confirm("Reset semua data (peserta & sesi)?")) return;
  stopTimer();
  state = defaultState();
  localStorage.removeItem(KEY);
  render();
  toast("Semua data direset.");
}

// ---------- UI Toggles ----------
function themeLabel(theme){
  switch(theme){
    case "fun": return "Fun";
    case "warm": return "Warm";
    case "deep": return "Deep";
    case "special": return "Special";
    case "closing": return "Closing";
    default: return "Deep";
  }
}

function toggleSessionEditors(theme){
  const isSpecial = theme === "special";
  $("normalSessionEditor").hidden = isSpecial;
  $("specialSessionEditor").hidden = !isSpecial;
}

function toggleControlsForActiveSession(sess){
  const isSpecial = !!sess && sess.theme === "special";
  $("normalControls").hidden = isSpecial;
  $("specialControls").hidden = !isSpecial;
}

// ---------- Render ----------
function render(){
  // update theme
  document.body.setAttribute("data-theme", state.uiTheme || "deep");
  $("pillTheme").textContent = themeLabel(state.uiTheme || "deep");

  // people inputs
  $("inpCount").value = state.people.count || "";
  $("taNames").value = (state.people.names || []).join("\n");
  $("selTheme").value = state.uiTheme || "deep";

  // sessions dropdown
  const sel = $("selSessions");
  sel.innerHTML = "";

  if(state.sessions.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— belum ada sesi —";
    sel.appendChild(opt);
    sel.disabled = true;
    $("btnSetActive").disabled = true;
    $("btnUpdateSession").disabled = true;
    $("btnDeleteSession").disabled = true;
  }else{
    sel.disabled = false;
    for(const s of state.sessions){
      const opt = document.createElement("option");
      opt.value = s.id;
      const mark = (s.id === state.activeSessionId) ? " (aktif)" : "";
      opt.textContent = `${s.name}${mark}`;
      sel.appendChild(opt);
    }
    sel.value = state.activeSessionId || state.sessions[0].id;

    $("btnSetActive").disabled = !sel.value;
    $("btnUpdateSession").disabled = !sel.value;
    $("btnDeleteSession").disabled = !sel.value;
  }

  // active session
  const active = getActiveSession();
  $("activeSessionTag").textContent = active ? `${active.name}` : "Belum ada sesi";

  // adopt active session theme for aesthetic "sesuai sesi"
  if(active && state.uiTheme !== active.theme){
    state.uiTheme = active.theme || state.uiTheme;
    document.body.setAttribute("data-theme", state.uiTheme);
    $("pillTheme").textContent = themeLabel(state.uiTheme || "deep");
  }

  // controls toggle
  toggleControlsForActiveSession(active);

  // turn
  $("turnName").textContent = currentTurnName();
  $("turnHint").textContent = ensurePeopleSilent() ? `(${(state.people.turnIndex||0)+1}/${state.people.count})` : "";

  // stage question
  if(active){
    if(active.theme === "special"){
      $("questionText").textContent = "Mode Special aktif. Spin Nama → pilih subtema → Spin Pertanyaan.";
    }else{
      const lastIdx = (typeof active.lastQuestionIdx === "number") ? active.lastQuestionIdx : null;
      $("questionText").textContent =
        (lastIdx !== null && active.questions[lastIdx]) ?
        active.questions[lastIdx] :
        "Tekan “Spin Pertanyaan” untuk memilih pertanyaan acak.";
    }
  }else{
    $("questionText").textContent = "Buat sesi dulu di panel kanan, lalu jadikan sesi aktif.";
  }

  // progress (normal sessions)
  if(active && active.theme !== "special"){
    const total = active.questions.length;
    const used = active.usedIdx?.length || 0;
    const pct = total ? Math.round((used/total)*100) : 0;
    $("usedCount").textContent = used;
    $("totalCount").textContent = total;
    $("barFill").style.width = `${pct}%`;
  }else{
    $("usedCount").textContent = "0";
    $("totalCount").textContent = "0";
    $("barFill").style.width = "0%";
  }

  // used list (normal)
  const usedList = $("usedList");
  usedList.innerHTML = "";
  if(active && active.theme !== "special" && active.usedIdx?.length){
    const idxs = [...active.usedIdx].slice().sort((a,b)=>a-b);
    for(const i of idxs){
      const li = document.createElement("li");
      li.textContent = active.questions[i] || "(pertanyaan tidak ditemukan)";
      usedList.appendChild(li);
    }
  }else{
    const li = document.createElement("li");
    li.textContent = (active && active.theme === "special")
      ? "Mode Special: pertanyaan used disimpan per subtema (lihat editor Special & log)."
      : "Belum ada pertanyaan yang keluar.";
    usedList.appendChild(li);
  }

  // enable normal buttons
  const canSpin = ensurePeopleSilent() && !!active && active.theme !== "special" &&
    (active.questions.length > 0) &&
    ((active.usedIdx?.length || 0) < active.questions.length);

  $("btnSpin").disabled = !canSpin;
  $("btnNextTurn").disabled = !ensurePeopleSilent();
  $("btnStart1m").disabled = !(ensurePeopleSilent() && !!active);
  $("btnStart45s").disabled = !(ensurePeopleSilent() && !!active);
  $("btnResetSession").disabled = !(!!active && active.theme !== "special");

  // render session editor by currently selected session
  const selectedId = getSelectedSessionId();
  if(selectedId){
    const editSess = state.sessions.find(s => s.id === selectedId);
    if(editSess){
      toggleSessionEditors(editSess.theme);
      // if special, keep list updated
      if(editSess.theme === "special"){
        renderSpecialSubthemeList(editSess);
      }
    }
  }

  // render special controls if active special
  renderSpecialActive(active);
}

function renderSpecialActive(active){
  if(!active || active.theme !== "special"){
    // disable special buttons
    $("spSpinName").disabled = true;
    $("spConfirmSubtheme").disabled = true;
    $("spSpinQuestion").disabled = true;
    $("spResetSpecialRuntime").disabled = true;
    $("spSubthemeSelect").disabled = true;
    $("spSubthemeSelect").innerHTML = "";
    $("spSubthemeRemaining").value = "—";
    $("spRemainingCount").textContent = "0";
    $("spQuota").textContent = "0";
    $("spPersonProg").textContent = "0/0";
    $("spLog").innerHTML = "";
    $("spRemainingList").innerHTML = "";
    return;
  }

  const sp = getSpecial(active);
  const rt = ensureSpecialRuntime(active);

  // quota
  const quota = clamp(parseInt(sp.quotaPerPerson,10) || 1, 1, 10);
  $("spQuota").textContent = String(quota);

  // remaining count + list
  $("spRemainingCount").textContent = String(rt.remainingPeopleIdx.length);
  const remUl = $("spRemainingList");
  remUl.innerHTML = "";
  if(rt.remainingPeopleIdx.length){
    for(const idx of rt.remainingPeopleIdx){
      const li = document.createElement("li");
      li.textContent = state.people.names?.[idx] || `Peserta ${idx+1}`;
      remUl.appendChild(li);
    }
  }else{
    const li = document.createElement("li");
    li.textContent = "Semua sudah selesai. Aktifkan sesi Closing.";
    remUl.appendChild(li);
  }

  // log
  const logOl = $("spLog");
  logOl.innerHTML = "";
  if(rt.log.length){
    for(const item of rt.log.slice(-80)){ // last 80 entries
      const li = document.createElement("li");
      li.textContent = `${item.personName} • ${item.subthemeName}: ${item.question}`;
      logOl.appendChild(li);
    }
  }else{
    const li = document.createElement("li");
    li.textContent = "Belum ada pertanyaan Special yang keluar.";
    logOl.appendChild(li);
  }

  // subtheme select populate
  const sel = $("spSubthemeSelect");
  sel.innerHTML = "";
  for(const st of sp.subthemes){
    const opt = document.createElement("option");
    opt.value = st.id;
    opt.textContent = st.name;
    sel.appendChild(opt);
  }
  sel.disabled = (rt.currentPersonIdx === null); // only enable when someone selected
  if(rt.currentSubthemeId){
    sel.value = rt.currentSubthemeId;
  }

  // remaining questions for selected subtheme
  const stCur = sp.subthemes.find(x => x.id === (rt.currentSubthemeId || sel.value));
  if(stCur){
    const total = stCur.questions.length;
    const used = stCur.usedIdx?.length || 0;
    $("spSubthemeRemaining").value = `${Math.max(0,total-used)} tersisa (total ${total})`;
  }else{
    $("spSubthemeRemaining").value = "—";
  }

  // per-person progress
  const asked = rt.currentPersonAskedCount || 0;
  $("spPersonProg").textContent = `${asked}/${quota}`;

  // buttons enabled logic
  const canSpinName = ensurePeopleSilent() && rt.remainingPeopleIdx.length > 0 && rt.currentPersonIdx === null;
  $("spSpinName").disabled = !canSpinName;

  $("spConfirmSubtheme").disabled = !(rt.currentPersonIdx !== null);
  $("spSpinQuestion").disabled = !(rt.currentPersonIdx !== null && rt.currentSubthemeId);
  $("spResetSpecialRuntime").disabled = false;
}

// ---------- Events ----------
$("btnSavePeople").addEventListener("click", savePeople);
$("btnClearAll").addEventListener("click", resetAll);

$("btnAddSession").addEventListener("click", addSession);
$("btnUpdateSession").addEventListener("click", updateSelectedSession);
$("btnDeleteSession").addEventListener("click", deleteSelectedSession);
$("btnSetActive").addEventListener("click", setActiveSession);

$("btnSpin").addEventListener("click", spinQuestion);
$("btnNextTurn").addEventListener("click", nextTurn);
$("btnResetSession").addEventListener("click", resetSessionUsed);

$("btnStart1m").addEventListener("click", ()=> startTimer(60));
$("btnStart45s").addEventListener("click", ()=> startTimer(45));

$("selTheme").addEventListener("change", ()=>{
  state.uiTheme = $("selTheme").value;
  saveState();
});

$("selSessionTheme").addEventListener("change", ()=>{
  const theme = $("selSessionTheme").value;
  toggleSessionEditors(theme);
});

$("selSessions").addEventListener("change", ()=>{
  const id = getSelectedSessionId();
  if(id) fillEditorFromSession(id);
  $("btnSetActive").disabled = !id;
  $("btnUpdateSession").disabled = !id;
  $("btnDeleteSession").disabled = !id;
});

$("spAddSubtheme").addEventListener("click", addSubtheme);
$("spUpdateSubtheme").addEventListener("click", updateSubtheme);
$("spDeleteSubtheme").addEventListener("click", deleteSubtheme);

$("spSubthemeList").addEventListener("change", ()=>{
  const sess = getEditingSession();
  if(sess && sess.theme === "special"){
    fillSubthemeEditorFromSelected(sess);
  }
});

$("spSpinName").addEventListener("click", specialSpinName);
$("spConfirmSubtheme").addEventListener("click", specialConfirmSubtheme);
$("spSpinQuestion").addEventListener("click", specialSpinQuestion);
$("spResetSpecialRuntime").addEventListener("click", specialResetRuntime);

$("spSubthemeSelect").addEventListener("change", ()=>{
  // only allow changing before locked; if locked, user can still change then press "Kunci Subtema" to lock new one
  const sess = getActiveSession();
  if(!sess || sess.theme !== "special") return;
  const rt = ensureSpecialRuntime(sess);
  if(rt.currentPersonIdx === null) return;
  // do nothing automatic; they must press confirm
});

// Space to spin:
// - If normal session active => space = spinQuestion
// - If special session active:
//   - If no current person => space = spin name
//   - Else if has subtheme locked => space = spin question
//   - Else => do nothing (must confirm subtheme)
window.addEventListener("keydown", (e)=>{
  if(e.code !== "Space") return;
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  if(tag === "input" || tag === "textarea" || tag === "select") return;

  e.preventDefault();

  const sess = getActiveSession();
  if(!sess) return;

  if(sess.theme === "special"){
    const rt = ensureSpecialRuntime(sess);
    if(rt.currentPersonIdx === null){
      if(!$("spSpinName").disabled) specialSpinName();
      return;
    }
    if(rt.currentSubthemeId){
      if(!$("spSpinQuestion").disabled) specialSpinQuestion();
      return;
    }
    toast("Pilih & kunci subtema dulu.");
    return;
  }else{
    if(!$("btnSpin").disabled) spinQuestion();
  }
});

// ---------- Init ----------
function init(){
  // sync dropdown selection, fill editor
  if(state.sessions.length){
    const sel = $("selSessions");
    sel.value = state.activeSessionId || state.sessions[0].id;
    fillEditorFromSession(sel.value);
    $("btnSetActive").disabled = false;
  }else{
    $("btnSetActive").disabled = true;
  }

  $("selTheme").value = state.uiTheme || "deep";
  toggleSessionEditors($("selSessionTheme").value || "deep");

  render();
}

init();
