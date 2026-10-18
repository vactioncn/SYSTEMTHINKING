import {COLORS,FONT,clone,esc,uid,clamp,nodeBox,analyzeLoop,edgeGeometry,focusGraph,graphBounds,sceneSvg,exportSvg,autoLayout,fitLoop,removeSelection} from '/loops/core.js';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const paths={grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',orbit:'<path d="M5 7a8 8 0 0 1 14 0m1 4a8 8 0 0 1-12 8M4 15a8 8 0 0 1-1-4M5 3v4h4m11 0v4h-4M8 19H4v-4"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4m0 4v.1"/>',history:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6m3-4v6l4 2"/>',present:'<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M12 17v4m-4 0h8"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',folder:'<path d="M3 6V4h6l3 3h9v13H3z"/>',edit:'<path d="m14 5 5 5M4 16 16 4l4 4L8 20H4z"/>',plus:'<path d="M12 4v16M4 12h16"/>',cursor:'<path d="m5 3 14 10-7 1-3 7z"/>',text:'<path d="M5 6V4h14v2M12 4v16m-4 0h8"/>',arrow:'<path d="M3 18C3 7 13 7 20 7m-5-4 5 4-5 4"/>',undo:'<path d="M4 10h11a5 5 0 0 1 0 10M9 5l-5 5 5 5"/>',redo:'<path d="M20 10H9a5 5 0 0 0 0 10m6-15 5 5-5 5"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',focus:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',layout:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 5h10M6 7l5 10m7-10-5 10"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16"/>',fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.orbit}</svg>`;
function icons(root=document){$$('[data-icon]',root).forEach(el=>el.innerHTML=icon(el.dataset.icon));}
const state={workspace:null,base:null,active:null,selection:new Set(),tool:'select',linkFrom:null,focus:'',camera:{x:0,y:0,k:1},undo:[],redo:[],dirty:false,saving:false,conflict:false,version:0,drag:null,space:false,presenting:false,loaded:false};
let saveTimer,toastTimer,drawFrame,miniBounds,recoveredDraft=null,fieldSession=null;
const DRAFT='mpi-loop-unsaved-v1', ACTIVE='mpi-loop-active-v1';
const graph=()=>state.workspace?.diagrams.find(d=>d.id===state.active);
const visibleGraph=()=>focusGraph(graph(),state.focus);
const selected=()=>{if(state.selection.size!==1)return null;const [kind,id]=[...state.selection][0].split(':');return {kind,id,obj:graph()[{node:'nodes',edge:'edges',loop:'loops'}[kind]].find(o=>o.id===id)};};
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
async function request(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{const r=await fetch(path,{cache:'no-store',...options,signal:controller.signal});const body=await r.json();if(!r.ok){const error=new Error(body.error||'请求失败');error.status=r.status;throw error;}return body;}finally{clearTimeout(timer);}
}
function saveLabel(text,error=false){$('#save-status').textContent=text;$('#save-status').classList.toggle('error',error);}
function stash(){try{localStorage.setItem(DRAFT,JSON.stringify({active:state.active,workspace:state.workspace}));}catch{saveLabel('本地草稿空间不足 · 正在保存',true);}}
function dirty(summary){state.workspace.changeSummary=summary;state.version++;state.dirty=true;stash();saveLabel(state.conflict?'需要合并 · 草稿已保留':'正在保存…',state.conflict);clearTimeout(saveTimer);if(!state.conflict)saveTimer=setTimeout(save,650);updateUndo();}
async function save(){
 if(!state.dirty||state.saving||state.conflict)return;
 state.saving=true;const version=state.version,payload=clone(state.workspace);
 try{
  const next=await request('/api/loops',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:payload.revision,workspace:payload})});
  state.base=clone(next);state.workspace.revision=next.revision;state.workspace.updatedAt=next.updatedAt;
  if(version===state.version){state.dirty=false;try{localStorage.removeItem(DRAFT);}catch{}saveLabel('已保存 · v'+next.revision);}else stash();
 }catch(error){
  if(error.status===409){state.conflict=true;$('#conflict-banner').hidden=false;saveLabel('需要合并 · 草稿已保留',true);}
  else{saveLabel('保存未完成 · 草稿已保留',true);toast(error.name==='AbortError'?'保存超时，草稿已保留，将自动重试。':error.message);}
 }finally{state.saving=false;if(state.dirty&&!state.conflict)saveTimer=setTimeout(save,2500);}
}
async function poll(){
 if(!state.loaded||state.dirty||state.saving||state.drag||document.hidden||$('#modal').open)return;
 try{
  const version=state.version,revision=state.workspace.revision;
  const next=await request('/api/loops');
  if(state.dirty||state.saving||state.drag||state.version!==version||state.workspace.revision!==revision||$('#modal').open)return;
  if(next.revision!==state.workspace.revision){state.workspace=next;state.base=clone(next);if(!graph())state.active=next.diagrams[0].id;state.undo=[];state.redo=[];clearSelection();renderAll();toast('已同步 Codex 或另一窗口的更新 · v'+next.revision);}
  saveLabel('已保存 · v'+next.revision);
 }catch{saveLabel('连接中断 · 可继续编辑',true);}
}
function remember(){state.undo.push({workspace:clone(state.workspace),active:state.active});if(state.undo.length>80)state.undo.shift();state.redo=[];}
function mutate(summary,fn,{inspector=true}={}){fieldSession=null;remember();fn();dirty(summary);renderAll({inspector});}
function restoreSnapshot(snapshot){const revision=state.workspace.revision;state.workspace=clone(snapshot.workspace);state.workspace.revision=revision;state.active=snapshot.active;if(!graph())state.active=state.workspace.diagrams[0].id;clearSelection();dirty('撤销或重做图形编辑');renderAll();}
function undo(){if(!state.undo.length)return;state.redo.push({workspace:clone(state.workspace),active:state.active});restoreSnapshot(state.undo.pop());}
function redo(){if(!state.redo.length)return;state.undo.push({workspace:clone(state.workspace),active:state.active});restoreSnapshot(state.redo.pop());}
function updateUndo(){$('#undo').disabled=!state.undo.length;$('#redo').disabled=!state.redo.length;}
function clearSelection(){state.selection.clear();state.linkFrom=null;}
function select(kind,id,add=false){const key=kind+':'+id;if(add){state.selection.has(key)?state.selection.delete(key):state.selection.add(key);}else if(!state.selection.has(key)||state.selection.size!==1){state.selection=new Set([key]);}$('#inspector').hidden=false;renderInspector();scheduleDraw();}
function setTool(tool){state.tool=tool;state.linkFrom=null;$$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));$('#diagram-viewport').classList.toggle('placing',tool!=='select');toolHint();scheduleDraw();}
function toolHint(){const text=state.tool==='node'?'点击空白处，放置一个变量':state.tool==='edge'?(state.linkFrom?'再点击终点变量 · Esc 取消':'依次点击起点与终点，建立影响关系'):'';$('#tool-hint').hidden=!text;$('#tool-hint').textContent=text;}
function renderAll({inspector=true}={}){
 const g=graph();if(!g)return;
 if(state.focus&&!g.loops.some(l=>l.id===state.focus))state.focus='';
 $('#document-title').textContent=g.title;document.title=g.title+' · 系统回路';$('#document-subtitle').textContent=g.subtitle||'在 Codex 中继续对话，也可以在画布上自由绘制。';$('#atlas-label').textContent='我的图集 · '+state.workspace.diagrams.length;
 $('#example-badge').textContent=g.mode==='example'?'参考示例 · 独立保存':'真实分析';$('#example-badge').classList.toggle('live',g.mode==='live');
 $('#focus-loop').innerHTML='<option value="">全部回路</option>'+g.loops.map(l=>`<option value="${esc(l.id)}">${esc(l.title)}</option>`).join('');$('#focus-loop').value=state.focus;
 $('#graph-count').textContent=`${g.nodes.length} 变量 · ${g.edges.length} 连线 · ${g.loops.length} 回路`;
 $('#empty-state').hidden=!!g.nodes.length||!!g.loops.length||state.tool!=='select';
 updateUndo();if(inspector&&!$('#inspector').hidden)renderInspector();scheduleDraw();
}
function scheduleDraw(){cancelAnimationFrame(drawFrame);drawFrame=requestAnimationFrame(draw);}
function worldPoint(clientX,clientY){const r=$('#diagram').getBoundingClientRect(),c=state.camera;return{x:(clientX-r.left-c.x)/c.k,y:(clientY-r.top-c.y)/c.k};}
function center(){const r=$('#diagram').getBoundingClientRect();return worldPoint(r.left+r.width/2,r.top+r.height/2);}
function draw(){
 if(!graph())return;const svg=$('#diagram'),c=state.camera;
 const view={x:-c.x/c.k,y:-c.y/c.k,width:svg.clientWidth/c.k,height:svg.clientHeight/c.k};
 $('#world').setAttribute('transform',`translate(${c.x} ${c.y}) scale(${c.k})`);
 $('#world').innerHTML=sceneSvg(visibleGraph(),{selection:state.presenting?new Set():state.selection,editing:!state.presenting,scale:c.k,linkFrom:state.linkFrom,viewport:view});
 if(state.drag?.kind==='marquee'){const {start,current}=state.drag;$('#world').insertAdjacentHTML('beforeend',`<rect x="${Math.min(start.x,current.x)}" y="${Math.min(start.y,current.y)}" width="${Math.abs(start.x-current.x)}" height="${Math.abs(start.y-current.y)}" fill="#27858b" fill-opacity=".06" stroke="#27858b" stroke-width="${1/c.k}" stroke-dasharray="5 4"/>`);}
 $('#zoom-label').textContent=(c.k<.01?(c.k*100).toFixed(2):Math.round(c.k*100))+'%';renderMinimap();
}
function fit(){const b=graphBounds(visibleGraph()),svg=$('#diagram'),padding=70,k=clamp(Math.min((svg.clientWidth-padding)/b.width,(svg.clientHeight-padding-20)/b.height),.0001,1.3);state.camera={k,x:(svg.clientWidth-b.width*k)/2-b.x*k,y:(svg.clientHeight-b.height*k)/2-b.y*k-8};scheduleDraw();}
function zoom(factor,x,y){const r=$('#diagram').getBoundingClientRect();x??=r.left+r.width/2;y??=r.top+r.height/2;const p=worldPoint(x,y);state.camera.k=clamp(state.camera.k*factor,.0001,4);state.camera.x=x-r.left-p.x*state.camera.k;state.camera.y=y-r.top-p.y*state.camera.k;scheduleDraw();}
function centerNode(node){const svg=$('#diagram'),k=Math.max(.65,state.camera.k);state.camera={k,x:svg.clientWidth/2-node.x*k,y:svg.clientHeight/2-node.y*k};scheduleDraw();}
function renderMinimap(){
 if($('#minimap-wrap').hidden)return;const g=graph(),b=graphBounds(g),c=state.camera,svg=$('#diagram'),k=Math.min(164/b.width,96/b.height),ox=(180-b.width*k)/2-b.x*k,oy=(112-b.height*k)/2-b.y*k;miniBounds={k,ox,oy};
 const nodes=new Map(g.nodes.map(n=>[n.id,n]));$('#minimap').innerHTML=`<rect width="180" height="112" fill="#fcfdfc"/><g transform="translate(${ox} ${oy}) scale(${k})">${g.edges.map(e=>{const a=nodes.get(e.from),b=nodes.get(e.to);return a&&b?`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="${e.color}" stroke-width="${.6/k}" opacity=".35"/>`:'';}).join('')}${g.nodes.map(n=>`<circle cx="${n.x}" cy="${n.y}" r="${2/k}" fill="${n.color}"/>`).join('')}<rect x="${-c.x/c.k}" y="${-c.y/c.k}" width="${svg.clientWidth/c.k}" height="${svg.clientHeight/c.k}" fill="#27858b" fill-opacity=".06" stroke="#27858b" stroke-width="${.8/k}"/></g>`;
}
function input(label,name,value,{type='text',min='',max='',step='',area=false,rows=3}={}){return `<label class="field"><span>${label}</span>${area?`<textarea data-field="${name}" rows="${rows}">${esc(value)}</textarea>`:`<input data-field="${name}" type="${type}" value="${esc(value)}"${min!==''?' min="'+min+'"':''}${max!==''?' max="'+max+'"':''}${step!==''?' step="'+step+'"':''}>`}</label>`;}
function selectField(label,name,value,options){return `<label class="field"><span>${label}</span><select data-field="${name}">${options.map(([v,l])=>`<option value="${esc(v)}"${v===value?' selected':''}>${esc(l)}</option>`).join('')}</select></label>`;}
function swatches(obj){return `<span class="field-label">颜色</span><div class="swatches">${Object.values(COLORS).map(c=>`<button class="swatch ${obj.color===c?'chosen':''}" data-color="${c}" style="background:${c}" title="颜色 ${c}" aria-label="颜色 ${c}"></button>`).join('')}<input type="color" data-field="color" value="${obj.color}" title="自选颜色" aria-label="自选颜色"></div>`;}
function renderInspector(){
 const g=graph(),s=selected();if(!g)return;let html='';
 if(!state.selection.size){$('#inspector-type').textContent='这张图';html=input('标题','title',g.title)+input('副标题','subtitle',g.subtitle,{area:true})+selectField('图的用途','mode',g.mode,[['live','真实分析'],['example','独立示例']])+input('说明与阅读提示','notes',g.notes,{area:true,rows:5})+'<p class="hint">直接拖动变量与回路徽章；选中连线后，拖动两个圆形控制点调整弧线。所有修改会自动保存。</p><div class="inspector-actions"><button class="small-button" data-action="duplicate-map">复制这张图</button><button class="small-button danger" data-action="delete-map">删除这张图</button></div>';}
 else if(state.selection.size>1){$('#inspector-type').textContent='多项选择';html=`<p class="select-count">${state.selection.size} 项</p><p class="hint">拖动任一已选变量，可以一起移动。Shift 点击可增减选择。</p><div class="inspector-actions"><button class="small-button" data-action="loop">将所选连线组织为回路</button><button class="small-button danger" data-action="delete">删除所选</button></div>`;}
 else if(s?.obj){const o=s.obj;
  if(s.kind==='node'){$('#inspector-type').textContent='变量';html=input('变量名称 · 支持换行','label',o.label,{area:true})+'<p class="hint">建议用可以增加或减少的量命名，例如「财务压力」「新客开发时间」。</p>'+swatches(o)+`<div class="field-row">${input('文字大小','fontSize',o.fontSize,{type:'number',min:12,max:80})}${input('换行宽度','width',o.width,{type:'number',min:60,max:1200})}</div>`+input('说明 / 观察依据','notes',o.notes,{area:true})+(o.sourceNodeIds?.length?`<p class="property-caption">来自四象限线索：${o.sourceNodeIds.map(esc).join('、')}。仅引用原记录，不自动生成因果联系。</p>`:'')+'<div class="inspector-actions"><button class="small-button" data-action="connect">从这里连线</button><button class="small-button" data-action="duplicate-node">复制变量</button><button class="small-button danger" data-action="delete">删除</button></div>';}
  if(s.kind==='edge'){$('#inspector-type').textContent='影响关系';const options=g.nodes.map(n=>[n.id,n.label.replaceAll('\n','')]);html=selectField('起点','from',o.from,options)+selectField('终点','to',o.to,options)+'<span class="field-label">影响方向 · 其他条件相同时</span><div class="direction-buttons">'+[['+','同向变化'],['-','反向变化'],['?','尚不确定']].map(([p,title])=>`<button data-polarity="${p}" class="${o.polarity===p?'chosen':''}" title="${title}">${p==='-'?'−':p}</button>`).join('')+'</div>'+selectField('核实状态','status',o.status,[['hypothesis','待核实 · 虚线'],['confirmed','已确认 · 实线']])+`<label class="check-row"><input type="checkbox" data-field="delay"${o.delay?' checked':''}>存在时间延迟 ∥</label>`+swatches(o)+input('关系依据','basis',o.basis,{area:true,rows:4})+input('线上的文字（可选）','label',o.label)+`<details><summary class="field-label">曲线与符号位置</summary>${input('符号在线上的位置','labelPosition',o.labelPosition??.86,{type:'range',min:.1,max:.98,step:.01})}${input('符号距线的距离','labelOffset',o.labelOffset??22,{type:'number',min:-200,max:200})}<p class="hint">画布上的两个圆形控制点可独立拖动。连线会跟随变量移动。</p></details><div class="inspector-actions"><button class="small-button" data-action="straight">拉直连线</button><button class="small-button" data-action="reverse">反转箭头</button><button class="small-button danger" data-action="delete">删除</button></div>`;}
  if(s.kind==='loop'){$('#inspector-type').textContent='回路区域';const result=analyzeLoop(g,o),nodes=new Map(g.nodes.map(n=>[n.id,n]));html=input('回路名称','title',o.title)+input('说明','description',o.description,{area:true})+swatches(o)+`<div class="loop-result"><strong>${result.type}</strong>${esc(result.message)}<small>${result.closed?'按所选连线的正负方向计算，'+(result.pending?'含待核实关系。':'不代表已证明因果。'):'只按已有连线判断，不会自动补线。'}</small></div><div class="field-row">${input('背景横向范围','rx',o.rx,{type:'number',min:40,max:100000})}${input('背景纵向范围','ry',o.ry,{type:'number',min:40,max:100000})}</div><span class="field-label">组成回路的连线</span><div class="loop-members">${g.edges.length?g.edges.map(e=>`<label class="check-row"><input type="checkbox" data-member="${esc(e.id)}"${o.edgeIds.includes(e.id)?' checked':''}><span>${esc(nodes.get(e.from)?.label.replaceAll('\n',''))} → ${esc(nodes.get(e.to)?.label.replaceAll('\n',''))} <b>${e.polarity==='-'?'−':esc(e.polarity)}</b></span></label>`).join(''):'<p class="hint">还没有连线。先添加变量，再连接它们。</p>'}</div><p class="hint">拖动徽章移动区域；按住 Alt 只移动徽章。右下角方块调整范围，中间圆点移动背景。</p><div class="inspector-actions"><button class="small-button" data-action="fit-loop">适应成员</button><button class="small-button" data-action="focus-selection">聚焦此回路</button><button class="small-button danger" data-action="delete">删除区域</button></div>`;}
 }else {state.selection.clear();return renderInspector();}
 $('#inspector-content').innerHTML=html;
}
function addNode(point){
 const n={id:uid('n'),label:'新变量 '+(graph().nodes.length+1),x:point.x,y:point.y,width:240,fontSize:28,color:COLORS.ink,notes:'',sourceNodeIds:[]};
 mutate('添加变量',()=>graph().nodes.push(n));state.focus='';setTool('select');select('node',n.id);requestAnimationFrame(()=>{$('[data-field="label"]')?.focus();$('[data-field="label"]')?.select();});
}
function addEdge(to){
 const from=state.linkFrom;if(!from){state.linkFrom=to;toolHint();scheduleDraw();return;}
 const twins=graph().edges.filter(e=>(e.from===from&&e.to===to)||(e.from===to&&e.to===from)).length,offset=twins?80+twins*50:0;
 const e={id:uid('e'),from,to,polarity:'?',status:'hypothesis',delay:false,color:COLORS.ink,route:from===to?{}:{c1:{along:.33,offset},c2:{along:.67,offset}},label:'',basis:'',labelPosition:.86,labelOffset:22};
 mutate('添加一条待核实的影响关系',()=>graph().edges.push(e));setTool('select');select('edge',e.id);toast('连线已添加。选择 ＋ / −，说明它的影响方向。');
}
function addLoop(){
 const g=graph(),selectedNodes=new Set([...state.selection].filter(s=>s.startsWith('node:')).map(s=>s.slice(5))),edges=g.edges.filter(e=>state.selection.has('edge:'+e.id)||(selectedNodes.has(e.from)&&selectedNodes.has(e.to))).map(e=>e.id),p=center();
 const loop={id:uid('loop'),title:'回路 '+(g.loops.length+1),description:'',color:g.loops.length%2?COLORS.amber:COLORS.teal,edgeIds:edges,x:p.x,y:p.y,rx:320,ry:210,labelX:p.x,labelY:p.y};if(edges.length)fitLoop(g,loop);
 mutate('添加回路区域',()=>g.loops.push(loop));state.focus='';select('loop',loop.id);renderAll();
}
function deleteSelected(){if(!state.selection.size)return;mutate('删除选中元素并清理相关引用',()=>removeSelection(graph(),state.selection));clearSelection();renderAll();toast('已删除，可用 ⌘ Z 撤销。');}
function switchGraph(id){if(state.conflict){toast('请先合并当前草稿，再切换图。');return;}state.active=id;clearSelection();state.focus='';setTool('select');$('#inspector').hidden=true;try{localStorage.setItem(ACTIVE,id);}catch{}renderAll();requestAnimationFrame(fit);}
function newGraph(){const next={id:uid('map'),title:'新的系统回路图',subtitle:'从一个变量开始，逐步看清相互影响。',mode:'live',notes:'',nodes:[],edges:[],loops:[]};mutate('新建系统回路图',()=>state.workspace.diagrams.push(next));switchGraph(next.id);$('#inspector').hidden=false;renderInspector();requestAnimationFrame(()=>$('[data-field="title"]')?.select());}
function duplicateMap(source=graph(),suffix=' · 副本'){const next=clone(source);next.id=uid('map');next.title+=suffix;mutate('复制回路图',()=>state.workspace.diagrams.push(next));switchGraph(next.id);return next;}
function openModal(title,content){$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;icons($('#modal'));if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();}
function atlas(){openModal('我的图集',state.workspace.diagrams.map(d=>`<div class="map-row ${d.id===state.active?'current':''}"><button data-map="${esc(d.id)}"><b>${esc(d.title)}</b><small>${d.mode==='example'?'参考示例':'真实分析'} · ${d.nodes.length} 个变量 · ${d.loops.length} 个回路</small></button><button class="small-button" data-copy-map="${esc(d.id)}">复制</button></div>`).join('')+'<div class="modal-actions"><button class="button primary" data-action="new">＋ 新建空白图</button><button class="button" data-action="import">导入图文件</button></div>');}
async function history(){try{const items=await request('/api/loops/history');openModal('回看历史版本','<p class="hint">打开历史中当前图的副本，继续修改或比较。现有图会保留。</p>'+items.slice(0,60).map(item=>`<div class="history-row"><div><b>v${item.revision} · ${esc(item.changeSummary)}</b><small>${item.updatedAt?new Date(item.updatedAt).toLocaleString('zh-CN'):'初始版本'}</small></div><button class="small-button" data-history="${item.revision}">打开副本</button></div>`).join(''));}catch(e){toast(e.message);}}
function search(){openModal('查找变量','<input id="search-variables" class="search-input" placeholder="输入变量名称或说明…" aria-label="查找变量"><div id="search-results"></div>');searchResults('');setTimeout(()=>$('#search-variables').focus(),20);}
function searchResults(query){const found=graph().nodes.filter(n=>(n.label+' '+n.notes).toLowerCase().includes(query.toLowerCase())).slice(0,100);$('#search-results').innerHTML=found.map(n=>`<button class="search-result" data-find="${esc(n.id)}"><div><b>${esc(n.label.replaceAll('\n',''))}</b><small>${esc(n.notes||'点击定位到画布')}</small></div><span>↗</span></button>`).join('')||'<p class="hint">没有找到相符的变量。</p>';}
async function sourceNodes(){try{const current=await request('/api/state');openModal('从四象限选择线索','<p class="hint">选中的记录会成为变量起点。你可以调整名称；影响方向与连线需要另行建立。</p>'+current.nodes.map(n=>`<label class="source-row"><input type="checkbox" data-source="${esc(n.id)}"><span>${esc(n.title)}<br><small>${n.quadrant} · ${esc(n.kind)}</small></span></label>`).join('')+'<div class="modal-actions"><button class="button primary" data-action="add-sources">添加选中的线索</button></div>');$('#modal').sourceData=current;}catch(e){toast(e.message);}}
function addSources(){const ids=new Set($$('[data-source]:checked').map(e=>e.dataset.source));if(!ids.size){toast('先选择一条线索。');return;}const source=$('#modal').sourceData,nodes=source.nodes.filter(n=>ids.has(n.id)),p=center();mutate('从四象限引用变量起点',()=>nodes.forEach((n,i)=>graph().nodes.push({id:uid('n'),label:n.title,x:p.x+(i%3-1)*310,y:p.y+Math.floor(i/3)*150,width:250,fontSize:26,color:COLORS.ink,notes:n.detail||'',sourceNodeIds:[n.id]})));state.focus='';closeModal();fit();}
function download(content,type,name){const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const fileName=()=>graph().title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,100);
function exportJSON(){download(JSON.stringify({format:'mpi-causal-diagram',schemaVersion:1,diagram:graph()},null,2),'application/json',fileName()+'.json');}
async function exportPNG(){
 const svg=exportSvg(graph()),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(2,8192/img.width,8192/img.height),canvas=document.createElement('canvas');canvas.width=Math.ceil(img.width*scale);canvas.height=Math.ceil(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('图片生成失败，请使用 SVG 导出。');download(blob,'image/png',fileName()+'.png');toast('高清图片已导出。');}catch(e){toast(e.message||'图片生成失败，请使用 SVG 导出。');}finally{URL.revokeObjectURL(url);}
}
async function importFile(file){
 if(!file)return;if(file.size>16*1024*1024){toast('图文件需小于 16 MB。');return;}
 try{const value=JSON.parse(await file.text());if(value.schemaVersion!==1)throw new Error('不支持这个文件的结构版本。');const diagrams=value.format==='mpi-causal-diagram'?[value.diagram]:value.schemaVersion===1&&Array.isArray(value.diagrams)?value.diagrams:null;
  if(!diagrams?.length)throw new Error('请选择从本工具导出的回路 JSON 文件。');
  // Server-side validation is authoritative; validate a candidate without replacing local state on error.
  await save();if(state.dirty||state.conflict)throw new Error('请先完成当前草稿的保存或合并，再导入文件。');
  const candidate=clone(state.workspace),added=diagrams.map(d=>({...clone(d),id:uid('map'),title:d.title+' · 导入'}));candidate.diagrams.push(...added);candidate.changeSummary='导入回路图副本';
  const next=await request('/api/loops',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:candidate.revision,workspace:candidate})});remember();state.workspace=next;state.base=clone(next);switchGraph(added[0].id);closeModal();saveLabel('已保存 · v'+next.revision);toast('已导入 '+added.length+' 张图。');
 }catch(e){toast(e.message||'无法读取这个图文件。');}finally{$('#import-file').value='';}
}
async function resolveConflict(copy){
 try{const current=await request('/api/loops');
  if(copy){const baseline=new Map((state.base?.diagrams||[]).map(d=>[d.id,JSON.stringify(d)])),changed=state.workspace.diagrams.filter(d=>JSON.stringify(d)!==baseline.get(d.id));let active=state.active;for(const diagram of changed){const local=clone(diagram);local.id=uid('map');local.title+=' · 合并副本';if(diagram.id===state.active)active=local.id;current.diagrams.push(local);}current.changeSummary='保留本地修改为副本，合并最新图集';const next=await request('/api/loops',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:current.revision,workspace:current})});state.workspace=next;state.active=current.diagrams.some(d=>d.id===active)?active:current.diagrams[0].id;}
  else{download(JSON.stringify(state.workspace,null,2),'application/json','系统回路-未合并草稿.json');state.workspace=current;if(!graph())state.active=current.diagrams[0].id;}
  state.base=clone(state.workspace);state.dirty=false;state.conflict=false;state.undo=[];state.redo=[];$('#conflict-banner').hidden=true;try{localStorage.removeItem(DRAFT);}catch{}clearSelection();renderAll();fit();saveLabel('已保存 · v'+state.workspace.revision);
 }catch(e){toast(e.message);}
}
function help(){openModal('把相互影响，画清楚。','<ol class="help-list"><li><b>添加变量：</b>点「变量」再点画布，或双击空白处。变量可以拖动，文字可以换行。</li><li><b>建立关系：</b>点「连线」，依次点击起点与终点。在右侧设置 ＋ / −、待核实状态与时间延迟。</li><li><b>调整弧线：</b>选中连线后，拖动两个圆点。每条连线都可以独立调整。</li><li><b>组织回路：</b>Shift 点击选择连线，再点「回路」。也可以在回路属性中勾选成员。闭合且方向明确时自动显示 R 或 B。</li><li><b>处理复杂图：</b>滚轮缩放、拖动空白平移；Shift 点击多选，Shift 拖动框选变量。用搜索、缩略导航与「聚焦回路」查看局部。</li><li><b>继续对话：</b>直接在 Codex 中提出修改。保存后这里会同步；网页和对话同时修改时，会保留草稿并提示合并。</li></ol><p class="hint">快捷键：V 选择，N 变量，C 连线，F 适应画布，Delete 删除，⌘ Z 撤销，⌘ ⇧ Z 重做，⌘ F 搜索。回路中的负向关系为奇数时是 B，偶数时是 R；这只判断反馈结构，不验证现实因果。</p>');}
function present(){state.presenting=!state.presenting;document.body.classList.toggle('presenting',state.presenting);clearSelection();requestAnimationFrame(fit);}
async function action(name){
 switch(name){
  case 'new':closeModal();newGraph();break;
  case 'atlas':atlas();break;
  case 'document':clearSelection();$('#inspector').hidden=false;renderInspector();scheduleDraw();break;
  case 'inspector':$('#inspector').hidden=!$('#inspector').hidden;renderInspector();break;
  case 'close-inspector':$('#inspector').hidden=true;break;
  case 'loop':addLoop();break;
  case 'undo':undo();break;case 'redo':redo();break;
  case 'delete':deleteSelected();break;
  case 'fit':fit();break;
  case 'zoom-in':zoom(1.2);break;case 'zoom-out':zoom(1/1.2);break;case 'zoom-reset':zoom(1/state.camera.k);break;
  case 'minimap':$('#minimap-wrap').hidden=!$('#minimap-wrap').hidden;renderMinimap();break;
  case 'layout':mutate('整理现有图形布局',()=>autoLayout(graph()));fit();toast('布局已整理，可以继续拖动微调或撤销。');break;
  case 'search':search();break;
  case 'history':await history();break;
  case 'present':present();break;
  case 'export-menu':$('#export-menu').hidden=!$('#export-menu').hidden;$('[data-action="export-menu"]').setAttribute('aria-expanded',String(!$('#export-menu').hidden));break;
  case 'export-svg':download(exportSvg(graph()),'image/svg+xml;charset=utf-8',fileName()+'.svg');break;
  case 'export-png':await exportPNG();break;
  case 'export-json':exportJSON();break;
  case 'import':$('#import-file').click();break;
  case 'close-modal':closeModal();break;
  case 'help':help();break;
  case 'source-nodes':await sourceNodes();break;
  case 'add-sources':addSources();break;
  case 'connect':{const s=selected();if(s?.kind==='node'){setTool('edge');state.linkFrom=s.id;toolHint();}}break;
  case 'duplicate-node':{const s=selected();if(s?.kind==='node'){const node={...clone(s.obj),id:uid('n'),x:s.obj.x+65,y:s.obj.y+90};mutate('复制变量',()=>graph().nodes.push(node));select('node',node.id);}}break;
  case 'duplicate-map':duplicateMap();break;
  case 'delete-map':if(state.workspace.diagrams.length===1){toast('图集中至少保留一张图。');break;}mutate('删除图，可通过撤销或历史找回',()=>{state.workspace.diagrams=state.workspace.diagrams.filter(d=>d.id!==state.active);state.active=state.workspace.diagrams[0].id;clearSelection();});fit();toast('图已删除，可以撤销或从历史版本找回。');break;
  case 'straight':{const s=selected();if(s?.kind==='edge')mutate('调整连线路径',()=>s.obj.route=s.obj.from===s.obj.to?{}:{c1:{along:.33,offset:0},c2:{along:.67,offset:0}});}break;
  case 'reverse':{const s=selected();if(s?.kind==='edge')mutate('反转影响方向，重新标为待核实',()=>{const e=s.obj,a=e.from;e.from=e.to;e.to=a;e.route={};e.status='hypothesis';e.basis='';});}break;
  case 'fit-loop':{const s=selected();if(s?.kind==='loop')mutate('调整回路范围以包含成员',()=>fitLoop(graph(),s.obj));}break;
  case 'focus-selection':{const s=selected();if(s?.kind==='loop'){state.focus=s.id;renderAll();fit();}}break;
  case 'conflict-copy':await resolveConflict(true);break;case 'conflict-load':await resolveConflict(false);break;
  case 'recover-draft':if(recoveredDraft){const changed=recoveredDraft.workspace.diagrams.filter(d=>JSON.stringify(d)!==JSON.stringify(state.workspace.diagrams.find(v=>v.id===d.id)));let active=state.active;mutate('恢复尚未保存的图集草稿',()=>{for(const prior of changed){const next=clone(prior);next.id=uid('map');next.title+=' · 恢复草稿';state.workspace.diagrams.push(next);if(prior.id===recoveredDraft.active)active=next.id;}});switchGraph(active);$('#draft-banner').hidden=true;recoveredDraft=null;}break;
  case 'discard-draft':recoveredDraft=null;$('#draft-banner').hidden=true;try{localStorage.removeItem(DRAFT);}catch{}break;
 }
 if(name!=='export-menu'){$('#export-menu').hidden=true;$('[data-action="export-menu"]').setAttribute('aria-expanded','false');}
}

