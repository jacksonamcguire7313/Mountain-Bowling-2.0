// The build camera is independent of the bowler and can move above and around the route.
function buildEditorView(canvas){
  const T=window.THREE,renderer=new T.WebGLRenderer({canvas,antialias:true});
  renderer.setSize(960,600,false);
  const scene=new T.Scene(),lens=new T.PerspectiveCamera(57,1.6,.1,900),ray=new T.Raycaster();
  scene.background=new T.Color(0xaadcf2);scene.fog=new T.FogExp2(0xaadcf2,.0024);
  scene.add(new T.HemisphereLight(0xf8ffff,0xa8cb85,1.8));
  const sun=new T.DirectionalLight(0xffedca,1.8);sun.position.set(-60,110,40);scene.add(sun);
  const materials=new Map(),heading={yaw:0,pitch:-.55};
  const rockTexture=new T.TextureLoader().load(localTextures['stone.webp']);rockTexture.colorSpace=T.SRGBColorSpace;
  let model=null,terrainMesh=null,level,position={x:0,z:-20,h:24};
  function mesh(geo,color){
    if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color:color===0x84958d?0xffffff:color,map:color===0x84958d?rockTexture:null,side:T.DoubleSide,roughness:1}));
    const obj=new T.Mesh(geo,materials.get(color));model.add(obj);return obj;
  }
  function strip(rows,cols,vertex,color){
    const xyz=[],indices=[];
    for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
      xyz.push(...vertex(i,j));
      if(i&&j){const b=i*(cols+1)+j,a=b-cols-1;indices.push(a-1,a,b,a-1,b,b-1);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,color);
  }
  function rebuild(l,selected){
    if(model){scene.remove(model);model.traverse(m=>{m.geometry?.dispose();if(m.isBoxHelper||m.type==='BoxHelper')m.material.dispose();});}
    level=l;model=new T.Group();scene.add(model);
    const height=z=>levelHeight(l.terrain,z);
    terrainMesh=strip(272,1,(i,j)=>{const z=i*2-70;return [j*600-300,height(z)-.12,-z];},0x79ad5f);
    const last=l.points.at(-1).z;
    if(last)strip(last,1,(z,j)=>[pathX(l.points,z)+(j-.5)*customWidth,height(z)+.015,-z],0xbbb598);
    for(const p of l.props){
      const first=model.children.length;
      const obj=(geo,color,y)=>{const o=mesh(geo,color);o.position.set(p.x,height(p.z)+y,-p.z);return o;};
      if(p.type==='tree'){obj(new T.CylinderGeometry(.33,.46,2.7,7),0x946840,1.25);obj(new T.IcosahedronGeometry(2.15,1),0x387d4b,3.5).scale.y=1.2;}
      else if(p.type==='rock')obj(new T.DodecahedronGeometry(1.15),0x84958d,.43).scale.set(1.35,.74,1);
      else{
        const side=Math.sign(p.x-pathX(l.points,p.z)),r={start:p.z-5,stop:p.z+5};
        strip(10,10,(i,j)=>{const z=r.start+i,d=j*rampRadius/10;return [pathX(l.points,z)+side*(customWidth/2+d),height(z)+rampRise(r,z,d)+.03,-z];},0xc7894a);
      }
      for(const obj of model.children.slice(first)){
        obj.userData.prop=p;
        if(p===selected){const helper=new T.BoxHelper(obj,0xffd13b);model.add(helper);}
      }
    }
    if(l.finish){
      const x=pathX(l.points,last),y=height(last);
      mesh(new T.CylinderGeometry(.1,.1,4,8),0xeae9da).position.set(x,y+2,-last);
      const flag=new T.BufferGeometry();flag.setAttribute('position',new T.Float32BufferAttribute([0,0,0,2,-.45,0,0,-1,0],3));flag.computeVertexNormals();
      mesh(flag,0xe65044).position.set(x,y+4,-last);
    }
    draw();
  }
  function draw(){
    if(!level)return;
    lens.position.set(position.x,levelHeight(level.terrain,position.z)+position.h,-position.z);
    const c=Math.cos(heading.pitch);lens.lookAt(lens.position.x+c*Math.sin(heading.yaw),lens.position.y+Math.sin(heading.pitch),lens.position.z-c*Math.cos(heading.yaw));
    renderer.render(scene,lens);
  }
  function move(keys,dt){
    const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    const c=Math.cos(heading.yaw),s=Math.sin(heading.yaw),speed=35*dt;
    position.x=clamp(position.x+(s*forward+c*side)*speed,-235,235);
    position.z=clamp(position.z+(c*forward-s*side)*speed,-50,445);
    position.h=clamp(position.h+(Number(keys.has('KeyE'))-Number(keys.has('KeyQ')))*speed,2,120);draw();
  }
  function look(dx,dy){heading.yaw+=dx*.005;heading.pitch=clamp(heading.pitch-dy*.005,-1.53,1.15);draw();}
  function pick(x,y){
    ray.setFromCamera(new T.Vector2(x,y),lens);
    const groundHit=ray.intersectObject(terrainMesh)[0];if(!groundHit)return null;
    const hit=ray.intersectObjects(model.children.filter(o=>o.userData.prop),false)[0];
    const p=groundHit.point;
    return {x:Math.round(p.x),z:Math.round(-p.z),object:hit&&hit.distance<=groundHit.distance+.01?hit.object.userData.prop:null};
  }
  return {rebuild,move,look,pick};
}
