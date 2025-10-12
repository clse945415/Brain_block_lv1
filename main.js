// Brain Block - playable build (題目上色+鎖定 / 玩家作答 / 驗證10塊 / 排行榜五關進度 / 本地保存)
let STATE = {
  config: null,
  levels: null,
  puzzles: null,
  player: '',
  currentQ: 1,
  selectedPiece: 'I',
  grid: [],                 // 玩家作答 ('.' 或 'I','O','L','T','S')
  solved: new Set(),        // 已完成題號
  locked: [],               // true 表題目格（不可更動）
  saves: {}                 // { q: ["........","........",...5行] }（完整盤面）
};

const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------- Utils (Global) ---------- */
// 轉 CSS 像素 -> canvas 原生座標（解決 CSS 縮放後點擊偏移）
function getCanvasPoint(e, cvs){
  const rect = cvs.getBoundingClientRect();
  let clientX, clientY;
  if (e.touches && e.touches[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  const xCss = clientX - rect.left;
  const yCss = clientY - rect.top;
  const scaleX = cvs.width  / rect.width;
  const scaleY = cvs.height / rect.height;
  return { x: xCss * scaleX, y: yCss * scaleY };
}

// 煙火特效（完成時在狀態按鈕位置綻放）
function showFireworks(targetSelector){
  const target = document.querySelector(targetSelector);
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = 'fixed';
  canvas.style.left = 0;
  canvas.style.top = 0;
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = 9999;
  document.body.appendChild(canvas);

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const particles = [];
  const colors = ['#FFDD94','#FA897B','#86E3CE','#CCABD8','#D0E6A5'];

  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 4 + 2;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: Math.random() * 3 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 60 + Math.random() * 20
    });
  }

  function animate(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = p.color;
      ctx.fill();
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life--;
    }
    for (let i=particles.length-1;i>=0;i--) {
      if (particles[i].life<=0) particles.splice(i,1);
    }
    if (particles.length>0) requestAnimationFrame(animate);
    else canvas.remove();
  }
  animate();
  setTimeout(()=>canvas.remove(), 2000);
}

/* ---------- LocalStorage ---------- */
const LS_KEYS = {
  name: 'bb_player_name',
  solved: 'bb_solved_set',
  saves: 'bb_grids'
};
function saveProgressToLocal(){
  try{
    localStorage.setItem(LS_KEYS.name, STATE.player||'');
    localStorage.setItem(LS_KEYS.solved, JSON.stringify(Array.from(STATE.solved)));
    localStorage.setItem(LS_KEYS.saves, JSON.stringify(STATE.saves));
  }catch(e){}
}
function loadProgressFromLocal(){
  try{
    const name = localStorage.getItem(LS_KEYS.name);
    if(name) { STATE.player = name; const input = $('#playerName'); if(input) input.value = name; }
    const solved = JSON.parse(localStorage.getItem(LS_KEYS.solved)||'[]');
    STATE.solved = new Set(solved);
    STATE.saves  = JSON.parse(localStorage.getItem(LS_KEYS.saves)||'{}');
  }catch(e){}
}

/* ---------- Load Data ---------- */
async function loadData(){
  const bust = 'ver=' + Date.now();
  const [config, levels, puzzles] = await Promise.all([
    fetch('data/config.json?'+bust).then(r=>r.json()),
    fetch('data/levels.json?'+bust).then(r=>r.json()),
    fetch('data/puzzles.json?'+bust).then(r=>r.json()),
  ]);
  STATE.config  = config;
  STATE.levels  = levels.levels;
  STATE.puzzles = puzzles.puzzles;
}

/* ---------- Page Switch ---------- */
function go(screenId){
  $$('.screen').forEach(s=>s.classList.remove('active'));
  $('#screen-'+screenId).classList.add('active');
}

/* ---------- Cover ---------- */
function initCover(){
  $('#btnStart').addEventListener('click', ()=>{
    const name = $('#playerName').value.trim();
    if(!name){ alert('請輸入玩家名稱'); return; }
    STATE.player = name;
    saveProgressToLocal();
    renderLevelList();
    go('levels');
  });
}

