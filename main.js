// Brain Block - playable build (題目上色+鎖定 / 玩家作答保存 / 驗證10塊 / 安全排行榜)
let STATE = {
  config: null,
  levels: null,
  puzzles: null,
  player: '',
  currentQ: 1,
  selectedPiece: 'I',
  grid: [],             // 當前棋盤（含題目鎖定與玩家著色）
  locked: [],           // true 表題目格（不可更動）
  solved: new Set(),    // 已完成題號
};

const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ======================= Local Save / Load ======================= */
const SAVE_KEY = 'brainblock_save_v2';
// 保存內容：{ player:string, solved:number[], answers: { [qid:number]: "5行*8字" } }
function saveAll(){
  try{
    const data = {
      player: STATE.player || '',
      solved: Array.from(STATE.solved || []),
      answers: _collectAnswers()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }catch(e){ console.warn('saveAll failed', e); }
}
function loadAll(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return {player:'', solved:[], answers:{}};
    const data = JSON.parse(raw);
    return {
      player: data.player || '',
      solved: Array.isArray(data.solved) ? data.solved : [],
      answers: (data.answers && typeof data.answers==='object') ? data.answers : {}
    };
  }catch(e){
    console.warn('loadAll failed', e);
    return {player:'', solved:[], answers:{}};
  }
}
// 只保存「玩家可改的格子」：題目鎖定格用 '.'，可改格用 I/O/L/T/S
function _collectAnswers(){
  const out = {};
  const q = STATE.currentQ;
  if (!q || !STATE.grid || !STATE.locked) return _answersCache;
  const H=5, W=8;
  let rows = [];
  for(let r=0;r<H;r++){
    let line = '';
    for(let c=0;c<W;c++){
      line += STATE.locked[r][c] ? '.' : (STATE.grid[r][c]||'.');
    }
    rows.push(line);
  }
  _answersCache[q] = rows.join('\n');
  return _answersCache;
}
let _answersCache = {};   // 啟動時從 localStorage 載入

/* ========================== Data load =========================== */
async function loadData(){
  const bust = 'ver=' + Date.now(); // 防快取
  const [config, levels, puzzles] = await Promise.all([
    fetch('data/config.json?'+bust).then(r=>r.json()),
    fetch('data/levels.json?'+bust).then(r=>r.json()),
    fetch('data/puzzles.json?'+bust).then(r=>r.json()),
  ]);
  STATE.config  = config;
  STATE.levels  = levels.levels;
  STATE.puzzles = puzzles.puzzles;
}

/* ======================= Page switching ========================= */
function go(screenId){
  $$('.screen').forEach(s=>s.classList.remove('active'));
  $('#screen-'+screenId).classList.add('active');
}

/* ============================ Cover ============================= */
function initCover(){
  $('#btnStart').addEventListener('click', ()=>{
    const name = $('#playerName').value.trim();
    if(!name){ alert('請輸入玩家名稱'); return; }
    STATE.player = name;
    saveAll();                 // 立刻保存玩家名稱
    renderLevelList();
    go('levels');
  });
}

/* ========================= Level List =========================== */
function countSolvedInRange([a,b]){
  let c=0; for(let i=a;i<=b;i++){ if(STATE.solved.has(i)) c++; } return c;
}
function isLevelCleared(lv){ return countSolvedInRange(lv.range)===20; }

