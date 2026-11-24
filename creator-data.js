// Course geometry is shared by the editor, rolling physics, minimap and renderer.
const customWidth=18, customSlots=[];
let selectedPackName='', verificationRun=null;
function authored(){return customSlots[selectedCourse-12];}
function pathX(points,z){
  if(z<=0)return 0;
  const i=points.findIndex(p=>p.z>=z);
  if(i<0)return points.at(-1).x;
  const a=points[i-1],b=points[i],h=b.z-a.z,t=(z-a.z)/h;
  const before=points[Math.max(0,i-2)],after=points[Math.min(points.length-1,i+1)];
  const m=(b.x-before.x)/(b.z-before.z),n=(after.x-a.x)/(after.z-a.z);
  return lerp(a.x,b.x,smooth(t))+h*t*(1-t)*((1-t)*m-t*n);
}
function levelHeight(type,z){
  if(type==='flat')return 0;
  return type==='hilly'?-.065*z+1.15*Math.sin(z/17):-.22*z+3.6*Math.sin(z/15);
}
function installLevels(name,levels){
  selectedPackName=name;customSlots.splice(0,customSlots.length,...levels);
  levels.forEach((level,i)=>{courses[12+i]=[level.name,'custom','curve',customWidth,1];courseLengths[12+i]=level.points.at(-1).z;});
}
function levelSignature(l){
  const s=JSON.stringify([l.terrain,l.points.map(p=>[p.x,p.z]),l.finish,l.props.map(p=>[p.type,p.x,p.z])]);
  let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);
  return h>>>0;
}
function cleanLevel(raw){
  const bad=()=>{throw Error('This file contains an invalid level.');};
  if(!raw||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>40||!['flat','hilly','extreme'].includes(raw.terrain)||!Array.isArray(raw.points)||!raw.points.length||raw.points.length>60||!Array.isArray(raw.props)||raw.props.length>180)bad();
  const points=raw.points.map(({x,z},i)=>{
    if(!Number.isInteger(x)||!Number.isInteger(z)||Math.abs(x)>160||z>400||(i===0?(x!==0||z!==0):z<raw.points[i-1].z+4))bad();
    return {x,z};
  });
  if(typeof raw.finish!=='boolean'||(raw.finish&&points.at(-1).z<32))bad();
  const props=raw.props.map(({type,x,z})=>{
    if(!['tree','rock','ramp'].includes(type)||!Number.isFinite(x)||Math.abs(x)>220||!Number.isInteger(z)||z<0||z>400)bad();
    if(type==='ramp'&&(z<5||z>points.at(-1).z-5||Math.abs(Math.abs(x-pathX(points,z))-customWidth/2)>.001))bad();
    return {type,x,z};
  });
  const level={name:raw.name.trim(),terrain:raw.terrain,points,props,finish:raw.finish,proof:null};
  if(raw.proof&&level.finish&&raw.proof.signature===levelSignature(level)&&checkProof(level,raw.proof))level.proof={...raw.proof};
  return level;
}
function checkProof(level,proof){
  const {x,vx,vz,wind:w,curve:c}=proof;
  if(![x,vx,vz,w,c].every(Number.isFinite)||Math.abs(x)>customWidth/2||Math.hypot(vx,vz)>(proof.physics===4?25.1:23.3)||vz<=0||Math.abs(w)>.65||Math.abs(c)>12)return false;
  if((proof.physics===3||proof.physics===4)&&(!Number.isFinite(proof.windZ)||Math.hypot(w,proof.windZ)>.65))return false;
  const saved={selectedCourse,settings,end,curve,sideRamps,teeAngle,teeLimits};
  const slot=customSlots.length;
  try{
    customSlots.push(level);selectedCourse=12+slot;settings={layout:'custom',shape:'curve',width:customWidth,start:0};
    end=level.points.at(-1).z;curve=c;buildSideRamps();
    const b={x,z:0,vx,vz,spin:0};
    for(let i=0;i<48000;i++){const result=integrate(b,tick,w,(proof.physics||1)<2,(proof.physics===3||proof.physics===4)?proof.windZ:0,(proof.physics!==3&&proof.physics!==4));if(result)return result==='Reached the end';}
    return false;
  }finally{
    customSlots.pop();({selectedCourse,settings,end,curve,sideRamps,teeAngle,teeLimits}=saved);
  }
}