/* ---------- Level List ---------- */
function countSolvedInRange([a,b]){
  let c=0; for(let i=a;i<=b;i++){ if(STATE.solved.has(i)) c++; } return c;
}
function isLevelCleared(lv){ return countSolvedInRange(lv.range)===20; }

function renderLevelList(){
  const ul = $('#levelList');
  if(!ul) return;
  ul.innerHTML = '';
  for(const lv of STATE.levels){
    const li = document.createElement('li');
    li.className = 'level-pill';

    const unlocked = isLevelCleared(lv)
      ? `public/badges/${lv.badge}_unlocked.png`
      : `public/badges/${lv.badge}_locked.svg`;

    const progress = `${countSolvedInRange(lv.range)} / 20`;

    li.innerHTML = `
      <div class="level-left">
        <div class="level-title">${lv.name}</div>
        <div class="level-progress">${progress}</div>
      </div>
      <div class="badge-circle"><img src="${unlocked}" alt=""></div>
      <button class="enter-circle" aria-label="進入 ${lv.name}">
        <img src="public/icons/nav/arrow_next.svg" alt="">
      </button>
    `;

    li.querySelector('.enter-circle').addEventListener('click', ()=>{
      const [a,b] = lv.range;
      let q = a;
      for(let i=a;i<=b;i++){ if(!STATE.solved.has(i)) { q=i; break; } }
      openPuzzle(q);
    });

    ul.appendChild(li);
  }
}

