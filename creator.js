'use strict';
const slotCount=7;
const shelfKey='mountainBowling.creator.v1';
const cloneLevel=value=>JSON.parse(JSON.stringify(value));
function blankLevel(n){return {name:'Untitled '+n,terrain:'flat',points:[{x:0,z:0}],props:[],finish:false,proof:null};}
let creatorShelf={levels:[],packs:[]},storageIssue='';
try{const saved=localStorage.getItem(shelfKey);if(saved){const data=JSON.parse(saved);if(!Array.isArray(data.levels)||!Array.isArray(data.packs))throw Error();creatorShelf=data;}}
catch{storageIssue='Saved courses could not be read. Export a backup before closing.';}
let freeView=null,freeMode=false;
let draft=blankLevel(1),selectedObject=null;
let currentLevel=0,tool='path',history=[],camX=0,camZ=38,scale=4;
const editorKeys=new Set(),board=$('editorMap'),pen=board.getContext('2d');
const hints={select:'Click a tree, rock or ramp to select it. Press Delete or use Delete selected object.',path:'Click ahead of the last point to extend the curved path.',end:'Place a finish at least 32 m from the start. Click the last point to flag it.',tree:'Click on the grass to plant a tree.',rock:'Click on the grass to place a rock.',ramp:'Click along either edge of the path to attach a wooden ramp.',erase:'Click a path point, finish or object to remove it.'};
const current=()=>creatorShelf.levels[currentLevel]||draft;
function emptySlot(levels){
  for(let i=0;i<slotCount;i++)if(!levels[i])return i;
  return -1;
}
function switchSlot(i){
  currentLevel=i;draft=blankLevel(i+1);history=[];selectedObject=null;camX=0;camZ=38;
}
function storeCurrent(){creatorShelf.levels[currentLevel]=current();}

