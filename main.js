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
  const H=5, W=8;

  // A) 全滿 + 題目鎖定格未被改色
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

  // B) 準備所有合法形狀的所有朝向（座標）
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

  // C) 產生所有「候選放置」：符合邊界、棋盤字母一致的 4 格組合
  //    每個候選包含：{cells:[idx...4], type:'I'|...}
  const idx = (r,c)=> r*W + c;
  const CAND = [];
  for (const t of ['I','O','L','T','S']){
    for (const shape of ORIENTS[t]){
      // 把 shape 視為相對座標，嘗試所有左上角位移
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
            // 去重（同一組 4 格可能由不同錨點生成）
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
  if (CAND.length === 0) return; // 沒任何可用放置

  // 建索引：每個 cell -> 哪些候選涵蓋它
  const cellToCand = Array.from({length:H*W}, ()=>[]);
  CAND.forEach((cand, i)=> cand.cells.forEach(ci=> cellToCand[ci].push(i)));

  // D) 用精確鋪滿（Exact Cover）搜尋 10 塊，並且每種剛好 2 塊
  const usedCell = Array(H*W).fill(false);
  const usedCand = Array(CAND.length).fill(false);
  const countByType = {I:0,O:0,L:0,T:0,S:0};
  let picked = 0;

  // 選擇下一個尚未覆蓋的格，採用最少候選（啟發式剪枝）
  function nextCell(){
    let best=-1, list=null;
    for(let i=0;i<H*W;i++){
      if(usedCell[i]) continue;
      const arr = cellToCand[i].filter(ci=>{
        if(usedCand[ci]) return false;
        // 候選不能碰到已佔格
        for(const cc of CAND[ci].cells) if(usedCell[cc]) return false;
        // 類型不能超過 2
        if(countByType[CAND[ci].type] >= 2) return false;
        return true;
      });
      if(arr.length===0) return {i, options:[]}; // 死路
      if(best===-1 || arr.length < best){
        best = arr.length;
        list = {i, options:arr};
        if(best===1) break;
      }
    }
    return list; // 可能為 null（全部覆蓋）
  }

  function dfs(){
    if (picked === 10){
      // 全部覆蓋了嗎？
      for(let i=0;i<H*W;i++) if(!usedCell[i]) return false;
      return ['I','O','L','T','S'].every(t=>countByType[t]===2);
    }
    const choice = nextCell();
    if(!choice) return false;
    const {options} = choice;
    // 沒選項：失敗
    if(options.length===0) return false;

    // 逐一嘗試候選
    for(const ci of options){
      const cand = CAND[ci];
      // second check overlap
      let clash=false; for(const cc of cand.cells){ if(usedCell[cc]){ clash=true; break; } }
      if(clash) continue;

      // 放
      usedCand[ci]=true; picked++; countByType[cand.type]++;
      cand.cells.forEach(cc=> usedCell[cc]=true);

      // 剪枝：任何類型超過 2、或剩餘形狀不足以達到 10-picked，都會自動在遞迴中排除
      if (countByType[cand.type] <= 2 && dfs()) return true;

      // 撤銷
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

  // 先本地存檔（避免網路失敗）
  if (typeof saveProgressToLocal === 'function') saveProgressToLocal();

  const lv=STATE.levels.find(l=>STATE.currentQ>=l.range[0]&&STATE.currentQ<=l.range[1]);
  if(lv && isLevelCleared(lv)){
    $('#badgeBig').src=`public/badges_big/${lv.badge}_big.png`;
    go('badge');
  }
  pushProgress();
}
/* ---------- Leaderboard ---------- */
async function pushProgress(){
  try{
    const url = STATE.config && STATE.config.leaderboardUrl;
    if(!url || !STATE.player){ console.warn('leaderboard disabled'); return; }

    // 逐關進度（L1~L5 各 0-20）
    const per = {};
    for(const lv of STATE.levels){
      per[`L${lv.level}`] = countSolvedInRange(lv.range);
    }

    const payload = {
      secret: STATE.config.sharedSecret || '',
      name: STATE.player,
      progress: per
    };

    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',        // 伺服器需回 Access-Control-Allow-Origin
      keepalive: true,     // 避免頁面切換中斷
      headers: { 'content-type':'application/json', 'accept':'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => ({_err:err}));

    if(res && res.ok){
      // 可選：成功後再刷新一次排行榜（若此時在排行榜頁）
      if(document.querySelector('#screen-leaderboard').classList.contains('active')){
        loadLeaderboard();
      }
    }else{
      console.warn('pushProgress failed', res && (res.status || res._err));
    }
  }catch(e){
    console.warn('pushProgress exception', e);
  }
}

async function loadLeaderboard(){
  const list = $('#leaderboardList');
  list.innerHTML = '讀取中…';

  const url = STATE.config && STATE.config.leaderboardUrl;
  if(!url){ list.textContent = '排行榜未啟用'; return; }

  try{
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'top=50', {
      method: 'GET',
      mode: 'cors',
      headers: { 'accept':'application/json' }
    });

    let data = null;
    try { data = await res.json(); } catch { /* 不是 JSON */ }

    if(!res.ok || !data || data.ok === false || !Array.isArray(data.players)){
      list.textContent = '讀取失敗';
      return;
    }

    list.innerHTML = '';
    data.players.forEach(p=>{
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = `<div class="lb-name">${p.rank}. ${p.name}</div><div>${p.total_cleared}</div>`;
      list.appendChild(row);
    });
  }catch(e){
    console.warn('loadLeaderboard failed', e);
    list.textContent = '讀取失敗';
  }
}

/* ---------- Nav ---------- */
function initNav(){
  // 固定返回
  $$('#screen-levels .topbar .nav-btn').forEach(btn =>
    btn.addEventListener('click', () => go('cover'))
  );
  $$('#screen-puzzle .topbar .nav-btn[data-go="levels"]').forEach(btn =>
    btn.addEventListener('click', () => go('levels'))
  );
  $$('#screen-badge .topbar .nav-btn').forEach(btn =>
    btn.addEventListener('click', () => go('levels'))
  );

  const btnBadgeNext = $('#btnBadgeNext');
  if (btnBadgeNext) btnBadgeNext.addEventListener('click', () => go('levels'));

  // 右上角🏆：先切頁再載資料，避免讀取失敗卡住
  const lbBtn = $('#btnToLeaderboard');
  if (lbBtn) lbBtn.addEventListener('click', () => {
    go('leaderboard');
    loadLeaderboard();
  });

  // 排行榜頁左上返回
  const lbBack = document.querySelector('#screen-leaderboard .topbar .nav-btn');
  if (lbBack) lbBack.addEventListener('click', () => go('levels'));
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
