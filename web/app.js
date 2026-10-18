/* The canvas reads structured records. All substantive editing happens in Codex. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    route:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h7"/>',
    history:'<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2"/>',
    book:'<path d="M12 5v16M3 3c4-1 6 0 9 2 3-2 6-3 9-2v16c-3-1-6 0-9 2-3-2-6-3-9-2z"/>',
    compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
    download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    link:'<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(0 0) scale(.95)"/>',
    expand:'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5M8 8l-4-4m12 4 4-4M8 16l-4 4m12-4 4 4"/>',
    fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    message:'<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V5a2 2 0 0 1 2-2h9a8 8 0 0 1 8 8Z"/><path d="M7 8h8M7 12h5"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
  const meta = {
    I:{title:'我的内心',sub:'个体内在 · 信念、感受与顾虑',empty:'让内心的声音，慢慢浮现',hint:'出现个人信念或顾虑时再记录。<br>暂时留白，也是一种真实。'},
    It:{title:'具体的行为',sub:'个体外在 · 行为、能力与可见表现',empty:'从你看见的一个画面开始',hint:'一个观点、一次经历，都可以成为入口。<br>接下来，在对话里慢慢展开。'},
    We:{title:'我们的共同默认',sub:'集体内在 · 文化、互动与共享信念',empty:'共同的默认，还需要被听见',hint:'出现相关线索时再连接到这里。<br>先保留线索，不急着下结论。'},
    Its:{title:'现有的系统安排',sub:'集体外在 · 分工、流程与资源安排',empty:'沿着行为，看见安排',hint:'现在实际上怎样运作？<br>谁决定、依据什么、怎样反馈？'}
  };
  const kinds = {opinion:'观点',observation:'行为 / 事件',outcome:'结果 / 现象',system:'系统安排',clue:'内在 / 文化线索'};
  const statuses = {reported:'已描述',verified:'已核实',hypothesis:'待核实',revised:'已修正'};
  const state = {live:null,data:null,example:null,mode:'live',view:'canvas',thread:'',expanded:false,links:true,zoom:1,autoFit:true,revision:null,selected:null,opener:null,polling:false,healthy:false,allQuadrants:new Set()};
  const offline = !!window.MPI_SNAPSHOT;
  let toastTimer, resizeFrame;

  function formatDate(value) {
    if (!value) return '尚无对话记录';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  }
  function toast(text) {
    $('#toast').textContent = text;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
  }
  async function get(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(url,{cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('读取失败');
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function syncLabel() {
    const label = offline ? '离线副本 · 可回看' : !state.healthy ? '连接中断 · 保留当前画布' : state.mode === 'example' ? '教学示例 · 独立于真实记录' : state.mode === 'history' ? '正在回看历史版本' : state.live?.revision ? '已保存 · 自动同步' : '已连接 · 等待对话';
    $('#sync-status').innerHTML = `<i class="status-dot ${offline || !state.healthy ? 'offline' : state.mode === 'example' ? 'example' : ''}"></i>${escape(label)}`;
  }
  async function poll() {
    if (offline || state.polling) return;
    state.polling = true;
    try {
      const next = await get('/api/state');
      const changed = !state.live || JSON.stringify(next) !== JSON.stringify(state.live);
      state.live = next;
      state.healthy = true;
      if (changed && state.mode === 'live') {
        const first = !state.data;
        state.data = next;
        render();
        if (!first) toast(`画布已更新 · 第 ${next.revision} 版`);
      }
      if (!$('#canvas-loading').hidden) $('#canvas-loading').hidden = true;
    } catch (error) {
      state.healthy = false;
      if (!state.data) $('#canvas-loading').textContent = '还没有连接上本地画布。请在 Codex 中说“打开画布”，恢复后这里会自动重试。';
    } finally { state.polling = false; syncLabel(); }
  }
  function setMode(mode, data) {
    closeDrawer();
    state.mode = mode;
    state.data = data;
    state.thread = '';
    state.autoFit = true;
    showView('canvas');
    render();
  }
  function render() {
    const data = state.data;
    if (!data) return;
    if (!data.threads.some(thread => thread.id === state.thread)) state.thread = '';
    $('#live-switch b').textContent = offline ? '离线副本' : '真实困局';
    $('#topic-short').textContent = state.live?.mode === 'example' ? '教学示例 · 非真实记录' : state.live?.topic.status === 'confirmed' ? state.live.topic.title : '等待第一段真实记录';
    $('#thread-count').textContent = data.threads.length;
    $('#live-switch').setAttribute('aria-pressed', state.mode === 'live');
    const banner = $('#mode-banner');
    banner.hidden = state.mode === 'live' && !offline;
    banner.innerHTML = offline ? `<span>离线画布${data.mode==='example'?' · 教学示例，非真实记录':''} · 保留导出时的记录与联系，不接收后续对话更新。</span>` : state.mode === 'example' ? '<span>教学示例 · 所有内容来自需求中的举例，不代表你公司的已确认事实。</span><button id="return-live">回到真实困局</button>' : state.mode === 'history' ? `<span>正在回看第 ${data.revision} 版 · 当前对话的更新仍会保存到最新版本。</span><button id="return-live">回到最新画布</button>` : '';
    $('#revision-label').textContent = state.mode === 'example' ? '教学示例' : data.revision ? `第 ${data.revision} 版理解` : '准备开始';
    $('#revision-date').textContent = data.updatedAt ? formatDate(data.updatedAt) + ' 更新' : state.mode === 'example' ? '只演示，不写入真实记录' : '等待第一段真实记录';
    $('#core-title').textContent = data.topic.title;
    $('#core-caption').textContent = data.mode === 'example' ? '教学示例 · 围绕同一议题，连接不同面向' : data.topic.status === 'pending' ? '在 Codex 中说出来，从这里开始' : '共同议题 · 可在对话中继续修订';
    $('#next-question').textContent = data.questions[0] || '继续描述你看见的画面，或指出需要修改的地方。';
    const select = $('#thread-select');
    select.innerHTML = '<option value="">全部线索</option>' + data.threads.map(t => `<option value="${escape(t.id)}">${escape(t.title)}</option>`).join('');
    select.value = state.thread;
    const focused = focusIds();
    const readingOrder = new Map();
    data.threads.forEach(thread => thread.nodeIds.forEach(id => {
      if (!readingOrder.has(id)) readingOrder.set(id, readingOrder.size);
    }));
    Object.entries(meta).forEach(([quadrant, info]) => {
      const nodes = data.nodes.filter(node => node.quadrant === quadrant && (!focused || focused.has(node.id)))
        .sort((a,b) => (readingOrder.get(a.id) ?? Infinity) - (readingOrder.get(b.id) ?? Infinity));
      const narrow = $('#viewport').clientWidth < 850;
      const limit = narrow && !state.thread && !state.allQuadrants.has(quadrant) ? 2 : Infinity;
      const shown = nodes.slice(0,limit);
      $(`#quadrant-${quadrant}`).innerHTML = `<header class="quadrant-head"><div class="quadrant-title"><span class="quadrant-letter">${quadrant}</span><div><h2>${info.title}</h2><p>${info.sub}</p></div></div><span class="quadrant-count">${nodes.length ? nodes.length + ' 条记录' : ['I','We'].includes(quadrant) ? '保留位置' : '等待探寻'}</span></header><div class="cards">${nodes.length ? shown.map(node => card(node, focused)).join('') : `<div class="empty-quadrant"><div class="empty-rings"></div><b>${info.empty}</b><p>${info.hint}</p></div>`}</div>${shown.length<nodes.length?`<button class="more-nodes" data-quadrant="${quadrant}">还有 ${nodes.length-shown.length} 条记录 · 展开 ↓</button>`:state.allQuadrants.has(quadrant)&&nodes.length>2?`<button class="more-nodes" data-quadrant="${quadrant}">收起更多记录 ↑</button>`:''}`;
    });
    $('#expand-toggle').setAttribute('aria-pressed',state.expanded);
    $('#expand-toggle span:last-child').textContent = state.expanded ? '折叠详情' : '展开详情';
    $('#links-toggle').setAttribute('aria-pressed',state.links);
    $('#overview-button').classList.toggle('active',!state.thread);
    $('#canvas-loading').hidden = true;
    if (state.view === 'threads') renderThreads();
    if (state.view === 'history') renderHistory();
    if (state.selected) renderDrawer();
    syncLabel();
    requestAnimationFrame(layout);
  }
  function focusIds() {
    return state.thread ? new Set(state.data.threads.find(t => t.id === state.thread)?.nodeIds || []) : null;
  }
  function card(node, focused) {
    const questions = node.openQuestions || [];
    return `<button class="node-card${focused && !focused.has(node.id) ? ' dimmed' : ''}${state.selected === node.id ? ' is-focused' : ''}" data-node="${escape(node.id)}" aria-label="${escape(kinds[node.kind] + '：' + node.title + '，' + statuses[node.status] + '，查看详情')}"><div class="card-meta"><span class="kind-label">${kinds[node.kind]}</span><span class="card-status ${node.status}">${statuses[node.status]}</span></div><h3>${escape(node.title)}</h3>${state.expanded ? `<p class="card-detail">${escape(node.detail)}</p>${questions.length ? `<p class="card-question">待补充 · ${escape(questions[0])}</p>` : ''}` : ''}<div class="card-foot"><span class="open-count">${questions.length ? `<i class="open-question-mark">?</i>${questions.length} 处待补充` : '来源与整理详情'}</span><span class="arrow">↗</span></div></button>`;
  }
  function layout() {
    if (state.view !== 'canvas' || !state.data) return;
    const viewport = $('#viewport');
    const board = $('#board');
    const boardWidth = Math.max(520,Math.min(1240,viewport.clientWidth - 24));
    board.style.width = `${boardWidth}px`;
    board.classList.toggle('compact',boardWidth<850);
    if (state.autoFit) state.zoom = Math.min(1,Math.max(state.thread ? .75 : .2,Math.min((viewport.clientWidth - 24)/boardWidth,(viewport.clientHeight - 24)/board.offsetHeight)));
    const width = Math.max(viewport.clientWidth,boardWidth * state.zoom + 24);
    const height = Math.max(viewport.clientHeight,board.offsetHeight * state.zoom + 36);
    $('#board-stage').style.width = `${width}px`;
    $('#board-stage').style.height = `${height}px`;
    board.style.left = `${(width - boardWidth * state.zoom) / 2}px`;
    board.style.top = `${Math.max(12,(height - board.offsetHeight * state.zoom) / 2)}px`;
    board.style.transform = `scale(${state.zoom})`;
    $('#zoom-value').textContent = `${Math.round(state.zoom*100)}%`;
    drawLinks();
  }
  function drawLinks() {
    const svg = $('#connections');
    svg.innerHTML = '';
    if (!state.links) return;
    const focused = focusIds();
    const lookup = new Map();
    $$('.node-card').forEach(el => {
      const quad = el.closest('.quadrant');
      lookup.set(el.dataset.node,{x:quad.offsetLeft+el.offsetLeft,y:quad.offsetTop+el.offsetTop,w:el.offsetWidth,h:el.offsetHeight,q:quad.id});
    });
    const links = state.data.links.filter(link => !focused || (focused.has(link.from) && focused.has(link.to)));
    let markup = '';
    links.forEach((link, index) => {
      const a = lookup.get(link.from), b = lookup.get(link.to);
      if (!a || !b) return;
      let x1,y1,x2,y2,path;
      const mid = $('#board').offsetWidth / 2;
      if (a.q !== b.q && Math.abs(a.y-b.y) > 180 && a.x > mid && b.x > mid) {
        x1=a.x+a.w;y1=a.y+a.h*.6;x2=b.x+b.w;y2=b.y+b.h*.6;
        const lane=$('#board').offsetWidth-12+(index%3)*4;
        path=`M${x1},${y1} C${lane},${y1} ${lane},${y1} ${lane},${y1+(y2-y1)/2} S${lane},${y2} ${x2},${y2}`;
      } else if (Math.abs(a.x-b.x) > a.w*.6) {
        const right = b.x > a.x;
        x1=a.x+(right?a.w:0);y1=a.y+a.h*.65;x2=b.x+(right?0:b.w);y2=b.y+b.h*.65;
        const bend=(x1+x2)/2;
        path=`M${x1},${y1} C${bend},${y1} ${bend},${y2} ${x2},${y2}`;
      } else {
        const down=b.y>a.y;
        x1=a.x+a.w*.55;y1=a.y+(down?a.h:0);x2=b.x+b.w*.55;y2=b.y+(down?0:b.h);
        path=`M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}`;
      }
      markup += `<path d="${path}" class="${link.status==='hypothesis'?'pending':''}"><title>${escape(link.label)}</title></path><circle cx="${x1}" cy="${y1}" r="2.3"/><circle cx="${x2}" cy="${y2}" r="2.3"/>`;
    });
    svg.innerHTML = markup;
  }
  function zoom(next) {
    const viewport = $('#viewport');
    const old = state.zoom;
    const centerX=(viewport.scrollLeft+viewport.clientWidth/2)/old;
    const centerY=(viewport.scrollTop+viewport.clientHeight/2)/old;
    state.autoFit=false;
    state.zoom=Math.max(.2,Math.min(1.8,next));
    layout();
    viewport.scrollLeft=centerX*state.zoom-viewport.clientWidth/2;
    viewport.scrollTop=centerY*state.zoom-viewport.clientHeight/2;
  }
  function showView(view) {
    state.view=view;
    $$('.view').forEach(el => el.hidden = el.id !== `${view}-view`);
    $$('[data-view]').forEach(button => button.classList.toggle('active',button.dataset.view===view));
    $('#view-name').textContent={canvas:'整体画布',threads:'探寻线索',history:'讨论记录',method:'理论与使用方法'}[view];
    if (view==='threads' && state.data) renderThreads();
    if (view==='history' && state.data) renderHistory();
    if (view==='canvas') requestAnimationFrame(layout);
  }
  function emptyView(title, description, symbol) {
    return `<div class="reading-empty">${icon(symbol)}<h2>${title}</h2><p>${description}</p></div>`;
  }
  function renderThreads() {
    if (!state.data.threads.length) {
      $('#threads-view').innerHTML=emptyView('线索会从对话里长出来','说出一个观点，展开一段经历。<br>能够连接起来的记录，会在这里汇成一条线索。','route');
      return;
    }
    $('#threads-view').innerHTML='<div class="eyebrow">沿着一条线索，把联系看清</div><h2>从观点，到具体画面，再到安排。</h2><p class="muted">同一条记录可以属于多条线索。排列只帮助阅读，联系以有依据的连线为准。</p>'+state.data.threads.map(thread => {
      const links=state.data.links.filter(l=>thread.nodeIds.includes(l.from)&&thread.nodeIds.includes(l.to));
      return `<article class="thread-row"><header class="thread-row-header"><h3>${escape(thread.title)}</h3><button data-focus="${escape(thread.id)}">在画布中聚焦 ↗</button></header><div class="thread-chips">${thread.nodeIds.map(id=>{const node=state.data.nodes.find(n=>n.id===id);return node?`<button data-node="${escape(id)}"><span>${node.quadrant} · ${kinds[node.kind]}</span>${escape(node.title)}</button>`:'';}).join('')}</div>${links.map(link=>`<div class="link-row"><i class="legend-line ${link.status==='hypothesis'?'dashed':''}"></i><div><b>${escape(state.data.nodes.find(n=>n.id===link.from).title)}</b> · ${escape(link.label)} · <b>${escape(state.data.nodes.find(n=>n.id===link.to).title)}</b><br>${link.status==='hypothesis'?'待验证':'已确认的表述联系'} · ${escape(link.basis)}</div></div>`).join('')}</article>`;
    }).join('');
  }
  async function renderHistory() {
    const root=$('#history-view');
    if (offline || state.mode==='example') {
      root.innerHTML=emptyView(offline?'这是一份离线副本':'示例与真实记录分开保存',offline?'副本保留导出时的状态。<br>请在本地画布中查看完整历史。':'教学示例不会进入真实讨论的历史。<br>回到真实困局后，每轮更新都会留下版本。','history');return;
    }
    try {
      const versions=await get('/api/history');
      if (state.view!=='history' || state.mode==='example') return;
      root.innerHTML='<div class="eyebrow">理解如何一步步变化</div><h2>每一次补充，都有来处。</h2><p class="muted">回看旧版本不会覆盖当前记录。需要修正时，在 Codex 中说明即可。</p>'+versions.map(item=>`<article class="history-row"><span class="version-pill">${item.revision?'v'+item.revision:'起点'}</span><div><h3>${escape(item.changeSummary)}</h3><small>${formatDate(item.updatedAt)}</small></div><button data-revision="${item.revision}">回看这一版 ↗</button></article>`).join('');
    } catch(error) {root.innerHTML=emptyView('暂时无法读取历史','已显示的画布仍然保留。连接恢复后，请重新打开讨论记录。','history');}
  }
  function openNode(id) {
    state.opener=document.activeElement;
    state.selected=id;
    renderDrawer();
    $('#drawer-backdrop').hidden=false;
    $('#detail-drawer').hidden=false;
    $('.shell').inert=true;
    document.body.style.overflow='hidden';
    $('#close-drawer').focus();
  }
  function renderDrawer() {
    const node=state.data.nodes.find(n=>n.id===state.selected);
    if (!node) {closeDrawer();return;}
    const sources=node.sourceIds.map(id=>state.data.sources.find(s=>s.id===id)).filter(Boolean);
    const links=state.data.links.filter(l=>l.from===node.id||l.to===node.id);
    $('#drawer-content').innerHTML=`<div class="eyebrow">${node.quadrant} · ${meta[node.quadrant].title} / ${kinds[node.kind]}</div><h2 id="drawer-title">${escape(node.title)}</h2><span class="drawer-status">${statuses[node.status]}${state.data.mode==='example'?' · 教学示例':''}</span><p>${escape(node.detail)}</p>${node.verification?`<h3>核实依据</h3><p>${escape(node.verification)}</p>`:''}${Object.keys(node.fields||{}).length?'<h3>现在了解到的具体情况</h3><dl>'+Object.entries(node.fields).map(([key,value])=>`<div><dt>${escape(key)}</dt><dd>${escape(value)}</dd></div>`).join('')+'</dl>':''}<h3>原话与来源</h3>${sources.map(source=>`<blockquote>${escape(source.quote)}<small>${escape(source.label)} · ${{user:'对话原话',record:'提供的记录',exercise:'教学示例'}[source.origin]}</small></blockquote>`).join('')}${(node.openQuestions||[]).length?'<h3>还留着的问号</h3>'+node.openQuestions.map(q=>`<div class="question-item">${escape(q)}</div>`).join(''):''}${links.length?'<h3>与这条记录相连</h3>'+links.map(link=>{const other=state.data.nodes.find(n=>n.id===(link.from===node.id?link.to:link.from));return `<div class="relation-item"><b>${link.status==='confirmed'?'— 已确认的联系':'┄ 待验证的联系'} · ${escape(link.label)}</b><br><button data-node="${escape(other.id)}">${other.quadrant} · ${escape(other.title)}</button><small>${escape(link.basis)}</small></div>`;}).join(''):''}<p class="drawer-hint">编号 ${escape(node.id)} · 在 Codex 中补充或修正这条记录，画布会保留它的连续性。</p>`;
  }
  function closeDrawer() {
    const wasOpen=!$('#detail-drawer').hidden;
    $('#detail-drawer').hidden=true;
    $('#drawer-backdrop').hidden=true;
    $('.shell').inert=false;
    document.body.style.overflow='';
    state.selected=null;
    if (wasOpen && state.opener?.isConnected) state.opener.focus();
  }
  function showTopic() {
    state.opener=document.activeElement;
    state.selected=null;
    const topic=state.data.topic;
    $('#drawer-content').innerHTML=`<div class="eyebrow">共同面对的核心困局</div><h2 id="drawer-title">${escape(topic.title)}</h2><span class="drawer-status">${state.data.mode==='example'?'教学示例':topic.status==='pending'?'等待确认议题':'对话中确认的议题'}</span><p>四个象限围绕同一困局展开。困局的表述也可以在对话中逐渐澄清和修正。</p>${(topic.sourceIds||[]).map(id=>{const s=state.data.sources.find(source=>source.id===id);return s?`<blockquote>${escape(s.quote)}<small>${escape(s.label)}</small></blockquote>`:'';}).join('')}<h3>目前整理到这里</h3><p>${escape(state.data.changeSummary)}</p><p class="drawer-hint">从具体画面开始，不必一次填满四个象限。</p>`;
    $('#drawer-backdrop').hidden=false;$('#detail-drawer').hidden=false;$('.shell').inert=true;document.body.style.overflow='hidden';$('#close-drawer').focus();
  }
  function download(type) {
    if (!state.data) return toast('请先等待画布连接。');
    $('#export-menu').hidden=true;$('#export-button').setAttribute('aria-expanded','false');
    let url, revoke=false;
    if (offline) {
      const content=type==='json'?JSON.stringify(state.data,null,2):'<!doctype html>\n'+document.documentElement.outerHTML;
      url=URL.createObjectURL(new Blob([content],{type:type==='json'?'application/json':'text/html'}));revoke=true;
    } else {
      url=`/api/export?format=${type}&${state.mode==='example'?'mode=example':'revision='+state.data.revision}`;
    }
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`mpi-${state.data.mode}-v${state.data.revision}.${type}`;document.body.append(anchor);anchor.click();anchor.remove();
    if (revoke) setTimeout(()=>URL.revokeObjectURL(url),30000);
    toast(type==='json'?'正在导出结构化记录，可供后续对话继续整理。':'正在导出离线画布，打开文件即可展开和回看。');
  }
  function init() {
    if (offline) $('#loop-nav').hidden=true;
    $$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
    document.addEventListener('click',async event=>{
      const button=event.target.closest('button,a.brand');
      if (!button) {if(!event.target.closest('.export-menu')) $('#export-menu').hidden=true;return;}
      try {
        if (button.matches('a.brand')) {event.preventDefault();showView('canvas');}
        if (button.dataset.view) showView(button.dataset.view);
        if (button.dataset.node) openNode(button.dataset.node);
        if (button.dataset.quadrant) {const q=button.dataset.quadrant;state.allQuadrants.has(q)?state.allQuadrants.delete(q):state.allQuadrants.add(q);render();}
        if (button.dataset.focus) {state.thread=button.dataset.focus;state.autoFit=true;showView('canvas');render();}
        if (button.dataset.revision) setMode('history',await get('/api/history/'+button.dataset.revision));
        if (button.dataset.export) download(button.dataset.export);
        switch(button.id) {
          case 'example-switch': if(offline){toast('离线副本只保留当前画布。');break;} state.example ||= await get('/api/example');setMode('example',state.example);break;
          case 'live-switch': case 'return-live': if(offline){toast('当前是离线副本，请在 Codex 中打开本地画布。');break;} if(state.live) setMode('live',state.live);else await poll();break;
          case 'overview-button': state.thread='';state.autoFit=true;render();break;
          case 'expand-toggle':state.expanded=!state.expanded;render();break;
          case 'links-toggle':state.links=!state.links;render();break;
          case 'zoom-in':zoom(state.zoom+.1);break;
          case 'zoom-out':zoom(state.zoom-.1);break;
          case 'zoom-value':zoom(1);break;
          case 'fit-button':state.autoFit=true;layout();break;
          case 'close-drawer':closeDrawer();break;
          case 'core-topic':if(state.data)showTopic();break;
          case 'export-button':$('#export-menu').hidden=!$('#export-menu').hidden;button.setAttribute('aria-expanded',!$('#export-menu').hidden);break;
        }
      } catch(error) {toast('暂时无法读取，请确认本地画布服务正在运行。');}
    });
    $('#thread-select').addEventListener('change',event=>{state.thread=event.target.value;state.autoFit=true;render();});
    $('#drawer-backdrop').addEventListener('click',closeDrawer);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){closeDrawer();$('#export-menu').hidden=true;$('#export-button').setAttribute('aria-expanded','false');}
      if(event.key==='Tab'&&!$('#detail-drawer').hidden){
        const controls=$$('button,a,[tabindex="0"]',$('#detail-drawer'));
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    const viewport=$('#viewport');let drag=null;
    viewport.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.target.closest('button,a,select'))return;
      drag={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(event.pointerId);viewport.classList.add('dragging');
    });
    viewport.addEventListener('pointermove',event=>{if(drag){viewport.scrollLeft=drag.left-(event.clientX-drag.x);viewport.scrollTop=drag.top-(event.clientY-drag.y);}});
    const endDrag=()=>{drag=null;viewport.classList.remove('dragging');};viewport.addEventListener('pointerup',endDrag);viewport.addEventListener('pointercancel',endDrag);
    viewport.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();zoom(state.zoom+(event.deltaY>0?-.05:.05));}},{passive:false});
    let wasNarrow=null;
    new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{const narrow=viewport.clientWidth<850;if(wasNarrow!==narrow&&state.data){wasNarrow=narrow;render();}else layout();});}).observe(viewport);
    if(offline){state.mode=window.MPI_SNAPSHOT.mode==='example'?'example':'live';state.live=window.MPI_SNAPSHOT;state.data=window.MPI_SNAPSHOT;state.healthy=false;render();}
    else {poll();setInterval(()=>{if(!document.hidden)poll();},1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
