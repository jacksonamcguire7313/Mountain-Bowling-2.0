// Cache the static course outline. Ball and record markers move independently.
let mapCache=null,lastMapPaint=-Infinity,lastMapState='';
function drawCourseMap(){
  const canvas=$('courseMap');
  canvas.hidden=displayPrefs.mapSize==='off'||$('intro').open;
  if(canvas.hidden)return;
  canvas.className=displayPrefs.mapSize==='large'?'large':'';
  const key=[selectedCourse,settings.variant,settings.start,settings.width,end,settings.shape,settings.layout].join('|');
  if(mapCache?.key!==key){
    const layer=document.createElement('canvas');layer.width=192;layer.height=248;
    const g=layer.getContext('2d'),rows=[];
    for(let z=settings.start;z<=end;z+=1)rows.push({z,x:center(z),w:halfWidth(z)});
    const bowl=settings.layout==='bowl';
    const min=Math.min(bowl?-2*bowlRadius-4:Infinity,...rows.map(r=>r.x-r.w)),max=Math.max(...rows.map(r=>r.x+r.w));
    const bottom=bowl?bowlZ-bowlRadius-4:settings.start;
    const scale=198/(end-bottom),across=Math.min(168/(max-min+(settings.island?76:36)),scale*2.2);
    const X=x=>96+(x-(min+max)/2)*across,Y=z=>222-(z-bottom)*scale;
    g.fillStyle='#467c48';g.fillRect(0,0,192,248);g.fillStyle='#173d37';g.fillRect(0,0,192,23);
    g.fillStyle='#fff';g.font='bold 14px system-ui';g.fillText('COURSE '+(mapIndex+1),12,19);
    const shape=(points,color)=>{
      if(!points.length)return;
      g.beginPath();points.forEach(([x,z],i)=>i?g.lineTo(X(x),Y(z)):g.moveTo(X(x),Y(z)));g.closePath();g.fillStyle=color;g.fill();
    };
    const band=(rs,edge,color)=>shape([...rs.map(r=>[r.x-r.w-edge,r.z]),...rs.slice().reverse().map(r=>[r.x+r.w+edge,r.z])],color);
    // Sample the same coastline as the landscape. Cache the painted vegetation and grass stripes.
    for(let py=0;py<248;py+=2)for(let px=0;px<192;px+=2){
      const z=bottom+(222-py)/scale,x=(px-96)/across+(min+max)/2;
      const shore=coastDistance(x,z);
      g.fillStyle=shore<1?mapWaterColor:shore<4?'#f0e2af':'#306634';
      g.fillRect(px,py,2,2);
    }
    band(rows,5,'#61a848');band(rows,0,'#86ca56');
    for(let i=2;i<rows.length-2;i+=6)band(rows.slice(i,i+3),0,'#9bd86a');
    for(let i=0;i<750;i++){
      const px=(i*71.723)%192,py=(i*31.715+9*Math.sin(i))%248;
      const z=bottom+(222-py)/scale,x=(px-96)/across+(min+max)/2;
      if(!treeSiteClear(x,z,Math.max(3/across,3/scale))||Math.abs(x-center(z))<halfWidth(z)+6)continue;
      g.fillStyle=i%2?'#20572e':'#284f2a';g.beginPath();g.moveTo(px,py-3);g.lineTo(px-2,py+2);g.lineTo(px+2,py+2);g.fill();
    }
    const green=(x,z,r)=>{g.fillStyle='#acd96b';g.beginPath();g.ellipse(X(x),Y(z),r*across,r*scale,0,0,Math.PI*2);g.fill();};
    green(center(end),end,7);const tee=teePoint(0);green(tee.x,tee.z,teeRadius());
    if(bowl){
      const rim=[];for(let i=0;i<=48;i++){const a=-Math.PI+i*Math.PI/48;rim.push([-bowlRadius+(bowlRadius+3)*Math.cos(a),bowlZ+(bowlRadius+3)*Math.sin(a)]);}
      shape(rim,'#dda661');shape([[-5,bowlZ],[5,bowlZ],[5,0],[-5,0]],'#dda661');
    }
    if(settings.lake){
      const {x,z,radius}=settings.lake;
      for(const [r,color] of [[radius+2.8,'#e5ca91'],[radius,mapWaterColor]]){
        g.beginPath();g.ellipse(X(x),Y(z),r*across,r*scale,0,0,2*Math.PI);g.fillStyle=color;g.fill();
      }
    }
    for(const r of sideRamps){const rs=rows.filter(t=>t.z>=r.start&&t.z<=r.stop);shape([...rs.map(t=>[t.x+r.side*t.w,t.z]),...rs.reverse().map(t=>[t.x+r.side*(t.w+rampRadius),t.z])],'#d89d59');}
    const fx=X(center(end)),fy=Y(end);g.fillStyle='#f9fcf6';g.fillRect(fx,fy-12,1.5,13);
    g.fillStyle='#ff6550';g.beginPath();g.moveTo(fx+1,fy-12);g.lineTo(fx+12,fy-9);g.lineTo(fx+1,fy-5);g.fill();
    mapCache={key,layer,X,Y};lastMapState='';lastMapPaint=-Infinity;
  }
  const now=performance.now();
  if(now-lastMapPaint<65)return;
  const state=[phase,ball.x,ball.z,record?.x,record?.z,curve,$('aim').value,$('power').value,displayPrefs.aimGuide].join('|');
  if(state===lastMapState)return;
  lastMapState=state;lastMapPaint=now;
  const {layer,X,Y}=mapCache,g=canvas.getContext('2d');
  g.drawImage(layer,0,0);
  if(phase==='ready'&&displayPrefs.aimGuide==='on'){
    const path=trajectory();
    g.save();g.lineCap='round';g.lineJoin='round';g.beginPath();
    path.forEach((point,i)=>{
      if(i===0)g.moveTo(X(point.x),Y(point.z));
      else g.lineTo(X(point.x),Y(point.z));
    });
    g.strokeStyle='#205ace';g.lineWidth=3.5;g.stroke();
    g.strokeStyle='#fff';g.lineWidth=2;g.setLineDash([.1,9]);g.stroke();g.restore();
    if(curve){
      g.fillStyle='#142f3a';g.fillRect(0,227,192,21);
      g.fillStyle='#fff';g.font='bold 13px system-ui';g.fillText('Curve '+(curve<0?'← ':'→ ')+Math.abs(curve),12,242);
    }
    const tip=path.at(-1);g.strokeStyle='#fff';g.lineWidth=1.5;
    g.save();g.translate(X(tip.x),Y(tip.z));g.rotate(Math.PI/4);g.fillStyle='#ffcf49';g.fillRect(-3,-3,6,6);g.strokeRect(-3,-3,6,6);g.restore();
  }
  if(record){g.strokeStyle='#ffe171';g.lineWidth=3;g.beginPath();g.arc(X(record.x),Y(record.z),5,0,2*Math.PI);g.stroke();}
  if(phase==='ready'){
    g.save();g.translate(X(ball.x),Y(ball.z));g.rotate(bowlerHeading());g.fillStyle='#e1fbff';g.strokeStyle='#174276';g.lineWidth=1.6;
    g.beginPath();g.moveTo(0,-7);g.lineTo(4.8,5);g.lineTo(0,3);g.lineTo(-4.8,5);g.closePath();g.fill();g.stroke();g.restore();return;
  }
  g.fillStyle='#f48634';g.strokeStyle='white';g.lineWidth=2;g.beginPath();g.arc(X(ball.x),Y(ball.z),4.5,0,2*Math.PI);g.fill();g.stroke();
}

