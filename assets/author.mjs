// One-time asset authoring. The production build only bundles the resulting files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('.', import.meta.url).pathname;
let seed = 187;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const run = (tool, config, args) => execFileSync(tool, ['--config', config, ...args], {stdio:'pipe'});
const save = (p, v) => writeFileSync(p, JSON.stringify(v));
let ops = [];
const rect = (x,y,width,height,color) => ops.push({op:'fill_rect',x:Math.round(x),y:Math.round(y),width:Math.max(1,Math.round(width)),height:Math.max(1,Math.round(height)),color});
const circle = (cx,cy,r,color) => ops.push({op:'fill_circle',cx:Math.round(cx),cy:Math.round(cy),r:Math.round(r),color});
const line = (x1,y1,x2,y2,color) => ops.push({op:'line',x0:Math.round(x1),y0:Math.round(y1),x1:Math.round(x2),y1:Math.round(y2),color});
function sprite(path,w,h,paint,sheet=false) {
  const full=root+path; mkdirSync(full.substring(0,full.lastIndexOf('/')),{recursive:true}); ops=[]; paint();
  const config='/tmp/opencode/art-config.json', actions='/tmp/opencode/art-actions.json';
  if(path.includes('/hurt/'))ops=ops.map(o=>{const shift=y=>Math.round(-9*(1-y/90));if('x' in o)return {...o,x:o.x+shift(o.y)};if('cx' in o)return {...o,cx:o.cx+shift(o.cy)};if('x0' in o)return {...o,x0:o.x0+shift(o.y0),x1:o.x1+shift(o.y1)};return o;});
  save(actions,ops); save(config,{width:w,height:h,background:'#00000000',actions,preview:full,...(sheet?{frames:1}:{})});
  run(sheet?'draw-sheet':'draw',config,['render','--actions',actions,'--out',full,'--width',String(w),'--height',String(h),'--no-layers']);
}
const bands = {topsoil:['#514b3e','#69604b','#393c35'],rockbed:['#3c4b50','#536469','#2b383d'],deepstone:['#282e43','#3c4357','#1d2334'],coreshell:['#442d38','#66404a','#2d2430']};
for(const [band,colors] of Object.entries(bands)) for(let n=0;n<3;n++) sprite(`tiles/${band}-${n}.png`,80,80,()=>{
 rect(0,0,80,80,colors[0]); for(let i=0;i<1050;i++) {let x=random()*80,y=random()*80;rect(x,y,1+random()*3,1,colors[1+(i%2)]);}
 for(let i=0;i<5;i++){let x=random()*80,y=random()*80;line(x,y,x+9,y+3,colors[2]);} });