function changeProperty(target,live=false){
 const field=target.dataset.field,s=selected(),obj=s?.obj||graph();if(!obj)return;
 let value=target.type==='checkbox'?target.checked:target.type==='number'||target.type==='range'?Number(target.value):target.value;
 if((field==='title'||field==='label')&&!(s?.kind==='edge'&&field==='label')&&!String(value).trim()){if(live)return;toast('名称不能为空。');renderInspector();return;}
 if(target.type==='number'&&(!target.checkValidity()||!target.value)){if(live)return;toast('请输入允许范围内的数字。');renderInspector();return;}
 if(field==='status'&&value==='confirmed'&&!obj.basis?.trim()){toast('请先填写关系依据，再标为已确认。');renderInspector();return;}
 if(field==='basis'&&obj.status==='confirmed'&&!String(value).trim()){if(live)return;toast('已确认的关系需要保留依据。');renderInspector();return;}
 if(JSON.stringify(obj[field])===JSON.stringify(value))return;
 const key=state.active+':'+(s?.id||'document')+':'+field;
 if(!live||fieldSession!==key)remember();fieldSession=live?key:null;
 obj[field]=value;if(s?.kind==='edge'&&(field==='from'||field==='to')){obj.route={};obj.status='hypothesis';obj.basis='';}
 dirty('修改'+(s?{node:'变量',edge:'影响关系',loop:'回路'}[s.kind]:'图的说明'));renderAll({inspector:!live});
}
document.addEventListener('change',event=>{
 const el=event.target;
 if(el.dataset.field)changeProperty(el);
 if(el.dataset.member){const s=selected();if(s?.kind==='loop')mutate('调整回路成员',()=>{s.obj.edgeIds=el.checked?[...new Set([...s.obj.edgeIds,el.dataset.member])]:s.obj.edgeIds.filter(id=>id!==el.dataset.member);});}
 if(el.id==='focus-loop'){state.focus=el.value;clearSelection();renderAll();fit();}
 if(el.id==='import-file')importFile(el.files[0]);
});
document.addEventListener('input',event=>{if(event.target.id==='search-variables')searchResults(event.target.value);else if(event.target.dataset.field&&event.target.matches('input:not([type=checkbox]),textarea'))changeProperty(event.target,true);});
document.addEventListener('focusout',()=>fieldSession=null);
document.addEventListener('click',async event=>{
 const button=event.target.closest('button');
 if(!event.target.closest('.menu-wrap'))$('#export-menu').hidden=true;
 if(!button||!state.loaded)return;
 try{
  if(button.dataset.tool)setTool(button.dataset.tool);
  if(button.dataset.action)await action(button.dataset.action);
  if(button.dataset.color){const s=selected();if(s?.obj)mutate('修改图形颜色',()=>s.obj.color=button.dataset.color);}
  if(button.dataset.polarity){const s=selected();if(s?.kind==='edge')mutate('修改影响方向',()=>s.obj.polarity=button.dataset.polarity);}
  if(button.dataset.map){closeModal();switchGraph(button.dataset.map);}
  if(button.dataset.copyMap){duplicateMap(state.workspace.diagrams.find(d=>d.id===button.dataset.copyMap));closeModal();}
  if(button.dataset.find){const node=graph().nodes.find(n=>n.id===button.dataset.find);closeModal();state.focus='';select('node',node.id);renderAll();centerNode(node);}
  if(button.dataset.history){const previous=await request('/api/loops/history/'+button.dataset.history),old=previous.diagrams.find(d=>d.id===state.active);if(!old){toast('这一版本中还没有当前图。');return;}duplicateMap(old,' · v'+button.dataset.history);closeModal();}
 }catch(error){toast(error.message||'操作没有完成，当前内容仍然保留。');}
});
const svg=$('#diagram'),viewport=$('#diagram-viewport');
svg.addEventListener('pointerdown',event=>{
 if(!state.loaded||event.button>1)return;
 const p=worldPoint(event.clientX,event.clientY),handle=event.target.closest('[data-handle]'),item=event.target.closest('[data-kind]');
 const startDrag=details=>{state.drag={...details,start:p,client:{x:event.clientX,y:event.clientY},changed:false,before:null};svg.setPointerCapture(event.pointerId);viewport.classList.add('dragging');};
 if(state.space||event.button===1||state.presenting){event.preventDefault();startDrag({kind:'pan',camera:{...state.camera}});return;}
 if(handle){const id=handle.dataset.id,key=handle.dataset.handle,obj=key.startsWith('loop')?graph().loops.find(l=>l.id===id):graph().edges.find(e=>e.id===id);startDrag({kind:'handle',id,key,obj,original:clone(obj)});return;}
 if(item){
  const kind=item.dataset.kind,id=item.dataset.id;
  if(state.tool==='edge'){if(kind==='node')addEdge(id);return;}
  if(event.shiftKey){select(kind,id,true);return;}
  if(!state.selection.has(kind+':'+id))select(kind,id);else{renderInspector();scheduleDraw();}
  if(kind==='node'||kind==='loop'){
   const items=[...state.selection].map(key=>{const [kind,id]=key.split(':');const obj=graph()[{node:'nodes',edge:'edges',loop:'loops'}[kind]].find(o=>o.id===id);return{kind,id,obj,original:clone(obj)};}).filter(i=>i.kind!=='edge');
   startDrag({kind:'move',items,labelOnly:event.altKey});
  }
  return;
 }
 if(state.tool==='node'){addNode(p);return;}
 if(state.tool==='edge'){state.linkFrom=null;toolHint();scheduleDraw();return;}
 if(event.shiftKey){startDrag({kind:'marquee',current:p,selection:new Set(state.selection)});return;}
 clearSelection();renderInspector();startDrag({kind:'pan',camera:{...state.camera}});scheduleDraw();
});
svg.addEventListener('pointermove',event=>{
 const d=state.drag;if(!d)return;
 if(d.kind==='pan'){state.camera.x=d.camera.x+event.clientX-d.client.x;state.camera.y=d.camera.y+event.clientY-d.client.y;scheduleDraw();return;}
 const p=worldPoint(event.clientX,event.clientY);
 if(d.kind==='marquee'){d.current=p;scheduleDraw();return;}
 if(!d.changed&&Math.hypot(event.clientX-d.client.x,event.clientY-d.client.y)<3)return;
 if(!d.changed){d.before={workspace:clone(state.workspace),active:state.active};d.changed=true;}
 const dx=p.x-d.start.x,dy=p.y-d.start.y;
 if(d.kind==='move')for(const {kind,obj,original} of d.items){
  if(kind==='node'||!d.labelOnly){obj.x=clamp(original.x+dx,-1000000,1000000);obj.y=clamp(original.y+dy,-1000000,1000000);}
  if(kind==='loop'){obj.labelX=clamp(original.labelX+dx,-1000000,1000000);obj.labelY=clamp(original.labelY+dy,-1000000,1000000);}
 }
 if(d.kind==='handle'){
  if(d.key==='loop-size'){d.obj.rx=clamp(p.x-d.obj.x,40,100000);d.obj.ry=clamp(p.y-d.obj.y,40,100000);}
  else if(d.key==='loop-center'){d.obj.x=clamp(d.original.x+dx,-1000000,1000000);d.obj.y=clamp(d.original.y+dy,-1000000,1000000);}
  else {const geom=edgeGeometry(d.obj,new Map(graph().nodes.map(n=>[n.id,n])));d.obj.route??={};d.obj.route[d.key]=geom.toRoute(p);}
 }
 scheduleDraw();
});
function endPointer(event,cancel=false){
 const d=state.drag;if(!d)return;
 if(cancel&&d.before){state.workspace=d.before.workspace;state.active=d.before.active;}
 else if(d.changed){state.undo.push(d.before);if(state.undo.length>80)state.undo.shift();state.redo=[];dirty('调整图形布局');}
 else if(d.kind==='marquee'){
  const minX=Math.min(d.start.x,d.current.x),maxX=Math.max(d.start.x,d.current.x),minY=Math.min(d.start.y,d.current.y),maxY=Math.max(d.start.y,d.current.y);state.selection=new Set(d.selection);
  for(const n of visibleGraph().nodes)if(n.x>=minX&&n.x<=maxX&&n.y>=minY&&n.y<=maxY)state.selection.add('node:'+n.id);
  if(state.selection.size)$('#inspector').hidden=false;
 }
 state.drag=null;viewport.classList.remove('dragging');if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);renderAll();
}
svg.addEventListener('pointerup',e=>endPointer(e));svg.addEventListener('pointercancel',e=>endPointer(e,true));
svg.addEventListener('dblclick',event=>{if(state.presenting)return;const item=event.target.closest('[data-kind]');if(item){select(item.dataset.kind,item.dataset.id);requestAnimationFrame(()=>{$('[data-field="label"], [data-field="title"]')?.focus();$('[data-field="label"], [data-field="title"]')?.select();});}else if(state.tool==='select')addNode(worldPoint(event.clientX,event.clientY));});
viewport.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(-event.deltaY*.0015),event.clientX,event.clientY);},{passive:false});
$('#minimap').addEventListener('pointerdown',event=>{if(!miniBounds)return;const r=event.currentTarget.getBoundingClientRect(),{k,ox,oy}=miniBounds,px=(event.clientX-r.left-ox)/k,py=(event.clientY-r.top-oy)/k;state.camera.x=svg.clientWidth/2-px*state.camera.k;state.camera.y=svg.clientHeight/2-py*state.camera.k;scheduleDraw();});
document.addEventListener('keydown',event=>{
 if(!state.loaded)return;const typing=event.target.matches('input,textarea,select,[contenteditable]'),mod=event.metaKey||event.ctrlKey;
 if(event.key==='Escape'){if($('#modal').open){closeModal();return;}if(state.presenting)present();else{setTool('select');clearSelection();$('#inspector').hidden=true;scheduleDraw();}$('#export-menu').hidden=true;return;}
 if(mod&&event.key.toLowerCase()==='s'){event.preventDefault();document.activeElement?.blur();clearTimeout(saveTimer);save();return;}
 if(typing||$('#modal').open)return;
 const key=event.key.toLowerCase();
 if(mod&&key==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
 if(mod&&key==='f'){event.preventDefault();search();return;}
 if(mod&&key==='a'){event.preventDefault();state.selection=new Set(visibleGraph().nodes.map(n=>'node:'+n.id));$('#inspector').hidden=false;renderInspector();scheduleDraw();return;}
 if(key==='delete'||key==='backspace'){event.preventDefault();deleteSelected();return;}
 if(key===' '){event.preventDefault();state.space=true;return;}
 if(event.key==='Enter'&&event.target.closest('[data-kind]')){const t=event.target.closest('[data-kind]');select(t.dataset.kind,t.dataset.id);return;}
 if(key==='v')setTool('select');if(key==='n')setTool('node');if(key==='c')setTool('edge');if(key==='f')fit();
});
document.addEventListener('keyup',e=>{if(e.key===' ')state.space=false;});
window.addEventListener('blur',()=>state.space=false);
window.addEventListener('beforeunload',e=>{if(state.dirty){stash();e.preventDefault();e.returnValue='';}});
new ResizeObserver(()=>scheduleDraw()).observe(viewport);
async function init(){
 icons();
 try{
  state.workspace=await request('/api/loops');state.base=clone(state.workspace);let active=null;
  try{active=localStorage.getItem(ACTIVE);recoveredDraft=JSON.parse(localStorage.getItem(DRAFT)||'null');}catch{}
  state.active=state.workspace.diagrams.some(d=>d.id===active)?active:state.workspace.diagrams[0].id;state.loaded=true;
  if(recoveredDraft?.workspace?.diagrams?.length)$('#draft-banner').hidden=false;
  renderAll();requestAnimationFrame(fit);saveLabel('已保存 · v'+state.workspace.revision);setInterval(poll,2000);
 }catch(e){saveLabel('尚未连接',true);toast('未能打开回路图：'+e.message+'。请在 Codex 中恢复本地服务后刷新。');}
}
init();