const note=text=>{$('studioMessage').textContent=text;};
function persist(){
  try{localStorage.setItem(shelfKey,JSON.stringify(creatorShelf));return true;}
  catch{storageIssue='Local saving failed. Use Export all to keep your work.';note(storageIssue);return false;}
}
function updateEditor(message){
  const l=current();if(!l)return;
  $('levelList').replaceChildren(...Array.from({length:Math.max(slotCount,creatorShelf.levels.length)},(_,i)=>{const v=creatorShelf.levels[i];return new Option((i<slotCount?'Slot ':'Older save ')+(i+1)+' · '+(v?v.name+(v.proof?' ✓':''):'Empty'),i);}));
  $('levelList').value=currentLevel;$('levelName').value=l.name;$('terrainType').value=l.terrain;
  $('newLevel').disabled=emptySlot(creatorShelf.levels)<0;
  $('deleteLevel').disabled=$('exportLevel').disabled=!creatorShelf.levels[currentLevel];
  $('deleteObject').disabled=!selectedObject||!l.props.includes(selectedObject);
  $('testLevel').disabled=!l.finish;$('undoEdit').disabled=!history.length;
  $('levelStatus').textContent=l.proof?'✓ Verified':l.finish?'Ready for a verification run':'Draft · Finish required';
  $('editorTools').replaceChildren(...Object.keys(hints).map(k=>tile(({select:'Select',path:'Path',end:'Finish',tree:'Tree',rock:'Rock',ramp:'Ramp',erase:'Erase'})[k],tool===k,()=>{tool=k;selectedObject=null;updateEditor();focusEditor();})));
  note(storageIssue||message||hints[tool]);if(freeMode)freeView.rebuild(l,selectedObject);else paintBoard();
}
function change(work,message){
  storeCurrent();selectedObject=null;const l=current(),before=cloneLevel(l);work(l);l.proof=null;
  history.push(before);if(history.length>40)history.shift();persist();updateEditor(message);
}
function realign(l,previous){
  const last=l.points.at(-1).z;
  l.props=l.props.filter(p=>p.type!=='ramp'||p.z<=last-5);
  for(const p of l.props)if(p.type==='ramp')p.x=pathX(l.points,p.z)+(p.x>=pathX(previous,p.z)?1:-1)*customWidth/2;
}
function place(x,z){
  const l=current(),last=l.points.at(-1),side=x>=pathX(l.points,z)?1:-1;
  if(tool==='select'){
    let nearest=null,best=4;
    for(const p of l.props){
      let dx=x-p.x,dz=z-p.z;
      if(p.type==='ramp'){
        const t=clamp(z,p.z-5,p.z+5),side=Math.sign(p.x-pathX(l.points,p.z));
        dx=x-pathX(l.points,t)-side*(customWidth/2+rampRadius/2);dz=z-t;
      }
      const d=Math.hypot(dx,dz);if(d<=best){nearest=p;best=d;}
    }
    selectObject(nearest);return;
  }
  if(tool==='erase'){
    const prop=l.props.findIndex(p=>Math.hypot(p.x-x,p.z-z)<4);
    if(prop>=0){change(l=>l.props.splice(prop,1));return;}
    const i=l.points.findIndex(p=>Math.hypot(p.x-x,p.z-z)<4);
    if(i<=0){note('Select a placed object or path point. The tee stays in place.');return;}
    change(l=>{const prev=l.points.slice();if(i===prev.length-1&&l.finish){l.finish=false;return;}l.points.splice(i,1);realign(l,prev);});return;
  }
  if(tool==='path'||tool==='end'){
    if(l.finish){note('Erase the finish before extending this path.');return;}
    const flagLast=tool==='end'&&Math.hypot(last.x-x,last.z-z)<4;
    if(tool==='end'&&(flagLast?last.z:z)<32){note('The finish needs at least 32 m of course.');return;}
    if(!flagLast&&(z<last.z+4||z>400||Math.abs(x)>160||l.points.length>=60)){note('Place the next point at least 4 m forward, within the course boundary.');return;}
    change(l=>{const prev=l.points.slice();if(!flagLast)l.points.push({x,z});l.finish=tool==='end';realign(l,prev);});return;
  }
  if(l.props.length>=180||z<0||z>400||Math.abs(x)>210){note('Choose a spot inside the course boundary (up to 180 objects).');return;}
  const edge=Math.abs(x-pathX(l.points,z))-customWidth/2;
  if(tool==='ramp'){
    if(Math.abs(edge)>5||z<5||z>last.z-5){note('A ramp needs 10 m of path. Click close to an edge.');return;}
    x=pathX(l.points,z)+side*customWidth/2;
    if(l.props.some(p=>p.type==='ramp'&&Math.sign(p.x-pathX(l.points,p.z))===side&&Math.abs(z-p.z)<10)){note('There is already a ramp here.');return;}
  }else if(z<=last.z&&edge<2){note('Place trees and rocks on the grass beside the path.');return;}
  change(l=>l.props.push({type:tool,x,z}));
}
const sx=x=>board.width/2+(x-camX)*scale,sy=z=>board.height/2-(z-camZ)*scale;
function paintBoard(){
  const l=current();if(!l)return;
  const w=board.width,h=board.height;
  pen.fillStyle='#619f66';pen.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=6){const z=camZ+(h/2-y)/scale;const slope=levelHeight(l.terrain,z+1)-levelHeight(l.terrain,z);
    pen.fillStyle='rgba(21,67,64,'+Math.min(.42,Math.abs(slope)*.78)+')';pen.fillRect(0,y,w,6);}
  pen.beginPath();for(let x=sx(0)%(10*scale);x<w;x+=10*scale){pen.moveTo(x,0);pen.lineTo(x,h);}
  for(let y=sy(0)%(10*scale);y<h;y+=10*scale){pen.moveTo(0,y);pen.lineTo(w,y);}
  pen.strokeStyle='#e0f7d42b';pen.lineWidth=1;pen.stroke();
  const last=l.points.at(-1);
  if(last.z){
    pen.beginPath();for(let z=0;z<=last.z;z++)pen.lineTo(sx(pathX(l.points,z)-customWidth/2),sy(z));
    for(let z=last.z;z>=0;z--)pen.lineTo(sx(pathX(l.points,z)+customWidth/2),sy(z));
    pen.closePath();pen.fillStyle='#d7cfad';pen.fill();pen.strokeStyle='#a49e81';pen.stroke();
  }
  for(const p of l.props){
    if(p.type==='ramp'){
      pen.beginPath();const side=Math.sign(p.x-pathX(l.points,p.z));
      for(let z=p.z-5;z<=p.z+5;z++)pen.lineTo(sx(pathX(l.points,z)+side*(customWidth/2+1)),sy(z));
      pen.lineWidth=scale*2;pen.strokeStyle='#ab622e';pen.stroke();
    }else{
      pen.beginPath();pen.arc(sx(p.x),sy(p.z),scale*(p.type==='tree'?2:1.4),0,Math.PI*2);
      pen.fillStyle=p.type==='tree'?'#245c3b':'#687779';pen.fill();
    }
  }
  if(selectedObject){const p=selectedObject;pen.beginPath();pen.arc(sx(p.x),sy(p.z),Math.max(9,scale*3),0,Math.PI*2);pen.strokeStyle='#ffe14e';pen.lineWidth=3;pen.stroke();}
  for(const p of l.points){pen.beginPath();pen.arc(sx(p.x),sy(p.z),4,0,Math.PI*2);pen.fillStyle='#fff';pen.fill();}
  pen.font='bold 15px system-ui';pen.fillStyle='#113e3c';pen.fillText('TEE',sx(0)+9,sy(0)+5);
  if(l.finish){pen.fillStyle='#c84932';pen.fillRect(sx(last.x),sy(last.z)-20,2,20);pen.beginPath();pen.moveTo(sx(last.x)+2,sy(last.z)-20);pen.lineTo(sx(last.x)+17,sy(last.z)-16);pen.lineTo(sx(last.x)+2,sy(last.z)-11);pen.fill();}
  pen.fillStyle='#143c3bcc';pen.fillRect(10,h-32,135,23);pen.fillStyle='#fff';pen.fillText('Grid 10 m  ·  N ↑',18,h-15);
}
function studioFrame(time){
  if(!$('studio').open)return;
  const dt=Math.min(.05,(time-studioFrame.last)/1000)||0;studioFrame.last=time;
  if(freeMode&&editorKeys.size)freeView.move(editorKeys,dt);
  else if(editorKeys.size){
    camX=clamp(camX+((+editorKeys.has('KeyD'))-(+editorKeys.has('KeyA')))*dt*175/scale,-210,210);
    camZ=clamp(camZ+((+editorKeys.has('KeyW'))-(+editorKeys.has('KeyS')))*dt*175/scale,-25,425);paintBoard();
  }
  requestAnimationFrame(studioFrame);
}
function openStudio(message){

  $('studio').showModal();updateEditor(message);focusEditor();studioFrame.last=performance.now();requestAnimationFrame(studioFrame);
}
$('openStudio').onclick=()=>openStudio();
$('studioBack').onclick=()=>$('studio').close();
$('studio').addEventListener('close',()=>editorKeys.clear());
window.addEventListener('blur',()=>editorKeys.clear());
document.addEventListener('keydown',e=>{
  if(!$('studio').open||$('packs').open||$('confirmLevel').open||e.target.closest?.('input,select')||!['KeyW','KeyA','KeyS','KeyD',...(freeMode?['KeyQ','KeyE']:[])].includes(e.code))return;
  e.preventDefault();editorKeys.add(e.code);
});
document.addEventListener('keyup',e=>editorKeys.delete(e.code));
board.onpointerdown=e=>{const r=board.getBoundingClientRect();focusEditor();place(Math.round(camX+((e.clientX-r.left)*board.width/r.width-board.width/2)/scale),Math.round(camZ-((e.clientY-r.top)*board.height/r.height-board.height/2)/scale));};
board.addEventListener('wheel',e=>{e.preventDefault();scale=clamp(scale*(e.deltaY>0?.85:1.18),1.3,12);paintBoard();},{passive:false});
$('levelList').onchange=e=>{switchSlot(+e.target.value);updateEditor();};
$('newLevel').onclick=()=>{
  const i=emptySlot(creatorShelf.levels);if(i<0)return;
  switchSlot(i);storeCurrent();tool='path';persist();updateEditor();
};
$('levelName').onchange=e=>{storeCurrent();current().name=e.target.value.trim()||'Untitled';persist();updateEditor();};
$('deleteLevel').onclick=()=>{
  if(!creatorShelf.levels[currentLevel])return;
  editorKeys.clear();$('deletePrompt').textContent='Delete “'+current().name+'” from slot '+(currentLevel+1)+'? Packs keep their own copy.';
  $('confirmLevel').showModal();
};
$('keepLevel').onclick=()=>$('confirmLevel').close();
$('confirmDeleteLevel').onclick=()=>{
  if(!$('confirmLevel').open)return;
  creatorShelf.levels[currentLevel]=null;
  while(creatorShelf.levels.length&&!creatorShelf.levels.at(-1))creatorShelf.levels.pop();
  switchSlot(Math.min(slotCount-1,currentLevel));persist();$('confirmLevel').close();updateEditor('Level deleted.');
};
function selectObject(p){selectedObject=p;updateEditor(p?'Selected '+p.type+'. Press Delete or use Delete selected object.':'Click a tree, rock or ramp to select it.');}
function deleteObject(){
  const i=current().props.indexOf(selectedObject);
  if(i>=0)change(l=>l.props.splice(i,1),'Object deleted. Use Undo placement to restore it.');
}
$('deleteObject').onclick=deleteObject;
document.addEventListener('keydown',e=>{
  if(e.key==='Delete'&&$('studio').open&&!$('packs').open&&!$('confirmLevel').open&&!e.target.closest?.('input,select,textarea')){
    e.preventDefault();deleteObject();
  }
});
$('terrainType').onchange=e=>change(l=>l.terrain=e.target.value);
$('undoEdit').onclick=()=>{if(history.length){selectedObject=null;creatorShelf.levels[currentLevel]=history.pop();persist();updateEditor();}};
$('testLevel').onclick=()=>{
  if(!current().finish)return;
  verificationRun={roster,openingCourse,firstSettings,levels:customSlots.slice(),pack:selectedPackName,completed:false};
  installLevels('Verification',[cloneLevel(current())]);openingCourse=12;firstSettings={layout:'custom',width:customWidth,shape:'curve',start:0};
  roster=[{name:'Creator',color:palette[0],look:myLook}];$('studio').close();startTournament();
};
function finishVerification(){
  presentation.pause();presentation.currentTime=0;
  const run=verificationRun;verificationRun=null;
  installLevels(run.pack,run.levels);roster=run.roster;openingCourse=run.openingCourse;firstSettings=run.firstSettings;
  $('skipReplay').hidden=$('skipIntro').hidden=true;queue=roster.slice();resetMatch();home();openStudio(run.completed?'Flag reached! This level is verified.':'Back in the editor.');
}
function readPack(raw){
  if(!raw||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>40||!Array.isArray(raw.levels)||raw.levels.length!==3)throw Error('A pack needs a name and three levels.');
  const levels=raw.levels.map(cleanLevel);
  if(levels.some(l=>!l.proof)||new Set(levels.map(l=>l.name+'|'+levelSignature(l))).size<3)throw Error('A pack requires three different verified levels.');
  return {name:raw.name.trim(),levels};
}
function download(name,payload){
  const url=URL.createObjectURL(new Blob([JSON.stringify({format:'mountain-bowling',version:1,...payload},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=(name.replace(/[^a-z0-9_-]/gi,'-')||'course')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
$('exportLevel').onclick=()=>download(current().name,{levels:[current()],packs:[]});
$('backupStudio').onclick=()=>download('Mountain-Bowling-backup',{levels:creatorShelf.levels.filter(Boolean),packs:creatorShelf.packs});
$('importStudio').onclick=()=>$('studioFile').click();
$('studioFile').onchange=async e=>{
  try{
    const file=e.target.files[0];if(!file)return;if(file.size>12000000)throw Error('This file is too large.');
    const data=JSON.parse(await file.text());
    if(data.format!=='mountain-bowling'||data.version!==1||!Array.isArray(data.levels)||!Array.isArray(data.packs))throw Error('Choose a Mountain Bowling export.');
    const packs=data.packs.map(readPack),levels=data.levels.map(cleanLevel);
    const merged=creatorShelf.levels.slice();let picked=currentLevel;
    for(const l of levels){
      let i=merged.findIndex(old=>old&&old.name===l.name&&JSON.stringify([old.points,old.terrain,old.finish,old.props])===JSON.stringify([l.points,l.terrain,l.finish,l.props]));
      if(i<0){
        i=emptySlot(merged);
        if(i<0)throw Error('All seven slots are needed. Free enough slots for this import and try again.');
        merged[i]=l;
      }else if(l.proof)merged[i]={...merged[i],proof:l.proof};
      picked=i;
    }
    creatorShelf.levels=merged;switchSlot(picked);
    for(const p of packs)if(!creatorShelf.packs.some(old=>JSON.stringify(old)===JSON.stringify(p)))creatorShelf.packs.push(p);
    history=[];persist();updateEditor('Import complete. Your existing levels are still available.');
  }catch(error){note(error.message);}finally{e.target.value='';}
};
function packPanel(){
  const available=Array.from(creatorShelf.levels,(l,i)=>[l,i]).filter(([l])=>l?.proof);
  $('packChoices').replaceChildren(...[0,1,2].map(n=>{
    const label=document.createElement('label'),select=document.createElement('select');
    label.textContent='Course '+(n+1);select.add(new Option('Choose level',''));
    for(const [l,i] of available)select.add(new Option(l.name,i));
    if(available[n])select.value=available[n][1];label.append(select);return label;
  }));
  $('savePack').disabled=available.length<3;$('packMessage').textContent=available.length<3?available.length+' of 3 verified levels ready.':'';
  $('packList').replaceChildren(...creatorShelf.packs.map(pack=>{
    const row=document.createElement('p'),btn=document.createElement('button');row.textContent=pack.name;btn.textContent='Export pack';btn.onclick=()=>download(pack.name,{levels:[],packs:[pack]});row.append(btn);return row;
  }));
}
$('packManager').onclick=()=>{editorKeys.clear();packPanel();$('packs').showModal();};
$('savePack').onclick=()=>{
  try{
    const picks=[...$('packChoices').querySelectorAll('select')].map(s=>s.value);
    if(picks.includes('')||new Set(picks).size!==3)throw Error('Choose three different verified levels.');
    const pack=readPack({name:$('packName').value,levels:picks.map(i=>creatorShelf.levels[i])});
    if(creatorShelf.packs.some(p=>p.name===pack.name))throw Error('Choose a different pack name.');
    creatorShelf.packs.push(pack);persist();packPanel();$('packMessage').textContent='Pack ready for Local and Multiplayer.';
  }catch(error){$('packMessage').textContent=error.message;}
};
function refreshNetPacks(){
  const sel=$('netTier');sel.replaceChildren(...[...difficulties,...creatorShelf.packs.map(p=>p.name)].map((n,i)=>new Option(n,i)));
}

function focusEditor(){(freeMode?$('editorWorld'):board).focus();}
$('viewMode').onclick=()=>{
  try{if(!freeView)freeView=buildEditorView($('editorWorld'));}
  catch{note('3D camera unavailable on this device. The overhead camera supports the same build tools.');return;}
  freeMode=!freeMode;board.hidden=freeMode;$('editorWorld').hidden=!freeMode;
  $('viewMode').textContent=freeMode?'Overhead camera':'3D free camera';
  $('cameraGuide').textContent=freeMode?'WASD to fly · Q / E for height · Drag to look · Click to place':'WASD to move the camera · Scroll to zoom · Click to place';
  updateEditor();focusEditor();
};
let cameraDrag=null;
const worldBoard=$('editorWorld');
worldBoard.onpointerdown=e=>{focusEditor();worldBoard.setPointerCapture(e.pointerId);cameraDrag={x:e.clientX,y:e.clientY,total:0};};
worldBoard.onpointermove=e=>{
  if(!cameraDrag)return;
  const dx=e.clientX-cameraDrag.x,dy=e.clientY-cameraDrag.y;cameraDrag.total+=Math.abs(dx)+Math.abs(dy);
  if(cameraDrag.total>3)freeView.look(dx,dy);
  cameraDrag.x=e.clientX;cameraDrag.y=e.clientY;
};
worldBoard.onpointerup=e=>{
  if(cameraDrag&&cameraDrag.total<=3){
    const r=worldBoard.getBoundingClientRect(),spot=freeView.pick((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
    if(tool==='select')selectObject(spot?.object||null);else if(spot)place(spot.x,spot.z);
  }
  cameraDrag=null;
};
worldBoard.onpointercancel=()=>{cameraDrag=null;};

refreshNetPacks();