sprite('tiles/tunnel.png',80,80,()=>{rect(0,0,80,80,'#141e26');for(let i=0;i<220;i++)rect(random()*80,random()*80,2,1,'#1a2630');});
sprite('tiles/bedrock.png',80,80,()=>{rect(0,0,80,80,'#17242c');for(let i=0;i<8;i++){line(0,i*12,80,i*12-20,'#344750');line(i*16,0,i*16-30,80,'#0a141c');}});
for(let n=0;n<2;n++)sprite(`tiles/stone-${n}.png`,80,80,()=>{circle(41,41,36,'#182932');circle(40+n*3,37,33,'#536671');circle(38+n*3,33,27-n*3,'#647780');for(let i=0;i<9;i++)line(15+i*5,19+i%3*4+n*5,25+i*5,57-n*4,'#40525e');line(22,14+n*3,53,12+n*2,'#a6b7b6');});
const oreColors=['#b9b8a6','#d5b85c','#e9925a','#d1dce5','#5f9ddb','#c5d951','#b4a4df','#f08c4b','#ed6a75','#78eedb','#67e3a4','#ec89c8','#ffdb75'];
const names=['ferron','marlite','cuprite','argenite','cobaltine','voltite','halcite','pyronium','cindrite','adamite','verdite','roselite','aurite'];
names.forEach((name,k)=>sprite(`ore/${name}.png`,80,80,()=>{const c=oreColors[k];if(k<10){for(let i=0;i<260;i++){let x=random()*80,y=32+Math.sin(x/16)*9+(random()-.5)*26;rect(x,y,2+random()*8,1+random()*3,c+(i%3===0?'bb':'66'));}for(let i=0;i<24;i++){let x=random()*80;rect(x,30+Math.sin(x/16)*9,3,2,'#fff6d6bb');}}else{for(let y=12;y<65;y++){let half=y<30?(y-9)*1.1:(65-y)*.7;line(40-half,y,40+half,y,c);}for(let i=0;i<4;i++)line(40,63,20+i*13,28,'#ffffff88');line(18,29,61,29,'#f4ffef');circle(34,20,3,'#ffffff');line(34,12,34,26,'#ffffff');}}));
for(const [k,c] of [['resonite','#61edc1'],['cryenite','#a29aff'],['core','#ffb653'],['core-sample','#ffb653']])sprite(`materials/${k}.png`,80,80,()=>{circle(40,40,29,c+'22');for(let n=0;n<5;n++){let x=15+n*10,y=22+(n%3)*8;for(let j=0;j<32;j++)line(x-j/5,y+j,x+j/5,y+j,c);line(x,y,x-5,y+30,'#e6ffff');}circle(40,39,5,'#ffffff');});
const counts={idle:12,walk:6,'drill-down':4,'drill-side':4,jetpack:4,fall:4,hurt:3,'fuel-out':3};
for(const [state,count] of Object.entries(counts))for(let f=0;f<count;f++)sprite(`miner/${state}/frame${String(f).padStart(2,'0')}.png`,80,80,()=>{
 let bob=state==='idle'?Math.round(Math.sin(f*Math.PI/6)*1.2):state==='hurt'?-f*2:state==='fuel-out'?4+f%2:f%2*2, cy=26+bob+(state==='fuel-out'?4:state==='drill-down'?3:0);let leg=state==='walk'?Math.round(Math.sin(f*Math.PI/3)*7):state==='fall'?5+f%2*3:0;
 // Dark outlines, ochre pressure suit, cold visor, striped drill, twin pack.
 rect(13,31+bob,18,28,'#0a1720');rect(14,32+bob,13,25,'#506775');rect(14,34+bob,5,18,'#90a5a3');rect(17,56+bob,7,7,'#182c36');
 if(state==='jetpack'){rect(16,61,8,11+f%3*3,'#ff7a3b');rect(18,61,4,8+f%2*5,'#fff5ab');}
 rect(27-leg/2,53+bob,12,17-leg/2,'#b27937');rect(43+leg/2,52+bob,11,17+leg/2,'#d39a48');rect(24-leg/2,66+bob-leg/2,17,7,'#142a36');rect(42+leg/2,65+bob+leg/2,18,7,'#142a36');
 rect(26,31+bob,29,27,'#172a32');rect(28,33+bob,25,23,'#e4ac55');rect(31,36+bob,6,17,'#f6ce78');rect(28,49+bob,26,6,'#6a6549');rect(42,39+bob,8,9,'#243c44');rect(44,41+bob,4,3,'#76f2d7');
 circle(40,cy,18,'#101e29');circle(40,cy-1,15,'#e4b464');rect(31,cy-6,24,15,'#152f40');rect(33,cy-5,20,9,'#52abb6');rect(35,cy-5,13,3,'#c8f5e5');rect(27,cy-10,7,7,'#ebefd1');rect(28,cy-9,4,4,f%2?'#ffffff':'#c4edbb');
 let down=state==='drill-down';let dx=down?47:58,dy=down?55:43+bob;rect(45,37+bob,10,15,'#b47d39');circle(52,47+bob,6,'#e2af61');rect(dx-4,dy-5,14,13,'#334e5a');rect(dx-2,dy-3,12,4,'#a6b4a5');
 if(down){rect(49,60,7,12,'#aec0c0');for(let i=0;i<4;i++)line(48,62+i*3,57,65+i*3,'#31434f');}else{for(let i=0;i<16;i++)line(67+i,dy-4+i/4,67+i,dy+5-i/4,'#a7b7b8');for(let i=0;i<4;i++)line(68+i*3,dy-3,71+i*3,dy+4,'#334c58');}
 if(state==='hurt')line(24,13,18-f*3,6,'#f4e6c6');if(state==='fuel-out')rect(42,40+bob,7,3,'#e1644c');
},true);
for(let f=0;f<4;f++)sprite(`tiles/crack/frame0${f}.png`,80,80,()=>{for(let i=0;i<=f;i++){line(40,40,8+i*13,4,'#101820bb');line(40,40,76-i*9,70,'#101820dd');line(40,40,3,63-i*12,'#101820bb');}},true);
for(let f=0;f<4;f++)sprite(`hazards/lava/frame0${f}.png`,80,80,()=>{rect(0,0,80,80,'#b53d35');for(let y=0;y<80;y+=3)for(let x=0;x<80;x+=3){let z=Math.sin(x/12+f)+Math.cos(y/8-f);rect(x,y,3,3,z>1?'#ffe591':z>0?'#fb9b46':z>-.6?'#e95c35':'#843037');}},true);
function building(id,w,h,k){sprite(`surface/${id}.png`,w,h,()=>{
 rect(4,108,172,10,'#1b303a');rect(11,104,158,5,'#889080');
 if(k===0){ // Twin storage tanks, exposed feed pipes, and a metered pump.
  for(let x of [13,59]){circle(x+19,23,18,'#728f91');rect(x+1,23,36,75,'#506c74');rect(x+5,25,8,72,'#89a5a1');rect(x,39,39,7,'#b09b66');rect(x,79,39,7,'#b09b66');rect(x+7,11,23,6,'#b9c6ac');}
  rect(103,43,12,61,'#677c77');rect(92,89,40,10,'#7d938c');rect(122,37,45,67,'#b58b4d');rect(126,42,36,27,'#213d49');rect(130,46,27,12,'#74ccbe');rect(130,78,27,18,'#435760');line(161,57,175,66,'#7a8d87');line(175,66,175,90,'#7a8d87');
 }else if(k===1){ // Ore weighbridge and saw-tooth market awning.
  rect(18,31,143,73,'#344b54');rect(23,37,132,61,'#4b6268');rect(28,46,48,43,'#152b35');rect(89,41,56,28,'#152b35');rect(94,47,46,12,'#6baf9e');rect(13,20,154,13,'#c29b58');for(let x=14;x<165;x+=23)rect(x,23,12,18,'#debd78');
  rect(41,75,22,22,'#8b8c6d');rect(23,89,56,10,'#9e9674');rect(95,80,65,23,'#283f48');for(let x=98;x<160;x+=10)rect(x,84,5,14,'#8d9e91');
 }else if(k===2){ // Open save beacon, with solar wings and a luminous terminal.
  rect(79,5,20,91,'#526f79');rect(85,10,8,63,'#99bcb4');circle(89,10,7,'#7ee6c5');rect(21,35,45,23,'#264454');rect(112,35,45,23,'#264454');for(let x=25;x<158;x+=10)if(x<65||x>111)rect(x,38,2,17,'#689caa');
  rect(56,69,65,35,'#34545e');rect(64,76,49,17,'#18343f');rect(69,80,38,9,'#78dfba');rect(50,99,78,5,'#a7bbb0');
 }else if(k===3){ // A workshop, gantry crane, and a luminous tool wall.
  rect(19,30,144,74,'#405962');rect(24,38,134,62,'#283f4a');rect(30,45,50,48,'#17303a');for(let i=0;i<4;i++){rect(36+i*10,51,4,22,'#9eb3a6');rect(33+i*10,52,10,5,'#b1b9a0');}rect(91,53,52,39,'#6a827e');rect(98,59,38,10,'#e4b466');rect(10,19,160,11,'#909d8c');rect(18,3,10,18,'#6e8889');rect(25,4,93,7,'#b9a16b');line(115,9,115,38,'#9da38c');circle(115,39,5,'#d4b36a');rect(27,89,123,11,'#b39358');
 }else if(k===4){ // Stacked shipping crates and a supply container.
  rect(20,31,143,73,'#53716b');rect(24,36,135,63,'#6b8173');for(let x=27;x<155;x+=12)rect(x,38,3,57,'#3c5958');rect(110,40,43,57,'#203a45');rect(116,46,31,11,'#b8d1b3');rect(118,67,27,23,'#425b5e');
  for(let x of [26,61,96]){rect(x,5,30,25,'#a4a17b');rect(x+3,8,24,19,'#7b8770');line(x+4,9,x+25,25,'#c1b98b');line(x+25,9,x+4,25,'#c1b98b');}rect(24,73,34,30,'#9e916b');rect(63,79,35,24,'#ad9b70');
 }else{rect(14,92,152,12,'#526a72');rect(10,72,12,32,'#9b9268');rect(158,72,12,32,'#9b9268');rect(15,66,17,7,'#d4b36b');rect(148,66,17,7,'#d4b36b');for(let x=24;x<155;x+=17)rect(x,95,10,5,'#d4b36b');}
 for(let x=16;x<170;x+=29){rect(x,107,3,3,'#d1c197');}
 });}
