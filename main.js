// Brain Block - playable build (題目上色+鎖定 / 玩家作答 / 驗證10塊)
let STATE = {
  config: null,
  levels: null,
  puzzles: null,
  player: '',
  currentQ: 1,
  selectedPiece: 'I',
  grid: [],                 // 玩家作答 ('.' 或 'I','O','L','T','S')
  solved: new Set(),        // 已完成題號
  locked: []                // true 表題目格（不可更動）
};

const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------- Load Data ---------- */
async function loadData(){
  const bust = 'ver=' + Date.now(); // 破快取
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
    drawBoard(); checkSolved();
  });

  // 上/下一題
  $('#prevQ').addEventListener('click', ()=> navigateQ(-1));
  $('#nextQ').addEventListener('click', ()=> navigateQ(+1));

  // 排行榜按鈕（頁面沒有時不報錯）
  const lbBtn = $('#btnToLeaderboard');
  if (lbBtn) lbBtn.addEventListener('click', ()=> go('leaderboard'));
}

function navigateQ(delta){
  let q=STATE.currentQ+delta;
  if(q<1) q=1;
  if(q>STATE.puzzles.length) q=STATE.puzzles.length;
  openPuzzle(q);
}

/* ---------- 驗證：整盤全滿 + 共10塊 + I/O/L/T/S各2 ---------- */
function checkSolved(){
  const H = 5, W = 8;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const inb = (r,c)=> r>=0 && r<H && c>=0 && c<W;

  // A) 全滿
  for(let r=0;r<H;r++){
    for(let c=0;c<W;c++){
      if(STATE.grid[r][c] === '.') return;
    }
  }

  // B) 題目鎖定格顏色未被修改（雙重保險）
  const target = STATE.puzzles[STATE.currentQ-1];
  if(target && target.rows){
    for(let r=0;r<H;r++){
      const row = target.rows[r] || '';
      for(let c=0;c<W;c++){
        const need = row[c] || '.';
        if(STATE.locked[r][c] && STATE.grid[r][c] !== need) return;
      }
    }
  }

  // 工具：產生規範化簽名（用於形狀比對）
  const sigOf = (cells) => {
    const minR = Math.min(...cells.map(p=>p[0]));
    const minC = Math.min(...cells.map(p=>p[1]));
    const norm = cells.map(([r,c])=>[r-minR,c-minC]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    return norm.map(([r,c])=>`${r},${c}`).join(';');
  };

  // C) 檢查「題目本身」的塊（只看 locked=true 的格）
  {
    const seen = Array.from({length:H},()=>Array(W).fill(false));
    for(let r=0;r<H;r++){
      for(let c=0;c<W;c++){
        if(!STATE.locked[r][c] || seen[r][c]) continue;
        const ch = STATE.grid[r][c];
        if(!P_TYPES.includes(ch)) return;

        const q = [[r,c]]; seen[r][c]=true;
        const cells = [[r,c]];
        while(q.length){
          const [rr,cc] = q.shift();
          for(const [dr,dc] of dirs){
            const nr = rr+dr, nc = cc+dc;
            if(!inb(nr,nc)) continue;
            if(seen[nr][nc]) continue;
            if(!STATE.locked[nr][nc]) continue;     // 只在題目鎖定區擴張
            if(STATE.grid[nr][nc] !== ch) continue;
            seen[nr][nc] = true;
            q.push([nr,nc]);
            cells.push([nr,nc]);
          }
        }
        // 題目每塊也必須是合法 tetromino（4 格、形狀正確）
        if(cells.length !== 4) return;
        if(!VALID_SIGS[ch].has(sigOf(cells))) return;
      }
    }
  }

  // D) 檢查「全盤（題目+玩家）」塊數與形狀
  const seenAll = Array.from({length:H},()=>Array(W).fill(false));
  const totalCnt = {I:0,O:0,L:0,T:0,S:0};
  for(let r=0;r<H;r++){
    for(let c=0;c<W;c++){
      const ch = STATE.grid[r][c];
      if(ch==='.' || seenAll[r][c]) continue;
      if(!P_TYPES.includes(ch)) return;

      const q = [[r,c]]; seenAll[r][c]=true;
      const cells = [[r,c]];
      while(q.length){
        const [rr,cc] = q.shift();
        for(const [dr,dc] of dirs){
          const nr = rr+dr, nc = cc+dc;
          if(!inb(nr,nc)) continue;
          if(seenAll[nr][nc]) continue;
          if(STATE.grid[nr][nc] !== ch) continue;
          seenAll[nr][nc] = true;
          q.push([nr,nc]);
          cells.push([nr,nc]);
        }
      }

      if(cells.length !== 4) return;                 // 每塊 4 格
      if(!VALID_SIGS[ch].has(sigOf(cells))) return;  // 形狀合法（含旋/鏡）
      totalCnt[ch]++;                                // 計數
      if(totalCnt[ch] > 2) return;                   // 任一種超過 2 → 失敗
    }
  }

  // E) 每種剛好 2 塊（總共 10 塊）
  for(const t of P_TYPES){ if(totalCnt[t] !== 2) return; }

  // ---- 通關！----
  STATE.solved.add(STATE.currentQ);
  $('#statusImg').src = 'public/icons/status/btn_solved.svg';
  updateLevelProgressForCurrentQ();

  const lv = STATE.levels.find(l => STATE.currentQ>=l.range[0] && STATE.currentQ<=l.range[1]);
  if(lv && isLevelCleared(lv)){
    $('#badgeBig').src = `public/badges_big/${lv.badge}_big.png`;
    go('badge');
  }
  pushProgress();
}

/* ---------- Leaderboard ---------- */
async function pushProgress(){
  try{
    const url=STATE.config.leaderboardUrl;
    if(!url || !STATE.player) return;
    const per={};
    for(const lv of STATE.levels) per[`L${lv.level}`]=countSolvedInRange(lv.range);
    await fetch(url,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({secret:STATE.config.sharedSecret,name:STATE.player,progress:per})
    });
  }catch(e){ console.warn('pushProgress failed', e); }
}

async function loadLeaderboard(){
  const url=STATE.config.leaderboardUrl+'?top=50';
  const res=await fetch(url).then(r=>r.json()).catch(()=>({ok:false}));
  const list=$('#leaderboardList'); list.innerHTML='';
  if(!res.ok){ list.textContent='讀取失敗'; return; }
  res.players.forEach(p=>{
    const row=document.createElement('div');
    row.className='lb-row';
    row.innerHTML=`<div class="lb-name">${p.rank}. ${p.name}</div><div>${p.total_cleared}</div>`;
    list.appendChild(row);
  });
}

/* ---------- Nav ---------- */
function initNav(){
  $$('#screen-levels .topbar .nav-btn').forEach(btn=>btn.addEventListener('click',()=>go('cover')));
  $$('#screen-puzzle .topbar .nav-btn[data-go="levels"]').forEach(btn=>btn.addEventListener('click',()=>go('levels')));
  $$('#screen-badge .topbar .nav-btn').forEach(btn=>btn.addEventListener('click',()=>go('levels')));
  const btnBadgeNext=$('#btnBadgeNext');
  if(btnBadgeNext) btnBadgeNext.addEventListener('click',()=>go('levels'));
}

/* ---------- Boot ---------- */
(async function(){
  await loadData();
  initCover();
  bindToolbar();
  initNav();
  await loadLeaderboard();
  // openPuzzle(1); // 如需預開第一題
})();
