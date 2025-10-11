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

  $('#board').addEventListener('click',e=>{
    const rect=e.target.getBoundingClientRect();
    const x=e.clientX-rect.left, y=e.clientY-rect.top;
    const meta=JSON.parse(e.target.dataset.cell||'{}');
    if(!meta.cell) return;
    const c=Math.floor((x-meta.ox)/meta.cell);
    const r=Math.floor((y-meta.oy)/meta.cell);
    if(r<0||r>=5||c<0||c>=8) return;
    if(STATE.locked[r][c]) return; // 鎖定格不可改
    const t=STATE.selectedPiece;
    STATE.grid[r][c] = (t === '.') ? '.' : t;

    // 寫入本地存檔（整盤）
    STATE.saves[STATE.currentQ] = STATE.grid.map(row => row.join(''));
    saveProgressToLocal();

    drawBoard(); checkSolved();
  });

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
      // sendBeacon 回 false 才走備援
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
    // 只用 JSON：不要 callback
    const api = url + (url.includes('?') ? '&' : '?') + 'top=50&_ts=' + Date.now();
    const res = await fetch(api, {
      method: 'GET',
      headers: { 'accept': 'application/json' }
    });

    let data = null;
    try { data = await res.json(); } catch(e){}

    if (!res.ok || !data || data.ok === false || !Array.isArray(data.data)) {
      console.warn('[leaderboard] bad response', res.status, data);
      list.textContent = '排行榜暫不提供或伺服器離線';
      return;
    }

    const rows = data.data;
    list.innerHTML = '';
    rows.forEach((r, i) => {
      const name  = r.player_name || `玩家${i+1}`;
      const total = Number(r.total_cleared || 0);
      // 你目前表是 L1~L5 儲存「已解數量」，這裡就顯示 x/20
      const lvStr = [r.L1, r.L2, r.L3, r.L4, r.L5]
        .map(v => `${Number(v)||0}/20`).join('  ');

      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = `
        <div class="lb-name">${i+1}. ${name}</div>
        <div>${total}</div>
        <div style="opacity:.8; min-width:9em; text-align:right">${lvStr}</div>
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

/* ---------- Boot ---------- */
(async function(){
  loadProgressFromLocal();        // 優先載本地存檔
  await loadData();
  initCover();
  bindToolbar();
  initNav();
  renderLevelList();
  // 可選：go('levels'); // 若想直接看到關卡列表
})();
