// Brain Block - playable build (題目顯示 + 上色作答)
let STATE = {
  config:null, levels:null, puzzles:null,
  player:'', currentQ:1, selectedPiece:'I',
  grid:[], // 5x8 玩家作答 ('.' 或 'I','O','L','T','S')
  solved: new Set(), // 已標記完成的題號
  // 多一個鎖定矩陣，true 表示題目給的格子
  locked: [] //true表示題目格
};
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

async function loadData(){
  const [config, levels, puzzles] = await Promise.all([
    fetch('data/config.json').then(r=>r.json()),
    fetch('data/levels.json').then(r=>r.json()),
    fetch('data/puzzles.json').then(r=>r.json()),
  ]);
  STATE.config=config;
  STATE.levels=levels.levels;
  STATE.puzzles=puzzles.puzzles;
}

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
    renderLevelList();
    go('levels');
  });
}

/* ---------- Levels ---------- */
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

    // 新增進度文字（title 右側顯示 0/20）
    const progress = `${countSolvedInRange(lv.range)} / 20`;

    li.innerHTML = `
      <div class="level-left">
        <div class="level-title">${lv.name}</div>
        <div class="level-progress">${progress}</div>
      </div>

      <div class="badge-circle" title="${isLevelCleared(lv) ? '已解鎖' : '未解鎖'}">
        <img src="${unlocked}" alt="">
      </div>

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
const P_TYPES = ['I','O','L','T','S'];

function rotate90(shape){ return shape.map(([r,c])=>[c,-r]); }
function flipH(shape){ return shape.map(([r,c])=>[r,-c]); }
function normalize(shape){
  const minR = Math.min(...shape.map(p=>p[0]));
  const minC = Math.min(...shape.map(p=>p[1]));
  return shape.map(([r,c])=>[r-minR, c-minC]).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
}
function signature(shape){ return normalize(shape).map(([r,c])=>`${r},${c}`).join(';'); }
function uniq(arr){ return Array.from(new Set(arr)); }

function allOrientations(base){
  let shapes = [], s = base;
  for(let i=0;i<4;i++){
    shapes.push(signature(s));
    shapes.push(signature(flipH(s)));
    s = rotate90(s);
  }
  return uniq(shapes);
}

const BASE_SHAPES = {
  I: [[0,0],[1,0],[2,0],[3,0]],
  O: [[0,0],[0,1],[1,0],[1,1]],
  L: [[0,0],[1,0],[2,0],[2,1]],
  T: [[0,0],[0,1],[0,2],[1,1]],
  S: [[0,1],[0,2],[1,0],[1,1]], // 鏡像(Z)會被 allOrientations 自動涵蓋
};
const VALID_SIGS = Object.fromEntries(
  P_TYPES.map(t => [t, new Set(allOrientations(BASE_SHAPES[t]))])
);

/* ---------- Puzzle ---------- */
function openPuzzle(id){
  STATE.currentQ = id;

  // 盤面 + 鎖定矩陣
  STATE.grid   = Array.from({length:5}, ()=>Array(8).fill('.'));
  STATE.locked = Array.from({length:5}, ()=>Array(8).fill(false));

  // 讀取題目，直接上色並鎖定
  const target = STATE.puzzles[id-1];
  if(target && target.rows){
    for(let r=0;r<5;r++){
      const row = target.rows[r] || '';
      for(let c=0;c<8;c++){
        const ch = row[c] || '.';
        if('IOLTS'.includes(ch)){
          STATE.grid[r][c]   = ch;     // 題目顏色直接成為實際著色
          STATE.locked[r][c] = true;   // 這格不可更動
        }
      }
    }
  }

  $('#qNumber').textContent = id;
  $('#statusImg').src = 'public/icons/status/btn_unsolved.svg';
  updateLevelProgressForCurrentQ();
  drawBoard();
  go('puzzle');
}

function updateLevelProgressForCurrentQ(){
  const lv = STATE.levels.find(l => STATE.currentQ>=l.range[0] && STATE.currentQ<=l.range[1]);
  const val = lv ? `${countSolvedInRange(lv.range)} / 20` : `${STATE.solved.size} / 100`;
  $('#levelProgress').textContent = val;
}

function hexToRgba(hex, a=0.25){
  if(!hex) return `rgba(0,0,0,${a})`;
  let s = hex.replace('#','');
  if(s.length===3) s = s.split('').map(x=>x+x).join('');
  const r = parseInt(s.slice(0,2),16);
  const g = parseInt(s.slice(2,4),16);
  const b = parseInt(s.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

function drawBoard(){
  const cvs = $('#board');
  const ctx = cvs.getContext('2d');
  const w = cvs.width, h = cvs.height;
  const H = 5, W = 8;

  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = '#F7F7F7';
  ctx.fillRect(0,0,w,h);

  const cell = Math.min(Math.floor((w-40)/8), Math.floor((h-40)/5));
  const ox = (w - cell*W)/2, oy = (h - cell*H)/2;

  // === 依 grid 上色（包含題目鎖定格與玩家格） ===
  for(let r=0;r<H;r++){
    for(let c=0;c<W;c++){
      const t = STATE.grid[r][c];
      if(t!=='.'){
        ctx.fillStyle = STATE.config.colors[t];
        ctx.fillRect(ox+c*cell+1, oy+r*cell+1, cell-2, cell-2);
        // 鎖定格描淡灰邊
        if (STATE.locked && STATE.locked[r][c]) {
          ctx.strokeStyle = 'rgba(0,0,0,0.2)';
          ctx.lineWidth = 2;
          ctx.strokeRect(ox+c*cell+1.5, oy+r*cell+1.5, cell-3, cell-3);
        }
      }
    }
  }

  // === 畫格線 ===
  ctx.strokeStyle = STATE.config.colors.gridBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, cell*W, cell*H);
  for(let r=1;r<H;r++){ ctx.beginPath(); ctx.moveTo(ox, oy+r*cell); ctx.lineTo(ox+W*cell, oy+r*cell); ctx.stroke(); }
  for(let c=1;c<W;c++){ ctx.beginPath(); ctx.moveTo(ox+c*cell, oy); ctx.lineTo(ox+c*cell, oy+H*cell); ctx.stroke(); }

  cvs.dataset.cell = JSON.stringify({ox,oy,cell});
}
  
  // ===== 格線（放在提示之後，保持銳利） =====
  ctx.strokeStyle = STATE.config.colors.gridBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, cell*8, cell*5);
  for(let r=1;r<5;r++){ ctx.beginPath(); ctx.moveTo(ox, oy+r*cell); ctx.lineTo(ox+8*cell, oy+r*cell); ctx.stroke(); }
  for(let c=1;c<8;c++){ ctx.beginPath(); ctx.moveTo(ox+c*cell, oy); ctx.lineTo(ox+c*cell, oy+5*cell); ctx.stroke(); }

  // ===== 玩家上色（不透明，覆蓋提示） =====
  for(let r=0;r<5;r++){
    for(let c=0;c<8;c++){
      const t = STATE.grid[r][c];
      if(t!=='.'){
        ctx.fillStyle = STATE.config.colors[t];
        ctx.fillRect(ox+c*cell+1, oy+r*cell+1, cell-2, cell-2);
      }
    }
  }

  cvs.dataset.cell = JSON.stringify({ox,oy,cell});
}

function bindToolbar(){
  // 工具列選擇
  $$('#paintToolbar .tool').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('#paintToolbar .tool').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      STATE.selectedPiece = btn.dataset.piece || 'I'; // '.' 為橡皮擦
    });
  });
  // 預設選中 I
  const first = $('#paintToolbar .tool[data-piece="I"]');
  if(first){ first.classList.add('active'); }

  // 棋盤點擊上色
$('#board').addEventListener('click', (e)=>{
  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const meta = JSON.parse(e.target.dataset.cell || '{}');
  if(!meta.cell) return;
  const c = Math.floor((x - meta.ox)/meta.cell);
  const r = Math.floor((y - meta.oy)/meta.cell);
  if(r<0||r>=5||c<0||c>=8) return;

  // ★ 題目格鎖定：不可擦、不可改色
  if (STATE.locked && STATE.locked[r][c]) return;

  const t = STATE.selectedPiece;
  STATE.grid[r][c] = (t === '.') ? '.' : t; // 橡皮擦 or 著色
  drawBoard();
  checkSolved();
});

  // 上/下一題
  $('#prevQ').addEventListener('click', ()=> navigateQ(-1));
  $('#nextQ').addEventListener('click', ()=> navigateQ(+1));

  // 排行榜
  $('#btnToLeaderboard').addEventListener('click', ()=> go('leaderboard'));
}

function navigateQ(delta){
  let q = STATE.currentQ + delta;
  if(q<1) q=1;
  if(q>STATE.puzzles.length) q=STATE.puzzles.length;
  openPuzzle(q);
}

function checkSolved(){
  const H=5, W=8;

  // --- 題目限制：取出本題 target（puzzles.json 的 rows） ---
  const target = STATE.puzzles[STATE.currentQ-1];
  const tgtRows = target ? target.rows : null; // 5 行，每行 8 字，字元是 I/O/L/T/S 或 '.'

  // --- (A) 先檢查：整盤必須填滿 40 格 ---
  for(let r=0;r<H;r++){
    for(let c=0;c<W;c++){
      if(STATE.grid[r][c] === '.') return; // 尚未全滿
    }
  }

  // --- (B) 題目限制必須滿足 ---
  // 規則：若題目該格為 I/O/L/T/S，玩家該格必須放同字母；題目為 '.' 則不限制
  if(tgtRows){
    for(let r=0;r<H;r++){
      const row = tgtRows[r] || '';
      for(let c=0;c<W;c++){
        const need = row[c] || '.';
        if('IOLTS'.includes(need) && STATE.grid[r][c] !== need){
          return; // 未遵守題目限制
        }
      }
    }
  }

  // --- (C) 數量與形狀檢查：每種恰好 2 個、每塊 4 格、形狀合法（含旋轉/鏡像） ---
  const seen = Array.from({length:H},()=>Array(W).fill(false));
  const cnt = {I:0,O:0,L:0,T:0,S:0};
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

  for(let r=0;r<H;r++){
    for(let c=0;c<W;c++){
      const ch = STATE.grid[r][c];
      if(ch==='.' || seen[r][c]) continue;
      if(!P_TYPES.includes(ch)) return;

      // BFS 找連通塊（同字母）
      const q=[[r,c]]; seen[r][c]=true;
      const cells=[[r,c]];
      while(q.length){
        const [rr,cc]=q.shift();
        for(const [dr,dc] of dirs){
          const nr=rr+dr, nc=cc+dc;
          if(nr<0||nr>=H||nc<0||nc>=W) continue;
          if(seen[nr][nc]) continue;
          if(STATE.grid[nr][nc]!==ch) continue;
          seen[nr][nc]=true;
          q.push([nr,nc]);
          cells.push([nr,nc]);
        }
      }

      // 每塊必須 4 格
      if(cells.length!==4) return;

      // 形狀合法（允許旋轉/鏡像）
      const sig = signature(cells);
      if(!VALID_SIGS[ch].has(sig)) return;

      // 計數
      cnt[ch]++;
      if(cnt[ch]>2) return;
    }
  }

  if(!P_TYPES.every(t=>cnt[t]===2)) return;

  // --- 通關 ---
  STATE.solved.add(STATE.currentQ);
  $('#statusImg').src = 'public/icons/status/btn_solved.svg';
  updateTotalProgress();
  updateLevelProgressForCurrentQ();

  const lv = STATE.levels.find(l => STATE.currentQ>=l.range[0] && STATE.currentQ<=l.range[1]);
  if(lv && isLevelCleared(lv)){
    $('#badgeBig').src = `public/badges_big/${lv.badge}_big.png`;
    go('badge');
  }
  pushProgress();
}

function updateTotalProgress(){
  // 目前總進度顯示在 Puzzle header 右側區塊的關卡內進度
  // 如需 0/100 顯示可額外放置元素；此處維持現有結構
}

async function pushProgress(){
  try{
    const url = STATE.config.leaderboardUrl;
    if(!url || !STATE.player) return;
    // 每關進度
    const per = {};
    for(const lv of STATE.levels){
      per[`L${lv.level}`] = countSolvedInRange(lv.range);
    }
    await fetch(url, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ secret: STATE.config.sharedSecret, name: STATE.player, progress: per })
    });
  }catch(e){ console.warn('pushProgress failed', e); }
}

/* ---------- Leaderboard ---------- */
async function loadLeaderboard(){
  const url = STATE.config.leaderboardUrl + '?top=50';
  const res = await fetch(url).then(r=>r.json()).catch(()=>({ok:false}));
  const list = $('#leaderboardList'); list.innerHTML='';
  if(!res.ok){ list.textContent='讀取失敗'; return; }
  res.players.forEach(p=>{
    const row = document.createElement('div');
    row.className='lb-row';
    row.innerHTML = `<div class="lb-name">${p.rank}. ${p.name}</div><div>${p.total_cleared}</div>`;
    list.appendChild(row);
  });
}

/* ---------- Nav ---------- */
function initNav(){
  $$('#screen-levels .topbar .nav-btn').forEach(btn=>btn.addEventListener('click',()=>go('cover')));
  $$('#screen-puzzle .topbar .nav-btn[data-go="levels"]').forEach(btn=>btn.addEventListener('click',()=>go('levels')));
  $$('#screen-badge .topbar .nav-btn').forEach(btn=>btn.addEventListener('click',()=>go('levels')));
  $('#btnBadgeNext').addEventListener('click', ()=>go('levels'));
}

/* ---------- Boot ---------- */
(async function(){
  await loadData();
  initCover();
  bindToolbar();
  initNav();
  await loadLeaderboard();
  // 初次進入時，若需要可預開第一關第一題
  // openPuzzle(1);
})();