function renderLevelList(){
  const ul = $('#levelList'); ul.innerHTML = '';
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

/* ====================== Shapes utilities ======================== */
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

/* ============================ Puzzle ============================ */
function openPuzzle(id){
  STATE.currentQ=id;
  // 先建立空盤與鎖定
  STATE.grid  = Array.from({length:5},()=>Array(8).fill('.'));
  STATE.locked= Array.from({length:5},()=>Array(8).fill(false));

  // 題目 rows 上色 + 鎖定
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

  // 套用玩家曾經作答
  const saved = _answersCache[id];
  if (saved) {
    const parts = saved.split('\n');
    for(let r=0;r<5;r++){
      const line = parts[r] || '';
      for(let c=0;c<8;c++){
        const ch = line[c] || '.';
        if(!STATE.locked[r][c] && 'IOLTS'.includes(ch)) {
          STATE.grid[r][c] = ch;
        }
      }
    }
  }

  // 顯示
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

/* ========================= Draw board ========================== */
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

/* ====================== Toolbar & actions ====================== */
function bindToolbar(){
  $$('#paintToolbar .tool').forEach(btn=>{
    btn.addEventListener('click',()=>{
      $$('#paintToolbar .tool').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      STATE.selectedPiece = btn.dataset.piece || 'I';
    });
  });
  const first=$('#paintToolbar .tool[data-piece="I"]');
  if(first) first.classList.add('active');

  // 點棋盤上色（自動保存＋驗證）
  $('#board').addEventListener('click',e=>{
    const rect=e.target.getBoundingClientRect();
    const x=e.clientX-rect.left, y=e.clientY-rect.top;
    const meta=JSON.parse(e.target.dataset.cell||'{}');
    if(!meta.cell) return;
    const c=Math.floor((x-meta.ox)/meta.cell);
    const r=Math.floor((y-meta.oy)/meta.cell);
    if(r<0||r>=5||c<0||c>=8) return;
    if(STATE.locked[r][c]) return;
    const t=STATE.selectedPiece;
    STATE.grid[r][c] = (t === '.') ? '.' : t;
    drawBoard();
    _collectAnswers(); // 更新該題作答快取
    saveAll();         // 立即保存
    checkSolved();
  });

  // 上/下一題
  $('#prevQ').addEventListener('click', ()=> navigateQ(-1));
  $('#nextQ').addEventListener('click', ()=> navigateQ(+1));
}

function navigateQ(delta){
  let q=STATE.currentQ+delta;
  q = Math.max(1, Math.min(q, STATE.puzzles.length));
  openPuzzle(q);
}

/* ======================= Validation (10塊) ====================== */
function checkSolved(){
  const H=5, W=8;
  const target = STATE.puzzles[STATE.currentQ-1];
  const tgtRows = target ? target.rows : null;

  // A) 全滿 + 題目格不被改色
  for(let r=0;r<H;r++){
    for(let c=0;c<W;c++){
      const ch = STATE.grid[r][c];
      if(ch==='.') return;
      if(tgtRows && STATE.locked[r][c]) {
        const need = (tgtRows[r] || '')[c] || '.';
        if(ch !== need) return;
      }
    }
  }

  // B) 產生所有合法塊候選
  const rot = s=>s.map(([r,c])=>[c,-r]);
  const flip= s=>s.map(([r,c])=>[r,-c]);
  const norm= s=>{
    const minR=Math.min(...s.map(p=>p[0]));
    const minC=Math.min(...s.map(p=>p[1]));
    return s.map(([r,c])=>[r-minR,c-minC]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  };
  const uniqShapes = base=>{
    let s=base,out=[],seen=new Set();
    for(let i=0;i<4;i++){
      const a=norm(s), b=norm(flip(s));
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

  const idx=(r,c)=>r*W+c;
  const CAND=[];
  for(const t of ['I','O','L','T','S']){
    for(const sh of ORIENTS[t]){
      for(let r0=0;r0<H;r0++) for(let c0=0;c0<W;c0++){
        let ok=true, cells=[];
        for(const [dr,dc] of sh){
          const r=r0+dr,c=c0+dc;
          if(r<0||r>=H||c<0||c>=W){ ok=false; break; }
          if(STATE.grid[r][c]!==t){ ok=false; break; }
          cells.push(idx(r,c));
        }
        if(ok){
          cells.sort((a,b)=>a-b);
          const key=t+':'+cells.join(',');
          if(!CAND._seen) CAND._seen=new Set();
          if(!CAND._seen.has(key)){ CAND._seen.add(key); CAND.push({type:t,cells}); }
        }
      }
    }
  }
  if(!CAND.length) return;

  const cellToCand=Array.from({length:H*W},()=>[]);
  CAND.forEach((cand,i)=>cand.cells.forEach(ci=>cellToCand[ci].push(i)));

  const usedCell=Array(H*W).fill(false), usedCand=Array(CAND.length).fill(false);
  const cnt={I:0,O:0,L:0,T:0,S:0}; let picked=0;

  function nextCell(){
    let best=-1, ret=null;
    for(let i=0;i<H*W;i++){
      if(usedCell[i]) continue;
      const opts=cellToCand[i].filter(ci=>{
        if(usedCand[ci]) return false;
        for(const cc of CAND[ci].cells) if(usedCell[cc]) return false;
        if(cnt[CAND[ci].type]>=2) return false;
        return true;
      });
      if(opts.length===0) return {i,options:[]};
      if(best===-1 || opts.length<best){ best=opts.length; ret={i,options:opts}; if(best===1) break; }
    }
    return ret;
  }
  function dfs(){
    if(picked===10){
      for(let i=0;i<H*W;i++) if(!usedCell[i]) return false;
      return ['I','O','L','T','S'].every(t=>cnt[t]===2);
    }
    const choice=nextCell(); if(!choice) return false;
    const {options}=choice; if(options.length===0) return false;
    for(const ci of options){
      const cand=CAND[ci];
      let clash=false; for(const cc of cand.cells){ if(usedCell[cc]){ clash=true; break; } }
      if(clash) continue;
      usedCand[ci]=true; picked++; cnt[cand.type]++; cand.cells.forEach(cc=>usedCell[cc]=true);
      if(cnt[cand.type]<=2 && dfs()) return true;
      cand.cells.forEach(cc=>usedCell[cc]=false); cnt[cand.type]--; picked--; usedCand[ci]=false;
    }
    return false;
  }
  if(!dfs()) return;

  // ✅ 通關
  STATE.solved.add(STATE.currentQ);
  $('#statusImg').src='public/icons/status/btn_solved.svg';
  updateLevelProgressForCurrentQ();
  saveAll(); // 保存通關與作答
  const lv=STATE.levels.find(l=>STATE.currentQ>=l.range[0]&&STATE.currentQ<=l.range[1]);
  if(lv && isLevelCleared(lv)){
    $('#badgeBig').src=`public/badges_big/${lv.badge}_big.png`;
    go('badge');
  }
}

/* ========================== Leaderboard =========================
   這裡先做「不阻塞」版本：即使後端掛了也能返回 */
async function loadLeaderboard(){
  const list = $('#leaderboardList');
  if(!list) return;
  const url = STATE.config && STATE.config.leaderboardUrl;
  if(!url){ list.textContent='排行榜暫不提供或伺服器離線'; return; }

  list.textContent = '讀取中…';
  let timer;
  try{
    const ctrl = new AbortController();
    timer = setTimeout(()=>ctrl.abort(), 6000); // 6 秒逾時
    const res = await fetch(url + (url.includes('?')?'&':'?') + 'top=50', {
      method:'GET', mode:'cors', headers:{accept:'application/json'}, signal: ctrl.signal
    });
    clearTimeout(timer);
    let data=null; try{ data=await res.json(); }catch{}
    if(!res.ok || !data || data.ok===false || !Array.isArray(data.players)){
      list.textContent='讀取失敗';
      return;
    }
    list.innerHTML='';
    data.players.forEach(p=>{
      const row=document.createElement('div');
      row.className='lb-row';
      row.innerHTML=`<div class="lb-name">${p.rank}. ${p.name}</div><div>${p.total_cleared}</div>`;
      list.appendChild(row);
    });
  }catch(e){
    clearTimeout(timer);
    list.textContent='讀取失敗';
  }
}

/* ============================== Nav ============================ */
// 用事件委派，確保任何 data-go 的按鈕都能返回
function initNav(){
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('.nav-btn[data-go]');
    if(btn){
      const to = btn.getAttribute('data-go');
      if(to) go(to);
    }
  });

  // 右上🏆：先切頁再載排行榜，不會卡住返回
  const lbBtn = $('#btnToLeaderboard');
  if (lbBtn) lbBtn.addEventListener('click', ()=>{
    go('leaderboard');
    loadLeaderboard();
  });

  const btnBadgeNext = $('#btnBadgeNext');
  if (btnBadgeNext) btnBadgeNext.addEventListener('click', ()=> go('levels'));
}

/* ============================= Boot ============================ */
(async function(){
  await loadData();
  // 讀取本地存檔
  const saved = loadAll();
  STATE.player = saved.player || '';
  STATE.solved = new Set(saved.solved || []);
  _answersCache = saved.answers || {};

  // 將名字帶回封面輸入框
  const nameInput = $('#playerName'); if(nameInput && STATE.player) nameInput.value = STATE.player;

  initCover();
  bindToolbar();
  initNav();
  renderLevelList();          // 讓關卡進度顯示已解數量
})();
