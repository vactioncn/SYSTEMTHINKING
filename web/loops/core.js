/* Pure graph, geometry and SVG functions. No UI state or external dependencies. */
export const COLORS = {ink:'#29434e',teal:'#27858b',amber:'#ba6b38',sage:'#73856a',plum:'#89708e',slate:'#6e8490'};
export const FONT = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
export const clone = value => JSON.parse(JSON.stringify(value));
export const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const uid = prefix => prefix+'-'+crypto.randomUUID().slice(0,12);
export const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const fmt = n => Math.round(n*100)/100;
export function wrap(text,width,fontSize) {
  return String(text).split('\n').flatMap(paragraph=>{
    const lines=[];let line='',length=0;
    for(const char of paragraph){const w=/[\u0000-\u00ff]/.test(char)?fontSize*.56:fontSize;if(length+w>width&&line){lines.push(line);line='';length=0;}line+=char;length+=w;}
    lines.push(line);return lines;
  });
}
export function nodeBox(node) {
  const font=node.fontSize||28,lines=wrap(node.label,node.width||240,font);
  const widths=lines.map(line=>Array.from(line).reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?font*.56:font),0));
  return {x:node.x,y:node.y,width:Math.max(40,...widths)+24,height:lines.length*font*1.45+16,lines,font};
}
export function analyzeLoop(graph,loop) {
  const byId=new Map(graph.edges.map(e=>[e.id,e])), edges=loop.edgeIds.map(id=>byId.get(id)).filter(Boolean);
  if(!edges.length)return {type:'?',closed:false,message:'选择连线，组成有向闭环',nodeIds:[],edgeIds:[]};
  const next=new Map(),incoming=new Map(),nodes=new Set();let invalid=false;
  for(const e of edges){nodes.add(e.from);nodes.add(e.to);if(next.has(e.from))invalid=true;next.set(e.from,e);incoming.set(e.to,(incoming.get(e.to)||0)+1);}
  if([...nodes].some(id=>!next.has(id)||incoming.get(id)!==1))invalid=true;
  const ordered=[],seen=new Set();let at=edges[0].from;
  while(!seen.has(at)&&next.has(at)){seen.add(at);const e=next.get(at);ordered.push(e);at=e.to;}
  const closed=!invalid&&at===edges[0].from&&ordered.length===edges.length;
  const unknown=edges.some(e=>e.polarity==='?');
  const type=closed&&!unknown?(edges.filter(e=>e.polarity==='-').length%2?'B':'R'):'?';
  return {type,closed,message:!closed?'尚未组成单一有向闭环':unknown?'闭环已形成，影响方向待明确':type==='B'?'调节回路':'强化回路',nodeIds:[...nodes],edgeIds:ordered.map(e=>e.id),pending:edges.some(e=>e.status==='hypothesis')};
}
function clip(box,toward) {
  const dx=toward.x-box.x,dy=toward.y-box.y;
  const ratio=Math.min((box.width/2+10)/(Math.abs(dx)||.0001),(box.height/2+8)/(Math.abs(dy)||.0001));
  return {x:box.x+dx*ratio,y:box.y+dy*ratio};
}
export function edgeGeometry(edge,nodes) {
  const a=nodes.get(edge.from),b=nodes.get(edge.to);if(!a||!b)return null;
  const self=a.id===b.id,dx=self?200:b.x-a.x,dy=self?0:b.y-a.y,length=Math.hypot(dx,dy)||1,u={x:dx/length,y:dy/length},n={x:-u.y,y:u.x};
  const defaults=self?{c1:{along:1,offset:150},c2:{along:1,offset:-150}}:{c1:{along:.33,offset:0},c2:{along:.67,offset:0}};
  const route={...defaults,...edge.route};
  const control=r=>({x:a.x+u.x*length*r.along+n.x*r.offset,y:a.y+u.y*length*r.along+n.y*r.offset});
  const c1=control(route.c1),c2=control(route.c2),p0=clip(nodeBox(a),c1),p3=clip(nodeBox(b),c2);
  const point=t=>{const q=1-t;return{x:q*q*q*p0.x+3*q*q*t*c1.x+3*q*t*t*c2.x+t*t*t*p3.x,y:q*q*q*p0.y+3*q*q*t*c1.y+3*q*t*t*c2.y+t*t*t*p3.y};};
  const tangent=t=>{const q=1-t,x=3*q*q*(c1.x-p0.x)+6*q*t*(c2.x-c1.x)+3*t*t*(p3.x-c2.x),y=3*q*q*(c1.y-p0.y)+6*q*t*(c2.y-c1.y)+3*t*t*(p3.y-c2.y),len=Math.hypot(x,y)||1;return{x:x/len,y:y/len};};
  return {p0,p3,c1,c2,point,tangent,d:`M ${fmt(p0.x)} ${fmt(p0.y)} C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p3.x)} ${fmt(p3.y)}`,toRoute:p=>({along:clamp(((p.x-a.x)*u.x+(p.y-a.y)*u.y)/length,-10,10),offset:clamp((p.x-a.x)*n.x+(p.y-a.y)*n.y,-100000,100000)})};
}
export function focusGraph(graph,loopId) {
  const loop=graph.loops.find(l=>l.id===loopId);if(!loop)return graph;
  const ids=new Set(loop.edgeIds),edges=graph.edges.filter(e=>ids.has(e.id)),nodes=new Set(edges.flatMap(e=>[e.from,e.to]));
  return {...graph,nodes:graph.nodes.filter(n=>nodes.has(n.id)),edges,loops:[loop]};
}
function loopText(graph,loop) {
  const result=analyzeLoop(graph,loop),title=`${result.type==='B'?'调节回路':result.type==='R'?'强化回路':'回路线索'}｜${loop.title}`;
  const titleLines=wrap(title,500,24),descriptionLines=loop.description?wrap(loop.description,450,21):[];
  const titleY=loop.labelY+61,descriptionY=titleY+(titleLines.length-1)*34.8+36;
  const questionY=descriptionY+descriptionLines.length*30.45+12;
  const bottom=result.type==='?'?questionY+20:descriptionLines.length?descriptionY+(descriptionLines.length-1)*30.45+22:titleY+(titleLines.length-1)*34.8+25;
  return {result,titleLines,descriptionLines,titleY,descriptionY,questionY,bottom};
}
export function graphBounds(graph) {
  if(!graph.nodes.length&&!graph.loops.length)return{x:0,y:0,width:1200,height:760};
  const xs=[],ys=[],add=(x,y)=>{xs.push(x);ys.push(y);};
  for(const node of graph.nodes){const b=nodeBox(node);add(b.x-b.width/2,b.y-b.height/2);add(b.x+b.width/2,b.y+b.height/2);}
  for(const loop of graph.loops){add(loop.x-loop.rx,loop.y-loop.ry);add(loop.x+loop.rx,loop.y+loop.ry);const text=loopText(graph,loop);add(loop.labelX-250,loop.labelY-38);add(loop.labelX+250,text.bottom);}
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  for(const e of graph.edges){const g=edgeGeometry(e,nodes);if(g)for(let t=0;t<=1;t+=.1){const p=g.point(t);add(p.x-30,p.y-30);add(p.x+30,p.y+30);}}
  const x=xs.reduce((a,b)=>Math.min(a,b),Infinity),y=ys.reduce((a,b)=>Math.min(a,b),Infinity);return{x,y,width:Math.max(100,xs.reduce((a,b)=>Math.max(a,b),-Infinity)-x),height:Math.max(100,ys.reduce((a,b)=>Math.max(a,b),-Infinity)-y)};
}
export function textSvg(lines,x,y,size,color,extra='') {
  return `<text x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" font-size="${size}" fill="${color}" ${extra}>${lines.map((line,i)=>`<tspan x="${fmt(x)}" dy="${i?size*1.45:0}">${esc(line)}</tspan>`).join('')}</text>`;
}
export function sceneSvg(graph,{selection=new Set(),editing=false,scale=1,linkFrom=null,viewport=null}={}) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  const colors=[...new Set(graph.edges.map(e=>e.color))];
  let out=`<defs>${colors.map(c=>`<marker id="arrow-${c.slice(1)}" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="18" markerHeight="16" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 4 L0 8 Z" fill="${c}"/></marker>`).join('')}</defs>`;
  const loopShapes=[],loopLabels=[];
  for(const loop of graph.loops){
    const selected=selection.has('loop:'+loop.id),text=loopText(graph,loop),result=text.result;
    loopShapes.push(`<ellipse cx="${loop.x}" cy="${loop.y}" rx="${loop.rx}" ry="${loop.ry}" fill="${loop.color}" fill-opacity=".065" pointer-events="none"${selected?' stroke="'+loop.color+'" stroke-opacity=".35" stroke-dasharray="5 7"':''}/>`);
    loopLabels.push(`<g data-kind="loop" data-id="${esc(loop.id)}" class="loop-label" role="button" tabindex="0" aria-label="回路 ${esc(loop.title)}，${esc(result.message)}"><title>${esc(result.message)}${result.pending?' · 含待核实关系':''}</title><circle cx="${loop.labelX}" cy="${loop.labelY}" r="34" fill="#fff" stroke="${loop.color}" stroke-width="2"/><text x="${loop.labelX}" y="${loop.labelY+12}" fill="${loop.color}" text-anchor="middle" font-size="37">${result.type}</text>${textSvg(text.titleLines,loop.labelX,text.titleY,24,loop.color)}${textSvg(text.descriptionLines,loop.labelX,text.descriptionY,21,'#7a8c92')}${result.type==='?'?textSvg([result.message],loop.labelX,text.questionY,15,'#8b9495'):''}</g>`);
    if(editing&&selected){loopLabels.push(`<rect data-handle="loop-size" data-id="${esc(loop.id)}" x="${loop.x+loop.rx-7}" y="${loop.y+loop.ry-7}" width="14" height="14" rx="3" fill="white" stroke="${loop.color}" stroke-width="2"/><circle data-handle="loop-center" data-id="${esc(loop.id)}" cx="${loop.x}" cy="${loop.y-loop.ry}" r="7" fill="white" stroke="${loop.color}" stroke-width="2"/>`);}
  }
  out+=loopShapes.join('');
  const edges=[],handles=[];
  for(const edge of graph.edges){
    const g=edgeGeometry(edge,nodes);if(!g)continue;
    if(viewport&&graph.nodes.length>300){const p=[g.p0,g.p3,g.c1,g.c2];if(p.every(p=>p.x<viewport.x-100)||p.every(p=>p.x>viewport.x+viewport.width+100)||p.every(p=>p.y<viewport.y-100)||p.every(p=>p.y>viewport.y+viewport.height+100))continue;}
    const selected=selection.has('edge:'+edge.id),t=edge.labelPosition||.86,p=g.point(t),v=g.tangent(t),offset=edge.labelOffset??22;
    const edgeName=`${nodes.get(edge.from).label.replaceAll('\n','')} → ${nodes.get(edge.to).label.replaceAll('\n','')} ${edge.polarity}`;
    edges.push(`<g data-kind="edge" data-id="${esc(edge.id)}" role="button" tabindex="0" aria-label="${esc(edgeName)}"><title>${esc(edgeName)} · ${edge.status==='hypothesis'?'待核实':'已确认'}${edge.delay?' · 时间延迟':''}</title>${editing?`<path d="${g.d}" fill="none" stroke="transparent" stroke-width="${Math.max(18,12/scale)}" class="edge-hit"/>`:''}<path d="${g.d}" fill="none" stroke="${edge.color}" stroke-width="${selected?4.2:3.2}" stroke-linecap="round"${edge.status==='hypothesis'?' stroke-dasharray="13 12"':''} marker-end="url(#arrow-${edge.color.slice(1)})"/><text x="${fmt(p.x-v.y*offset)}" y="${fmt(p.y+v.x*offset+10)}" text-anchor="middle" font-size="34" fill="${edge.color}" paint-order="stroke" stroke="#fcfdfc" stroke-width="5" stroke-linejoin="round">${edge.polarity==='-'?'−':esc(edge.polarity)}</text>`);
    if(edge.delay){const d=g.point(.5),v=g.tangent(.5),deg=Math.atan2(v.y,v.x)*180/Math.PI;edges.push(`<g transform="translate(${fmt(d.x)} ${fmt(d.y)}) rotate(${fmt(deg)})"><path d="M-8 -17 L-1 17 M6 -17 L13 17" stroke="#fcfdfc" stroke-width="8"/><path d="M-8 -17 L-1 17 M6 -17 L13 17" stroke="${edge.color}" stroke-width="3"/></g>`);}
    if(edge.label){const p=g.point(.5);edges.push(textSvg(wrap(edge.label,220,16),p.x,p.y-28,16,edge.color,'paint-order="stroke" stroke="#fcfdfc" stroke-width="5"'));}
    edges.push('</g>');
    if(editing&&selected){handles.push(`<g class="curve-handles"><path d="M${g.p0.x} ${g.p0.y}L${g.c1.x} ${g.c1.y}M${g.p3.x} ${g.p3.y}L${g.c2.x} ${g.c2.y}" stroke="${edge.color}" stroke-width="1" stroke-dasharray="5 5"/>${['c1','c2'].map(key=>`<circle data-handle="${key}" data-id="${esc(edge.id)}" cx="${g[key].x}" cy="${g[key].y}" r="${Math.max(7,5/scale)}" fill="white" stroke="${edge.color}" stroke-width="2"/>`).join('')}</g>`);}
  }
  out+=edges.join('')+loopLabels.join('');
  for(const node of graph.nodes){
    const b=nodeBox(node),selected=selection.has('node:'+node.id)||linkFrom===node.id;
    if(viewport&&graph.nodes.length>300&&(b.x+b.width<viewport.x||b.x-b.width>viewport.x+viewport.width||b.y+b.height<viewport.y||b.y-b.height>viewport.y+viewport.height))continue;
    out+=`<g data-kind="node" data-id="${esc(node.id)}" class="variable" role="button" tabindex="0" aria-label="变量 ${esc(node.label.replaceAll('\n',''))}"><title>${esc(node.label)}</title><rect x="${fmt(b.x-b.width/2)}" y="${fmt(b.y-b.height/2)}" width="${fmt(b.width)}" height="${fmt(b.height)}" rx="8" fill="${selected?'#e9f3f1':'transparent'}"${selected?' fill-opacity=".85" stroke="#27858b" stroke-width="1.2" stroke-dasharray="5 4"':''}/>${scale<.2&&graph.nodes.length>150?`<circle cx="${node.x}" cy="${node.y}" r="14" fill="${node.color}"/>`:textSvg(b.lines,b.x,b.y-(b.lines.length-1)*b.font*1.45/2+b.font*.34,b.font,node.color,'font-weight="400"')}</g>`;
  }
  return out+handles.join('');
}
export function exportSvg(graph) {
  const b=graphBounds(graph),margin=90,w=Math.max(1100,b.width+margin*2);
  const titleLines=wrap(graph.title,w-2*margin,43),subtitle=wrap(graph.subtitle||'',w-2*margin,23),head=75+titleLines.length*62+subtitle.length*33;
  const note=(graph.mode==='example'?'绘图示例 · ':'')+(graph.notes||'箭头表示其他条件相同时的影响方向；R 为强化回路，B 为调节回路。');
  const noteLines=wrap(note,w-2*margin,15),footer=head+40+b.height+65,height=footer+92+noteLines.length*22;
  const tx=(w-b.width)/2-b.x,ty=head+40-b.y;
  const leftText=(lines,x,y,size,color)=>textSvg(lines,x,y,size,color).replace('text-anchor="middle"','text-anchor="start"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}" height="${fmt(height)}" viewBox="0 0 ${fmt(w)} ${fmt(height)}"><rect width="100%" height="100%" fill="#fcfdfc"/><g font-family="${FONT}">${leftText(titleLines,margin,65,43,COLORS.ink)}${leftText(subtitle,margin,65+titleLines.length*62,23,'#7a8c92')}<path d="M${margin} ${head}H${w-margin}" stroke="#dce5e7"/><g transform="translate(${fmt(tx)} ${fmt(ty)})">${sceneSvg(graph)}</g><path d="M${margin} ${footer}H${w-margin}" stroke="#dce5e7"/><text x="${margin}" y="${footer+42}" fill="${COLORS.ink}" font-size="19">＋ 同向影响　 − 反向影响　 ? 方向待明确　 ∥ 时间延迟　 ┄ 待核实关系</text>${leftText(noteLines,margin,footer+77,15,'#7a8c92')}</g></svg>`;
}
export function autoLayout(graph) {
  // Stable component layout. Existing links are routed, never inferred or added.
  const neighbours=new Map(graph.nodes.map(n=>[n.id,[]]));
  for(const e of graph.edges){neighbours.get(e.from)?.push(e.to);neighbours.get(e.to)?.push(e.from);}
  const byId=new Map(graph.nodes.map(n=>[n.id,n])),seen=new Set(),groups=[];
  for(const node of graph.nodes){if(seen.has(node.id))continue;const group=[],queue=[node.id];seen.add(node.id);for(let i=0;i<queue.length;i++){const id=queue[i];group.push(byId.get(id));for(const n of neighbours.get(id)||[]){if(!seen.has(n)){seen.add(n);queue.push(n);}}}groups.push(group);}
  let left=0;
  for(const group of groups){const radius=Math.max(260,group.length*65),cx=left+radius,cy=radius;group.forEach((n,i)=>{const a=-Math.PI/2+2*Math.PI*i/group.length;n.x=cx+Math.cos(a)*radius;n.y=cy+Math.sin(a)*radius;});left+=2*radius+350;}
  const pairs=new Map();for(const e of graph.edges){const key=[e.from,e.to].sort().join('|');const i=pairs.get(key)||0;pairs.set(key,i+1);const offset=i?80+i*60:0;e.route={c1:{along:.33,offset},c2:{along:.67,offset}};}
  for(const loop of graph.loops)fitLoop(graph,loop);
  return graph;
}
export function fitLoop(graph,loop) {
  const ids=new Set(analyzeLoop(graph,loop).nodeIds),nodes=graph.nodes.filter(n=>ids.has(n.id));if(!nodes.length)return;
  const b=graphBounds({...graph,nodes,edges:[],loops:[]});loop.x=b.x+b.width/2;loop.y=b.y+b.height/2;loop.rx=Math.max(160,b.width*.65);loop.ry=Math.max(110,b.height*.65);loop.labelX=loop.x;loop.labelY=loop.y;
}
export function removeSelection(graph,selection) {
  const nodes=new Set([...selection].filter(s=>s.startsWith('node:')).map(s=>s.slice(5)));
  const edges=new Set([...selection].filter(s=>s.startsWith('edge:')).map(s=>s.slice(5)));
  graph.nodes=graph.nodes.filter(n=>!nodes.has(n.id));
  for(const e of graph.edges)if(nodes.has(e.from)||nodes.has(e.to))edges.add(e.id);
  graph.edges=graph.edges.filter(e=>!edges.has(e.id));
  graph.loops=graph.loops.filter(l=>!selection.has('loop:'+l.id));
  for(const l of graph.loops)l.edgeIds=l.edgeIds.filter(id=>!edges.has(id));
  return graph;
}
