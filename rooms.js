// Each browser plays the same physics ticks from the room's accepted throw log.
let roomSession=null, roomLive=false, seenShots=0, roomTurn=-1, sending=false, catchingUp=false;
let seedState=null,roomMatch=0;
function gameRandom(){
  if(seedState===null)return Math.random();
  seedState=(Math.imul(seedState,1664525)+1013904223)>>>0;
  return seedState/4294967296;
}
let votedClip=false,clipVotes=0;
function skipId(){
  if(phase==='presentation')return [roomMatch,mapIndex,settings.variant].join('-');
  if(phase==='replay'&&!reel)return 'replay-'+roomMatch+'-'+seenShots;
  return '';
}
function skipButton(){return $(phase==='presentation'?'skipIntro':'skipReplay');}
function resetSkipButton(){
  const button=skipButton();votedClip=false;clipVotes=0;button.disabled=false;
  button.textContent=roomLive?'Vote to skip · 0/'+(Math.floor(roster.length/2)+1):
    phase==='presentation'?'Skip flyover':'Skip replay';
}
function showSkipVote(result){
  if(!roomLive||!result.flyover||result.flyover!==skipId())return;
  votedClip=votedClip||result.voted;
  clipVotes=Math.max(clipVotes,result.skipVotes);
  const button=skipButton();button.disabled=votedClip;
  button.textContent=(votedClip?'Voted':'Vote to skip')+' · '+clipVotes+'/'+result.needed;
  if(clipVotes>=result.needed){
    if(phase==='presentation')finishFlyover();else endReplay();
  }
}
async function voteSkip(){
  const id=skipId();
  if(!id||votedClip)return;
  votedClip=true;skipButton().disabled=true;
  try{showSkipVote(await roomCall('skip',{match:roomMatch,flyover:id}));}
  catch(e){if(id===skipId()){votedClip=false;skipButton().disabled=false;roomError(e);}}
}
function canBowl(){return !roomLive || (!sending && roomTurn===roomSession.seat && queue[0]===roster[roomSession.seat]);}
async function roomCall(action,fields={}){
  const response=await fetch('/room/'+action,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...roomSession,...fields}),signal:typeof AbortSignal.timeout==='function'?AbortSignal.timeout(8000):undefined});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Open the game from the Python host address. This page has no room server.');
  const result=await response.json();
  if(!response.ok)throw Error(result.error);
  return result;
}
function roomNotice(text){document.getElementById('netStatus').textContent=text;}
function roomError(error){roomNotice(error.message);if(roomLive)$('live').textContent='Connection · '+error.message;}
async function enterRoom(action){
  if(roomSession)return;
  let code=$('roomCode').value.trim();
  if(action==='join'&&/^https?:/i.test(code)){
    try{
      const url=new URL(code),invite=url.searchParams.get('room')||'';
      if(!/^[0-9a-f]{6}$/i.test(invite)||url.username||url.password)throw Error();
      if(location.origin!==url.origin){
        const target=new URL('/',url.origin);target.searchParams.set('room',invite);target.searchParams.set('name',$('netName').value.trim());
        location.assign(target.href);return;
      }
      code=invite;
    }catch{roomNotice('Paste the full invite link from the host.');return;}
  }
  try{
    $('createRoom').disabled=$('joinRoom').disabled=true;
    roomSession=await roomCall(action,{look:JSON.stringify(myLook),code:code.toUpperCase(),name:$('netName').value.trim()});
    try{sessionStorage.setItem('mountainRoom',JSON.stringify(roomSession));}catch{}
    pollRoom();
  }catch(error){roomError(error);}
  finally{$('createRoom').disabled=!!roomSession||location.protocol==='file:';$('joinRoom').disabled=!!roomSession;}
}
async function submitShot(){
  if(!canBowl())return;
  sending=true;
  try{await roomCall('roll',{match:roomMatch,seq:seenShots,stance,curve,aim:+$('aim').value,power:+$('power').value});}
  catch(error){roomError(error);}
  finally{sending=false;}
}
function enterMatch(state){
  seedState=state.seed;
  roster=state.players.map((name,i)=>({name,color:palette[i],look:parseLook(state.looks?.[i])}));
  openingCourse=state.tier===5?-1:state.tier*3;
  if(state.tier===4){
    const pack=readPack(JSON.parse(state.pack));installLevels(pack.name,pack.levels);openingCourse=12;
  }
  const [,layout,shape,width]=courses[Math.max(0,openingCourse)];
  firstSettings={layout,shape,width,start:0};
  roomLive=true;$('netDialog').close();startTournament();
}
function replayInput(shot){
  if(shot.type==='reroll'){seedState=shot.seed;rerollCourse();seenShots++;roomTurn=-1;return;}
  stance=shot.stance;curve=shot.curve;Object.assign(ball,teePoint(stance));
  $('aim').value=shot.aim;$('power').value=shot.power;
  seedState=shot.seed;releaseBall();seenShots++;roomTurn=-1;
}
async function pollRoom(){
  if(!roomSession)return;
  try{
    const state=await roomCall('poll',{needPack:!roomLive,match:roomMatch,seq:seenShots,flyover:roomLive?skipId():'',ready:roomLive&&phase==='ready'?roster.indexOf(queue[0]):-1});
    roomSession.seat=state.seat;
    if(!state.started){
      $('netEntry').hidden=true;$('netLobby').hidden=false;
      $('netRoster').textContent=state.players.join(' · ');$('netCode').textContent=roomSession.code;
      $('hostStart').hidden=$('netTier').hidden=roomSession.seat!==0;
      $('hostStart').disabled=state.players.length<2;
      $('inviteLink').value=new URL(roomSession.invite||'/?room='+roomSession.code,location.origin).href;
      roomNotice('Friends can open this invite link and enter their name.');
    }else{
      if(roomLive && roomMatch!==state.match){
        for(const id of ['options','results'])if($(id).open)$(id).close();
        $('skipReplay').hidden=true;seenShots=0;roomTurn=-1;roomLive=false;
      }
      roomMatch=state.match;
      if(!roomLive){catchingUp=state.events.length>0;enterMatch(state);}
      if(catchingUp){
        for(const shot of state.events){
          if(phase==='presentation')finishFlyover();
          replayInput(shot);
          for(let i=0;i<150000 && !['ready','over','presentation'].includes(phase);i++)step(tick);
        }
        catchingUp=false;
      }else if(state.events.length && phase==='ready')replayInput(state.events[0]);
      showSkipVote(state);
      roomTurn=state.seq===seenShots?state.turn:-1;
      if(phase==='ready'){
        $('playView').dataset.ready=String(canBowl());
        $('live').textContent=queue[0]===roster[roomSession.seat]?(canBowl()?'Your turn':'Waiting for the other screens…'):queue[0].name+' to roll';
      }
    }
  }catch(error){
    roomError(error);
    if(error.message.startsWith('Session expired')){
      sessionStorage.removeItem('mountainRoom');roomSession=null;
      if(roomLive){location.reload();return;}
      $('netLobby').hidden=true;$('netEntry').hidden=false;
      $('createRoom').disabled=$('joinRoom').disabled=false;
    }
  }
  if(roomSession)setTimeout(pollRoom,300);
}
async function leaveNetwork(){
  // Finished players may leave while other screens are still showing the last replay.
  if(roomSession && phase!=='over'){try{await roomCall('leave');}catch{}}
  sessionStorage.removeItem('mountainRoom');roomSession=null;location.reload();
}
function setupRooms(){
  if(new URLSearchParams(location.search).has('desktop')){
    setInterval(()=>fetch('/desktop-alive',{cache:'no-store'}).catch(()=>{}),30000);
  }
  $('multiplayer').onclick=()=>{
    refreshNetPacks();$('netDialog').showModal();$('netEntry').hidden=false;
    $('createRoom').disabled=location.protocol==='file:';
    roomNotice(location.protocol==='file:'?'Open Mountain-Bowling.exe to host, or paste a friend’s invite to join.':'Create a room, or paste a friend’s invite to join.');

  };
  $('copyInvite').onclick=async()=>{
    const input=$('inviteLink');input.select();
    try{await navigator.clipboard.writeText(input.value);roomNotice('Invite copied. Send it to the other players.');}
    catch{roomNotice('Invite selected. Press Ctrl+C to copy it.');}
  };
  $('createRoom').onclick=()=>enterRoom('create');$('joinRoom').onclick=()=>enterRoom('join');
  $('hostStart').onclick=async()=>{try{const n=+$('netTier').value;await roomCall('start',n<=4?{tier:n===4?5:n}:{tier:4,pack:JSON.stringify(creatorShelf.packs[n-5])});}catch(error){roomError(error);}};
  $('netBack').onclick=()=>roomSession?leaveNetwork():$('netDialog').close();
  $('netDialog').oncancel=e=>{if(roomSession)e.preventDefault();};
  if(location.protocol!=='file:'){
    try{roomSession=JSON.parse(sessionStorage.getItem('mountainRoom'));}catch{}
    const link=new URLSearchParams(location.search);
    if(link.has('room') && roomSession?.code!==link.get('room').toUpperCase())roomSession=null;
    if(roomSession){$('netDialog').showModal();$('netEntry').hidden=true;pollRoom();}
    else if(link.has('room')||link.has('multiplayer')){
      $('netDialog').showModal();$('roomCode').value=link.get('room')||'';
      if(link.get('name'))$('netName').value=link.get('name').slice(0,22);
      roomNotice('Enter your name and select Join room.');
    }
  }
}
