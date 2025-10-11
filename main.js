// Brain Block - minimal playable build
let STATE = {
  config:null, levels:null, puzzles:null,
  player:'', currentQ:1, selectedPiece:'I',
  grid:[], // 5x8 current placed types ('.' empty or 'I','O','L','T','S')
  solved: new Set(), // ids marked solved
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

async function loadData(){
  const [config, levels, puzzles] = await Promise.all([
    fetch('data/config.json').then(r=>r.json()),
    fetch('data/levels.json').then(r=>r.json()),
    fetch('data/puzzles.json').then(r=>r.json()),
  ]);
  STATE.config=config; STATE.levels=levels.levels; STATE.puzzles=puzzles.puzzles;
}

function go(screenId){
  $$('.screen').forEach(s=>s.classList.remove('active'));
  $('#screen-'+screenId).classList.add('active');
}

function initCover(){
  $('#btnStart').addEventListener('click', ()=>{
    const name = $('#playerName').value.trim();
    if(!name){ alert('請輸入玩家名稱'); return; }
    STATE.player = name;
    renderLevelList();
    go('levels');
  });
}

function renderLevelList(){
  const ul = $('#levelList');
  ul.innerHTML='';
  for(const lv of STATE.levels){
    const li = document.createElement('li');
    li.className='level-item';
    // badge
    const unlocked = isLevelCleared(lv) ? `public/badges/${lv.badge}_unlocked.png` : `public/badges/${lv.badge}_locked.svg`;
    li.innerHTML = `
      <div class="level-left">
        <img src="${unlocked}">
        <div>
          <div>${lv.name}</div>
          <div class="progress">${countSolvedInRange(lv.range)} / 20</div>
        </div>
      </div>
      <div class="level-right">
        <button class="nav-btn go-level">進入 <img src="public/icons/nav/arrow_next.svg" /></button>
      </div>`;
    li.querySelector('.go-level').addEventListener('click', ()=>{
      // jump to first Q in range not yet solved (or start)
      const [a,b] = lv.range;
      let q = a;
      for(let i=a;i<=b;i++){ if(!STATE.solved.has(i)) { q=i; break; } }
      openPuzzle(q);
    });
    ul.appendChild(li);
  }
}

function countSolvedInRange([a,b]){
  let c=0; for(let i=a;i<=b;i++){ if(STATE.solved.has(i)) c++; } return c;
}
function isLevelCleared(lv){ return countSolvedInRange(lv.range)===20; }

function openPuzzle(id){
  STATE.currentQ = id;
  // init empty grid 5x8
  STATE.grid = Array.from({length:5}, ()=>Array(8).fill('.'));
  $('#qNumber').textContent = id;
  $('#statusImg').src = 'public/icons/status/btn_unsolved.svg';
  drawBoard();
  go('puzzle');
}

function drawBoard(){
  const cvs = $('#board');
  const ctx = cvs.getContext('2d');
  const w=cvs.width, h=cvs.height;
  ctx.fillStyle = '#F7F7F7';
  ctx.fillRect(0,0,w,h);
  const cell = Math.min(Math.floor((w-40)/8), Math.floor((h-40)/5));
  const ox = (w - cell*8)/2, oy = (h - cell*5)/2;
  // grid lines
  ctx.strokeStyle = STATE.config.colors.gridBorder;
  ctx.lineWidth = 2;
  for(let r=0;r<=5;r++){ ctx.beginPath(); ctx.moveTo(ox, oy+r*cell); ctx.lineTo(ox+8*cell, oy+r*cell); ctx.stroke(); }
  for(let c=0;c<=8;c++){ ctx.beginPath(); ctx.moveTo(ox+c*cell, oy); ctx.lineTo(ox+c*cell, oy+5*cell); ctx.stroke(); }
  // draw cells
  for(let r=0;r<5;r++){
    for(let c=0;c<8;c++){
      const t = STATE.grid[r][c];
      if(t!=='.'){
        ctx.fillStyle = STATE.config.colors[t];
        ctx.fillRect(ox+c*cell+1, oy+r*cell+1, cell-2, cell-2);
      }
    }
  }
  // store for hit test
  cvs.dataset.cell = JSON.stringify({ox,oy,cell});
}

function placePieceAt(r,c,type){
  const shape = getShape(type);
  // simple try: place pivot at r,c; if out of bounds or collision -> ignore
  for(const [dr,dc] of shape){
    const rr=r+dr, cc=c+dc;
    if(rr<0||rr>=5||cc<0||cc>=8) return false;
    if(STATE.grid[rr][cc]!=='.') return false;
  }
  for(const [dr,dc] of shape){
    STATE.grid[r+dr][c+dc]=type;
  }
  return true;
}

function getShape(t){
  // shape returns coords relative to pivot 0,0. Default orientation up.
  switch(t){
    case 'I': return [[0,0],[1,0],[2,0],[3,0]];
    case 'O': return [[0,0],[0,1],[1,0],[1,1]];
    case 'L': return [[0,0],[1,0],[2,0],[2,1]];
    case 'T': return [[0,0],[0,-1],[0,1],[1,0]];
    case 'S': return [[0,0],[1,0],[1,1],[2,1]];
  }
  return [[0,0]];
}

// rotate 90deg (clockwise)
function rot(shape){ return shape.map(([r,c])=>[-c, r]); }
// flip horizontally
function flip(shape){ return shape.map(([r,c])=>[r,-c]); }

let currentShape = getShape('I');
let rotatedTimes = 0, flipped=false;

function bindToolbar(){
  $$('.tool').forEach(b=>b.addEventListener('click', ()=>{
    const t = b.dataset.piece;
    if(t){
      STATE.selectedPiece = t;
      currentShape = getShape(t);
      rotatedTimes=0; flipped=false;
    }
  }));
  $('#btnClear').addEventListener('click', ()=>{
    STATE.grid = Array.from({length:5}, ()=>Array(8).fill('.'));
    $('#statusImg').src = 'public/icons/status/btn_unsolved.svg';
    drawBoard();
  });
  // keyboard: R rotate, F flip
  document.addEventListener('keydown', (e)=>{
    if(e.key==='r' || e.key==='R'){
      currentShape = rot(currentShape); rotatedTimes=(rotatedTimes+1)%4;
    }else if(e.key==='f' || e.key==='F'){
      currentShape = flip(currentShape); flipped=!flipped;
    }
  });
  // place on canvas click
  $('#board').addEventListener('click', (e)=>{
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const meta = JSON.parse(e.target.dataset.cell || '{}');
    if(!meta.cell) return;
    const c = Math.floor((x - meta.ox)/meta.cell);
    const r = Math.floor((y - meta.oy)/meta.cell);
    if(r<0||r>=5||c<0||c>=8) return;
    const ok = placePieceAt(r,c, STATE.selectedPiece);
    if(ok){ drawBoard(); checkSolved(); }
  });
  $('#prevQ').addEventListener('click', ()=> navigateQ(-1));
  $('#nextQ').addEventListener('click', ()=> navigateQ(+1));
}

function navigateQ(delta){
  let q = STATE.currentQ + delta;
  if(q<1) q=1;
  if(q>STATE.puzzles.length) q=STATE.puzzles.length;
  openPuzzle(q);
}

function checkSolved(){
  // Compare current grid vs target pattern of currentQ (shape-only match)
  const target = STATE.puzzles[STATE.currentQ-1];
  if(!target) return;
  const tgt = target.rows;
  // stringify grid to rows
  const rows = STATE.grid.map(r=>r.join(''));
  const normalize = s => s.replace(/[^IOLTS.]/g,'');
  const ok = rows.length===tgt.length && rows.every((row,i)=> normalize(row)===normalize(tgt[i]));
  if(ok){
    STATE.solved.add(STATE.currentQ);
    $('#statusImg').src = 'public/icons/status/btn_solved.svg';
    updateTotalProgress();
    // if this was last in level -> show badge
    const lv = STATE.levels.find(l=> STATE.currentQ>=l.range[0] && STATE.currentQ<=l.range[1]);
    if(lv && isLevelCleared(lv)){
      $('#badgeBig').src = `public/badges_big/${lv.badge}_big.png`;
      go('badge');
    }
    // push progress to leaderboard
    pushProgress();
  }
}

function updateTotalProgress(){
  $('#totalProgress').textContent = STATE.solved.size;
}

async function pushProgress(){
  try{
    const url = STATE.config.leaderboardUrl;
    if(!url || !STATE.player) return;
    // compute progress per level
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

function initNav(){
  $$('#screen-levels .topbar .nav-btn').forEach(btn=>btn.addEventListener('click',()=>go('cover')));
  $$('#screen-puzzle .topbar .nav-btn').forEach(btn=>btn.addEventListener('click',()=>go('levels')));
  $$('#screen-badge .topbar .nav-btn').forEach(btn=>btn.addEventListener('click',()=>go('levels')));
  $('#btnBadgeNext').addEventListener('click', ()=>go('levels'));
}

(async function(){
  await loadData();
  initCover();
  bindToolbar();
  initNav();
  updateTotalProgress();
  await loadLeaderboard();
})();