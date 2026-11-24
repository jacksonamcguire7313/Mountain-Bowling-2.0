
'use strict';
const $ = id => document.getElementById(id);
const ctx = $('scene').getContext('2d');
const palette = ['#2468cb','#a247b6','#df5230','#2c875e','#cd8a19','#137d96','#b44470','#6244b0'];
let end=108;
const courseLengths=[315,300,275,235,230,285,220,260,215];
let previousAim=0, arrowUntil=0;
const courses=[
  ['Maple Grove Bowl','bowl','straight',18.5,1],['Clover Downs','hill','sweep',18.5,.55],['Willow Shore','lake','wind',18.5,.45],
  ['Wooden Bowl','bowl','wind',14.3,1],['Pine Descent','hill','wind',14.3,.85],['Lakeside Bend','lake','sweep',14.3,1.25],
  ['Corkscrew Bowl','bowl','wind',10.2,1.6],['Summit Pass','hill','sweep',10.2,2.1],['Heron Narrows','lake','wind',10.2,1.5]
];
const difficulties=['Easy','Normal','Hard','Random','9-Map Course'];
const generated=[];
function generateCourses(first=0,last=3){
  for(let i=first;i<last;i++){
    const draw=()=>gameRandom(),id=9+i;
    const layout=['hill','bowl','lake'][Math.floor(draw()*3)];
    const route=[(draw()<.5?-1:1)*(8+draw()*12),23+draw()*19,(draw()-.5)*14,12+draw()*14];
    generated[i]={route,grade:.06+draw()*.22,drop:5+draw()*19,seed:Math.floor(draw()*100000)};
    const pick=words=>words[Math.floor(draw()*words.length)];
    const prefix=pick(['Amber','Kingfisher','Moonlit','Cascade','Windward','Blue Heron','Foxglove','Echo','Saltwind','Cloudberry','Redtail','Sunrise','Quartz','Switchback','Whistling','Driftwood','Seven Sisters','Tumbledown']);
    const suffix=pick({hill:['Heights','Steps','Escarpment','Traverse','Divide','Lookout','Trail'],bowl:['Amphitheatre','Hollow','Crater','Quarry','Caldera','Run','Cirque'],lake:['Sound','Bluffs','Shore','Causeway','Cove','Crossing','Reach']}[layout]);
    const name=prefix+' '+suffix;
    courses[id]=[name,layout,'wind',13+draw()*7,.75+draw()*.6];
    courseLengths[id]=Math.floor(235+draw()*110);
  }
}
for(let i=0;i<3;i++)courses.push(['Random course','hill','wind',16,1]);
let selectedCourse=3,draftCourse=3,openingCourse=3,mapIndex=0;
let wizard=false,wind=0;
let settings = {layout:'bowl', shape:'wind', width:14.3, start:0};
const defaultLook={skin:'#efbe91',hair:'#594032',shirt:'#2468cb',style:0,face:0};
function parseLook(json){
  try{const a=JSON.parse(json);
    if(a&&['skin','hair','shirt'].every(k=>/^#[0-9a-f]{6}$/i.test(a[k]))&&Number.isInteger(a.style)&&a.style>=0&&a.style<5&&Number.isInteger(a.face)&&a.face>=0&&a.face<4)return a;
  }catch{}return null;
}
let myLook={...defaultLook};
try{myLook=parseLook(localStorage.getItem('mountainBowling.character'))||myLook;}catch{}
let roster = ['Player 1','Player 2','Player 3'].map((name,i) => ({name,color:palette[i]}));
let queue = roster.slice(), record = null, phase = 'ready', message = '', ball, transfer, distance = 0;
let camera = {x:0,y:0,z:0};
const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
const lerp = (a,b,t) => a+(b-a)*t;
const smooth = t => t*t*(3-2*t);
const meters = n => n.toFixed(1)+' m';
const bowlRadius=9,bowlZ=-9;
function bankHeading(){return Math.PI;}
function bowlHeight(radius,angle,z){
  const fade=smooth(clamp(Math.abs(angle)/.48,0,1));
  return ground(z)+fade*(.12+3.5*Math.pow(clamp(radius/(bowlRadius+3),0,1),3));
}
function center(z){
  if(authored())return pathX(authored().points,z);
  return courses[selectedCourse][4]*courseBend(z);
}
const routes=[
    [3,44,1,15],[9,32,-2,13],[-6,24,3,11],
    [7,23,-3,12],[-9,31,4,14],[12,37,-5,16],
    [7,18,3,9],[-7,26,4,11],[8,22,-4,10]
  ];
function courseBend(z) {
  const t=Math.max(0,z);
  // Different turn radii, rhythms and directions for each of the nine descents.
  const [a,r,b,q]=(generated[selectedCourse-9]?.route||routes[selectedCourse]);
  const v=settings.land||0,sign=a<0?-1:1;
  const sweep=.58*(1-Math.cos(t/(r*1.4+v*5)))+.23*Math.sin(t/(q*1.6))+.15*Math.sin(t/(22+v*7));
  return sign*(halfWidth(z)*sweep/Math.max(.55,courses[selectedCourse][4])+
    t*(.025+.014*(selectedCourse%3))*(1-Math.exp(-t/35)));

}
function halfWidth(z) {
  return settings.width/2;
}
const grades=[.055,.09,.065,.08,.14,.075,.105,.17,.095];
function ground(z){
  if(authored())return levelHeight(authored().terrain,z);
  if(z>end-5)z=end-5;
  const gen=generated[selectedCourse-9],i=selectedCourse;
  const plunge=gen?.drop??[1,4,2,6,25,1,10,36,4][i];
  const t=clamp((z/end-.24-(i%3)*.08)/(.32+(i%2)*.15),0,1);
  const ledge=settings.cliff?9*smooth(clamp((z/end-.48)/.055,0,1)):0;
  return -ledge-(gen?.grade??grades[i])*z-plunge*smooth(t)+.22*Math.sin(z/(9+i));
}
// Continue the shoreline grid inland so adjacent mesh rows share the same edges.
function terrainRow(z){
  const cx=center(z),width=halfWidth(z),base=ground(z);
  const t=clamp(z,waterStart(),waterEnd()),edges=waterSection(t);
  const shift=cx-center(t),left=edges[0]+shift,right=edges[1]+shift;
  return {cx,width,base,left,right,level:waterLevel(),blend:!hasWater()?0:smooth(clamp(1-Math.abs(z-t)/16,0,1))};
}
function teeRadius(){return settings.layout==='bowl'?3.25:halfWidth(settings.start)+.8;}
function seaHeight(){return settings.seaLevel??ground(end)-6;}
function coastDistance(x,z){
  if(!settings.island)return Math.min(350-Math.abs(x),z+85,end+88-z);
  const shore=halfWidth(z)+25+7*Math.sin(z/27)+4*Math.sin(z/12+.3*x/30);
  const main=Math.min(shore-Math.abs(x-center(z)),z+38,end+34-z);
  const lake=settings.lake;
  // Keep a strip of dry land all the way around an island lake.
  return lake?Math.max(main,lake.radius+14-Math.hypot(x-lake.x,z-lake.z)):main;
}
function grassHeight(x,z,row=terrainRow(z)){
  const offset=Math.abs(x-row.cx),upland=Math.max(0,offset-59)*(.15+.065*Math.sin(z/27+x/39+6*(settings.land||0))+.045*Math.cos(x/27-z/38));
  const terrace=settings.cliff?12*smooth(clamp((offset-row.width-10)/7,0,1)):0;
  let land=terrace+row.base+Math.max(0,offset-row.width-rampRadius-5)*(.065+.04*Math.sin(z/17))+upland;
  const across=offset-row.width;
  if(across>=-.001 && across<rampRadius+9){
    const side=Math.sign(x-row.cx), ramp=rampAt(z,side);
    const edge=surface(row.cx+side*row.width,z)-row.base;
    const bank=ramp?rampRise(ramp,z,clamp(across,0,rampRadius)):0;
    land+=(edge+bank)*(1-smooth(clamp((across-rampRadius)/9,0,1)));
  }
  if(settings.layout==='bowl'&&z<=bowlZ)
    land-=.6*(1-smooth(clamp((Math.hypot(x+bowlRadius,z-bowlZ)-bowlRadius-3)/3,0,1)));
  const gap=Math.max(0,row.left-x,x-row.right);
  const coast=coastDistance(x,z);
  if(coast<10)return lerp(seaHeight()-3,land,smooth(clamp((coast+2)/12,0,1)));
  if(!row.blend||gap>=12||offset<=row.width)return land;
  // Ease the banks toward a horizontal beach while keeping the playing surface supported.
  const shoreWeight=row.blend*(1-smooth(clamp((gap-.9)/11.1,0,1)))*smooth(clamp((offset-row.width)/2,0,1));
  return lerp(land,row.level+.20*clamp(gap/.9,0,1),shoreWeight);
}
function clearOfCourse(x,z,radius){
  if(settings.layout==='bowl'&&z<6&&Math.hypot(x+bowlRadius,z-bowlZ)<bowlRadius+radius+8)return false;
  if(z>end-10&&Math.abs(x-center(end))<12+radius)return false;
  for(const t of [z-radius,z,z+radius]){
    const side=Math.sign(x-center(t));
    const extra=rampAt(t,side)?rampRadius:0;
    if(Math.abs(x-center(t))<halfWidth(t)+extra+radius+1)return false;
  }
  return true;
}
function ballFloor(state){return state.y??surface(state.x,state.z);}

function hasWater(){return !authored()&&(settings.layout==='lake'||settings.pond);}
const mapWaterColor='#a7dcdf',classicWaterColor='#70b6cb';
function waterStart(){return settings.lake?settings.lake.z-settings.lake.radius:Math.round(end*.45);}
function waterEnd(){return waterStart()+2*(settings.lake?.radius??12);}
function waterLevel(){return ground(waterEnd())-.65;}
function coastal(z){return settings.layout==='lake'&&z>=waterStart()&&z<=waterEnd();}
function oceanSide(z){return settings.waterSide||1;}
function inOcean(x,z){return coastDistance(x,z)<=0;}
let retriever=null,returnHeight=0;
function receiverPose(){return retriever||{player:record.player,x:record.x+.65,z:record.z};}
// Each segment has a quarter-circle cross section and eased ends.
const rampRadius=4.6, rampHeight=5.4;
let sideRamps=[],teeAngle=0,teeLimits=[-1,1];
function teePoint(offset,forward=0){
  if(settings.layout==='bowl')return {x:-2*bowlRadius-offset,z:bowlZ+5-forward};
  return {x:center(settings.start)+offset*Math.cos(teeAngle)+forward*Math.sin(teeAngle),
    z:settings.start-offset*Math.sin(teeAngle)+forward*Math.cos(teeAngle)};
}
function teeDepth(x,z){
  return (x-center(settings.start))*Math.sin(teeAngle)+(z-settings.start)*Math.cos(teeAngle);
}
function buildSideRamps(){
  teeAngle=settings.layout==='bowl'?bankHeading(settings.start):0;
  teeLimits=settings.layout==='bowl'?[-2.5,2.5]:[-1,1].map(side=>{
    let lo=0,hi=halfWidth(settings.start)*2;
    for(let i=0;i<20;i++){
      const mid=(lo+hi)/2,p=teePoint(side*mid);
      if(Math.abs(p.x-center(p.z))<=halfWidth(p.z))lo=mid;else hi=mid;
    }
    return side*lo;
  });
  if(authored()){sideRamps=authored().props.filter(o=>o.type==='ramp').map(o=>({start:o.z-5,stop:o.z+5,side:Math.sign(o.x-center(o.z))}));return;}
  sideRamps=Array.from({length:selectedCourse%3===1?1:2},(_,i)=>{
    const start=Math.round(end*(.32+.045*(selectedCourse%3)+i*.39));
    const stop=Math.min(end-2,start+Math.round(end*.16));
    const mid=(start+stop)/2, bend=center(mid+6)+center(mid-6)-2*center(mid);
    const side=settings.layout==='lake'?-oceanSide(start):Math.abs(bend)>.02?-Math.sign(bend):(i%2?1:-1);
    return {start,stop,side};
  });
}
function rampAt(z,side){return sideRamps.find(r=>r.side===side&&z>=r.start&&z<=r.stop);}
function rampRise(r,z,across){
  const u=clamp(across/rampRadius,0,1);
  return rampHeight*(1-Math.sqrt(Math.max(0,1-u*u)))*smooth(clamp(Math.min(z-r.start,r.stop-z)/3,0,1));
}
function playable(x,z){
  if(inOcean(x,z)||z>=end||(settings.layout==='bowl'?z<bowlZ-.05:z<settings.start+8&&teeDepth(x,z)<-.2))return false;
  const offset=x-center(z),edge=Math.abs(offset)-halfWidth(z);
  return edge<=.065 || (edge<=rampRadius && !!rampAt(z,Math.sign(offset)));
}
function surface(x,z) {
  let bank=0;
  if(settings.layout==='bowl'&&z<=bowlZ){
    const r=Math.hypot(x+bowlRadius,z-bowlZ);
    if(r<=bowlRadius+3.01)return bowlHeight(r,Math.atan2(z-bowlZ,x+bowlRadius),z);
  }
  const offset=x-center(z),across=Math.abs(offset)-halfWidth(z);
  const ramp=across>0 && rampAt(z,Math.sign(offset));
  const gutter=authored()?0:.045*Math.pow(clamp(Math.abs(offset)/halfWidth(z),0,1),2)*smooth(clamp((end-7-z)/10,0,1))*smooth(clamp(z/8,0,1));
  return ground(z)+bank+gutter+(ramp?rampRise(ramp,z,across):0);
}
let stance=0, strafeSpeed=0, previewKey='', previewPoints=[];
const heldDirections=new Set(),cameraKeys=new Set();
let cameraOffset=0,cameraDragX=null;
function canPan(){return displayPrefs.shotCamera==='on'&&(phase==='rolling'||phase==='replay');}
function resetPan(){cameraOffset=0;cameraDragX=null;cameraKeys.clear();}
function panBy(metres){cameraOffset=clamp(cameraOffset+metres,-7,7);}

const tick=1/240;
const startSound=new Audio('data:audio/mpeg;base64,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');
const presentation=new Audio('assets/presentation.mp3');
let flyTime=0,startClock=0;
const flyLength=13.068;
function flyZ(){return lerp(end-20,teePoint(0).z,smooth(clamp(flyTime/flyLength,0,1)));}
function startFlyover(){
  phase='presentation';flyTime=0;message=courses[selectedCourse][0]+' · '+(authored()?selectedPackName:difficulties[Math.floor(selectedCourse/3)]);
  announce(message);resetSkipButton();$('skipIntro').hidden=false;update();
  presentation.currentTime=0;presentation.volume=volume.music*.6;
  if(musicEnabled&&!catchingUp)presentation.play().catch(()=>{});
}
function finishFlyover(){
  if(phase!=='presentation')return;
  presentation.pause();presentation.currentTime=0;$('skipIntro').hidden=true;
  if(catchingUp){ready();return;}
  phase='settling';startClock=0;message='';update();
}
$('skipIntro').onclick=()=>roomLive?voteSkip():finishFlyover();
let curve=0,crowdEnabled=true;
let finishedPlayers=new Set();
let round=1, pending=[], scores=new Map();
let tournamentTotals=new Map(), firstSettings={...settings};
const replayLimit=Math.ceil(4.8/tick);
let frameCursor=0,launchFrame=null;
let frames=[], replayTime=0, replayBowler=null;
const highlights=new Map();
let reel=null,celebrateAfter=false,celebrationTime=0;
function courseCount(){return openingCourse===-1?9:openingCourse>=12?customSlots.length:3;}
function resetMatch(){
  if(reel)stopHighlightMusic();
  highlights.clear();reel=null;
  if(openingCourse===9){generateCourses();const [,layout,shape,width]=courses[9];firstSettings={layout,shape,width,start:0};}
  previewKey='';
  selectedCourse=Math.max(0,openingCourse);mapIndex=0;settings={...firstSettings};
  tournamentTotals=new Map(roster.map(p=>[p,0]));
  beginMap();
}
function beginMap(){
  finishedPlayers.clear();
  end=authored()?courseLengths[selectedCourse]:Math.max(courseLengths[selectedCourse],settings.shape==='straight'?165:108);
  settings.land=authored()?0:gameRandom();settings.pond=!authored()&&settings.layout==='hill'&&settings.land>.62;settings.waterSide=settings.land>.5?-1:1;settings.cliff=!authored()&&([4,7].includes(selectedCourse)||selectedCourse>=9&&settings.land>.65);
  settings.variant=authored()?levelSignature(authored()):generated[selectedCourse-9]?.seed??Math.floor(settings.land*1000000);
  settings.lake=null;
  if(hasWater()){
    const radius=settings.layout==='lake'?12:9;
    const z=Math.round(end*(settings.layout==='lake'?.62:.38+.12*settings.land));
    let outer=-Infinity;
    for(let t=z-radius;t<=z+radius;t++)
      outer=Math.max(outer,oceanSide(t)*center(t)+halfWidth(t));
    settings.lake={x:oceanSide(z)*(outer+radius+10),z,radius};
  }
  settings.seaLevel=Infinity;
  for(let z=-40;z<=end+1;z++)settings.seaLevel=Math.min(settings.seaLevel,ground(z)-6);
  buildSideRamps();
  const mph=2+Math.floor(gameRandom()*15);
  settings.windBearing=gameRandom()*2*Math.PI;
  settings.windMph=mph;
  settings.island=!authored()&&([2,5].includes(selectedCourse)||(selectedCourse>=9&&settings.land>.74));
  wind=Math.sin(settings.windBearing)*mph*.04;
  settings.windZ=Math.cos(settings.windBearing)*mph*.04;
  $('wind').textContent=mph+' mph';
  round=1; record=null; pending=queue.slice(); scores=new Map(roster.map(p=>[p,0])); ready();
}
function announce(text){
  const card=$('ribbon');card.textContent=text;card.classList.remove('show');
  void card.offsetWidth;card.classList.add('show');
}
function ready() {
  resetPan();
  retriever=null;returnHeight=0;
  if(round===5)$('ribbon').classList.remove('show');
  else announce((round===1?courses[selectedCourse][0]+' · ':'')+'Round '+round+' · '+queue[0].name);
  const z=settings.start;
  ball={...teePoint(0),vx:0,vz:0,spin:0};
  $('bowlerArrow').dataset.mode='move';arrowUntil=0;previousAim=0;stance=0;strafeSpeed=0;heldDirections.clear();curve=0;phase='ready';distance=0;message='';
  $('aim').value=0;$('power').value=65;
  update();
}
function moveSide(direction){
  if(phase!=='ready')return;
  const before=stance;
  stance=clamp(stance+direction*.18,teeLimits[0]+.4,teeLimits[1]-.4);
  Object.assign(ball,teePoint(stance));
  if(Math.abs(stance-before)>.00003)showArrow(direction<0?'←':'→');
}
for(const [id,key] of [['moveLeft','touchLeft'],['moveRight','touchRight']]){
  const button=$(id);
  button.onpointerdown=e=>{if(!canBowl())return;button.setPointerCapture(e.pointerId);heldDirections.add(key);};
  button.onlostpointercapture=()=>heldDirections.delete(key);
}
document.addEventListener('keyup',e=>{heldDirections.delete(e.code);cameraKeys.delete(e.code);});
window.addEventListener('blur',()=>{heldDirections.clear();cameraKeys.clear();cameraDragX=null;strafeSpeed=0;});
function launch(state,vary=false){
  const angle=(settings.layout==="bowl"?Math.PI:Math.atan2(center(state.z+.1)-center(state.z),.1))+(Number($('aim').value)+(vary?(gameRandom()-.5)*.8:0))*Math.PI/180;
  const speed=1.08*(4+Number($('power').value)*.19)*(vary?1+(gameRandom()-.5)*.018:1);
  if(settings.layout==='bowl'){
    state.bowlEntry=true;state.y=ground(state.z)+.75;state.vy=2.2;
  }
  state.vx=Math.sin(angle)*speed;
  state.vz=Math.cos(angle)*speed;
}
function roll(){if(phase!=='ready')return;if(roomLive){submitShot();return;}releaseBall();}
function releaseBall() {
  if(phase!=='ready')return;
  launch(ball,true);
  launchFrame={...ball};frameCursor=0;frames=[launchFrame];replayBowler=queue[0];
  sound('drop');phase='rolling';update();
}
function finish(reason) {
  if(reason==='Water splash')sound('splash');
  if(verificationRun&&reason==='Reached the end'&&!verificationRun.completed){
    current().proof={physics:4,windZ:settings.windZ||0,signature:levelSignature(authored()),x:launchFrame.x,vx:launchFrame.vx,vz:launchFrame.vz,curve,wind};
    verificationRun.completed=true;persist();
  }
  const previous=record;
  const player=queue.shift();
  const guest=roster.length===1||!previous;
  if(round===5)retriever=null;
  else if(guest){
    const choices=palette.filter(color=>!roster.some(p=>p.color===color));
    const color=choices[Math.floor(gameRandom()*choices.length)];
    const side=coastal(ball.z)?-oceanSide(ball.z):(gameRandom()<.5?-1:1);
    retriever={player:{name:'Course attendant',color},guest:true,x:center(ball.z)+side*(halfWidth(ball.z)+4),z:ball.z-.7};
  }else retriever={player:previous.player,x:previous.x+.65,z:previous.z};
  if(retriever){retriever.homeX=retriever.x;retriever.homeZ=retriever.z;}
  const best=!record||distance>record.distance+.000001;
  if(best) record={player,distance,x:ball.x,z:ball.z};
  scores.set(player,Math.max(scores.get(player)||0,distance));
  if(reason==='Reached the end')finishedPlayers.add(player);
  pending=pending.filter(p=>p!==player);
  queue.push(player);
  queue=queue.filter(p=>!finishedPlayers.has(p));
  if(queue.includes(record.player))queue=queue.filter(p=>p!==record.player).concat(record.player);
  queue=queue.filter(p=>pending.includes(p)).concat(queue.filter(p=>!pending.includes(p)));
  if(round===5){message='';$('ribbon').classList.remove('show');}
  else{
  announce((reason==='Reached the end'?'Flag reached · ':best?'New Highscore · ':reason+' · ')+meters(distance));
  message=player.name+' rolled '+meters(distance)+' · '+reason+(best?' · New Highscore!':'');
  }
  const reached=reason==='Reached the end';
  sound(reached?'cup':best||reason==='Ball stopped'?'nice':'stop',round!==5);
  if(crowdEnabled)sound(reached||best?'cheer':reason==='Off course'?'boo':'aw');
  celebrateAfter=best||reached;
  if(frameCursor)frames=frames.slice(frameCursor).concat(frames.slice(0,frameCursor));
  if(best){
    const samples=frames.filter((_,i)=>i%8===0);
    if(samples.at(-1)!==frames.at(-1))samples.push(frames.at(-1));
    highlights.set(mapIndex,{samples,ticks:frames.length-1,player,round,course:selectedCourse,settings:{...settings},end,wind,stance,aim:$('aim').value,distance});
  }
  ball={...frames[0]};replayTime=0;phase='replay';resetSkipButton();$('skipReplay').hidden=false;update();
}
function showHighlight(){
  if(reel.index===reel.shots.length){
    ({selectedCourse,settings,end,wind,stance,frames,ball,record,retriever,distance,round,mapIndex,message,replayBowler}=reel.saved);
    $('aim').value=reel.saved.aim;
    buildSideRamps();stopHighlightMusic();reel=null;phase='over';$('skipReplay').hidden=true;
    $('skipReplay').textContent='Replay · Skip';update();$('results').showModal();return;
  }
  const shot=reel.shots[reel.index];
  phase='replay';selectedCourse=shot.course;settings=shot.settings;end=shot.end;wind=shot.wind;
  stance=shot.stance;$('aim').value=shot.aim;round=shot.round;mapIndex=reel.index;buildSideRamps();
  frames=shot.samples;ball={...frames[0]};record=null;retriever=null;distance=0;replayTime=0;replayBowler=shot.player;
  message=shot.player.name+' · '+meters(shot.distance);
  update();$('next').textContent='Course record';$('wind').textContent=settings.windMph+' mph';
  announce('Highlight '+(reel.index+1)+' / '+reel.shots.length+' · '+message);
  $('skipReplay').textContent=reel.index+1===reel.shots.length?'Back to results':'Next highlight';
  $('skipReplay').disabled=false;$('skipReplay').hidden=false;sound('drop');
}
$('highlights').onclick=()=>{
  if(phase!=='over'||!highlights.size)return;
  reel={index:0,shots:[...highlights.values()],saved:{selectedCourse,settings,end,wind,stance,frames,ball,record,retriever,distance,round,mapIndex,message,replayBowler,aim:$('aim').value}};
  $('results').close();highlightMusic.currentTime=0;syncHighlightMusic();showHighlight();
};
function endReplay(){
  if(reel){reel.index++;showHighlight();return;}
  if(phase!=='replay')return;
  delete ball.y;Object.assign(ball,frames[frames.length-1]);$('skipReplay').hidden=true;
  if(celebrateAfter){celebrateAfter=false;phase='celebrating';celebrationTime=0;message=replayBowler.name+' celebrates!';update();return;}
  afterThrow();
}
function afterThrow(){
  if(round===5||!queue.length){nextTurn();return;}
  phase='pickup';advance();
}
function nextTurn(){
  if(!queue.length||(!pending.length && round===5)){
    for(const [p,best] of scores)tournamentTotals.set(p,tournamentTotals.get(p)+best);
    if(mapIndex+1<courseCount()){
      mapIndex++;selectedCourse=openingCourse===-1?mapIndex:openingCourse-openingCourse%3+(openingCourse%3+mapIndex)%3;
      const [,layout,shape,width]=courses[selectedCourse];
      settings={layout,shape,width,start:0};queue=roster.slice();beginMap();startFlyover();
    }else{
      phase='over';$('summary').textContent=[...tournamentTotals].sort((a,b)=>b[1]-a[1]).map(([p,total])=>p.name+' · '+meters(total)).join('\n');
      $('resultsTitle').textContent=verificationRun?'Course results':'Tournament totals';
      $('again').textContent=verificationRun?'Back to editor':'Home screen';
      $('results').showModal();update();
    }
  } else {
    if(!pending.length){round++;if(queue.includes(record.player))queue=queue.filter(p=>p!==record.player).concat(record.player);pending=queue.slice();}
    ready();
  }
}
function advance() {
  if(phase==='presentation')$('skipIntro').onclick();
  else if(phase==='replay')$('skipReplay').onclick();
  else if(phase==='ready') roll();
  else if(phase==='pickup'){
    transfer={x:ball.x+.32,z:ball.z,fromX:retriever.x,fromZ:retriever.z,time:0};
    phase='collecting';update();
  } else if(phase==='held'){
    transfer={...teePoint(0),fromX:ball.x,fromZ:ball.z,time:0};
    phase='returning';update();
  }
}
$('skipReplay').onclick=()=>roomLive&&!reel?voteSkip():endReplay();
function step(dt) {
  if(phase==='celebrating'){celebrationTime+=dt;if(celebrationTime>=1.65)afterThrow();return;}
  if(phase==='settling'||phase==='starting'){
    startClock+=dt;
    if(phase==='settling'&&startClock>=1){phase='starting';startClock=0;message='Start';startSound.volume=volume.effects*.8;startSound.currentTime=0;startSound.play().catch(()=>{});update();}
    else if(phase==='starting'&&startClock>=1.1)ready();
    return;
  }
  if(phase==='presentation'){flyTime+=dt;if(flyTime>=flyLength)finishFlyover();return;}
  if(phase==='ready'){
    const direction=Number(heldDirections.has('KeyD')||heldDirections.has('touchRight'))-Number(heldDirections.has('KeyA')||heldDirections.has('touchLeft'));
    strafeSpeed=lerp(strafeSpeed,direction*2.65,1-Math.exp(-dt*9));
    if(Math.abs(strafeSpeed)>.001)moveSide(strafeSpeed*dt/.18);
    return;
  }
  if(phase==='replay'){
    replayTime+=dt;
    const ticks=reel?reel.shots[reel.index].ticks:frames.length-1,duration=ticks*tick;
    const elapsed=Math.min(ticks,replayTime/tick);
    const segment=reel?Math.min(Math.floor(elapsed/8),Math.max(0,frames.length-2)):Math.floor(elapsed);
    const progress=reel?segment+(elapsed-segment*8)/Math.max(1,Math.min(8,ticks-segment*8)):elapsed;
    const a=frames[Math.floor(progress)],b=frames[Math.min(frames.length-1,Math.ceil(progress))];
    for(const key of ['x','z','spin','vx','vz'])ball[key]=lerp(a[key],b[key],progress%1);
    ball.y=lerp(ballFloor(a),ballFloor(b),progress%1);
    if(reel)distance=Math.max(0,ball.z-settings.start);
    if(replayTime>=duration)endReplay();
    return;
  }
  if(phase==='collecting'||phase==='returning'){
    transfer.time+=dt;
    const t=clamp(transfer.time/(phase==='collecting'?.65:1.25),0,1);
    if(phase==='collecting'){
      retriever.x=lerp(transfer.fromX,transfer.x,smooth(t));retriever.z=lerp(transfer.fromZ,transfer.z,smooth(t));
      returnHeight=smooth(clamp((t-.7)/.3,0,1))*.82;
    }else{
      delete ball.y;ball.x=lerp(transfer.fromX,transfer.x,t);ball.z=lerp(transfer.fromZ,transfer.z,t);
      returnHeight=.82*(1-t)+4*t*(1-t)*Math.min(10,2+Math.abs(transfer.fromZ-transfer.z)*.13);
      retriever.x=lerp(transfer.fromX+.32,retriever.homeX,smooth(t));retriever.z=lerp(transfer.fromZ,retriever.homeZ,smooth(t));
    }
    if(t===1){
      if(phase==='collecting'){phase='held';advance();}
      else nextTurn();
    }
    return;
  }
  if(phase!=='rolling') return;
  const reason=integrate(ball,dt,wind,false,settings.windZ||0);
  if(frames.length<replayLimit)frames.push({...ball});
  else{frames[frameCursor]={...ball};frameCursor=(frameCursor+1)%replayLimit;}
  distance=clamp(ball.z-settings.start,0,end-settings.start);
  if(reason==='Reached the end')distance=end-settings.start;
  if(reason)finish(reason);
}
function trajectory(){
  const key=[selectedCourse,settings.variant,settings.start,settings.width,settings.shape,ball.x,ball.z,curve,$('aim').value,$('power').value].join('|');
  if(key===previewKey)return previewPoints;
  previewKey=key;const state={...ball};launch(state);previewPoints=[{...state}];
  // Only the dotted aiming estimate uses a coarser timestep.
  const predictionStep=1/60;
  for(let i=0;i<4500;i++){
    const reason=integrate(state,predictionStep);
    if(reason||i%3===0)previewPoints.push({x:state.x,z:state.z});
    if(reason)break;
  }
  return previewPoints;
}
function integrate(ball,dt,crosswind=0,legacy=false,downwind=0,oldProof=false){
  if(ball.bowlEntry){
    ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;
    ball.vy-=9.81*dt;ball.y+=ball.vy*dt;
    if(ball.z<=bowlZ){delete ball.bowlEntry;delete ball.y;ball.inBasin=true;}
    return null;
  }
  if(ball.airborne){
    if(!oldProof){ball.vx+=crosswind*.55*dt;ball.vz+=downwind*.55*dt;}
    ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.vy-=9.81*dt;ball.y+=ball.vy*dt;
    ball.spin+=Math.hypot(ball.vx,ball.vz)*dt/.28;
    const road=playable(ball.x,ball.z),sea=inOcean(ball.x,ball.z),pond=inPond(ball.x,ball.z),water=sea||pond;
    const openSea=coastDistance(ball.x,ball.z)<0;
    const floor=road?surface(ball.x,ball.z):pond?waterLevel():openSea?seaHeight():grassHeight(ball.x,ball.z);
    if(ball.y<=floor){
      ball.y=floor;ball.airborne=false;
      if(!road)return water||openSea?'Water splash':'Off course';
      delete ball.y;
    }
    return null;
  }
  if(oldProof && (ball.capture || (ball.z>=end-9 && ball.vz>0 && playable(ball.x,ball.z)))){
    if(!ball.capture)ball.capture={z:ball.z,x:ball.x-center(ball.z),speed:clamp(ball.vz,6,14)};
    const entry=ball.capture,span=Math.max(.001,end-entry.z);
    const z=Math.min(end,ball.z+entry.speed*dt);
    const x=center(z)+entry.x*(1-smooth(clamp((z-entry.z)/span,0,1)));
    ball.vx=(x-ball.x)/dt;ball.vz=(z-ball.z)/dt;
    ball.spin+=Math.hypot(ball.vx,ball.vz)*dt/.28;ball.x=x;ball.z=z;
    if(z===end){ball.vx=ball.vz=0;return 'Reached the end';}
    return null;
  }
  const oldX=ball.x, oldZ=ball.z,oldVx=ball.vx,oldVz=ball.vz;
  const slope=(surface(ball.x+.025,ball.z)-surface(ball.x-.025,ball.z))/.05;
  ball.rollAge=(ball.rollAge||0)+dt;
  const turn=curve*(oldProof?1:Math.exp(-ball.rollAge*.55))*.00085*Math.hypot(ball.vx,ball.vz)*dt;
  const vx=ball.vx*Math.cos(turn)+ball.vz*Math.sin(turn);
  ball.vz=ball.vz*Math.cos(turn)-ball.vx*Math.sin(turn);
  ball.vx=vx;
  const grade=(surface(ball.x,ball.z+.025)-surface(ball.x,ball.z-.025))/.05;
  // Tangential gravity for a rolling sphere, projected onto horizontal axes.
  const gravity=7/(1+slope*slope+grade*grade);
  ball.vx+=(crosswind*(oldProof?(legacy?1:.36):.16)-gravity*slope)*dt;
  ball.vz-=gravity*grade*dt;
  ball.vz+=downwind*.16*dt;
  const speed=Math.hypot(ball.vx,ball.vz);
  const onRamp=Math.abs(ball.x-center(ball.z))>halfWidth(ball.z)&&rampAt(ball.z,Math.sign(ball.x-center(ball.z)));
  const factor=Math.max(0,1-(onRamp&&!legacy?1.65:.12)*dt/Math.max(.01,speed));
  ball.vx*=factor;ball.vz*=factor;
  ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.spin+=speed*dt/.28;
  if(ball.inBasin){
    const dx=ball.x+bowlRadius,dz=ball.z-bowlZ,radial=Math.hypot(dx,dz),limit=bowlRadius+3-.28;
    if(radial>limit&&dz<0){
      const nx=dx/radial,nz=dz/radial,out=Math.max(0,ball.vx*nx+ball.vz*nz);
      ball.x=-bowlRadius+nx*limit;ball.z=bowlZ+nz*limit;
      ball.vx-=1.38*out*nx;ball.vz-=1.38*out*nz;
    }
    if(ball.z<bowlZ)return speed<.12?'Ball stopped':null;
    delete ball.inBasin;
  }
  if(!oldProof&&ball.z>=end-2.5){
    // Count first contact with the marked green or a crossing anywhere on the paved finish stripe.
    const dx=ball.x-oldX,dz=ball.z-oldZ,cx=center(end);
    const t=clamp(((cx-oldX)*dx+(end-oldZ)*dz)/(dx*dx+dz*dz||1),0,1);
    const hitsGreen=Math.hypot(oldX+t*dx-cx,oldZ+t*dz-end)<=2.5;
    const crosses=oldZ<end&&ball.z>=end;
    const f=crosses?(end-oldZ)/dz:t;
    const x=oldX+dx*f;
    if(hitsGreen||crosses){
      ball.x=x;ball.z=crosses?end:oldZ+t*dz;ball.vx=ball.vz=0;
      return hitsGreen||Math.abs(x-cx)<=halfWidth(end)+.065?'Reached the end':'Off course';
    }
  }
  if(authored()){
    // Find the rim contact within this tick, including on curved custom ramps.
    const side=Math.sign(ball.x-center(ball.z));
    const rimDistance=(x,z)=>side*(x-center(z))-halfWidth(z)-rampRadius;
    if(side&&rimDistance(oldX,oldZ)<=0&&rimDistance(ball.x,ball.z)>=0){
      let lo=0,hi=1;
      for(let i=0;i<12;i++){
        const t=(lo+hi)/2;
        if(rimDistance(lerp(oldX,ball.x,t),lerp(oldZ,ball.z,t))<0)lo=t;else hi=t;
      }
      const z=lerp(oldZ,ball.z,hi);
      if(rampAt(z,side)){
        ball.z=z;ball.x=center(z)+side*(halfWidth(z)+rampRadius);
        ball.y=surface(ball.x,z);ball.vx=ball.vz=0;return 'Ball stopped';
      }
    }
  }
  if(!playable(ball.x,ball.z)){
    if(authored()&&rampAt(oldZ,Math.sign(oldX-center(oldZ)))&&Math.abs(oldX-center(oldZ))>=halfWidth(oldZ)){
      ball.y=grassHeight(ball.x,ball.z);ball.vx=ball.vz=0;return 'Off course';
    }
    ball.airborne=true;ball.y=surface(oldX,oldZ);
    ball.vy=clamp(slope*oldVx+grade*oldVz,-18,22);
    return null;
  }
  const travel=Math.hypot(ball.x-oldX,ball.z-oldZ);
  ball.restTime=travel<.035*dt?(ball.restTime||0)+dt:0;
  if(ball.restTime>1)return 'Ball stopped';
  return speed<.13 && Math.hypot(slope,grade)*gravity<.12?'Ball stopped':null;
}
function update(){
  $('startCue').hidden=phase!=='starting';
  const replay=phase==='replay';
  $('replayBadge').hidden=!replay;
  $('replayBadge').textContent=reel?'Highlight replay':'Replay';
  $('playView').dataset.replay=String(replay);
  const readyTurn=phase==='ready';
  $('playView').dataset.ready=String(readyTurn&&canBowl());
  $('aim').disabled=$('power').disabled=!readyTurn;
  $('players').disabled=$('edit').disabled=!['ready','pickup','held'].includes(phase);
  $('action').disabled=!['ready','pickup','held'].includes(phase);
  $('action').textContent={ready:'Roll basketball',rolling:'Rolling…',pickup:'Collect ball',collecting:'Collecting…',held:'Return to '+(queue[0]?.name||'tee'),returning:'Returning…'}[phase];
  $('status').textContent=readyTurn?queue[0].name+' to roll':phase==='rolling'?queue[0].name+' is rolling':message;
  $('leader').textContent=record?record.player.name+' · '+meters(record.distance):'The first roll sets the record.';
  $('queue').replaceChildren(...queue.map(p=>{const li=document.createElement('li');li.textContent=p.name;return li;}));
  $('courseLabel').textContent='Map '+(mapIndex+1)+'/'+courseCount()+' · '+courses[selectedCourse][0]+' · Round '+round+'/5';
  updateMeters();
}
function showArrow(symbol){
  $('bowlerArrow').dataset.mode=['↶','↷'].includes(symbol)?'turn':'move';
  $('bowlerArrow').dataset.side=['←','↶'].includes(symbol)?'left':'right';arrowUntil=performance.now()+360;
}
function placeArrow(x,y){
  const el=$('bowlerArrow');
  el.hidden=phase!=='ready'||!canBowl();
  if(performance.now()>=arrowUntil)delete el.dataset.side;
  if(!el.hidden){el.style.left=x+'%';el.style.top=y+'%';}
}
function bowlerHeading(){
  return (settings.layout==='bowl'?Math.PI:Math.atan2(center(settings.start+.1)-center(settings.start),.1))+Number($('aim').value)*Math.PI/180;
}
function updateMeters(){
  const nextAim=Number($('aim').value);
  if(phase==='ready'&&previousAim!==nextAim)showArrow(nextAim>previousAim?'↷':'↶');
  previousAim=nextAim;
  $('fingerAim').value=nextAim;$('fingerPower').value=$('power').value;$('fingerCurve').value=curve;
  $('live').textContent=$('status').textContent;
  $('next').textContent=record?'Record · '+record.player.name+' '+meters(record.distance):'First roll';
  $('pathTools').hidden=false;
  $('menu').disabled=phase==='over'||!!reel;
}
$('fingerAim').oninput=e=>{if(phase==='ready'&&canBowl()){$('aim').value=e.target.value;updateMeters();}};
$('fingerPower').oninput=e=>{if(phase==='ready'&&canBowl()){$('power').value=e.target.value;updateMeters();}};
$('fingerCurve').oninput=e=>{if(phase==='ready'&&canBowl()){curve=Number(e.target.value);updateMeters();}};
$('touchRoll').onclick=()=>{if(canBowl())roll();};
$('action').onclick=advance;
$('aim').oninput=$('power').oninput=updateMeters;
document.addEventListener('keydown', event => {
  if(document.querySelector('dialog[open]'))return;
  if(canPan()&&['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(event.code)&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
    event.preventDefault();cameraKeys.add(event.code);return;
  }
  if(roomLive&&!canBowl()&&!(event.code==='Space'&&['presentation','replay'].includes(phase)))return;
  if (event.altKey || event.ctrlKey || event.metaKey ||
      $('courseDialog').open || $('playerDialog').open ||
      event.target.closest?.('textarea, select, [contenteditable]')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) advance();
    return;
  }
  if(phase==='ready' && ['KeyQ','KeyE'].includes(event.code)){
    event.preventDefault();curve=clamp(curve+(event.code==='KeyQ'?-1:1),-12,12);updateMeters();return;
  }
  if(['KeyA','KeyD'].includes(event.code)){
    event.preventDefault();if(phase==='ready')heldDirections.add(event.code);return;
  }
  const keys = {
    ArrowLeft: ['aim',-1],
    ArrowRight: ['aim',1],
    ArrowDown: ['power',-2], KeyS: ['power',-2],
    ArrowUp: ['power',2], KeyW: ['power',2]
  };
  const binding = keys[event.code];
  if (!binding) return;
  event.preventDefault();
  if (phase !== 'ready') return;
  const [id, amount] = binding;
  const slider = $(id);
  slider.value = clamp(Number(slider.value) + amount, Number(slider.min), Number(slider.max));
  updateMeters();
});
function tile(label,selected,click){
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.setAttribute('aria-pressed',selected);button.onclick=click;return button;
}
function chooseDifficulty(tier){
  draftCourse=tier===4?-1:tier*3;
  $('difficultyTiles').replaceChildren(...[...difficulties,...creatorShelf.packs.map(p=>p.name)].map((name,i)=>tile(name,i===tier,()=>chooseDifficulty(i))));
}
$('edit').onclick=()=>{
  const tier=openingCourse===12?creatorShelf.packs.findIndex(p=>p.name===selectedPackName)+5:openingCourse===-1?4:Math.floor(openingCourse/3);
  chooseDifficulty(tier);$('courseDialog').showModal();
};
$('courseForm').onsubmit=event=>{
  event.preventDefault();$('courseDialog').close();
  if(!wizard && openingCourse===draftCourse)return;
  openingCourse=draftCourse;
  if(draftCourse>=15){const pack=creatorShelf.packs[draftCourse/3-5];installLevels(pack.name,pack.levels);openingCourse=12;}
  const [,layout,shape,width]=courses[Math.max(0,openingCourse)];
  const next={layout,shape,width,start:0};
  if(record) queue=queue.filter(p=>p!==record.player).concat(record.player);
  record=null;firstSettings=next;if(wizard){wizard=false;startTournament();}else resetMatch();
};
let profiles=[];
function showPlayers(count){
  for(const row of $('slots').children){
    const i=Number(row.dataset.index);
    profiles[i]={name:row.querySelector('input').value,gender:row.querySelector('select').value};
  }
  $('counts').replaceChildren(...Array.from({length:5},(_,i)=>tile(String(i+1),count===i+1,()=>showPlayers(i+1))));
  $('slots').replaceChildren(...Array.from({length:count},(_,i)=>{
    const profile=profiles[i]||{name:'Player '+(i+1),gender:'Unspecified'};
    const row=document.createElement('fieldset');row.dataset.index=i;
    const title=document.createElement('legend');title.textContent='Bowler '+(i+1);
    const name=document.createElement('input');name.value=profile.name;name.maxLength=22;name.required=true;
    const gender=document.createElement('select');
    for(const option of ['Unspecified','Male','Female','Nonbinary'])gender.add(new Option(option,option));
    gender.value=profile.gender;
    for(const [label,input] of [['Name',name],['Gender',gender]]){
      const field=document.createElement('label');field.textContent=label;field.append(input);row.append(field);
    }
    row.prepend(title);return row;
  }));
  $('savePlayers').disabled=count===0;
}
$('players').onclick=()=>{
  $('slots').replaceChildren();
  profiles=roster.map(p=>({name:p.name,gender:p.gender||'Unspecified'}));
  showPlayers(0);$('nameError').textContent='';$('playerDialog').showModal();
};
$('playerForm').onsubmit=event=>{
  event.preventDefault();
  const picked=[...$('slots').children].map((row,i)=>({name:row.querySelector('input').value.trim(),gender:row.querySelector('select').value,color:palette[i],look:i===0?myLook:null}));
  const names=picked.map(p=>p.name);
  if(names.length<1||names.length>5||names.some(name=>!name||name.length>22)||new Set(names.map(name=>name.toLowerCase())).size!==names.length){
    $('nameError').textContent='Enter 1–5 different names, up to 22 characters each.';return;
  }
  roster=picked;queue=roster.slice();
  record=null;$('playerDialog').close();if(wizard)$('edit').click();else resetMatch();
};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
function project(x,y,z){
  const yaw=camera.yaw||0,dx=x-camera.x,dz=z-camera.z;
  const depth=Math.max(.08,dx*Math.sin(yaw)+dz*Math.cos(yaw));
  const k=510/depth;
  return [480+(dx*Math.cos(yaw)-dz*Math.sin(yaw))*k,83+(camera.y-y)*k,k];
}
function poly(points,color){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
  for(const p of points.slice(1)) ctx.lineTo(p[0],p[1]);
  ctx.closePath();ctx.fill();
}
function oval(x,y,rx,ry,color){
  ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
}
function roadPoint(u,z,height=0){
  const x=center(z)+u*halfWidth(z);
  return project(x,surface(x,z)+height,z);
}
const backdrop = new Image();
backdrop.src = 'assets/backdrop.webp';
const groundColors=['#4e8c25','#59982a','#68a52d','#5b9828'];
const fitTree=new Image();fitTree.src='assets/fit-tree.webp';
const grass=new Image();grass.src='assets/fairway.webp';
function turf(n,a,b){
  if(!grass.naturalWidth)return;
  const depth=(a+b)/2-camera.z;
  const scale=510/depth;
  const y1=project(0,ground(a),a)[1],y2=project(0,ground(b),b)[1];
  const h=y1-y2;if(h<=0)return;
  const w=scale*8, offset=((480-camera.x*scale)%w+w)%w;
  const row=((n%8+8)%8)*grass.naturalHeight/8;
  for(let x=offset-w;x<960;x+=w)ctx.drawImage(grass,0,row,grass.naturalWidth,grass.naturalHeight/8,x,y2,w+.4,h+.5);
}
function waterSection(z){
  const lake=settings.lake;
  if(!lake){
    const x=center(z)+oceanSide(z)*(halfWidth(z)+20);
    return [x,x];
  }
  const dz=z-lake.z,span=Math.sqrt(Math.max(0,lake.radius*lake.radius-dz*dz));
  return [lake.x-span,lake.x+span];
}
function inPond(x,z){
  const lake=settings.lake;
  return !!lake&&Math.hypot(x-lake.x,z-lake.z)<lake.radius;
}
function treeSiteClear(x,z,radius){
  if(!shorelineClear(x,z,radius))return false;
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    if(coastDistance(x+radius*Math.cos(a),z+radius*Math.sin(a))<10)return false;
  }
  return true;
}
function shorelineClear(x,z,radius){
  if(!hasWater())return true;
  // Check the crown's full footprint against each piecewise-linear shoreline strip.
  const reach=radius+2.8,lo=Math.max(waterStart(),Math.floor(z-reach)),hi=Math.min(waterEnd(),Math.ceil(z+reach));
  for(let t=lo;t<hi;t++){
    const a=waterSection(t),b=waterSection(t+1);
    if(x+reach>=Math.min(a[0],b[0])&&x-reach<=Math.max(a[1],b[1]))return false;
  }
  return true;
}
function lake(a,b){
  if(!hasWater())return;
  if(a<waterStart()||b>waterEnd())return;
  const [la,ra]=waterSection(a),[lb,rb]=waterSection(b),y=waterLevel();
  const point=(x,z,h)=>project(x,h,z);
  poly([point(la-2.8,a,grassHeight(la-2.8,a)+.08),point(ra+2.8,a,grassHeight(ra+2.8,a)+.08),point(rb+2.8,b,grassHeight(rb+2.8,b)+.08),point(lb-2.8,b,grassHeight(lb-2.8,b)+.08)],'#dac89a');
  poly([point(la,a,y),point(ra,a,y),point(rb,b,y),point(lb,b,y)],classicWaterColor);
}
const stones=['#acaaa0','#9b9d96','#b3b2a9','#a5a79e','#bcb9ad'];
const wood=['#c48949','#dca060','#e1a566','#cc9053'];
const scenery=Array.from({length:1100},(_,i)=>({z:(i%275)+Math.sin(i*3.4),side:i%2?-1:1,layer:Math.floor(i/275),offset:5+Math.floor(i/275)*9+(i*27%11),type:i%17===0?'rock':'tree'}));
function decorate(item){
  const {z,side,offset,type}=item;if(!authored()&&type!=='tree')return;
  const x=item.x??(center(z)+side*(halfWidth(z)+offset));
  if(!authored()&&(!treeSiteClear(x,z,3.1)||!clearOfCourse(x,z,3.1)))return;
  const [px,py,k]=project(x,grassHeight(x,z),z);
  if(k>210||px < -250||px>1210) return;
  const tree=fitTree;
  if(type==='tree'&&tree.naturalWidth){const w=4.3*k*tree.naturalWidth/tree.naturalHeight;ctx.drawImage(tree,px-w/2,py-k*4.3,w,k*4.3);return;}
  if(type==='tree'){
    oval(px+k*.65,py+k*.15,k*1.45,k*.25,'#25462266');
    ctx.fillStyle='#8a613e';ctx.fillRect(px-k*.16,py-k*1.8,k*.33,k*1.8);
    if(Math.floor(z)%3===0){
      for(let layer=0;layer<4;layer++){
        const y=py-k*(1.05+layer*.46), w=k*(.95-layer*.16);
        poly([[px-w,y],[px,y-k*1.43],[px+w,y]],'#26553e');
        poly([[px-w,y],[px,y-k*1.43],[px+k*.08,y]],'#3b6d46');
      }
    } else {
      for(let i=0;i<7;i++){
        const angle=i*2.4;
        oval(px+Math.cos(angle)*k*.55,py-k*(2.3+Math.sin(angle)*.53),k*.68,k*.69,
          ['#32613c','#3d7940','#4f8945','#659b50'][i%4]);
      }
    }
  }else{
    poly([[px-k*.45,py],[px-k*.33,py-k*.34],[px+k*.11,py-k*.48],[px+k*.38,py-k*.26],[px+k*.5,py]],'#8d9587');
    poly([[px-k*.33,py-k*.34],[px+k*.11,py-k*.48],[px+k*.38,py-k*.26],[px-k*.05,py-k*.18]],'#b4b9aa');
  }
}
function face(g,x,y,k,i,profile,look){
  const skins=['#efbe91','#b88057','#e5ab79','#975f45','#f8cba4','#c18c65','#eaba92','#ce946d'];
  const hairs=['#594032','#342c31','#995529','#302728','#c28d45','#423434','#754333','#362e2c'];
  const blob=(dx,dy,w,h,fill,tilt=0)=>{g.fillStyle=fill;g.beginPath();g.ellipse(x+dx*k,y+dy*k,w*k,h*k,tilt,0,Math.PI*2);g.fill();};
  const offset=profile?.18:0,style=look?.style??i%5,f=look?.face??[0,1,2,0,3][i%5];
  if(look){skins[i]=look.skin;hairs[i]=look.hair;}

  blob(0,0,.405,.48,skins[i]);blob(-.38,0,.064,.095,skins[i]);blob(.38,0,.064,.095,skins[i]);
  if(style!==1){blob(-offset*.65,-.23,.402,.267,hairs[i]);blob(-.315,-.10,.091,.22,hairs[i],-.2);
  for(let j=0;j<3;j++)blob(-.23+j*.16,-.235+j*.015,.123,.13,hairs[i],.5);
  if(style===2)for(const side of [-1,1])blob(side*.35,.04,.09,.34,hairs[i]);
  if(style===4)for(const side of [-1,0,1])blob(side*.15,-.43,.07,.14,hairs[i],side*.3); }
  for(const dx of [-.15,.15]){
    const ex=dx*(profile?.54:1)+offset;
    blob(ex,-.085,.06,.018,hairs[i],dx*.9);blob(ex,.015,.034,.048,'#181719');
  }
  if(style===3)for(const side of [-1,1])blob(side*.42,-.05,.14,.20,hairs[i]);
  if(f===3)for(const side of [-1,1]){g.strokeStyle='#263757';g.lineWidth=k*.023;g.beginPath();g.ellipse(x+(offset+side*.10)*k,y+.016*k,.089*k,.069*k,0,0,Math.PI*2);g.stroke();}
  if(f===2)for(const side of [-1,1])for(let n=0;n<3;n++)blob(side*(.16+n*.04),.13+(n%2)*.025,.012,.012,'#885d41');
  if(f===1)blob(0,.32,.19,.10,hairs[i]);
  blob(offset+.023,.13,.054,.038,'#bf855f');
  blob(offset,.245,.079,.015,'#895842');
}
function avatar(x,z,color,pose=0,forward=false){
  const [px,py,k]=project(x,surface(x,z),z);
  if(z<=camera.z+1.4||px<-200||px>1160) return;
  oval(px+k*.18,py,k*.5,k*.13,'#26372255');
  const look=roster.find(p=>p.color===color)?.look;
  const fetching=color===retriever?.player.color&&['collecting','returning'].includes(phase);
  const stride=fetching?Math.sin(transfer.time*15):forward&&phase==='ready'?Math.min(1,Math.abs(strafeSpeed)/2)*Math.sin(performance.now()*.013):0;
  oval(px-k*(.15+.05*stride),py-k*(.09+.08*Math.max(0,stride)),k*.15,k*.13,'#f4f4e7');
  oval(px+k*.17,py-k*(.09+pose*.08+.08*Math.max(0,-stride)),k*.15,k*.13,'#f4f4e7');
  oval(px,py-k*.3,k*.27,k*.22,'#292f39');
  oval(px,py-k*.63,k*.32,k*.41,look?.shirt||color);
  oval(px-k*.34,py-k*.52,k*.13,k*.13,look?.skin||'#f4c38a');
  const facing=forward?Math.sin(bowlerHeading()):0;
  oval(px+k*(.32+.16*pose+.18*facing),py-k*(.54+.19*pose),k*.13,k*.13,look?.skin||'#f4c38a');
  if(forward){
    oval(px,py-k*1.3,k*.40,k*.46,look?.skin||'#e4ad84');
    const style=look?.style??palette.indexOf(color),hair=look?.hair||['#594032','#342c31','#995529','#302728','#c28d45'][style%5];
    if(style!==1)oval(px-k*.075*facing,py-k*1.38,k*.405,k*(style===2?.50:.415),hair);
    if(style===3)for(const side of [-1,1])oval(px+side*k*.40,py-k*1.39,k*.15,k*.21,hair);
    return;
  }
  face(ctx,px,py-k*1.3,k,Math.max(0,palette.indexOf(color)),true,look);
}
function basketball(){
  const [x,y,k]=project(ball.x,ballFloor(ball)+.28+returnHeight,ball.z);
  const r=k*.28;
  if(ball.z<=camera.z+1||r<1) return;
  const floor=playable(ball.x,ball.z)?surface(ball.x,ball.z):grassHeight(ball.x,ball.z);
  const [sx,sy]=project(ball.x,floor+.02,ball.z);oval(sx,sy,k*.28,k*.095,'#23321f92');
  const fill=ctx.createRadialGradient(x-r*.34,y-r*.43,r*.08,x,y,r);
  fill.addColorStop(0,'#ffc16a');fill.addColorStop(.5,'#ed7d2a');fill.addColorStop(1,'#ad4317');
  oval(x,y,r,r,fill);
  ctx.save();ctx.translate(x,y);ctx.rotate(ball.spin*.34);ctx.strokeStyle='#64331e';ctx.lineWidth=Math.max(.7,r*.08);
  ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.stroke();
  ctx.beginPath();ctx.ellipse(0,0,r*.44,r*.99,0,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function draw(){
  const sky=ctx.createLinearGradient(0,0,0,185);
  sky.addColorStop(0,'#62b6e9');sky.addColorStop(1,'#c4e8f4');
  ctx.fillStyle=sky;ctx.fillRect(0,0,960,540);
  for(const [x,y,s] of [[128,75,1],[464,49,.7],[792,101,1.1]]){
    oval(x,y,51*s,10*s,'#ffffffdb');oval(x+6*s,y-7*s,22*s,13*s,'#ffffffdb');
  }
  poly([[0,166],[0,137],[90,119],[208,143],[330,118],[420,135],[540,121],[680,146],[805,116],[960,142],[960,540],[0,540]],'#7ea765');
  if(backdrop.complete && backdrop.naturalWidth) ctx.drawImage(backdrop,0,0,960,190);
  ctx.fillStyle=classicWaterColor;ctx.fillRect(0,177,960,363);
  const objects=authored()?authored().props.filter(p=>p.type!=='ramp'&&p.z>camera.z+1):scenery.filter(o=>o.z>camera.z+1&&o.z<end+23&&(displayPrefs.forest==='full'||o.layer===0));
  if(record && (!retriever?.guest||['collecting','returning'].includes(phase)) && !(phase==='ready' && queue[0]===record.player)){
    const receiver=receiverPose();
    objects.push({z:receiver.z+.05,draw:()=>{
      const x=record.x+(record.x>=center(record.z)?-.69:.69);
      const p=project(x,surface(x,record.z)+1.95,record.z);
      avatar(receiver.x,receiver.z,receiver.player.color);
      if(retriever?.guest)return;
      if(p[2]>8&&p[2]<190){
        ctx.font='bold 14px system-ui';ctx.textAlign='center';
        const label=meters(record.distance), width=ctx.measureText(label).width+18;
        ctx.fillStyle='#163d2f';ctx.fillRect(p[0]-width/2,p[1]-17,width,22);
        ctx.fillStyle='#fff1c8';ctx.fillText(label,p[0],p[1]-1);
      }
    }});
  }
  if(phase==='celebrating'){const t=teePoint(0);objects.push({z:t.z,draw:()=>avatar(t.x,t.z,replayBowler.color,Math.abs(Math.sin(celebrationTime*7)),false)});}
  if(phase==='ready'||(['rolling','replay'].includes(phase)&&ball.z-settings.start<9)){
    const tee=teePoint(stance-.52,-.55);objects.push({z:tee.z,draw:()=>avatar(tee.x,tee.z,(phase==='replay'?replayBowler:queue[0]).color,phase==='ready'?0:1,true)});
  }
  for(let j=0;j<24;j++){
    const pts=[[j,0],[j+1,0],[j+1,.16],[j,.16]].map(([n,f])=>teePoint(lerp(teeLimits[0],teeLimits[1],n/24),f));
    objects.push({z:pts[0].z,draw:()=>poly(pts.map(q=>project(q.x,surface(q.x,q.z)+.065,q.z)),'#fff3c2')});
  }
  objects.push({z:end,draw:()=>{
    poly([roadPoint(-1,end-.22),roadPoint(1,end-.22),roadPoint(1,end),roadPoint(-1,end)],'#e6f0ac');
    const [x,y,k]=project(center(end),ground(end),end);
    if(k<=0)return;
    const cup=project(center(end),ground(end),end);oval(cup[0],cup[1],cup[2]*7,cup[2]*1.4,'#83bc63');oval(cup[0],cup[1],cup[2]*.78,cup[2]*.25,'#24494a');
    ctx.fillStyle='#f8f5dd';ctx.fillRect(x-k*.06,y-k*4,k*.12,k*4);
    poly([[x,y-k*4],[x+k*1.65,y-k*3.7],[x,y-k*3.15]],'#f84936');
  }});
  objects.push({z:ball.z,draw:basketball});
  objects.sort((a,b)=>b.z-a.z);
  let oi=0;
  for(let n=end+24;n>camera.z+.5;n--){
    const a=Math.max(n-1,camera.z+.5),b=n;
    const far=(x,z)=>project(x,ground(z),z);
    const reach=z=>settings.island?halfWidth(z)+25+7*Math.sin(z/27)+4*Math.sin(z/12):350;
    const left=z=>(settings.island?center(z):0)-reach(z),right=z=>(settings.island?center(z):0)+reach(z);
    if(a<end+(settings.island?34:88)){
      const land=[far(left(a),a),far(right(a),a),far(right(b),b),far(left(b),b)];
      poly(land,groundColors[1]);ctx.save();ctx.clip();turf(n,a,b);ctx.restore();
    }
    lake(a,b);
    if(settings.layout==='bowl'&&b<=bowlZ&&a>=bowlZ-bowlRadius-3){
      for(let i=0;i<12;i++){
        const edge=(z,j)=>{const width=Math.sqrt(Math.max(0,(bowlRadius+3)**2-(z-bowlZ)**2));
          const x=-bowlRadius+width*(j/6-1);return project(x,surface(x,z)+.025,z);};
        poly([edge(a,i),edge(a,i+1),edge(b,i+1),edge(b,i)],wood[i%4]);
      }
    }

    if(a<end&&b>(settings.layout==='bowl'?bowlZ:-8)){
      const wooden=settings.layout==='bowl'&&b<=0;
      const cols=wooden?12:7;
      const shift=wooden?0:(n%2)*.08;
      for(let j=0;j<cols;j++){
        const lo=j===0?-1:-1+2*j/cols+shift;
        const hi=j===cols-1?1:-1+2*(j+1)/cols+shift;
        const outer=Math.abs((lo+hi)/2)>.65;
        const color=wooden?wood[j%4]:stones[(j*3+n*2)%5];
        const p=[roadPoint(lo,a),roadPoint(hi,a),roadPoint(hi,b),roadPoint(lo,b)];
        poly(p,color);
        ctx.strokeStyle=wooden?(outer?'#91542e55':'#93613a55'):'#606c625e';
        ctx.lineWidth=.65;ctx.stroke();
        if(wooden&&b-camera.z<25){
          ctx.strokeStyle='#79462140';ctx.lineWidth=.7;ctx.beginPath();
          const u=lo+(hi-lo)*.32;
          const v=roadPoint(u,a),w=roadPoint(u+.008*Math.sin(b),b);
          ctx.moveTo(...v.slice(0,2));ctx.lineTo(...w.slice(0,2));ctx.stroke();
        }
        if(wooden&&outer) poly(p,'#48240e28');
        if(wooden&&b-camera.z<30&&j%2===0){
          const bolt=roadPoint((lo+hi)/2,b-.16,.017);
          oval(bolt[0],bolt[1],bolt[2]*.024,bolt[2]*.012,'#6c624f');
        }
      }
      if(wooden&&b<16){
        for(const side of [-1,1]){
          const edge=side*.985;
          poly([roadPoint(edge,a,.05),roadPoint(side,a,.05),roadPoint(side,b,.05),roadPoint(edge,b,.05)],'#b3aa93');
        }
      }
    }

    for(const r of sideRamps){
      if(b<=r.start||a>=r.stop)continue;
      const point=(u,z)=>{const x=center(z)+r.side*(halfWidth(z)+rampRadius*Math.sin(u*Math.PI/2));return project(x,surface(x,z)+.03,z);};
      for(let j=0;j<10;j++)poly([point(j/10,a),point((j+1)/10,a),point((j+1)/10,b),point(j/10,b)],wood[j%4]);
    }
    const teeCenter=teePoint(0),radius=teeRadius();
    if(a<teeCenter.z+radius&&b>teeCenter.z-radius){
      const edge=(z,side)=>{z=clamp(z,teeCenter.z-radius,teeCenter.z+radius);const x=teeCenter.x+side*Math.sqrt(Math.max(0,radius*radius-(z-teeCenter.z)**2));return project(x,surface(x,z),z);};
      poly([edge(a,-1),edge(a,1),edge(b,1),edge(b,-1)],'#9bc96c');
    }
    while(oi<objects.length&&objects[oi].z>=a){
      const item=objects[oi++];
      if(item.draw) item.draw();else decorate(item);
    }
  }

}
const clips={splash:new Audio('data:audio/wav;base64,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LwA7ADEAKgAWAPr/7//y/+r/2P/M/8P/xv/O/+L/7f/l/+L/BAAIAOb/BQBGAGMAVABfAHIAZAA1AP//2v/M/6X/bv9+/7z/2P/y/xYAMgBEAFkAXQBFACMACQDq/9r/zP+4/7r/3v/n/9f/8P8XABoADAAPAB8AJAAhAAsAAwAHAP//8v8DABcABwDy//P/AgAfACkALAAzACwAEgADAPj/8f/o/+b/2P/Q/9H/0f/R/+L/4v/i/+j/8P/1//X/+//+/wEAAgAAAAUABAAJAAMA/P8EABcAFgAUABcAIQApACgAKQAuACYAGAAGAPz/9P/d/87/0v/Y/+H/6P/v/wAADQAPABkAIQAYAAEA/P8GAPL/zv/c/+L/5f8AAAkABAADAP//BgAbABwAJQAiABYAGwAYABAABAAAAAAA///1//j/AAAFAAMAAADz//n//P/4/+//5P/m/+z/8P/7/wAAAwABAAYABAD3/+f/7P/z//z/BgAJAAgABgAAAP3/9f/w//3/DwAWABgAFwAbABYADQAHAAEA+v////f/9//1//f/9P/9/wAADAAWABwAGAAPAAIAAwABAAMA/f/5//P/9//t/+n/5P/o/+j/8P/v//n/AgAEAAcAFgAXABIAAQAAAA0ACwAEAAcADAACAO//4v/t//z/7//j//X/CwAGAPz/AQAQAAIA//8WACYAFgAXABwAHgAbABMADwAEAPj/8//u/+7/7v/m/9j/4//k/+//8//1////AwAAAAsAEwAQAAwACQAAAAIA/P/+//f//v8AAAEAAQAHAAYA///1//T/9////wMABgAEAAAA/v///wkADAADAAIABQAPABEAEAAEAP3/+P/4//n//P/8//z//f/8//v/+v/6//z///8FAAQAAAAAAAAAAAACAAQAAwD///z/+f/6//z//P/7/wAAAgADAAYABgACAAEAAAABAAAAAQAAAAIAAwADAAAAAwAEAAMAAAAAAP7//v/+/wAA///+//v//f/9/////v////3///8AAAAAAAABAAAAAQAAAP///v8BAAIABQACAAMAAgACAAAAAgABAAEAAAABAAAAAAD//////v///////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),drop:new Audio('assets/Sample_0001.wav'), stop:new Audio('assets/stop.mp3')};
clips.cheer=new Audio('assets/cheer.mp3');
clips.boo=new Audio('assets/boo.mp3');
clips.aw=new Audio('assets/aw.mp3');
clips.recordVoice=new Audio('assets/recordVoice.mp3');
clips.menuClick=new Audio('assets/menuClick.mp3');
clips.cup=new Audio('assets/in-hole.mp3');clips.nice=new Audio('assets/nice-shot.mp3');
const displayPrefs={mapSize:'compact',forest:'full',quality:'auto',shadows:'on',aimGuide:'on',shotCamera:'off'};
const volume={music:.60,effects:.75,crowd:.65,ambient:.45};
let savedPrefs={};
try{savedPrefs=JSON.parse(localStorage.getItem('mountainBowling.settings'))||{};}catch{}
function savePrefs(){try{localStorage.setItem('mountainBowling.settings',JSON.stringify({...displayPrefs,...volume}));}catch{}}
for(const [key,options] of Object.entries({mapSize:['compact','large','off'],forest:['full','light'],quality:['auto','low','high','ultra'],shadows:['on','off'],aimGuide:['on','off'],shotCamera:['off','on']})){
  if(options.includes(savedPrefs[key]))displayPrefs[key]=savedPrefs[key];
  $(key).value=displayPrefs[key];
  $(key).onchange=()=>{displayPrefs[key]=$(key).value;savePrefs();};
}
for(const key of Object.keys(volume)){
  if(Number.isFinite(savedPrefs[key]))volume[key]=clamp(savedPrefs[key],0,1);
  $(key+'Level').value=Math.round(volume[key]*100);
  $(key+'Percent').textContent=$(key+'Level').value+'%';
}

const voices={};
for(const [cue,prefix] of Object.entries({nice:'NiceShot',stop:'TryAgain',cup:'NiceIn'})){
  voices[cue]={last:-1,clips:[1,2,3].map(i=>new Audio('assets/'+prefix+i+'.wav'))};
}
const ambience=new Audio('assets/meadow.mp3'), rollingAudio=new Audio('assets/Sample_0007.wav');
ambience.loop=rollingAudio.loop=true;
let ambientOn=false,rollingOn=false;
function updateCourseAudio(){
  const active=(!$('options').open||roomLive)&&!document.hidden&&!$('intro').open&&phase!=='over'&&!catchingUp;
  ambience.volume=volume.ambient*.72;
  const outdoors=active&&volume.ambient>0;
  if(outdoors!==ambientOn){ambientOn=outdoors;if(outdoors)ambience.play().catch(()=>{});else ambience.pause();}
  const moving=Boolean(active&&volume.effects>0&&!ball.airborne&&(phase==='rolling'||reel));
  const speed=Math.hypot(ball.vx,ball.vz);
  rollingAudio.volume=volume.effects*Math.min(.62,.15+speed*.023);
  rollingAudio.playbackRate=clamp(.74+speed*.024,.75,1.5);
  if(moving!==rollingOn){rollingOn=moving;if(moving){rollingAudio.currentTime=0;rollingAudio.play().catch(()=>{});}else rollingAudio.pause();}
}
document.addEventListener('visibilitychange',updateCourseAudio);
function sound(name,withVoice=true){if(catchingUp)return;let audio=clips[name];
  if(withVoice&&voices[name]){
    if(name==='nice'||name==='cup'){audio.volume=.24*volume.effects;audio.currentTime=0;audio.play().catch(()=>{});}
    const pool=voices[name],n=pool.clips.length;
    const index=pool.last<0?Math.floor(Math.random()*n):(pool.last+1+Math.floor(Math.random()*(n-1)))%n;
    pool.last=index;audio=pool.clips[index];
  }
  audio.volume=.65*(['boo','aw','cheer'].includes(name)?volume.crowd:volume.effects);audio.currentTime=0;audio.play().catch(()=>{});}
function editedLook(){return {skin:$('skinTint').value,hair:$('hairTint').value,shirt:$('shirtTint').value,style:$('hairStyle').selectedIndex,face:$('faceStyle').selectedIndex};}
function previewLook(){
  const g=$('portrait').getContext('2d'),a=editedLook();g.clearRect(0,0,260,165);g.fillStyle=a.shirt;g.beginPath();g.ellipse(130,170,43,55,0,0,Math.PI*2);g.fill();face(g,130,78,102,0,false,a);
}
$('customize').onclick=()=>{
  $('skinTint').value=myLook.skin;$('hairTint').value=myLook.hair;$('shirtTint').value=myLook.shirt;
  $('hairStyle').selectedIndex=myLook.style;$('faceStyle').selectedIndex=myLook.face;previewLook();$('character').showModal();
};
$('characterForm').oninput=previewLook;
$('characterForm').onsubmit=e=>{e.preventDefault();myLook=editedLook();try{localStorage.setItem('mountainBowling.character',JSON.stringify(myLook));}catch{}$('character').close();};
const titleMusic=new Audio('assets/titleMusic.mp3');
titleMusic.autoplay=true;titleMusic.loop=true;titleMusic.volume=volume.music*.6;
titleMusic.onplaying=()=>{if(!$('intro').open)titleMusic.pause();};
let musicEnabled=true;
const highlightMusic=new Audio('assets/highlights.mp3');
highlightMusic.loop=true;
function stopHighlightMusic(){highlightMusic.pause();highlightMusic.currentTime=0;}
function syncHighlightMusic(){
  highlightMusic.volume=volume.music*.6;
  if(reel&&musicEnabled&&volume.music>0&&!document.hidden)highlightMusic.play().catch(()=>{});
  else highlightMusic.pause();
}
document.addEventListener('visibilitychange',syncHighlightMusic);
function playTitle(){
  if(!musicEnabled||!$('intro').open||!titleMusic.paused)return;
  titleMusic.play().then(()=>{$('enableMusic').hidden=true;}).catch(error=>{
    if(error.name==='NotAllowedError'&&$('intro').open&&volume.music>0)$('enableMusic').hidden=false;
  });
}
$('enableMusic').onclick=playTitle;
document.addEventListener('pointerdown',playTitle);
document.addEventListener('keydown',playTitle);
document.addEventListener('click',event=>{if(event.target.closest?.('button'))sound('menuClick');});
$('soundSettings').onclick=()=>$('soundPanel').showModal();
for(const key of Object.keys(volume)){
  const slider=$(key+'Level');
  slider.oninput=()=>{
    volume[key]=Number(slider.value)/100;savePrefs();$(key+'Percent').textContent=slider.value+'%';
    titleMusic.volume=volume.music*.6;presentation.volume=titleMusic.volume;if(reel)syncHighlightMusic();
  };
  if(key==='crowd'||key==='effects')slider.onchange=()=>sound(key==='crowd'?'cheer':'menuClick');
}
function homeInfo(){
  $('homeInfo').textContent='Play singleplayer';
}
function home(){
  homeInfo();

  $('intro').showModal();playTitle();
}
$('intro').oncancel=e=>e.preventDefault();
$('courseDialog').addEventListener('close',()=>{if($('intro').open){homeInfo();}});
$('playerDialog').addEventListener('close',()=>{if($('intro').open)homeInfo();});
$('soloCard').onclick=()=>{roster=[{name:profiles[0]?.name?.trim()||'Player 1',color:palette[0],look:myLook}];queue=roster.slice();record=null;wizard=true;$('edit').click();};
$('play').onclick=()=>{wizard=true;$('players').click();};
function rerollCourse(){
  if(openingCourse!==9)return;
  generateCourses(mapIndex,mapIndex+1);
  selectedCourse=9+mapIndex;const [,layout,shape,width]=courses[selectedCourse];
  settings={layout,shape,width,start:0};highlights.delete(mapIndex);queue=roster.slice();previewKey='';
  $('skipReplay').hidden=true;if($('options').open)$('options').close();
  beginMap();startFlyover();
}
$('reroll').onclick=async()=>{
  if(!roomLive){rerollCourse();return;}
  try{await roomCall('reroll',{match:roomMatch,seq:seenShots});}catch(e){roomError(e);}
};
function startTournament(){titleMusic.pause();titleMusic.currentTime=0;queue=roster.slice();resetMatch();$('intro').close();startFlyover();const view=$('scene').parentElement;view.classList.remove('reveal');void view.offsetWidth;view.classList.add('reveal');};
$('leave').onclick=()=>{
  $('options').close();if(verificationRun){finishVerification();return;}if(roomLive){leaveNetwork();return;}
  presentation.pause();$('skipReplay').hidden=$('skipIntro').hidden=true;queue=roster.slice();resetMatch();home();
};
$('menu').onclick=()=>{
  heldDirections.clear();cameraKeys.clear();cameraDragX=null;strafeSpeed=0;
  $('leave').textContent=verificationRun?'Back to editor':'Main Menu';
  $('standings').textContent=roomLive?'Online match · '+(roomSession.seat===0?'Host':'Guest'):'Round '+round+' of 5 · '+courses[selectedCourse][0];
  $('reroll').hidden=openingCourse!==9;
  $('reroll').disabled=roomLive&&(roomSession.seat!==0||phase!=='ready');
  $('restart').disabled=roomLive&&roomSession.seat!==0;
  if(!roomLive)presentation.pause();
  $('options').showModal();
};
$('options').addEventListener('close',()=>{if(!roomLive&&phase==='presentation'&&!$('intro').open&&musicEnabled)presentation.play().catch(()=>{});});
$('restart').onclick=async()=>{
  if(roomLive){try{await roomCall('restart',{match:roomMatch});}catch(e){roomError(e);}return;}
  $('options').close();$('skipReplay').hidden=true;startTournament();
};
$('again').onclick=()=>{if(roomLive){leaveNetwork();return;}$('results').close();if(verificationRun){finishVerification();return;}queue=roster.slice();resetMatch();home();};
let touch=null;
$('scene').onpointerdown=e=>{if(canPan()){cameraDragX=e.clientX;$('scene').setPointerCapture(e.pointerId);return;}if(phase==='ready'&&canBowl()){touch=[e.clientX,e.clientY,+$('aim').value,+$('power').value];$('scene').setPointerCapture(e.pointerId);}};
$('scene').onpointermove=e=>{if(cameraDragX!==null&&canPan()){panBy((e.clientX-cameraDragX)*15/Math.max(1,$('scene').clientWidth));cameraDragX=e.clientX;return;}if(!touch)return;$('aim').value=touch[2]+(e.clientX-touch[0])/5;$('power').value=touch[3]+(touch[1]-e.clientY)/2;updateMeters();};
$('scene').onpointerup=e=>{cameraDragX=null;if(e.pointerType!=='touch'&&phase==='ready'&&touch&&Math.hypot(e.clientX-touch[0],e.clientY-touch[1])<5)roll();touch=null;};
$('scene').onpointercancel=()=>{touch=null;cameraDragX=null;};
$('results').oncancel=e=>e.preventDefault();
resetMatch();home();
let render3D;
try{render3D=createCourseView($('world'));$('world').hidden=!render3D;}catch(error){console.warn('Using classic course view',error);}
$('world').addEventListener('webglcontextlost',()=>{render3D=null;$('world').hidden=true;});
let last=performance.now(),accumulator=0;
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(roomLive||!$('options').open)accumulator+=dt;while(accumulator>=tick){step(tick);accumulator-=tick;}
  updateCourseAudio();
  if($('intro').open||$('options').open||$('results').open){
    requestAnimationFrame(frame);return;
  }
  if(canPan()){
    const right=cameraKeys.has('ArrowRight')||cameraKeys.has('KeyD');
    const left=cameraKeys.has('ArrowLeft')||cameraKeys.has('KeyA');
    panBy((Number(right)-Number(left))*9*dt);
  }else resetPan();
  if(phase!=='replay')drawCourseMap();
  const follow=phase==='presentation'?flyZ():phase==='ready'?settings.start:ball.z;
  camera.z=follow-10;
  camera.x=lerp(center(follow),ball.x,.42)+(canPan()?cameraOffset:0);
  camera.y=ground(follow)+7.4;
  if(phase==='presentation'){camera.x=center(follow);camera.y=ground(follow)+7;}
  if(phase==='replay'){const side=replayTime<1.7?-1:1;camera.x=ball.x+side*3+(canPan()?cameraOffset:0);camera.y=ballFloor(ball)+(replayTime<1.7?4.5:7);}
  if(phase==='celebrating'){const t=teePoint(0);camera.x=t.x;camera.z=t.z-4;camera.y=ground(t.z)+2;}
  if(render3D)render3D(dt);else{
    const aim=phase==='ready'?Number($('aim').value)*Math.PI/180:0;
    camera.yaw=lerp(camera.yaw||0,aim,1-Math.exp(-dt*8));
    if(phase==='ready'){camera.x=ball.x-10*Math.sin(camera.yaw);camera.z=ball.z-10*Math.cos(camera.yaw);}
    camera.y=Math.max(camera.y,grassHeight(camera.x,camera.z)+1.3,surface(camera.x,camera.z)+1.3);
    drawWindModel(phase==='ready'?bowlerHeading():0);draw();const {x,z}=teePoint(stance-.52,-.55);
    const at=project(x,surface(x,z)+.04,z);placeArrow(at[0]/9.6,at[1]/5.4);
  }
  const label=meters(distance);if($('distance').textContent!==label) $('distance').textContent=label;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setupRooms();
