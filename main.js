// Brain Block - stable build (保存作答 / 可復原 / 安全排行榜)
var STATE = {
  config: null,
  levels: null,
  puzzles: null,
  player: '',
  currentQ: 1,
  selectedPiece: 'I',
  grid: [],       // 5x8
  locked: [],     // 5x8 boolean
  solved: new Set()
};

var $  = function(sel){ return document.querySelector(sel); };
var $$ = function(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); };

/* ================== Local save ================== */
var SAVE_KEY = 'brainblock_save_v3';
// _answersCache: { [qid]: "5行字串以\\n分隔"（只保存「玩家可改」的格子；題目鎖定一律存 '.'） }
var _answersCache = {};

function safeJSONParse(s, fallback){
  try { return JSON.parse(s); } catch(e){ return fallback; }
}
function saveAll(){
  try{
    var data = {
      player: STATE.player || '',
      solved: Array.from ? Array.from(STATE.solved) : (function(s){ var a=[]; s.forEach(function(v){a.push(v);}); return a; })(STATE.solved),
      answers: _answersCache
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }catch(e){ /* ignore */ }
}
function loadAll(){
  try{
    var raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return {player:'', solved:[], answers:{}};
    var d = safeJSONParse(raw, {});
    return {
      player: d.player || '',
      solved: Array.isArray(d.solved) ? d.solved : [],
      answers: d.answers && typeof d.answers==='object' ? d.answers : {}
    };
  }catch(e){ return {player:'', solved:[], answers:{}}; }
}
// 只把「玩家可改」的格子寫入 answers（鎖定格寫成 .）
function collectAnswerOf(qid){
  if(!qid) return;
  var H=5, W=8, rows=[];
  for(var r=0;r<H;r++){
    var line='';
    for(var c=0;c<W;c++){
      line += STATE.locked[r][c] ? '.' : (STATE.grid[r][c] || '.');
    }
    rows.push(line);
  }
  _answersCache[qid] = rows.join('\n');
}

/* ================== Data load ================== */
function loadData(){
  var bust='ver='+Date.now();
  return Promise.all([
    fetch('data/config.json?'+bust).then(function(r){return r.json();}),
    fetch('data/levels.json?'+bust).then(function(r){return r.json();}),
    fetch('data/puzzles.json?'+bust).then(function(r){return r.json();})
  ]).then(function(arr){
    STATE.config  = arr[0];
    STATE.levels  = arr[1].levels;
    STATE.puzzles = arr[2].puzzles;
  });
}

/* ================== Navigation ================== */
function go(screenId){
  $$('.screen').forEach(function(s){ s.classList.remove('active'); });
  $('#screen-'+screenId).classList.add('active');
}

/* ================== Cover ================== */
function initCover(){
  $('#btnStart').addEventListener('click', function(){
    var name = ($('#playerName').value || '').trim();
    if(!name){ alert('請輸入玩家名稱'); return; }
    STATE.player = name;
    saveAll();
    renderLevelList();
    go('levels');
  });
}

/* ================== Level list ================== */
function countSolvedInRange(pair){
  var a=pair[0], b=pair[1], c=0;
  for(var i=a;i<=b;i++){ if(STATE.solved.has(i)) c++; }
  return c;
}
function isLevelCleared(lv){ return countSolvedInRange(lv.range)===20; }

function renderLevelList(){
  var ul = $('#levelList'); ul.innerHTML = '';
  STATE.levels.forEach(function(lv){
    var li = document.createElement('li');
    li.className = 'level-pill';
    var unlocked = isLevelCleared(lv) ? ('public/badges/'+lv.badge+'_unlocked.png')
                                      : ('public/badges/'+lv.badge+'_locked.svg');
    var progress = countSolvedInRange(lv.range)+' / 20';
    li.innerHTML =
      '<div class="level-left">'+
        '<div class="level-title">'+lv.name+'</div>'+
        '<div class="level-progress">'+progress+'</div>'+
      '</div>'+
      '<div class="badge-circle"><img src="'+unlocked+'" alt=""></div>'+
      '<button class="enter-circle" aria-label="進入 '+lv.name+'">'+
        '<img src="public/icons/nav/arrow_next.svg" alt="">'+
      '</button>';
    li.querySelector('.enter-circle').addEventListener('click', function(){
      var a=lv.range[0], b=lv.range[1], q=a;
      for(var i=a;i<=b;i++){ if(!STATE.solved.has(i)){ q=i; break; } }
      openPuzzle(q);
    });
    ul.appendChild(li);
  });
}

/* ================== Shapes helpers ================== */
var P_TYPES = ['I','O','L','T','S'];
function rotate90(shape){ return shape.map(function(p){return [p[1],-p[0]];}); }
function flipH(shape){ return shape.map(function(p){return [p[0],-p[1]];}); }
function normalize(shape){
  var minR = Math.min.apply(null, shape.map(function(p){return p[0];}));
  var minC = Math.min.apply(null, shape.map(function(p){return p[1];}));
  return shape.map(function(p){return [p[0]-minR,p[1]-minC];})
              .sort(function(a,b){return (a[0]-b[0])||(a[1]-b[1]);});
}
function signature(shape){ return normalize(shape).map(function(p){return p[0]+','+p[1];}).join(';'); }
function uniq(arr){ var s=new Set(); return arr.filter(function(x){ if(s.has(x)) return false; s.add(x); return true; }); }
function allOrientations(base){
  var shapes=[], s=base;
  for(var i=0;i<4;i++){
    shapes.push(signature(s));
    shapes.push(signature(flipH(s)));
    s=rotate90(s);
  }
  return uniq(shapes);
}
var BASE_SHAPES={
  I:[[0,0],[1,0],[2,0],[3,0]],
  O:[[0,0],[0,1],[1,0],[1,1]],
  L:[[0,0],[1,0],[2,0],[2,1]],
  T:[[0,0],[0,1],[0,2],[1,1]],
  S:[[0,1],[0,2],[1,0],[1,1]]
};
var VALID_SIGS=(function(){
  var out={}; P_TYPES.forEach(function(t){ out[t]=new Set(allOrientations(BASE_SHAPES[t])); }); return out;
})();

/* ================== Puzzle ================== */
function openPuzzle(id){
  STATE.currentQ=id;
  // reset
  STATE.grid  = Array.from({length:5}, function(){ return Array(8).fill('.'); });
  STATE.locked= Array.from({length:5}, function(){ return Array(8).fill(false); });

  // 題目顏色 + 鎖定
  var target=STATE.puzzles[id-1];
  if(target && target.rows){
    for(var r=0;r<5;r++){
      var row = target.rows[r] || '';
      for(var c=0;c<8;c++){
        var ch = row[c] || '.';
        if('IOLTS'.indexOf(ch)>=0){
          STATE.grid[r][c]=ch;
          STATE.locked[r][c]=true;
        }
      }
    }
  }

  // 套用玩家已保存的作答
  var saved = _answersCache[id];
  if(saved){
    var lines = saved.split('\n');
    for(var rr=0; rr<5; rr++){
      var line = lines[rr] || '';
      for(var cc=0; cc<8; cc++){
        var ch2 = line[cc] || '.';
        if(!STATE.locked[rr][cc] && 'IOLTS'.indexOf(ch2)>=0){
          STATE.grid[rr][cc] = ch2;
        }
      }
    }
  }

  // UI
  $('#qNumber').textContent = id;
  $('#statusImg').src = STATE.solved.has(id)
    ? 'public/icons/status/btn_solved.svg'
    : 'public/icons/status/btn_unsolved.svg';
  updateLevelProgressForCurrentQ();
  drawBoard();
  go('puzzle');
  // 進題目即刻保存（確保 currentQ 變動被寫入）
  collectAnswerOf(id);
  saveAll();
}

function updateLevelProgressForCurrentQ(){
  var lv = STATE.levels.find(function(l){ return STATE.currentQ>=l.range[0] && STATE.currentQ<=l.range[1]; });
  $('#levelProgress').textContent = lv ? (countSolvedInRange(lv.range)+' / 20') : (STATE.solved.size+' / 100');
}

/* ================== Draw board ================== */
function drawBoard(){
  var cvs=$('#board'), ctx=cvs.getContext('2d');
  var w=cvs.width,h=cvs.height,H=5,W=8;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#F7F7F7'; ctx.fillRect(0,0,w,h);
  var cell=Math.min(Math.floor((w-40)/8),Math.floor((h-40)/5));
  var ox=(w-cell*W)/2, oy=(h-cell*H)/2;

  for(var r=0;r<H;r++){
    for(var c=0;c<W;c++){
      var t=STATE.grid[r][c];
      if(t!=='.'){
        ctx.fillStyle = STATE.config.colors[t];
        ctx.fillRect(ox+c*cell+1, oy+r*cell+1, cell-2, cell-2);
        if(STATE.locked[r][c]){
          ctx.strokeStyle='rgba(0,0,0,0.2)';
          ctx.lineWidth=2;
          ctx.strokeRect(ox+c*cell+1.5, oy+r*cell+1.5, cell-3, cell-3);
        }
      }
    }
  }
  ctx.strokeStyle=STATE.config.colors.gridBorder;
  ctx.lineWidth=2;
  ctx.strokeRect(ox,oy,cell*W,cell*H);
  for(var rr=1; rr<H; rr++){ ctx.beginPath(); ctx.moveTo(ox, oy+rr*cell); ctx.lineTo(ox+W*cell, oy+rr*cell); ctx.stroke(); }
  for(var cc=1; cc<W; cc++){ ctx.beginPath(); ctx.moveTo(ox+cc*cell, oy); ctx.lineTo(ox+cc*cell, oy+H*cell); ctx.stroke(); }
  cvs.dataset.cell = JSON.stringify({ox:ox, oy:oy, cell:cell});
}

/* ================== Toolbar & actions ================== */
function bindToolbar(){
  $$('#paintToolbar .tool').forEach(function(btn){
    btn.addEventListener('click', function(){
      $$('#paintToolbar .tool').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      STATE.selectedPiece = btn.getAttribute('data-piece') || 'I';
    });
  });
  var first=$('#paintToolbar .tool[data-piece="I"]'); if(first) first.classList.add('active');

  // 點棋盤上色（每次都保存）
  $('#board').addEventListener('click', function(e){
    var rect=e.target.getBoundingClientRect();
    var x=e.clientX-rect.left, y=e.clientY-rect.top;
    var meta=safeJSONParse(e.target.dataset.cell || '{}', {});
    if(!meta.cell) return;
    var c=Math.floor((x-meta.ox)/meta.cell);
    var r=Math.floor((y-meta.oy)/meta.cell);
    if(r<0||r>=5||c<0||c>=8) return;
    if(STATE.locked[r][c]) return;
    var t=STATE.selectedPiece;
    STATE.grid[r][c] = (t === '.') ? '.' : t;
    drawBoard();
    collectAnswerOf(STATE.currentQ);
    saveAll();
    checkSolved();
  });

  // 上/下一題（切題也保存）
  $('#prevQ').addEventListener('click', function(){
    collectAnswerOf(STATE.currentQ); saveAll();
    navigateQ(-1);
  });
  $('#nextQ').addEventListener('click', function(){
    collectAnswerOf(STATE.currentQ); saveAll();
    navigateQ(1);
  });
}

function navigateQ(delta){
  var q = STATE.currentQ + delta;
  if(q<1) q=1;
  if(q>STATE.puzzles.length) q=STATE.puzzles.length;
  openPuzzle(q);
}

/* ================== Validation (10 pieces) ================== */
function checkSolved(){
  var H=5, W=8, r,c;
  var target = STATE.puzzles[STATE.currentQ-1];
  var tgtRows = target ? target.rows : null;

  // A) 全滿 + 題目格不被改色
  for(r=0;r<H;r++){
    for(c=0;c<W;c++){
      var ch = STATE.grid[r][c];
      if(ch==='.') return;
      if(tgtRows && STATE.locked[r][c]){
        var need = (tgtRows[r]||'')[c] || '.';
        if(ch!==need) return;
      }
    }
  }

  // B) 產生候選（略同前；為簡潔省略註解）
  function rot(s){ return s.map(function(p){return [p[1],-p[0]];}); }
  function flip(s){ return s.map(function(p){return [p[0],-p[1]];}); }
  function norm(s){
    var minR=Math.min.apply(null, s.map(function(p){return p[0];}));
    var minC=Math.min.apply(null, s.map(function(p){return p[1];}));
    return s.map(function(p){return [p[0]-minR,p[1]-minC];})
            .sort(function(a,b){return (a[0]-b[0])||(a[1]-b[1]);});
  }
  function uniqShapes(base){
    var s=base, out=[], seen={};
    for(var i=0;i<4;i++){
      var a=JSON.stringify(norm(s)), b=JSON.stringify(norm(flip(s)));
      if(!seen[a]){ seen[a]=1; out.push(norm(s)); }
      if(!seen[b]){ seen[b]=1; out.push(norm(flip(s))); }
      s=rot(s);
    }
    return out;
  }
  var BASE={
    I:[[0,0],[1,0],[2,0],[3,0]],
    O:[[0,0],[0,1],[1,0],[1,1]],
    L:[[0,0],[1,0],[2,0],[2,1]],
    T:[[0,0],[0,1],[0,2],[1,1]],
    S:[[0,1],[0,2],[1,0],[1,1]]
  };
  var ORIENTS={}; ['I','O','L','T','S'].forEach(function(t){ ORIENTS[t]=uniqShapes(BASE[t]); });

  function idx(rr,cc){ return rr*W+cc; }
  var CAND=[], seenKey={};
  ['I','O','L','T','S'].forEach(function(t){
    ORIENTS[t].forEach(function(sh){
      for(var r0=0;r0<H;r0++) for(var c0=0;c0<W;c0++){
        var ok=true, cells=[];
        for(var k=0;k<sh.length;k++){
          var rr=r0+sh[k][0], cc=c0+sh[k][1];
          if(rr<0||rr>=H||cc<0||cc>=W){ ok=false; break; }
          if(STATE.grid[rr][cc]!==t){ ok=false; break; }
          cells.push(idx(rr,cc));
        }
        if(ok){
          cells.sort(function(a,b){return a-b;});
          var key=t+':'+cells.join(',');
          if(!seenKey[key]){ seenKey[key]=1; CAND.push({type:t,cells:cells}); }
        }
      }
    });
  });
  if(!CAND.length) return;

  var cellToCand = Array.from({length:H*W}, function(){return [];});
  CAND.forEach(function(cand,i){ cand.cells.forEach(function(ci){ cellToCand[ci].push(i); }); });

  var usedCell=Array(H*W).fill(false),
      usedCand=Array(CAND.length).fill(false),
      cnt={I:0,O:0,L:0,T:0,S:0},
      picked=0;

  function nextCell(){
    var best=-1, ret=null;
    for(var i=0;i<H*W;i++){
      if(usedCell[i]) continue;
      var opts = cellToCand[i].filter(function(ci){
        if(usedCand[ci]) return false;
        var cand=CAND[ci];
        for(var u=0;u<cand.cells.length;u++){ if(usedCell[cand.cells[u]]) return false; }
        if(cnt[cand.type]>=2) return false;
        return true;
      });
      if(opts.length===0) return {i:i, options:[]};
      if(best===-1 || opts.length<best){ best=opts.length; ret={i:i, options:opts}; if(best===1) break; }
    }
    return ret;
  }
  function dfs(){
    if(picked===10){
      for(var i=0;i<H*W;i++) if(!usedCell[i]) return false;
      return ['I','O','L','T','S'].every(function(t){ return cnt[t]===2; });
    }
    var choice=nextCell(); if(!choice) return false;
    var options=choice.options; if(options.length===0) return false;
    for(var oi=0; oi<options.length; oi++){
      var ci=options[oi], cand=CAND[ci], clash=false;
      for(var k=0;k<cand.cells.length;k++){ if(usedCell[cand.cells[k]]){ clash=true; break; } }
      if(clash) continue;
      usedCand[ci]=true; picked++; cnt[cand.type]++;
      cand.cells.forEach(function(cc){ usedCell[cc]=true; });
      if(cnt[cand.type]<=2 && dfs()) return true;
      cand.cells.forEach(function(cc){ usedCell[cc]=false; });
      cnt[cand.type]--; picked--; usedCand[ci]=false;
    }
    return false;
  }
  if(!dfs()) return;

  // 通關
  STATE.solved.add(STATE.currentQ);
  $('#statusImg').src='public/icons/status/btn_solved.svg';
  updateLevelProgressForCurrentQ();
  collectAnswerOf(STATE.currentQ);
  saveAll();

  var lv = STATE.levels.find(function(l){ return STATE.currentQ>=l.range[0] && STATE.currentQ<=l.range[1]; });
  if(lv && isLevelCleared(lv)){
    $('#badgeBig').src = 'public/badges_big/'+lv.badge+'_big.png';
    go('badge');
  }
}

/* ================== Leaderboard (non-blocking) ================== */
function loadLeaderboard(){
  var list = $('#leaderboardList');
  if(!list){ return; }
  var url = STATE.config && STATE.config.leaderboardUrl;
  if(!url){ list.textContent='排行榜暫不提供或伺服器離線'; return; }

  list.textContent='讀取中…';
  // 超時保護（不使用 AbortController，行動端更穩）
  var timed = new Promise(function(_, reject){
    setTimeout(function(){ reject(new Error('timeout')); }, 6000);
  });
  Promise.race([
    fetch(url + (url.indexOf('?')>=0 ? '&' : '?') + 'top=50', {method:'GET', mode:'cors', headers:{'accept':'application/json'}}),
    timed
  ]).then(function(res){
    if(!res || !res.ok) throw new Error('bad');
    return res.json();
  }).then(function(data){
    if(!data || data.ok===false || !Array.isArray(data.players)) throw new Error('bad');
    list.innerHTML='';
    data.players.forEach(function(p){
      var row=document.createElement('div');
      row.className='lb-row';
      row.innerHTML='<div class="lb-name">'+p.rank+'. '+p.name+'</div><div>'+p.total_cleared+'</div>';
      list.appendChild(row);
    });
  }).catch(function(){
    list.textContent='排行榜暫不提供或伺服器離線';
  });
}

/* ================== Global nav（永遠可返回） ================== */
function initNav(){
  // 任何帶 data-go 的按鈕，都能切換頁面；切頁前保存
  document.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('.nav-btn[data-go]');
    if(btn){
      collectAnswerOf(STATE.currentQ);
      saveAll();
      var to = btn.getAttribute('data-go');
      if(to) go(to);
    }
  });

  // 右上🏆：先切頁再讀取，失敗也能返回
  var lbBtn = $('#btnToLeaderboard');
  if(lbBtn){
    lbBtn.addEventListener('click', function(){
      collectAnswerOf(STATE.currentQ); saveAll();
      go('leaderboard');
      loadLeaderboard();
    });
  }

  // Badge 下一步
  var btnBadgeNext = $('#btnBadgeNext');
  if(btnBadgeNext){
    btnBadgeNext.addEventListener('click', function(){
      collectAnswerOf(STATE.currentQ); saveAll();
      go('levels');
    });
  }
}

/* ================== Boot ================== */
(function(){
  loadData().then(function(){
    // 復原本地存檔
    var saved = loadAll();
    STATE.player = saved.player || '';
    STATE.solved = new Set(saved.solved || []);
    _answersCache = saved.answers || {};

    if(STATE.player){
      var inp = $('#playerName'); if(inp) inp.value = STATE.player;
    }

    initCover();
    bindToolbar();
    initNav();
    renderLevelList();
  });
})();