// Orthographically project two extruded solids into the HUD without another WebGL context.
let lastWindIcon='';
function drawWindModel(heading){
  const angle=(settings.windBearing||0)-heading;
  const key=Math.round(angle*130)+':'+(settings.windMph||0);
  if(key===lastWindIcon)return;lastWindIcon=key;
  const g=$('windModel').getContext('2d');g.clearRect(0,0,150,116);
  const c=Math.cos(angle),s=Math.sin(angle);
  function prism(outline,h0,h1,top,side,rotate){
    const verts=outline.map(([x,z])=>rotate?[x*c+z*s,-x*s+z*c]:[x,z]);
    const project=([x,z],h)=>[75+x*1.16,67-z*.79-h];
    const face=(points,color)=>{g.fillStyle=color;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill();};
    const walls=verts.map((a,i)=>[a,verts[(i+1)%verts.length]]).sort((a,b)=>b[0][1]+b[1][1]-a[0][1]-a[1][1]);
    for(const [a,b] of walls)face([project(a,h0),project(b,h0),project(b,h1),project(a,h1)],side);
    face(verts.map(v=>project(v,h1)),top);
  }
  g.strokeStyle='#e7ffff99';g.lineWidth=2;
  for(const r of [50,54]){g.beginPath();g.ellipse(75,56,r,r*.95,0,0,Math.PI*2);g.stroke();}
  prism([[-40,-27],[40,-27],[39,27],[-39,27]],-12,0,'#83cf32','#594323',false);
  prism([[-8,-22],[8,-22],[8,4],[20,4],[0,29],[-20,4],[-8,4]],5,14,'#f33624','#921e13',true);
  g.textAlign='center';g.font='bold 21px system-ui';g.lineWidth=3;g.strokeStyle='#374025';g.strokeText('Wind',75,96);g.fillStyle='white';g.fillText('Wind',75,96);
}
