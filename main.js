// Brain Block - playable build (題目上色+鎖定 / 玩家作答 / 驗證10塊 / 本地保存)
let STATE = {
  config: null,
  levels: null,
  puzzles: null,
  player: '',
  currentQ: 1,
  selectedPiece: 'I',
  grid: [],
  solved: new Set(),
  locked: []
};

const SAVE_KEY = 'brainblock_save_v1';
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------- Local Save / Load ---------- */
function saveProgressToLocal(){
  try{
    const data = {
      player: STATE.player || '',
      solved: Array.from(STATE.solved || [])
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }catch(e){ console.warn('saveProgressToLocal failed', e); }
}

function loadProgressFromLocal(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    if(data.player) STATE.player = data.player;
    if(Array.isArray(data.solved)) STATE.solved = new Set(data.solved);
  }catch(e){ console.warn('loadProgressFromLocal failed', e); }
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
    saveProgressToLocal(); // 儲存名稱
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
  $('#qNumber').textContent=id;
  $('#statusImg').src='public/icons/status/btn_unsolved.svg';
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
      STATE.selectedPiece = btn.dataset.piece || 'I';
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
    if(STATE.locked[r][c]) return;
    const t=STATE.selectedPiece;
    STATE.grid[r][c] = (t === '.') ? '.' : t;
    drawBoard(); checkSolved();
  });

  $('#prevQ').addEventListener('click', ()=> navigateQ(-1));
  $('#nextQ').addEventListener('click', ()=> navigateQ(+1));

  const lbBtn = $('#btnToLeaderboard');
  if (lbBtn) lbBtn.addEventListener('click', ()=> go('leaderboard'));
}

function navigateQ(delta){
  let q=STATE.currentQ+delta;
  if(q<1) q=1;
  if(q>STATE.puzzles.length) q=STATE.puzzles.length;
  openPuzzle(q);
}

/* ---------- 驗證 / 通關 ---------- */
function checkSolved(){
  const H=5, W=8;
  const target = STATE.puzzles[STATE.currentQ-1];
  const tgtRows = target ? target.rows : null;
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

  // 精確鋪滿驗證
  const rot = shape => shape.map(([r,c])=>[c,-r]);
  const flip = shape => shape.map(([r,c])=>[r,-c]);
  const normalize = shape => {
    const minR=Math.min(...shape.map(p=>p[0]));
    const minC=Math.min(...shape.map(p=>p[1]));
    return shape.map(([r,c])=>[r-minR,c-minC]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
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

  const cellToCand = Array.from({length:H*W}, ()=>[]);
  CAND.forEach((cand, i)=> cand.cells.forEach(ci=> cellToCand[ci].push(i)));

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
        best = arr.length;
        list = {i, options:arr};
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
  saveProgressToLocal(); // ← 儲存通關進度

  const lv=STATE.levels.find(l=>STATE.currentQ>=l.range[0]&&STATE.currentQ<=l.range[1]);
  if(lv && isLevelCleared(lv)){
    $('#badgeBig').src=`public/badges_big/${lv.badge}_big.png`;
    go('badge');
  }
}

/* ---------- Leaderboard (暫保留) ---------- */
async function loadLeaderboard(){
  const list = $('#leaderboardList');
  if(!list) return;
  list.textContent = '排行榜暫不提供或伺服器離線';
}

/* ---------- Nav ---------- */
function initNav(){
  $$('#screen-levels .topbar .nav-btn').forEach(btn => btn.addEventListener('click', () => go('cover')));
  $$('#screen-puzzle .topbar .nav-btn[data-go="levels"]').forEach(btn => btn.addEventListener('click', () => go('levels')));
  $$('#screen-badge .topbar .nav-btn').forEach(btn => btn.addEventListener('click', () => go('levels')));
  const btnBadgeNext = $('#btnBadgeNext');
  if (btnBadgeNext) btnBadgeNext.addEventListener('click', () => go('levels'));
  const lbBack = document.querySelector('#screen-leaderboard .topbar .nav-btn');
  if (lbBack) lbBack.addEventListener('click', () => go('levels'));
}

/* ---------- Boot ---------- */
(async function(){
  await loadData();
  loadProgressFromLocal(); // ← 載入舊紀錄
  const nameInput = $('#playerName');
  if (nameInput && STATE.player) nameInput.value = STATE.player; // 顯示舊名字
  initCover();
  bindToolbar();
  initNav();
  await loadLeaderboard();
})();
