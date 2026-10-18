import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeLoop,edgeGeometry,removeSelection,exportSvg,graphBounds,sceneSvg,autoLayout} from '../web/loops/core.js';
const sample=()=>JSON.parse(fs.readFileSync(new URL('../examples/presales-loop.json',import.meta.url)));

test('Reference cycles classify by directed closure and sign product',()=>{
 const g=sample();assert.equal(analyzeLoop(g,g.loops[0]).type,'B');assert.equal(analyzeLoop(g,g.loops[1]).type,'R');
 g.edges[0].polarity='?';assert.equal(analyzeLoop(g,g.loops[0]).type,'?');
 g.edges[0].polarity='+';g.loops[0].edgeIds.pop();assert.equal(analyzeLoop(g,g.loops[0]).closed,false);
});
test('Two disjoint cycles or a branching walk never pretend to be one feedback loop',()=>{
 const edges=[{id:'a',from:'1',to:'2',polarity:'+'},{id:'b',from:'2',to:'1',polarity:'+'},{id:'c',from:'3',to:'4',polarity:'+'},{id:'d',from:'4',to:'3',polarity:'+'}];
 assert.equal(analyzeLoop({edges},{edgeIds:edges.map(e=>e.id)}).closed,false);
 edges[2].from='1';assert.equal(analyzeLoop({edges},{edgeIds:edges.map(e=>e.id)}).closed,false);
});
test('Deleting a shared variable removes incident edges and updates both loops',()=>{
 const g=sample();removeSelection(g,new Set(['node:presale']));assert.equal(g.edges.some(e=>e.from==='presale'||e.to==='presale'),false);
 for(const l of g.loops){assert.equal(l.edgeIds.every(id=>g.edges.some(e=>e.id===id)),true);assert.equal(analyzeLoop(g,l).closed,false);}
});
test('Bezier controls stay relative to nodes; self-links render finite geometry',()=>{
 const g=sample(),nodes=new Map(g.nodes.map(n=>[n.id,n])),e=g.edges[0];const before=edgeGeometry(e,nodes);
 g.nodes.forEach(n=>{n.x+=500;n.y-=230;});const after=edgeGeometry(e,nodes);
 for(const key of ['p0','p3','c1','c2']){assert.ok(Math.abs(after[key].x-before[key].x-500)<1e-7);assert.ok(Math.abs(after[key].y-before[key].y+230)<1e-7);}
 const self=edgeGeometry({...e,to:e.from,route:{}},nodes);assert.equal(/NaN|Infinity/.test(self.d),false);assert.notDeepEqual(self.p0,self.p3);
 const control=after.toRoute({x:100,y:500});assert.ok(Number.isFinite(control.offset));
});
test('Export escapes user text and omits editing controls',()=>{
 const g=sample();g.title='<script>alert("x")</script>';g.notes='& '.repeat(1000);const svg=exportSvg(g);
 assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('data-handle'));assert.ok(!svg.includes('NaN'));

});
test('Layout preserves all semantic edges and large graph renders without fixed template limits',()=>{
 const g={nodes:[],edges:[],loops:[]};for(let i=0;i<1000;i++)g.nodes.push({id:'n'+i,label:'变量 '+i,x:i%40*300,y:Math.floor(i/40)*200,fontSize:28,width:240,color:'#29434e'});
 for(let i=0;i<2000;i++)g.edges.push({id:'e'+i,from:'n'+(i%1000),to:'n'+((i+1+Math.floor(i/1000))%1000),polarity:'?',status:'hypothesis',color:'#27858b'});
 const before=g.edges.map(e=>[e.id,e.from,e.to,e.polarity]);const started=performance.now();const output=sceneSvg(g);assert.ok(output.includes('变量 999'));assert.equal(/NaN|Infinity/.test(output),false);
 console.log('1000 nodes / 2000 edges SVG generation: '+Math.round(performance.now()-started)+' ms');
 autoLayout(g);assert.deepEqual(g.edges.map(e=>[e.id,e.from,e.to,e.polarity]),before);assert.ok(Number.isFinite(graphBounds(g).width));
});