['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad'].forEach((id,k)=>building(id,180,118,k));
sprite('surface/ground.png',160,32,()=>{rect(0,0,160,32,'#273c40');rect(0,0,160,5,'#9b9b78');for(let i=0;i<100;i++)rect(random()*160,6+random()*26,3,1,'#5a6660');});
sprite('surface/cave-mouth.png',80,100,()=>{rect(3,0,9,100,'#9b9875');rect(69,0,9,100,'#9b9875');rect(3,0,75,8,'#d7b36a');for(let y=10;y<100;y+=15){rect(5,y,6,7,'#283b40');rect(70,y,6,7,'#283b40');}rect(32,17,5,80,'#78938e');rect(55,17,5,80,'#78938e');for(let y=20;y<100;y+=13)rect(32,y,28,3,'#78938e');});
sprite('surface/sky.png',1280,664,()=>{for(let y=0;y<664;y++)rect(0,y,1280,1,`#${(12+Math.floor(y/100)).toString(16).padStart(2,'0')}202b`);circle(1030,140,57,'#536266');circle(1052,128,53,'#12222c');for(let i=0;i<210;i++)rect(random()*1280,random()*420,random()>.9?2:1,1,'#a0b2ad');for(let x=0;x<1280;x+=4){let h=80+Math.sin(x/120)*36+Math.sin(x/31)*12;rect(x,560-h,4,h+104,'#253840');}for(let x=0;x<1280;x+=4){let h=40+Math.sin(x/93)*25+Math.sin(x/21)*12;rect(x,590-h,4,h+74,'#304247');}});
for(let n=0;n<=5;n++)sprite(`rocket/stage${n}.png`,180,260,()=>{rect(6,243,168,17,'#4a6267');rect(20,239,140,7,'#c49c55');rect(18,41,12,199,'#5d777d');for(let y=45;y<235;y+=24){line(20,y,65,y+22,'#78928d');line(65,y,20,y+22,'#78928d');}if(n>0){rect(70,61,53,160,'#263e48');rect(74,65,45,149,'#a9b9ae');rect(79,65,10,149,'#d9dcc5');for(let y=80;y<210;y+=23)rect(74,y,45,3,'#5b777c');}if(n>1){rect(61,116,13,100,'#bd9557');rect(120,116,13,100,'#bd9557');}if(n>2){circle(98,91,12,'#1b3d4a');circle(98,91,8,'#82daca');}if(n>3){rect(80,214,33,24,'#324d58');rect(76,232,41,7,'#91a99f');}if(n>4){for(let y=14;y<63;y++)line(96-(y-14)/2,y,96+(y-14)/2,y,'#d2c7a2');rect(73,61,47,7,'#dca15c');}});
for(const [i,name] of ['fuel','hull','cargo','credits','depth','resonite','cryenite','core-sample'].entries())sprite(`icons/${name}.png`,24,24,()=>{const c=['#e9bd6c','#77d9be','#a8bbb0','#e9bd6c','#a2bac6','#61edc1','#a29aff','#ffb653'][i];if(i===0){rect(5,6,13,15,c);rect(9,3,7,4,c);rect(8,10,7,7,'#182d36');line(17,9,21,13,c);line(21,13,21,20,c);}else if(i===1){for(let y=3;y<21;y++){let half=y<13?8:(21-y);line(12-half,y,12+half,y,c);}rect(10,7,4,9,'#182d36');}else if(i===2){rect(3,7,18,14,c);rect(7,3,10,4,c);rect(8,5,8,2,'#182d36');rect(5,10,14,8,'#182d36');rect(10,10,3,8,c);}else if(i===3){circle(12,12,10,c);circle(12,12,7,'#182d36');rect(10,7,7,2,c);rect(8,9,3,7,c);rect(10,15,7,2,c);}else if(i===4){rect(10,2,4,13,c);for(let n=0;n<7;n++)line(5+n,12+n,19-n,12+n,c);rect(4,22,16,2,c);}else{for(let y=3;y<22;y++)line(12-(10-Math.abs(y-12))/2,y,12+(10-Math.abs(y-12))/2,y,c);}});
// Runtime's paths use the bundler URL map, so none depend on a server root.
sprite('materials/core.png',80,80,()=>{circle(40,40,38,'#ffad4922');circle(40,40,29,'#d95b3e');circle(37,37,24,'#f0a04a');circle(35,34,17,'#ffdd82');circle(33,32,10,'#fff5c2');for(let i=0;i<8;i++){const a=i*Math.PI/4;line(40+Math.cos(a)*27,40+Math.sin(a)*27,40+Math.cos(a)*39,40+Math.sin(a)*39,'#f7bd66');}line(23,58,58,24,'#854339');line(28,62,63,28,'#854339');});
save(root+'manifest.json',{frames:counts,colors:Object.fromEntries(names.map((n,i)=>[n,oreColors[i]]))});