/* ---------- 形狀工具 ---------- */
const P_TYPES = ['I','O','L','T','S'];
function rotate90(shape){ return shape.map(([r,c])=>[c,-r]); }
function flipH(shape){ return shape.map(([r,c])=>[r,-c]); }
function normalize(shape){
  const minR=Math.min(...shape.map(p=>p[0]));
  const minC=Math.min(...shape.map(p=>p[1]));
  return shape.map(([r,c])=>[r-minR,c-minC]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
function signature(shape){ return normalize(shape).map(([r,c])=>`${r},${c}`).join(';'); }
function uniq(arr){ return Array.from(new Set(arr)); }
function allOrientations(base){
  let shapes=[],s=base;
  for(let i=0;i<4;i++){
    shapes.push(signature(s));
    shapes.push(signature(flipH(s)));
    s=rotate90(s);
  }
  return uniq(shapes);
}
const BASE_SHAPES={
  I:[[0,0],[1,0],[2,0],[3,0]],
  O:[[0,0],[0,1],[1,0],[1,1]],
  L:[[0,0],[1,0],[2,0],[2,1]],
  T:[[0,0],[0,1],[0,2],[1,1]],
  S:[[0,1],[0,2],[1,0],[1,1]]
};
const VALID_SIGS=Object.fromEntries(P_TYPES.map(t=>[t,new Set(allOrientations(BASE_SHAPES[t]))]));

/* ---------- Puzzle ---------- */
function openPuzzle(id){
  STATE.currentQ=id;
  STATE.grid  = Array.from({length:5},()=>Array(8).fill('.'));
  STATE.locked= Array.from({length:5},()=>Array(8).fill(false));

  // 題目直接上色 + 鎖定
  const target=STATE.puzzles[id-1];
  if(target && target.rows){
    for(let r=0;r<5;r++){
      const row=target.rows[r]||'';
      for(let c=0;c<8;c++){
        const ch=row[c]||'.';
        if('IOLTS'.includes(ch)){
          STATE.grid[r][c]=ch;
          STATE.locked[r][c]=true;
        }
      }
    }
  }

  // 套用本地保存（玩家塗色），不改動鎖定格
  const saved = STATE.saves[id];
  if(saved && Array.isArray(saved) && saved.length===5){
    for(let r=0;r<5;r++){
      for(let c=0;c<8;c++){
        if(STATE.locked[r][c]) continue;
        const ch = (saved[r][c]||'.');
        if('IOLTS'.includes(ch)) STATE.grid[r][c]=ch;
      }
    }
  }

  $('#qNumber').textContent=id;
  $('#statusImg').src = STATE.solved.has(id)
    ? 'public/icons/status/btn_solved.svg'
    : 'public/icons/status/btn_unsolved.svg';

  updateLevelProgressForCurrentQ();
  drawBoard();
  go('puzzle');

  // ✅ 進入題目頁後做一次手機尺寸調整（行內 CSS 寬高）
  if (typeof window.__fitBoardMobile === 'function') {
    setTimeout(window.__fitBoardMobile, 0); // 等畫面切換完成再量測
  }
}

function updateLevelProgressForCurrentQ(){
  const lv=STATE.levels.find(l=>STATE.currentQ>=l.range[0]&&STATE.currentQ<=l.range[1]);
  const val=lv?`${countSolvedInRange(lv.range)} / 20`:`${STATE.solved.size} / 100`;
  $('#levelProgress').textContent=val;
}

/* ---------- 畫棋盤 ---------- */
function drawBoard(){
  const cvs=$('#board'),ctx=cvs.getContext('2d');
  const w=cvs.width,h=cvs.height,H=5,W=8;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#F7F7F7';ctx.fillRect(0,0,w,h);
  const cell=Math.min(Math.floor((w-40)/8),Math.floor((h-40)/5));
  const ox=(w-cell*W)/2,oy=(h-cell*H)/2;

  for(let r=0;r<H;r++){
    for(let c=0;c<W;c++){
      const t=STATE.grid[r][c];
      if(t!=='.'){
        ctx.fillStyle=STATE.config.colors[t];
        ctx.fillRect(ox+c*cell+1,oy+r*cell+1,cell-2,cell-2);
        if(STATE.locked[r][c]){
          ctx.strokeStyle='rgba(0,0,0,0.2)';
          ctx.lineWidth=2;
          ctx.strokeRect(ox+c*cell+1.5,oy+r*cell+1.5,cell-3,cell-3);
        }
      }
    }
  }

  ctx.strokeStyle=STATE.config.colors.gridBorder;
  ctx.lineWidth=2;
  ctx.strokeRect(ox,oy,cell*W,cell*H);
  for(let r=1;r<H;r++){ctx.beginPath();ctx.moveTo(ox,oy+r*cell);ctx.lineTo(ox+W*cell,oy+r*cell);ctx.stroke();}
  for(let c=1;c<W;c++){ctx.beginPath();ctx.moveTo(ox+c*cell,oy);ctx.lineTo(ox+c*cell,oy+H*cell);ctx.stroke();}
  cvs.dataset.cell=JSON.stringify({ox,oy,cell});
}

/* ---------- 工具列與互動 ---------- */
function bindToolbar(){
  $$('#paintToolbar .tool').forEach(btn=>{
    btn.addEventListener('click',()=>{
      $$('#paintToolbar .tool').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      STATE.selectedPiece = btn.dataset.piece || 'I'; // '.' 為橡皮擦
    });
  });
  const first=$('#paintToolbar .tool[data-piece="I"]');
  if(first) first.classList.add('active');

  const boardEl = $('#board');
  if (!boardEl) return;

  function handlePaintEvent(e){
    // 避免手機滾動/雙指縮放干擾
    if (e.cancelable) e.preventDefault();

    const meta = JSON.parse(boardEl.dataset.cell || '{}');
    if (!meta.cell) return;

    const { x, y } = getCanvasPoint(e, boardEl); // 轉回 canvas 原生座標
    const c = Math.floor((x - meta.ox) / meta.cell);
    const r = Math.floor((y - meta.oy) / meta.cell);
    if (r<0 || r>=5 || c<0 || c>=8) return;
    if (STATE.locked[r][c]) return;

    const t = STATE.selectedPiece;
    STATE.grid[r][c] = (t === '.') ? '.' : t;

    STATE.saves[STATE.currentQ] = STATE.grid.map(row => row.join(''));
    saveProgressToLocal();

    drawBoard();
    checkSolved();
  }

  // 用 pointer 事件涵蓋滑鼠/觸控/手寫筆；iOS 安全再補 touchstart
  boardEl.addEventListener('pointerdown', handlePaintEvent);
  boardEl.addEventListener('touchstart', handlePaintEvent, { passive: false });

  // 上/下一題
  $('#prevQ').addEventListener('click', ()=> navigateQ(-1));
  $('#nextQ').addEventListener('click', ()=> navigateQ(+1));

  // 右上🏆：先切頁後讀取（避免失敗卡住）
  const lbBtn = $('#btnToLeaderboard');
  if (lbBtn) lbBtn.addEventListener('click', () => {
    go('leaderboard');
    loadLeaderboard();
  });
}
function navigateQ(delta){
  let q=STATE.currentQ+delta;
  if(q<1) q=1;
  if(q>STATE.puzzles.length) q=STATE.puzzles.length;
  openPuzzle(q);
}

/* ---------- 驗證：整盤全滿 + 共10塊 + I/O/L/T/S各2 ---------- */
function checkSolved(){
  const H=5, W=8;

  const target = STATE.puzzles[STATE.currentQ-1];
  const tgtRows = target ? target.rows : null;
  for(let r=0;r<H;r++){
    for(let c=0;c<W;c++){
      const ch = STATE.grid[r][c];
      if(ch==='.') return; // 尚未填滿
      if(tgtRows && STATE.locked[r][c]) {
        const need = (tgtRows[r] || '')[c] || '.';
        if(ch !== need) return; // 題目格被改
      }
      if(!['I','O','L','T','S'].includes(ch)) return;
    }
  }

  // 形狀庫
  const rot = s => s.map(([r,c])=>[c,-r]);
  const flip = s => s.map(([r,c])=>[r,-c]);
  const normalize = s => {
    const minR=Math.min(...s.map(p=>p[0])), minC=Math.min(...s.map(p=>p[1]));
    return s.map(([r,c])=>[r-minR,c-minC]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  };
  const uniqShapes = base=>{
    let s=base, out=[], seen=new Set();
    for(let i=0;i<4;i++){
      const a=normalize(s), b=normalize(flip(s));
      const ka=JSON.stringify(a), kb=JSON.stringify(b);
      if(!seen.has(ka)){ seen.add(ka); out.push(a); }
      if(!seen.has(kb)){ seen.add(kb); out.push(b); }
      s=rot(s);
    }
    return out;
  };
  const BASE = {
    I:[[0,0],[1,0],[2,0],[3,0]],
    O:[[0,0],[0,1],[1,0],[1,1]],
    L:[[0,0],[1,0],[2,0],[2,1]],
    T:[[0,0],[0,1],[0,2],[1,1]],
    S:[[0,1],[0,2],[1,0],[1,1]],
  };
  const ORIENTS = Object.fromEntries(['I','O','L','T','S'].map(t=>[t, uniqShapes(BASE[t])]));

  // 產生候選 4 格
  const idx = (r,c)=> r*W + c;
  const CAND = [];
  for (const t of ['I','O','L','T','S']){
    for (const shape of ORIENTS[t]){
      for(let r0=0;r0<H;r0++){
        for(let c0=0;c0<W;c0++){
          let ok=true, cells=[];
          for(const [dr,dc] of shape){
            const r=r0+dr, c=c0+dc;
            if(r<0||r>=H||c<0||c>=W){ ok=false; break; }
            if(STATE.grid[r][c]!==t){ ok=false; break; }
            cells.push(idx(r,c));
          }
          if(ok){
            cells.sort((a,b)=>a-b);
            const key = t + ':' + cells.join(',');
            if(!CAND._seen){ CAND._seen=new Set(); }
            if(!CAND._seen.has(key)){
              CAND._seen.add(key);
              CAND.push({type:t, cells});
            }
          }
        }
      }
    }
  }
  if (CAND.length === 0) return;

  // 建索引
  const cellToCand = Array.from({length:H*W}, ()=>[]);
  CAND.forEach((cand, i)=> cand.cells.forEach(ci=> cellToCand[ci].push(i)));

  // 精確鋪滿
  const usedCell = Array(H*W).fill(false);
  const usedCand = Array(CAND.length).fill(false);
  const countByType = {I:0,O:0,L:0,T:0,S:0};
  let picked = 0;

  function nextCell(){
    let best=-1, list=null;
    for(let i=0;i<H*W;i++){
      if(usedCell[i]) continue;
      const arr = cellToCand[i].filter(ci=>{
        if(usedCand[ci]) return false;
        for(const cc of CAND[ci].cells) if(usedCell[cc]) return false;
        if(countByType[CAND[ci].type] >= 2) return false;
        return true;
      });
      if(arr.length===0) return {i, options:[]};
      if(best===-1 || arr.length < best){
        best = arr.length; list = {i, options:arr};
        if(best===1) break;
      }
    }
    return list;
  }

  function dfs(){
    if (picked === 10){
      for(let i=0;i<H*W;i++) if(!usedCell[i]) return false;
      return ['I','O','L','T','S'].every(t=>countByType[t]===2);
    }
    const choice = nextCell();
    if(!choice) return false;
    const {options} = choice;
    if(options.length===0) return false;

    for(const ci of options){
      const cand = CAND[ci];
      let clash=false; for(const cc of cand.cells){ if(usedCell[cc]){ clash=true; break; } }
      if(clash) continue;

      usedCand[ci]=true; picked++; countByType[cand.type]++;
      cand.cells.forEach(cc=> usedCell[cc]=true);

      if (countByType[cand.type] <= 2 && dfs()) return true;

      cand.cells.forEach(cc=> usedCell[cc]=false);
      countByType[cand.type]--;
      picked--; usedCand[ci]=false;
    }
    return false;
  }

  const ok = dfs();
  if(!ok) return;

  // ✅ 通關
  STATE.solved.add(STATE.currentQ);
  $('#statusImg').src='public/icons/status/btn_solved.svg';
  showFireworks('#statusImg');
  updateLevelProgressForCurrentQ();
  saveProgressToLocal();

  const lv=STATE.levels.find(l=>STATE.currentQ>=l.range[0]&&STATE.currentQ<=l.range[1]);
  if(lv && countSolvedInRange(lv.range)===20){
    $('#badgeBig').src=`public/badges_big/${lv.badge}_big.png`;
    go('badge');
  }
  pushProgress();
}

/* ---------- Leaderboard ---------- */
async function pushProgress(){
  try{
    const url = STATE.config && STATE.config.leaderboardUrl;
    if(!url || !STATE.player){ 
      console.warn('leaderboard disabled or no player'); 
      return; 
    }

    const totalCleared = STATE.solved.size;
    const lv = STATE.levels.find(l => STATE.currentQ>=l.range[0] && STATE.currentQ<=l.range[1]);
    const levelIndex = lv ? Number(lv.level) : null;

    const payload = {
      secret: STATE.config.sharedSecret || '',
      player_name: STATE.player,
      total_cleared: totalCleared,   // 0~100
      level_cleared: levelIndex,     // 1..5（完成該關時你後端會打勾）
      puzzle_id: STATE.currentQ
    };

    // ---- 優先：sendBeacon（不會預檢，最穩定）----
    const data = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=UTF-8' });
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(url, data);
      if (ok) return;
    }

    // ---- 備援：no-cors + text/plain（同樣不預檢）----
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(()=>{});
  }catch(e){
    console.warn('pushProgress exception', e);
  }
}

async function loadLeaderboard(){
  const list = $('#leaderboardList');
  if (!list) return;
  list.textContent = '讀取中…';

  const url = STATE.config && STATE.config.leaderboardUrl;
  if (!url) { list.textContent = '排行榜未啟用'; return; }

  try {
    const api = url + (url.includes('?') ? '&' : '?') + 'top=50&_ts=' + Date.now();
    const res = await fetch(api, { method: 'GET', headers: { 'accept': 'application/json' } });
    let data = null;
    try { data = await res.json(); } catch(e){}

    if (!res.ok || !data || data.ok === false || !Array.isArray(data.data)) {
      console.warn('[leaderboard] bad response', res.status, data);
      list.textContent = '排行榜暫不提供或伺服器離線';
      return;
    }

    const rows = data.data;
    list.innerHTML = '';
    const MAX_PER_LEVEL = 20;
    const TOTAL_MAX = (STATE?.levels?.length || 5) * MAX_PER_LEVEL;

    rows.forEach((r, i) => {
      const name  = r.player_name || `玩家${i+1}`;
      const lvVals = [Number(r.L1)||0, Number(r.L2)||0, Number(r.L3)||0, Number(r.L4)||0, Number(r.L5)||0];
      const total = Math.min(TOTAL_MAX, Number(r.total_cleared ?? lvVals.reduce((a,b)=>a+b,0)) || 0);
      const totalText = `${total} / ${TOTAL_MAX}`;

      // ✅ 簡化顯示樣式，只顯示名稱與總進度
      const row = document.createElement('div');
      row.className = 'lb-row simple';
      row.innerHTML = `
        <div class="lb-rank">${i + 1}.</div>
        <div class="lb-name">${name}</div>
        <div class="lb-total">${totalText}</div>
      `;
      list.appendChild(row);
    });

  } catch (e) {
    console.warn('loadLeaderboard failed', e);
    list.textContent = '排行榜暫不提供或伺服器離線';
  }
}


/* ---------- Nav ---------- */
function initNav(){
  // 返回
  $$('#screen-levels .topbar .nav-btn').forEach(btn =>
    btn.addEventListener('click', () => go('cover'))
  );
  $$('#screen-puzzle .topbar .nav-btn[data-go="levels"]').forEach(btn =>
    btn.addEventListener('click', () => go('levels'))
  );
  $$('#screen-badge .topbar .nav-btn').forEach(btn =>
    btn.addEventListener('click', () => go('levels'))
  );
  // 排行榜頁返回（HTML 已有返回鍵）
  const lbBack = document.querySelector('#screen-leaderboard .topbar .nav-btn');
  if (lbBack) lbBack.addEventListener('click', () => go('levels'));

  const btnBadgeNext = $('#btnBadgeNext');
  if (btnBadgeNext) btnBadgeNext.addEventListener('click', () => go('levels'));
}

/* ---------- PWA Install (Add to Home Screen) ---------- */
const PWA_LS = {
  iosTipDismissed: 'bb_ios_tip_dismissed',
  installDismissed: 'bb_install_dismissed'
};

function setupPWA(){
  registerServiceWorker();
  setupInstallPrompt();
  showIOSTipIfNeeded();
  watchDisplayMode();
}

function registerServiceWorker(){
  if ('serviceWorker' in navigator) {
    // 你的 sw.js 放在根目錄或與 index.html 同層
    navigator.serviceWorker.register('./sw.js').catch(err=>{
      console.warn('[PWA] SW register failed:', err);
    });
  }
}

function isStandalone(){
  // Android/桌面：display-mode；iOS Safari：navigator.standalone
  const dm = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return dm || window.navigator.standalone === true;
}

let _deferredPrompt = null;
function setupInstallPrompt(){
  // 動態注入最小樣式
  injectPWAStyles();

  // 如果已是安裝狀態就不顯示
  if (isStandalone()) return;

  window.addEventListener('beforeinstallprompt', (e)=>{
    // 阻止瀏覽器自己跳出小框框，改成自家按鈕
    e.preventDefault();
    _deferredPrompt = e;

    // 若使用者沒有永久關閉，顯示安裝浮動按鈕
    if (!localStorage.getItem(PWA_LS.installDismissed)) {
      renderInstallFAB();
    }
  });

  window.addEventListener('appinstalled', ()=>{
    // 安裝成功：收起提示
    removeNode('#bb-install-fab');
    removeNode('#bb-ios-tip');
    _deferredPrompt = null;
  });
}

function renderInstallFAB(){
  if (document.querySelector('#bb-install-fab')) return;
  const btn = document.createElement('button');
  btn.id = 'bb-install-fab';
  btn.type = 'button';
  btn.setAttribute('aria-label','安裝 Brain Block');
  btn.innerHTML = '安裝&nbsp;App';

  btn.addEventListener('click', async ()=>{
    if (!_deferredPrompt) {
      // 沒拿到事件，代表瀏覽器不支援或已安裝
      btn.classList.add('bb-hide');
      return;
    }
    _deferredPrompt.prompt();
    try{
      const choice = await _deferredPrompt.userChoice;
      // 使用者選擇後，不論接受或取消，都先把 _deferredPrompt 清掉
      _deferredPrompt = null;
      // 若取消，保留按鈕讓他之後再安裝；若安裝成功，系統會觸發 appinstalled 事件
      if (choice && choice.outcome === 'dismissed') {
        // 什麼都不做，讓他可以再按
      }
    }catch(e){
      console.warn('[PWA] userChoice error:', e);
    }
  });

  // 右上角關閉叉叉
  const close = document.createElement('span');
  close.className = 'bb-fab-close';
  close.innerHTML = '&times;';
  close.setAttribute('aria-label','關閉');
  close.addEventListener('click', ()=>{
    localStorage.setItem(PWA_LS.installDismissed, '1');
    btn.classList.add('bb-hide');
    setTimeout(()=>removeNode('#bb-install-fab'), 200);
  });
  btn.appendChild(close);

  document.body.appendChild(btn);
}

function showIOSTipIfNeeded(){
  // iOS Safari 沒有 beforeinstallprompt，要教他用「分享 -> 加入主畫面」
  const ua = window.navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const isSafari = isIOS && !!window.webkit && !!window.webkit.messageHandlers === false; // 大致辨識
  const alreadyDismissed = localStorage.getItem(PWA_LS.iosTipDismissed);

  if (isStandalone() || !isIOS) return;
  if (alreadyDismissed) return;

  // 顯示 iOS 導引條
  if (!document.querySelector('#bb-ios-tip')) {
    const bar = document.createElement('div');
    bar.id = 'bb-ios-tip';
    bar.innerHTML = `
      <div class="bb-ios-tip-text">
        將此遊戲加入主畫面：<br>
        1) 點選 Safari 的「分享」圖示，2) 選擇「加入主畫面」
      </div>
      <button type="button" class="bb-ios-tip-btn">知道了</button>
    `;
    bar.querySelector('.bb-ios-tip-btn').addEventListener('click', ()=>{
      localStorage.setItem(PWA_LS.iosTipDismissed, '1');
      bar.classList.add('bb-hide');
      setTimeout(()=>removeNode('#bb-ios-tip'), 200);
    });
    document.body.appendChild(bar);
  }
}

function watchDisplayMode(){
  // 監聽顯示模式變化（Chrome/Android）
  if (window.matchMedia) {
    const mm = window.matchMedia('(display-mode: standalone)');
    if (mm && mm.addEventListener) {
      mm.addEventListener('change', (e)=>{
        if (e.matches) {
          removeNode('#bb-install-fab');
          removeNode('#bb-ios-tip');
        }
      });
    }
  }
}

function removeNode(sel){
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function injectPWAStyles(){
  if (document.querySelector('#bb-pwa-style')) return;
  const css = `
#bb-install-fab{
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 9999;
  padding: 12px 16px 12px 16px;
  border: none;
  border-radius: 999px;
  font-size: 15px;
  line-height: 1;
  box-shadow: 0 6px 18px rgba(0,0,0,.18);
  background: #1C6F73; color: #fff;
  display: inline-flex; align-items: center; gap: 8px;
  transition: transform .18s ease, opacity .18s ease;
}
#bb-install-fab.bb-hide{ opacity: 0; transform: translateY(8px); }
#bb-install-fab .bb-fab-close{
  margin-left: 8px; font-size: 18px; opacity: .9; line-height: 1;
  cursor: pointer;
}
#bb-ios-tip{
  position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 9998;
  background: rgba(255,255,255,.96); backdrop-filter: blur(6px);
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 12px; padding: 12px;
  box-shadow: 0 6px 18px rgba(0,0,0,.12);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  font-size: 14px; color: #333;
}
#bb-ios-tip .bb-ios-tip-btn{
  border: none; background: #1C6F73; color: #fff;
  padding: 8px 12px; border-radius: 999px; font-size: 14px;
}
@media (min-width: 768px){
  #bb-install-fab{ bottom: 24px; right: 24px; }
  #bb-ios-tip{ left: calc(50% - 280px); right: auto; width: 560px; }
}
  `.trim();
  const style = document.createElement('style');
  style.id = 'bb-pwa-style';
  style.textContent = css;
  document.head.appendChild(style);
}


/* ---------- Boot ---------- */
(async function(){
  loadProgressFromLocal();        // 優先載本地存檔
  await loadData();
  initCover();
  bindToolbar();
  initNav();
  renderLevelList();
  setupPWA();
  // 可選：go('levels'); // 若想直接看到關卡列表
})();

/* === 只縮放 5×8 棋盤（手機），其他排版不動 ===
   不改 canvas 的屬性寬高，只改「行內 CSS 尺寸」以保持比例 8:5。 */
(function setupMobileBoardFit(){
  const RATIO_W = 8, RATIO_H = 5;
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  function fitBoardMobile() {
    const board = document.getElementById('board');
    const wrap  = board?.closest('.board-wrap');
    if (!board || !wrap) return;

    if (!isMobile()) { 
      board.style.width = ''; 
      board.style.height = ''; 
      return; 
    }

    const topbar = document.querySelector('#screen-puzzle .topbar');
    const title  = document.querySelector('#screen-puzzle .puzzle-title');
    const tools  = document.getElementById('paintToolbar');
    const footer = document.querySelector('#screen-puzzle .puzzle-footer');

    // 1) 可見區域
    const viewH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const viewW = window.visualViewport ? window.visualViewport.width  : window.innerWidth;

    const topH    = (topbar?.offsetHeight || 0) + (title?.offsetHeight || 0);
    const bottomH = (tools?.offsetHeight || 0) + (footer?.offsetHeight || 0);
    const safeGapY = 24;
    const availH = Math.max(100, viewH - topH - bottomH - safeGapY);

    // 2) 內部寬度（扣 padding）
    const cs = getComputedStyle(wrap);
    const padL = parseFloat(cs.paddingLeft)  || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const innerWrapW = Math.max(0, wrap.clientWidth - padL - padR);

    const safeGapX = 24;
    const availW = Math.max(120, Math.min(innerWrapW, viewW - safeGapX));

    // 3) 依 8:5 比例
    const hByW   = availW * (RATIO_H / RATIO_W);
    const finalH = Math.min(hByW, availH);
    const finalW = finalH * (RATIO_W / RATIO_H);

    // 4) 套尺寸（行內 CSS）
    board.style.width  = finalW + 'px';
    board.style.height = finalH + 'px';
  }

  // 螢幕尺寸或可視區改變時重新計算
  window.addEventListener('resize', fitBoardMobile);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitBoardMobile);
  }

  // 對外保留一個可呼叫的函式（進入題目頁時呼叫）
  window.__fitBoardMobile = fitBoardMobile;
})();

// 點擊「小徽章」→ 開啟大徽章頁
document.querySelectorAll('.badge-circle').forEach((el, idx) => {
  el.addEventListener('click', () => {
    const levelIndex = idx + 1;
    showBadgePage(levelIndex);
  });
});

// 顯示大徽章頁
function showBadgePage(levelIndex) {
  // 隱藏其他畫面
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-badge').classList.add('active');

  // 更新徽章圖片
  const img = $('#badgeImage');
  img.src = `public/badges/badge_L${levelIndex}.png`;
  img.alt = `徽章 L${levelIndex}`;
  
  // 下一關邏輯
  const btnNext = $('#btnNextLevel');
  btnNext.onclick = () => {
    STATE.currentLevel = levelIndex + 1;
    // 進入下一關的選關畫面或題目
    showLevel(levelIndex + 1);
  };
}

// 返回選關畫面
$('#btnBadgeBack').addEventListener('click', () => {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-levels').classList.add('active'); // 假設選關頁 id 是這個
});
