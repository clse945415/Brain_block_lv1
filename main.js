// Brain Block - playable build (題目顯示 + 上色作答)
let STATE = {
  config:null, levels:null, puzzles:null,
  player:'', currentQ:1, selectedPiece:'I',
  grid:[], // 5x8 玩家作答 ('.' 或 'I','O','L','T','S')
  solved: new Set(), // 已標記完成的題號
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
  ul.innerHTML='';
  for(const lv of STATE.levels){
    const li = document.createElement('li');
    li.className='level-item';

    const unlocked = isLevelCleared(lv)
      ? `public/badges/${lv.badge}_unlocked.png`
      : `public/badges/${lv.badge}_locked.svg`;

    li.innerHTML = `
      <div class="level-name">${lv.name}</div>
      <div class="level-progress">${countSolvedInRange(lv.range)} / 20</div>
      <img class="level-badge" src="${unlocked}" alt="badge">
      <button class="level-enter" aria-label="進入關卡">
        <img src="public/icons/nav/arrow_next.svg" alt="">
      </button>
    `;

    li.querySelector('.level-enter').addEventListener('click', ()=>{
      // 跳到該區間第一個未解題
      const [a,b] = lv.range;
      let q = a;
      for(let i=a;i<=b;i++){ if(!STATE.solved.has(i)) { q=i; break; } }
      openPuzzle(q);
    });

    ul.appendChild(li);
  }
}

/* ---------- Puzzle ---------- */
function openPuzzle(id){
  STATE.currentQ = id;
  // 初始化玩家作答盤
  STATE.grid = Array.from({length:5}, ()=>Array(8).fill('.'));
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

function drawBoard(){
  const cvs = $('#board');
  const ctx = cvs.getContext('2d');
  const w=cvs.width, h=cvs.height;

  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = '#F7F7F7';
  ctx.fillRect(0,0,w,h);

  const cell = Math.min(Math.floor((w-40)/8), Math.floor((h-40)/5));
  const ox = (w - cell*8)/2, oy = (h - cell*5)/2;

  // 外框 + 內格線
  ctx.strokeStyle = STATE.config.colors.gridBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, cell*8, cell*5);
  for(let r=1;r<5;r++){ ctx.beginPath(); ctx.moveTo(ox, oy+r*cell); ctx.lineTo(ox+8*cell, oy+r*cell); ctx.stroke(); }
  for(let c=1;c<8;c++){ ctx.beginPath(); ctx.moveTo(ox+c*cell, oy); ctx.lineTo(ox+c*cell, oy+5*cell); ctx.stroke(); }

  // 題目提示：淡灰描邊要填的格子 (依 puzzles.json rows)
  const target = STATE.puzzles[STATE.currentQ-1];
  if(target){
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for(let r=0;r<5;r++){
      const row = target.rows[r] || '';
      for(let c=0;c<8;c++){
        const ch = row[c] || '.';
        if('IOLTS'.includes(ch)){
          ctx.strokeRect(ox+c*cell+3, oy+r*cell+3, cell-6, cell-6);
        }
      }
    }
  }

  // 玩家著色
  for(let r=0;r<5;r++){
    for(let c=0;c<8;c++){
      const t = STATE.grid[r][c];
      if(t!=='.'){
        ctx.fillStyle = STATE.config.colors[t];
        ctx.fillRect(ox+c*cell+1, oy+r*cell+1, cell-2, cell-2);
      }
    }
  }

  // 點擊換算資料
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
  const target = STATE.puzzles[STATE.currentQ-1];
  if(!target) return;
  const tgt = target.rows;
  const rows = STATE.grid.map(r=>r.join(''));
  const normalize = s => s.replace(/[^IOLTS.]/g,'');
  const ok = rows.length===tgt.length && rows.every((row,i)=> normalize(row)===normalize(tgt[i]));
  if(ok){
    STATE.solved.add(STATE.currentQ);
    $('#statusImg').src = 'public/icons/status/btn_solved.svg';
    updateTotalProgress();
    updateLevelProgressForCurrentQ();

    // 若完成一整關，顯示徽章
    const lv = STATE.levels.find(l=> STATE.currentQ>=l.range[0] && STATE.currentQ<=l.range[1]);
    if(lv && isLevelCleared(lv)){
      $('#badgeBig').src = `public/badges_big/${lv.badge}_big.png`;
      go('badge');
    }
    pushProgress();
  }
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
