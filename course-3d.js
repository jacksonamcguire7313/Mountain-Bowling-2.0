// World coordinates use meters. Course progress maps to negative world Z.
function createCourseView(canvas) {
  const T = window.THREE;
  if (!T) return null;
  const renderer = new T.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setSize(960,540,false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene3 = new T.Scene();
  scene3.fog = new T.FogExp2(0xb9e4f6,.00165);
  const lens = new T.PerspectiveCamera(54,16/9,.08,950);
  const light = new T.DirectionalLight(0xffefc8,2.2);
  light.castShadow=true;
  Object.assign(light.shadow.camera,{left:-19,right:19,top:22,bottom:-22,far:65});
  light.shadow.mapSize.set(1024,1024);
  light.shadow.bias=-.0006;
  scene3.add(light, light.target,new T.HemisphereLight(0xe4f6ff,0x8c9966,1.9));
  const material=color=>new T.MeshStandardMaterial({color,roughness:.78});
  // Add a soft, sky-colored rim to curved sports equipment and characters.
  function rim(mat){
    mat.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
        'outgoingLight += vec3(0.10,0.14,0.17)*pow(1.0-max(dot(normal,normalize(vViewPosition)),0.0),3.0);\n#include <opaque_fragment>');
    };
    return mat;
  }
  const sphere=new T.SphereGeometry(1,24,16);
  const solid=(parent,geo,mat,x,y,z)=>{
    const mesh=new T.Mesh(geo,mat); mesh.position.set(x,y,-z);
    mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  function ellipsoid(group,mat,x,y,z,w,h,d){
    const m=solid(group,sphere,mat,x,y,z);m.scale.set(w,h,d);return m;
  }
  const orange=material(0xffffff);
  orange.map=new T.TextureLoader().load(localTextures['basketball.webp']);
  orange.map.colorSpace=T.SRGBColorSpace;orange.roughness=.95;
  const ballMesh=solid(scene3,sphere,orange,0,0,0);
  ballMesh.scale.setScalar(.28);
  const stamp=document.createElement('canvas');stamp.width=stamp.height=64;
  const brush=stamp.getContext('2d'),grad=brush.createRadialGradient(32,32,0,32,32,32);
  grad.addColorStop(0,'rgba(28,30,24,.76)');grad.addColorStop(.45,'rgba(28,30,24,.5)');grad.addColorStop(1,'rgba(28,30,24,0)');
  brush.fillStyle=grad;brush.fillRect(0,0,64,64);
  const contact=new T.Mesh(new T.PlaneGeometry(.82,.82),new T.MeshBasicMaterial({map:new T.CanvasTexture(stamp),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
  scene3.add(contact);const stampAxis=new T.Vector3(0,0,1),normal=new T.Vector3();

  const rubber=material(0x39271e);
  function importedGeometry(data){
    const geo=new T.BufferGeometry();
    geo.setIndex(data.idx);
    geo.setAttribute('position',new T.Float32BufferAttribute(data.pos,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));
    geo.computeVertexNormals();
    if(data.morph){
      geo.morphTargetsRelative=true;
      geo.morphAttributes.position=data.morph.map(offset=>new T.Float32BufferAttribute(offset,3));
      let start=0;
      data.counts.forEach((count,materialIndex)=>{if(count)geo.addGroup(start,count,materialIndex);start+=count;});
    }
    return geo;
  }
  function importedTexture(key){
    const tex=new T.TextureLoader().load(resortTextures[key]);
    tex.colorSpace=T.SRGBColorSpace;
    return tex;
  }
  const bodyGeometries=resortModels.golf.map(importedGeometry);
  const shirtTexture=importedTexture('shirt');
  shirtTexture.wrapS=shirtTexture.wrapT=T.MirroredRepeatWrapping;
  function makeAvatar(color,i,a){
    const g=new T.Group();scene3.add(g);
    const skin=material(a?.skin||[0xefbe91,0xb88057,0xe5ab79,0x975f45,0xf8cba4,0xc18c65,0xeaba92,0xce946d][i]);
    const hair=material(a?.hair||[0x594032,0x342c31,0x995529,0x302728,0xc28d45,0x423434,0x754333,0x362e2c][i]);
    const shirt=rim(material(a?.shirt||color));shirt.map=shirtTexture;
    const trousers=material(0x566377);trousers.map=shirtTexture;
    g.userData.body=bodyGeometries.map(geometry=>{
      const mesh=solid(g,geometry,[shirt,trousers,skin],0,0,0);
      mesh.scale.set(1.22,1,1.12);return mesh;
    });
    const style=a?.style??i%5,facial=a?.face??[0,1,2,0,3][i%5],ink=material(0x28222a);
    const skinWidth=[.40,.37,.41,.41,.38][style];
    ellipsoid(g,skin,0,1.41,0,skinWidth,.48,.36);
    // Keep each hairstyle legible from the bowling camera behind the player.
    if(style!==1){
      ellipsoid(g,hair,0,1.63,-.066,.411,.30,.363);
      ellipsoid(g,hair,0,1.46,-.19,.377,style===2?.43:.28,.21);
      for(const side of [-1,1]){
        const lock=ellipsoid(g,hair,side*.33,1.53,.07,.085,style===2?.30:.15,.16);
        lock.rotation.z=side*.15;
        if(style===3)ellipsoid(g,hair,side*.42,1.48,-.10,.165,.23,.17);
      }
      for(let n=0;n<4;n++){
        const x=(n-1.5)*.15;
        const fringe=ellipsoid(g,hair,x,1.71-Math.abs(x)*.11,.214+(.23-Math.abs(x))*.25,.108,.15,.084);
        fringe.rotation.z=style===2?Math.sign(x)*-.56:-.48;
        if(style===4){const spike=solid(g,new T.ConeGeometry(.115,.30,6),hair,x,1.90-Math.abs(x)*.42,0);spike.rotation.z=-.22;}
      }
    }
    for(const side of [-1,1]){
      ellipsoid(g,skin,side*skinWidth,1.40,0,.067,.10,.066);
      const ex=side*.146;
      ellipsoid(g,ink,ex,1.45,.335,.034,.045,.025);
      const brow=ellipsoid(g,hair,ex,1.555,.317,.10,facial===1?.030:.020,.027);
      brow.rotation.z=side*[.15,.24,-.11,.20,.28][style];
      if(facial===3){
        const lens=solid(g,new T.TorusGeometry(.099,.012,6,28),material(0x263757),ex,1.45,.383);
        lens.scale.set(1.13,.83,1);
      }
      if(facial===2||facial===3)for(let n=0;n<3;n++)ellipsoid(g,rubber,side*(.193+n*.034),1.36+(n%2)*.024,.312-n*.018,.009,.009,.009);
      if(facial===1)ellipsoid(g,hair,side*.073,1.235,.325,.076,.029,.022).rotation.z=side*.29;
    }
    if(facial===3)ellipsoid(g,ink,0,1.452,.38,.037,.011,.012);
    if(facial===1)ellipsoid(g,hair,0,1.06,.235,.135,.07,.053);
    ellipsoid(g,skin,0,1.35,.361,.061,.082,.081);
    const smile=new T.QuadraticBezierCurve3(new T.Vector3(-.102,1.219,-.326),new T.Vector3(0,1.155,-.36),new T.Vector3(.102,1.224,-.326));
    solid(g,new T.TubeGeometry(smile,12,.012,6,false),rubber,0,0,0);
    g.userData.appearance=a;return g;
  }
  const avatars=palette.map((color,i)=>makeAvatar(color,i,null));
  const grassTex=new T.TextureLoader().load(localTextures['fairway.webp']);
  grassTex.wrapS=grassTex.wrapT=T.RepeatWrapping;grassTex.colorSpace=T.SRGBColorSpace;
  grassTex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const turfMat=material(0xffffff);turfMat.vertexColors=true;turfMat.map=grassTex;
  turfMat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 terrainPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n terrainPoint=position;');
    shader.fragmentShader='varying vec3 terrainPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float patches=0.5+0.5*sin(terrainPoint.x*.09+sin(terrainPoint.z*.065))*cos(terrainPoint.z*.075);
      diffuseColor.rgb*=mix(vec3(.86,.97,.78),vec3(1.14,1.06,.92),patches);
    `);
  };
  const roadMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.84,side:T.DoubleSide});
  function surfaceMaterial(file){
    const mat=roadMat.clone(),tex=new T.TextureLoader().load(localTextures[file]);
    tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;
    tex.anisotropy=grassTex.anisotropy;mat.map=tex;return mat;
  }
  const maple=surfaceMaterial('maple.webp'),stone=surfaceMaterial('stone.webp');
  const finishWidth={value:0};
  const teeMark={value:new T.Vector3()},cupMark={value:new T.Vector2()},basinCut={value:new T.Vector3()};
  for(const mat of [maple,stone,turfMat]){
    const previous=mat.onBeforeCompile.bind(mat);
    mat.onBeforeCompile=shader=>{
      previous(shader);
      shader.uniforms.finishWidth=finishWidth;shader.uniforms.basinCut=basinCut;shader.uniforms.teeMark=teeMark;shader.uniforms.cupMark=cupMark;
      shader.vertexShader='varying vec2 fieldXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfieldXZ=vec2(position.x,-position.z);');
      shader.fragmentShader='varying vec2 fieldXZ; uniform float finishWidth; uniform vec3 teeMark; uniform vec2 cupMark; uniform vec3 basinCut;\n'+shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
        ${mat===turfMat?'if(fieldXZ.y<=basinCut.y && distance(fieldXZ,basinCut.xy)<basinCut.z) discard;':''}
        float tee=distance(fieldXZ,teeMark.xy),cup=distance(fieldXZ,cupMark);
        float grain=.97+.03*sin(fieldXZ.x*6.)*cos(fieldXZ.y*5.);
        if(tee<teeMark.z) diffuseColor.rgb=grain*(tee>teeMark.z-.18?vec3(.72,.82,.42):vec3(.31,.64,.17));
        if(cup<7.1) diffuseColor.rgb=grain*vec3(.32,.68,.17);
        if((abs(cup-2.5)<.12)||(fieldXZ.y<cupMark.y&&fieldXZ.y>cupMark.y-.22&&abs(fieldXZ.x-cupMark.x)<finishWidth)) diffuseColor.rgb=vec3(.89,.94,.62);
        #include <roughnessmap_fragment>
      `);
    };
  }
  const flagMat=material(0xffe6af);
  const bankMat=material(0xffffff);bankMat.map=stone.map;
  let course=new T.Group(), key='', animatedTime=0;
  scene3.add(course);
  const propCells=[],viewFrustum=new T.Frustum(),viewProjection=new T.Matrix4();
  const propShapes=[];
  function updateProps(){
    lens.updateMatrixWorld();
    viewProjection.multiplyMatrices(lens.projectionMatrix,lens.matrixWorldInverse);
    viewFrustum.setFromProjectionMatrix(viewProjection);
    for(const cell of propCells){
      const visible=viewFrustum.intersectsBox(cell.bounds);
      if(visible&&!cell.mesh){
        const rock=cell.kind===2;
        const shape=propShapes[cell.kind] ||= rock?new T.DodecahedronGeometry(1,0):importedGeometry(resortModels.tree[cell.kind]);
        const mesh=new T.InstancedMesh(shape,rock?bankMat:treeMats[cell.kind],cell.items.length);
        const pose=new T.Object3D();
        cell.items.forEach(([x,y,z,h,height,depth,yaw],i)=>{
          pose.position.set(x,y,-z);pose.scale.set(h,height??h,depth??h);pose.rotation.y=yaw||0;pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);
        });
        course.add(mesh);cell.mesh=mesh;
      }
      if(cell.mesh)cell.mesh.visible=visible;
    }
  }
  // Index just the rendered ground surfaces. A camera query visits one small region.
  const groundCells=new Map(),cellSize=12;
  function indexGround(geometry){
    const p=geometry.attributes.position,indices=geometry.index?.array;
    for(let i=0;i<(indices?.length??p.count);i+=3){
      const a=indices?indices[i]:i,b=indices?indices[i+1]:i+1,c=indices?indices[i+2]:i+2;
      const x=p.getX(a),y=p.getY(a),z=p.getZ(a);
      const bx=p.getX(b)-x,bz=p.getZ(b)-z,cx=p.getX(c)-x,cz=p.getZ(c)-z;
      const det=bx*cz-cx*bz;if(Math.abs(det)<1e-9)continue;
      const tri=[x,y,z,cz/det,-cx/det,-bz/det,bx/det,p.getY(b)-y,p.getY(c)-y];
      const left=Math.floor((x+Math.min(0,bx,cx))/cellSize),right=Math.floor((x+Math.max(0,bx,cx))/cellSize);
      const near=Math.floor((z+Math.min(0,bz,cz))/cellSize),far=Math.floor((z+Math.max(0,bz,cz))/cellSize);
      for(let iz=near;iz<=far;iz++)for(let ix=left;ix<=right;ix++){
        const id=iz*65536+ix;let list=groundCells.get(id);
        if(!list){list=[];groundCells.set(id,list);}
        list.push(tri);
      }
    }
  }
  function renderedFloor(x,z){
    let floor=seaHeight()+.08;
    const list=groundCells.get(Math.floor(z/cellSize)*65536+Math.floor(x/cellSize));
    if(list)for(const t of list){
      const dx=x-t[0],dz=z-t[2],u=t[3]*dx+t[4]*dz,v=t[5]*dx+t[6]*dz;
      if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)floor=Math.max(floor,t[1]+u*t[7]+v*t[8]);
    }
    return floor;
  }
  function clearCamera(){
    const eye=lens.position,r=lens.near*(1+Math.tan(lens.fov*Math.PI/360)*Math.hypot(1,lens.aspect));
    let foot=renderedFloor(eye.x,eye.z);
    for(const dx of [-r,0,r])for(const dz of [-r,0,r])foot=Math.max(foot,renderedFloor(eye.x+dx,eye.z+dz));
    eye.y=Math.max(eye.y,foot+1.1+r);
    // Lift over a crest between the ball and the lens, even when both endpoints are clear.
    look.y=Math.max(look.y,renderedFloor(look.x,look.z)+.28);
    const steps=Math.min(24,Math.ceil(Math.hypot(eye.x-look.x,eye.z-look.z)));
    for(let i=1;i<steps;i++){
      const t=i/steps,x=lerp(look.x,eye.x,t),z=lerp(look.z,eye.z,t);
      eye.y=Math.max(eye.y,look.y+(renderedFloor(x,z)+.18-look.y)/t);
    }
  }
  function rebuild(){
    groundCells.clear();
    for(const cell of propCells)if(cell.mesh){course.remove(cell.mesh);cell.mesh.dispose();}
    propCells.length=0;
    scene3.remove(course);course.traverse(m=>{if(!m.isSprite&&m.geometry&&m.geometry!==sphere)m.geometry.dispose();});
    course=new T.Group();scene3.add(course);
    finishWidth.value=halfWidth(end);
    basinCut.value.set(-bowlRadius,bowlZ,settings.layout==='bowl'?bowlRadius+2.97:0);
    const startPad=teePoint(0);teeMark.value.set(startPad.x,startPad.z,teeRadius());cupMark.value.set(center(end),end);
    const terrainStrips=new Map();
    function ribbon(isRoad){
      const vertices=[],colors=[],uv=[],indices=[];
      const roadStart=settings.layout==='bowl'?bowlZ:-8;
      const cols=isRoad?24:100,first=isRoad?roadStart:-110,last=isRoad?end:end+130;
      const wetStart=waterStart(),wetEnd=waterEnd(),tint=new T.Color();
      // Every terrain section uses matching lane and beach vertices at its boundaries.
      const cuts=[...new Set([first,last,roadStart,0,end,wetStart,wetEnd,...sideRamps.flatMap(r=>[r.start,r.stop])])].filter(z=>z>=first&&z<=last).sort((a,b)=>a-b);
      let woodIndices=0,previous=-1;
      for(let section=0;section<cuts.length-1;section++){
        const shore=hasWater()&&!isRoad&&cuts[section]>=wetStart&&cuts[section+1]<=wetEnd;
        const stride=isRoad||(cuts[section]>=roadStart&&cuts[section+1]<=end)?1:3;
        const start=section?Math.min(cuts[section+1],cuts[section]+stride):cuts[section];
        for(let z=start;;z=Math.min(cuts[section+1],z+stride)){
          const stripStart=indices.length;
          const row=vertices.length/3,cx=center(z),width=halfWidth(z);
          const terrain=isRoad?null:terrainRow(z);
          const wood=isRoad&&settings.layout==='bowl'&&z<0;
          for(let j=0;j<=cols;j++){
            const u=2*j/cols-1;
            let x=isRoad?cx+width*u:390*u;
            if(terrain){
              const sign=oceanSide(z);
              const k=sign>0?j:cols-j;
              const near=(sign>0?terrain.left-cx:cx-terrain.right);
              const far=(sign>0?terrain.right-cx:cx-terrain.left);
              let d;
              if(k<=26)d=lerp(-390,-width-16,k/26);
              else if(k<=31)d=lerp(-width-16,-width-rampRadius,(k-26)/5);
              else if(k<=42)d=lerp(-width,width,(k-32)/10);
              else if(k===43)d=width+rampRadius;
              else if(k<=46)d=lerp(width+rampRadius,near-2.8,(k-43)/3);
              else if(k===47)d=near-.9;
              else if(k<=52)d=lerp(near,far,(k-48)/4);
              else if(k===53)d=far+.9;
              else d=lerp(far+2.8,390,(k-54)/46);
              x=cx+sign*d;
            }
            if(isRoad){
              vertices.push(x,surface(x,z),-z);
              tint.set(z>=end-9?0x9ddf72:wood?0xf0ab5f:0xc6c0ad);
              tint.multiplyScalar(wood?.88+.12*Math.sin(j*1.7+Math.floor(z/7)*.27):.91+.09*Math.sin(j*8+z*2));
              colors.push(tint.r,tint.g,tint.b);
            }else{
              const offset=Math.abs(x-cx);
              vertices.push(x,grassHeight(x,z,terrain),-z);
              const rough=clamp((offset-width-3)/18,0,1),stripe=.94+.065*Math.cos((x-cx)*.62+z*.045);
              colors.push((1.09-.31*rough)*stripe,(1.10-.24*rough)*stripe,(.77-.14*rough)*stripe);
            }
            uv.push(x/6,z/6);
            const cell=oceanSide(z)>0?j:cols-j-1;
            const underRoad=!isRoad&&cuts[section]>=roadStart&&cuts[section+1]<=end&&cell>=32&&cell<42;
            const rampSide=cell===31?-oceanSide(z):cell===42?oceanSide(z):0;
            const underRamp=!isRoad&&rampSide&&sideRamps.some(r=>r.side===rampSide&&cuts[section]>=r.start&&cuts[section+1]<=r.stop);
            if(previous>=0&&j<cols&&!underRoad&&!underRamp&&!(shore&&cell>=46&&cell<54)){
              const a=previous+j,b=row+j;
              indices.push(a,a+1,b+1,a,b+1,b);
            }
          }
          if(isRoad&&settings.layout==='bowl'&&z===0)woodIndices=indices.length;
          if(!isRoad&&previous>=0){
            const strip=[stripStart,indices.length-stripStart];
            for(let t=Math.floor(-vertices[previous*3+2]);t<z;t++)terrainStrips.set(t,strip);
          }
          previous=row;
          if(z===cuts[section+1])break;
        }
      }
      const geo=new T.BufferGeometry();
      geo.setIndex(indices);geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
      geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals();
      if(isRoad){
        if(woodIndices)geo.addGroup(0,woodIndices,0);
        geo.addGroup(woodIndices,indices.length-woodIndices,1);
      }
      indexGround(geo);
      const mesh=solid(course,geo,isRoad?[maple,stone]:turfMat,0,0,0);mesh.castShadow=false;return mesh;
    }
    const terrainMesh=ribbon(false);ribbon(true);
    const rails=[],backs=[],railPose=new T.Object3D();
    function addRail(a,b,radius){
      railPose.position.copy(a).lerp(b,.5);
      railPose.scale.set(radius,a.distanceTo(b),radius);
      railPose.quaternion.setFromUnitVectors(up,b.clone().sub(a).normalize());
      railPose.updateMatrix();rails.push(railPose.matrix.clone());
    }
    if(settings.layout==='bowl'){
      const positions=[],texcoords=[],colors=[],idx=[],perimeter=[];
      const rings=16,segments=64,radius=bowlRadius+3;
      const hub=new T.Vector3(-bowlRadius,ground(bowlZ),-bowlZ);
      function basinVertex(p){
        positions.push(p.x,p.y,p.z);texcoords.push(p.x/5,-p.z/5);colors.push(1,.91,.77);
      }
      basinVertex(hub);
      perimeter.push(hub);
      let lastLip=null;
      for(let i=0;i<=segments;i++){
        const angle=-Math.PI+Math.PI*i/segments;
        const spoke=[];
        for(let j=1;j<=rings;j++){
          const r=radius*j/rings,x=hub.x+r*Math.cos(angle),z=bowlZ+r*Math.sin(angle);
          const p=new T.Vector3(x,bowlHeight(r,angle,z),-z);
          const k=positions.length/3;
          basinVertex(p);spoke.push(p);
          if(i){
            const inner=j===1?0:k-rings-1;
            idx.push(k,inner,k-rings);
            if(j>1)idx.push(k,k-1,inner);
          }
        }
        const lip=spoke[rings-1];
        if(i===0)perimeter.push(...spoke);
        else perimeter.push(lip);
        if(i===segments)perimeter.push(...spoke.slice(0,-1).reverse());
        if(lastLip){
          const lift=new T.Vector3(0,.055,0);
          addRail(lastLip.clone().add(lift),lip.clone().add(lift),.075);
        }
        lastLip=lip;
      }
      // Close both straight ends and the curved back using the riding surface's exact outline.
      const baseY=Math.min(...perimeter.map(p=>p.y))-1.5;
      const bottomCenter=new T.Vector3(hub.x,baseY,hub.z+radius/3);
      for(let i=0;i<perimeter.length;i++){
        const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];
        const lowA=new T.Vector3(a.x,baseY,a.z),lowB=new T.Vector3(b.x,baseY,b.z);
        for(const p of [b,a,lowA,b,lowA,lowB,bottomCenter,lowB,lowA])
          backs.push(p.x,p.y,p.z);
      }
      const basin=new T.BufferGeometry();basin.setIndex(idx);basin.setAttribute('position',new T.Float32BufferAttribute(positions,3));basin.setAttribute('uv',new T.Float32BufferAttribute(texcoords,2));basin.setAttribute('color',new T.Float32BufferAttribute(colors,3));basin.computeVertexNormals();indexGround(basin);solid(course,basin,maple,0,0,0);
    }
    for(const ramp of sideRamps){
      const vertices=[],uv=[],colors=[];
      function edgePoint(z,fraction){
        const across=rampRadius*Math.sin(fraction*Math.PI/2);
        const x=center(z)+ramp.side*(halfWidth(z)+across);
        return new T.Vector3(x,surface(x,z),-z);
      }
      for(let z=ramp.start;z<ramp.stop;z=Math.min(ramp.stop,z+1)){
        for(let j=0;j<14;j++)for(const [ds,dz] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
          const u=(j+ds)/14,t=Math.min(ramp.stop,z+dz),v=edgePoint(t,u);
          vertices.push(v.x,v.y,v.z);uv.push(u,t/4);colors.push(1,.97,.90);
        }
        const a=edgePoint(z,1),b=edgePoint(Math.min(ramp.stop,z+1),1);
        addRail(a,b,.07);
      }
      const panel=new T.BufferGeometry();panel.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
      panel.setAttribute('uv',new T.Float32BufferAttribute(uv,2));panel.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      panel.computeVertexNormals();indexGround(panel);solid(course,panel,maple,0,0,0);
    }
    if(rails.length){
      const mesh=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,8),coping,rails.length);
      rails.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.castShadow=mesh.receiveShadow=true;course.add(mesh);
    }
    if(backs.length){
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(backs,3));geo.computeVertexNormals();
      const uv=[];
      for(let i=0;i<backs.length;i+=3)uv.push((backs[i]+backs[i+2])*.24,backs[i+1]*.3);
      geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      solid(course,geo,woodWall,0,0,0);
    }
    // Beyond the playable valley, three low-resolution ridges recede into atmospheric fog.
    for(let ring=0;!settings.island&&ring<3;ring++){
      const pos=[],col=[],cz=-end*.5;
      function ridge(i,t){
        const angle=i*Math.PI/96,radius=212+ring*115+t*93;
        const peak=36+ring*19+14*Math.sin(angle*5+selectedCourse+(settings.land||0)*7)+8*Math.cos(angle*9+ring);
        const rise=Math.sin(t*Math.PI/2);
        const y=ground(end*.6)+lerp(-75,peak,rise);
        pos.push(radius*Math.cos(angle),y,cz+radius*Math.sin(angle));
        col.push(.13+rise*(.18+ring*.04),.32+rise*(.25+ring*.02),.19+rise*(.16+ring*.085));
      }
      for(let row=0;row<5;row++)for(let i=0;i<192;i++){
        if(Math.sin(i*Math.PI/96)<-.6)continue;
        for(const [di,dy] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]])ridge(i+di,(row+dy)/5);
      }
      const ridgeGeo=new T.BufferGeometry();ridgeGeo.setAttribute('position',new T.Float32BufferAttribute(pos,3));ridgeGeo.setAttribute('color',new T.Float32BufferAttribute(col,3));
      solid(course,ridgeGeo,ridgeMat,0,0,0).castShadow=false;
    }
    const waterVerts=[],sandVerts=[];
    const low=waterLevel(),begin=waterStart(),stop=waterEnd();
    function quad(buffer,a,b,c,d){buffer.push(...a,...b,...c,...a,...c,...d);}
    const sea=seaHeight();
    for(let z=-950;z<end+950;z+=48){
      for(let x=-960;x<960;x+=48){
        quad(waterVerts,[x,sea,-z],[x+48,sea,-z],[x+48,sea,-z-48],[x,sea,-z-48]);
      }
    }
    function shore(z){
      const row=terrainRow(z),{left,right}=row,h=x=>grassHeight(x,z,row);
      return [[left-2.8,h(left-2.8),-z],[left-.9,h(left-.9),-z],[left,low,-z],
              [right,low,-z],[right+.9,h(right+.9),-z],[right+2.8,h(right+2.8),-z]];
    }
    for(let z=begin;hasWater()&&z<stop;z++){
      const aa=shore(z),bb=shore(z+1);
      for(let k=0;k<5;k++){
        if(k!==2){quad(sandVerts,aa[k],aa[k+1],bb[k+1],bb[k]);continue;}
        const cells=Math.max(1,Math.ceil((aa[3][0]-aa[2][0])/7));
        const at=(row,f)=>[lerp(row[2][0],row[3][0],f),low,row[2][2]];
        for(let j=0;j<cells;j++)quad(waterVerts,at(aa,j/cells),at(aa,(j+1)/cells),at(bb,(j+1)/cells),at(bb,j/cells));
      }
    }
    for(const [points,mat] of [[waterVerts,water],[sandVerts,sand]]){
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));geo.computeVertexNormals();
      if(mat===sand)indexGround(geo);
      solid(course,geo,mat,0,0,0).castShadow=false;
    }
    const seed=settings.variant??selectedCourse+1;
    // Two instanced tree species keep the distant forest inexpensive to draw.
    const stands=[[],[],[]],rows=displayPrefs.forest==='full'?5:2;
    const downRay=new T.Raycaster(),hits=[];
    downRay.ray.direction.set(0,-1,0);
    function plant(kind,x,z,h){
      if(!treeSiteClear(x,z,h*.8))return;
      const strip=terrainStrips.get(Math.floor(z));if(!strip)return;
      terrainMesh.geometry.setDrawRange(strip[0],strip[1]);
      downRay.ray.origin.set(x,grassHeight(x,z)+200,-z);
      hits.length=0;downRay.intersectObject(terrainMesh,false,hits);
      if(hits.length&&hits[0].point.y>sea+.3)stands[kind].push([x,hits[0].point.y-.04,z,h]);
    }
    for(let row=0;!authored()&&row<rows;row++)for(let i=0;i<(end+30)/3.7;i++)for(const side of [-1,1]){
      const n=i*13+row*23+side*7+seed*11;
      const hash=k=>{const v=Math.sin(n*3.12+k*7.85)*43758.545;return v-Math.floor(v);};
      const z=i*3.7-8+hash(1)*3.5;
      const x=center(z)+side*(halfWidth(z)+6+row*9+hash(2)*7);
      const h=3.6+hash(3)*4.1+row*.32;
      if(!clearOfCourse(x,z,h*.65))continue;
      plant(row<2?0:1,x,z,h);
    }
    for(let i=0;i<220;i++){
      const z=(i%110)*3.3-32+Math.sin(i)*3;
      const x=(i%2?1:-1)*(85+20*Math.sin(i*2.37)+i%31);
      plant(1,x,z,5+2*Math.cos(i*1.9));
    }
    if(settings.cliff){
      for(let i=0;i<32;i++){
        const z=end*(.32+i/32*.39),side=settings.layout==='lake'?-oceanSide(z):(i%2?1:-1);
        const x=center(z)+side*(halfWidth(z)+15+2*Math.sin(i));
        stands[2].push([x,grassHeight(x,z)-2,z,3.5,5+2*Math.sin(i*2),3.1,i*2.4]);
      }
    }
    for(const prop of authored()?.props||[]){
      const y=grassHeight(prop.x,prop.z);
      if(prop.type==='tree')plant(0,prop.x,prop.z,5);
      if(prop.type==='rock')stands[2].push([prop.x,y+.43,prop.z,1.55,.85,1.15]);
    }
    terrainMesh.geometry.setDrawRange(0,Infinity);
    stands.forEach((items,kind)=>{
      const cells=new Map();
      for(const item of items){
        const [x,y,z,h,height,depth]=item,id=Math.floor(x/48)+','+Math.floor(z/48);
        let cell=cells.get(id);
        if(!cell){cell={kind,items:[],bounds:new T.Box3(),mesh:null};cells.set(id,cell);propCells.push(cell);}
        cell.items.push(item);
        const extent=Math.max(h,height||0,depth||0);
        cell.bounds.expandByPoint(new T.Vector3(x-extent,y-extent,-z-extent));
        cell.bounds.expandByPoint(new T.Vector3(x+extent,y+extent*2,-z+extent));
      }
    });
    const gx=center(end),gy=ground(end);

    solid(course,new T.CylinderGeometry(.73,.73,.045,40),rubber,gx,gy+.025,end);
    solid(course,new T.CylinderGeometry(.065,.085,4.2,12),surf,gx,gy+2.18,end);
    const flag=new T.BufferGeometry();
    const cloth=[];
    for(let i=0;i<9;i++)for(const [di,dy] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
      const u=(i+di)/9;cloth.push(u*1.9,-dy*(1-u*.83)-u*.16,.18*Math.sin(u*8));
    }
    flag.setAttribute('position',new T.Float32BufferAttribute(cloth,3));flag.computeVertexNormals();
    solid(course,flag,finishRed,gx,gy+4.25,end);
    const stripe=[];
    for(let j=0;j<24;j++){
      for(const [side,depth] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
        const {x,z}=teePoint(lerp(teeLimits[0],teeLimits[1],(j+side)/24),depth*.16);
        stripe.push(x,surface(x,z)+.065,-z);
      }
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(stripe,3));geo.computeVertexNormals();
    solid(course,geo,flagMat,0,0,0).castShadow=false;
  }
  const treeMats=['near','far'].map(name=>{
    const texture=importedTexture(name);
    const mat=new T.MeshBasicMaterial({map:texture,alphaTest:.45,side:T.DoubleSide});
    mat.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>', `
        vec3 foot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
        vec2 toward=cameraPosition.xz-foot.xz;
        vec3 right=vec3(toward.y,0.,-toward.x)/max(.001,length(toward));
        vec3 worldTree=foot+right*position.x*length(instanceMatrix[0].xyz)
                            +vec3(0.,position.y*length(instanceMatrix[1].xyz),0.)
                            +cross(right,vec3(0.,1.,0.))*position.z*length(instanceMatrix[2].xyz);
        vec4 mvPosition=viewMatrix*vec4(worldTree,1.);
        gl_Position=projectionMatrix*mvPosition;
      `);
    };
    return mat;
  });
  const ridgeMat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
  const finishRed=material(0xff392b);finishRed.side=T.DoubleSide;
  const woodWall=material(0xa96d3d);woodWall.side=T.DoubleSide;woodWall.map=maple.map;
  const coping=material(0xd5dcdb),up=new T.Vector3(0,1,0);
  const water=material(0x16c7d4),surf=material(0xe3f2de),buoy=material(0xff6842),courseColor=material(0x00a9bd);
  const finishGreen=material(0x88ce60);
  const sand=material(0xf3d491);sand.side=T.DoubleSide;
  const waterTime={value:0};
  const skyReflection=new T.TextureLoader().load('assets/backdrop.webp');skyReflection.colorSpace=T.SRGBColorSpace;
  water.onBeforeCompile=shader=>{
    shader.uniforms.waterTime=waterTime;shader.uniforms.skyReflection={value:skyReflection};
    shader.vertexShader='uniform float waterTime; varying vec3 waterPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      transformed.y+=.048*sin(position.z*.78+waterTime*1.8)+.025*sin(position.x*.65+position.z*.32-waterTime);
      waterPoint=transformed;`);
    shader.fragmentShader='uniform float waterTime; uniform sampler2D skyReflection; varying vec3 waterPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec3 eye=normalize(cameraPosition-waterPoint);
      vec3 n=normalize(vec3(-.017*cos(waterPoint.x*.65+waterPoint.z*.32-waterTime),1.,-.042*cos(waterPoint.z*.78+waterTime*1.8)));
      vec3 r=reflect(-eye,n);
      vec2 uv=vec2(fract(atan(r.z,r.x)*.159155+.5),clamp(.43+r.y*.53,.1,.96));
      float fresnel=.30+.54*pow(1.-max(dot(eye,n),0.),2.);
      diffuseColor.rgb=mix(vec3(.045,.34,.40),texture2D(skyReflection,uv).rgb,fresnel);
      diffuseColor.rgb+=.38*pow(max(dot(r,normalize(vec3(-.5,.75,.4))),0.),75.);
    `);
  };
  water.side=surf.side=T.DoubleSide;water.roughness=.22;
  const target=new T.Vector3(), look=new T.Vector3();
  const breezeCoords=new Float32Array(36*6),breezeGeo=new T.BufferGeometry();
  breezeGeo.setAttribute('position',new T.BufferAttribute(breezeCoords,3).setUsage(T.DynamicDrawUsage));
  const breeze=new T.LineSegments(breezeGeo,new T.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.16,depthWrite:false}));
  breeze.frustumCulled=false;scene3.add(breeze);
  function updateBreeze(){
    const mph=settings.windMph||0,theta=settings.windBearing||0,dx=Math.sin(theta),dz=-Math.cos(theta);
    const count=Math.min(36,Math.round(mph*1.8)),t=animatedTime*(1+mph*.3);
    const wrap=n=>((n%34)+34)%34-17;
    for(let i=0;i<count;i++){
      const x=lens.position.x+wrap(i*13.63+t*dx),z=lens.position.z+wrap(i*17.31+t*dz);
      const y=ground(-z)+1+(i*2.731)%7+.15*Math.sin(t*.4+i);
      const k=i*6,len=.26+mph*.058;
      breezeCoords[k]=x;breezeCoords[k+1]=y;breezeCoords[k+2]=z;
      breezeCoords[k+3]=x+dx*len;breezeCoords[k+4]=y+.018;breezeCoords[k+5]=z+dz*len;
    }
    breeze.material.opacity=.055+mph*.006;breezeGeo.setDrawRange(0,2*count);breezeGeo.attributes.position.needsUpdate=true;
  }
  const vaneOutline=new T.Shape();
  const vanePoints=[[-.09,-.32],[.09,-.32],[.09,.05],[.23,.05],[0,.35],[-.23,.05],[-.09,.05]];
  vanePoints.forEach(([x,y],i)=>i?vaneOutline.lineTo(x,y):vaneOutline.moveTo(x,y));vaneOutline.closePath();
  const vaneBody=new T.ExtrudeGeometry(vaneOutline,{depth:.09,bevelEnabled:true,bevelThickness:.015,bevelSize:.015,bevelSegments:1});
  vaneBody.rotateX(-Math.PI/2);
  const windVane=solid(scene3,vaneBody,material(0xee3428),0,0,0);
  windVane.castShadow=false;
  const arrowAnchor=new T.Vector3();
  let priorPhase='',lastForest='',shadowAge=1,resolutionIndex=0;
  let sampleTime=0,sampleFrames=0,fastWindows=0;
  const sizes=[[960,540],[816,459],[704,396]];
  function adaptResolution(dt){
    sampleTime+=dt;sampleFrames++;
    if(sampleTime<2)return;
    const frameTime=sampleTime/sampleFrames;
    fastWindows=frameTime<.018?fastWindows+1:0;
    const next=frameTime>.025?Math.min(2,resolutionIndex+1):fastWindows>=4?Math.max(0,resolutionIndex-1):resolutionIndex;
    if(next!==resolutionIndex){resolutionIndex=next;fastWindows=0;}
    sampleTime=sampleFrames=0;
  }
  return function render(dt){
    adaptResolution(dt);
    const aspect=(canvas.clientWidth||960)/(canvas.clientHeight||540);
    const targetSize=({low:[704,396],high:[1600,900],ultra:[1920,1080]})[displayPrefs.quality]||sizes[resolutionIndex];
    renderer.shadowMap.enabled=displayPrefs.shadows!=='off';
    const height=Math.round(Math.min(targetSize[1],targetSize[0]/aspect));
    const width=Math.max(1,Math.round(height*aspect));
    if(lens.aspect!==aspect){lens.aspect=aspect;lens.updateProjectionMatrix();}
    if(canvas.width!==width||canvas.height!==height)renderer.setSize(width,height,false);
    animatedTime+=dt;waterTime.value=animatedTime;
    const newKey=settings;
    if(newKey!==key||lastForest!==displayPrefs.forest){rebuild();key=newKey;lastForest=displayPrefs.forest;priorPhase='';}
    const y=ballFloor(ball);
    const inBowl=settings.layout==='bowl'&&ball.z<=bowlZ&&Math.hypot(ball.x+bowlRadius,ball.z-bowlZ)<=bowlRadius+3;
    const floorAt=inBowl||playable(ball.x,ball.z)?surface:grassHeight;
    const floor=floorAt(ball.x,ball.z),lift=Math.max(0,y+returnHeight-floor);
    normal.set(-(floorAt(ball.x+.03,ball.z)-floorAt(ball.x-.03,ball.z))/.06,1,(floorAt(ball.x,ball.z+.03)-floorAt(ball.x,ball.z-.03))/.06).normalize();
    contact.quaternion.setFromUnitVectors(stampAxis,normal);contact.position.set(ball.x,floor+.037,-ball.z);
    contact.material.opacity=1/(1+lift*1.6);contact.scale.setScalar(1+Math.min(1,lift*.27));
    ballMesh.position.set(ball.x,y+.28+returnHeight,-ball.z);ballMesh.rotation.order='YXZ';
    if(phase==='ready')ballMesh.rotation.y=-bowlerHeading();
    else if(phase==='returning')ballMesh.rotation.y=-Math.atan2(transfer.x-transfer.fromX,transfer.z-transfer.fromZ);
    else if(Math.hypot(ball.vx,ball.vz)>.05)ballMesh.rotation.y=-Math.atan2(ball.vx,ball.vz);
    ballMesh.rotation.x=-ball.spin;
    avatars.forEach(g=>g.visible=false);
    function place(p,x,z,yaw,moving){
      const i=palette.indexOf(p.color),a=p.look||null;
      let g=avatars[i];
      if(g.userData.appearance!==a){
        scene3.remove(g);
        const geometries=new Set(),materials=new Set();
        g.traverse(m=>{if(m.geometry&&m.geometry!==sphere&&!bodyGeometries.includes(m.geometry))geometries.add(m.geometry);
          if(m.material)for(const mat of [].concat(m.material))if(mat!==rubber)materials.add(mat);});
        geometries.forEach(v=>v.dispose());materials.forEach(v=>v.dispose());
        avatars[i]=g=makeAvatar(p.color,i,a);
      }
      g.visible=true;g.position.set(x,surface(x,z),-z);g.rotation.set(0,yaw,0);
      const fetching=p===retriever?.player&&['collecting','returning'].includes(phase);
      const strafe=phase==='ready'&&p===queue[0]?Math.min(1,Math.abs(strafeSpeed)/2):0;
      const stride=fetching?Math.sin(transfer.time*15):strafe*Math.sin(animatedTime*13);
      g.position.y+=Math.abs(stride)*.04;
      for(const mesh of g.userData.body){
        mesh.morphTargetInfluences[0]=Math.max(0,stride);
        mesh.morphTargetInfluences[1]=Math.max(0,-stride);
        mesh.morphTargetInfluences[2]=moving&&!fetching?1:0;
      }

    }
    if(record&&(!retriever?.guest||['collecting','returning'].includes(phase))){const r=receiverPose();place(r.player,r.x,r.z,phase==='collecting'?Math.atan2(r.x-ball.x,ball.z-r.z):phase==='returning'?Math.atan2(r.x-r.homeX,r.homeZ-r.z):Math.PI-.35,phase==='returning');}
    const tee=teePoint(stance-.52,-.55);
    windVane.visible=phase==='ready';
    windVane.position.set(tee.x+1.05,surface(tee.x,tee.z)+1.5,-tee.z);

    if(['settling','starting','ready','rolling','replay'].includes(phase))place(phase==='replay'?replayBowler:queue[0],tee.x,tee.z,-bowlerHeading(),phase==='rolling');
    if(phase==='celebrating'){
      place(replayBowler,tee.x,tee.z,0,true);
      const g=avatars[palette.indexOf(replayBowler.color)],wave=Math.sin(celebrationTime*8);
      g.position.y+=Math.abs(wave)*.33;g.rotation.z=wave*.14;g.userData.body.forEach(m=>m.morphTargetInfluences[2]=.5+.5*wave);
    }
    if(phase==='returning' && queue[0]!==retriever.player)place(queue[0],center(settings.start)-.50,settings.start-.5,0,false);
    const z=ball.z;
    const bankView=settings.layout==='bowl'?bankHeading(z):0;
    if(phase==='collecting'){const r=receiverPose();target.set((r.x+ball.x)/2-4,y+5+Math.abs(r.z-z)*.25,Math.max(-r.z,-z)+7);}
    else if(phase==='returning'){target.set(ball.x-5,y+returnHeight+3,-z+8);}
    else if(phase==='presentation'){const t=flyZ();target.set(lerp(center(t),tee.x,smooth(clamp(1-t/20,0,1)))-6,ground(t)+9,-t+12);}
    else if(phase==='celebrating')target.set(tee.x+1.6,ground(tee.z)+2.2,-tee.z+3.8);
    else if(phase==='replay'){
      const heading=Math.atan2(ball.vx,ball.vz),side=replayTime<1.55?-1:1;
      const back=replayTime<3.1?4.0:8.8,lateral=side*(replayTime<3.1?5.2:1.8);
      target.set(ball.x-back*Math.sin(heading)+lateral*Math.cos(heading),y+(replayTime<1.55?2.5:replayTime<3.1?5.2:8),-z+back*Math.cos(heading)+lateral*Math.sin(heading));
    }else if(['ready','starting','settling'].includes(phase)){
      const heading=bowlerHeading();target.set(ball.x-8*Math.sin(heading),y+8,-z+8*Math.cos(heading));
    }else if(settings.layout==='bowl'&&z<0)target.set(ball.x+3,y+8.8,-z-8);
    else target.set(ball.x-5*Math.sin(bankView),y+(phase==='ready'?9:7.5),-z+8);
    const blend=priorPhase && !(phase==='replay'&&priorPhase!=='replay')?1-Math.exp(-dt*6):1;
    if(canPan())target.x+=cameraOffset;
    lens.position.lerp(target,blend);
    target.set(ball.x+.6*Math.sin(bankView),y+.28,-z-1.5);
    if(['ready','starting','settling'].includes(phase)){const heading=bowlerHeading();target.set(ball.x+2.6*Math.sin(heading),y+.35,-z-2.6*Math.cos(heading));}
    if(phase==='celebrating')target.set(tee.x,ground(tee.z)+1.1,-tee.z);
    if(phase==='presentation'){const t=flyZ();target.set(lerp(center(t+5),tee.x,smooth(clamp(1-t/20,0,1))),ground(t)+.8,-t-5);}
    if(phase==='collecting'){const r=receiverPose();target.set((r.x+ball.x)/2,y+.8,-(r.z+z)/2);}
    if(phase==='returning')target.set(ball.x,y+returnHeight,-z);
    look.lerp(target,blend);clearCamera();lens.lookAt(look);
    const cameraYaw=Math.atan2(look.x-lens.position.x,lens.position.z-look.z);
    windVane.rotation.set(0,-(settings.windBearing||0),0);
    arrowAnchor.set(Math.cos(cameraYaw),0,Math.sin(cameraYaw));
    windVane.rotateOnWorldAxis(arrowAnchor,.31);
    light.position.set(ball.x-12,y+21,-z+8);light.target.position.copy(ballMesh.position);
    shadowAge+=dt;
    if(shadowAge>=1/30||priorPhase!==phase){
      renderer.shadowMap.needsUpdate=true;shadowAge=0;
    }
    updateProps();updateBreeze();
    drawWindModel(phase==='ready'?bowlerHeading():Math.atan2(look.x-lens.position.x,lens.position.z-look.z));
    renderer.render(scene3,lens);
    const x=tee.x,playerZ=tee.z;
    arrowAnchor.set(x,surface(x,playerZ)+.04,-playerZ).project(lens);
    placeArrow((arrowAnchor.x+1)*50,(1-arrowAnchor.y)*50);priorPhase=phase;
  };
}
