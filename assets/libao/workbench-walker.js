import * as T from 'three';
import {GLTFLoader} from './viewer_lib/addons/loaders/GLTFLoader.js';
import {HDRLoader} from './viewer_lib/addons/loaders/HDRLoader.js';

// The original rig is rendered in a transparent scene whose ground plane is
// registered to the route drawn on the workshop image.
export async function createWalker(stage,svgPath){
 const R=new T.WebGLRenderer({alpha:true,antialias:true});
 R.setClearColor(0x000000,0);R.toneMapping=T.NeutralToneMapping;R.toneMappingExposure=.94;R.setPixelRatio(Math.min(devicePixelRatio,1.5));
 R.domElement.className='workbench-walker-canvas';R.domElement.setAttribute('aria-hidden','true');stage.append(R.domElement);
 const S=new T.Scene(),C=new T.PerspectiveCamera(40,16/9,.1,100);
 C.position.set(0,7,13);C.lookAt(0,0,0);C.updateMatrixWorld(true);
 S.add(new T.HemisphereLight(0xffedd9,0x7d8fa5,1.1));
 for(const [c,i,x,y,z] of [[0xffd7a7,2.1,-4,7,7],[0x87b7ff,1.05,4,3,-2]]){
  const l=new T.DirectionalLight(c,i);l.position.set(x,y,z);S.add(l)
 }
 const gltf=await new GLTFLoader().loadAsync(new URL('./libao.glb',import.meta.url).href);
 const model=gltf.scene,b=new T.Box3().setFromObject(model),sizeFactor=1.68,scale=1.9*sizeFactor/b.getSize(new T.Vector3()).y;
 model.scale.setScalar(scale);model.position.y=-b.min.y*scale;
 const carrier=new T.Group();carrier.add(model);S.add(carrier);
 const mixer=new T.AnimationMixer(model),faces=new Map(gltf.animations.filter(a=>a.name.startsWith('Face_')).map(a=>[a.name,a]));
 let faceAction=null,faceName='';
 function expression(name,t){if(name!==faceName){faceAction?.stop();faceName=name;const clip=faces.get(name)||faces.get('Face_Idle');faceAction=clip?mixer.clipAction(clip).reset().play():null}mixer.setTime(t)}
 expression('Face_Idle',0);
 const hdr=new HDRLoader().loadAsync(new URL('./environment/studio-small-08.hdr',import.meta.url).href).then(map=>{map.mapping=T.EquirectangularReflectionMapping;S.environment=map;S.environmentIntensity=.28;renderCurrent()}).catch(()=>{});
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,2,64,64,62);g.addColorStop(0,'rgba(0,0,0,.62)');g.addColorStop(.46,'rgba(0,0,0,.32)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
 const shadow=new T.Mesh(new T.PlaneGeometry(1.38*sizeFactor,.87*sizeFactor),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.004;S.add(shadow);
 const ray=new T.Raycaster(),floor=new T.Plane(new T.Vector3(0,1,0),0),length=svgPath.getTotalLength();
 const screenSamples=Array.from({length:161},(_,i)=>svgPath.getPointAtLength(length*i/160));
 const points=[];for(let j=0;j<=36;j++){const p=svgPath.getPointAtLength(length*j/36);ray.setFromCamera(new T.Vector2(p.x/800-1,1-p.y/450),C);points.push(ray.ray.intersectPlane(floor,new T.Vector3()))}
 const path=new T.CatmullRomCurve3(points,false,'centripetal');const pathLength=path.getLength();
 const smooth=v=>{v=T.MathUtils.clamp(v,0,1);return v*v*(3-2*v)};
 const bones={};S.updateMatrixWorld(true);
 for(const name of ['root','torso','head','leg.L','foot.L','leg.R','foot.R','arm.L','arm.R','forearm.L','forearm.R','hand.L','hand.R','antenna.L','antenna.R']){
  const o=model.getObjectByName(name.replace('.',''))||model.getObjectByName(name);if(!o)throw Error('Missing guide joint '+name);
  bones[name]={o,p:o.position.clone(),q:o.quaternion.clone(),wp:o.getWorldPosition(new T.Vector3()),wq:o.getWorldQuaternion(new T.Quaternion())}
 }
 const X=new T.Vector3(1,0,0),Z=new T.Vector3(0,0,1);
 function reset(){for(const {o,p,q} of Object.values(bones)){o.position.copy(p);o.quaternion.copy(q)}}
 function turn(name,axis,angle){const {o,q}=bones[name];const p=o.parent.getWorldQuaternion(new T.Quaternion()).invert();const a=axis.clone().applyQuaternion(carrier.quaternion).applyQuaternion(p);o.quaternion.copy(new T.Quaternion().setFromAxisAngle(a,angle).multiply(q))}
 function trackAt(distance){let u=T.MathUtils.clamp(distance/pathLength,0,1);return {p:path.getPointAt(u),t:path.getTangentAt(Math.min(u,.999))}}
 function walk(distance){
  reset();const L=.24*sizeFactor,phase=distance/L,env=smooth(distance/(.16*sizeFactor))*smooth((pathLength-distance)/(.16*sizeFactor));
  const root=bones.root.o,js=root.getWorldScale(new T.Vector3()).x;
  root.position.y=bones.root.p.y+(-.015-.006*Math.cos(phase*4*Math.PI))*env*sizeFactor/js;root.position.x=bones.root.p.x+Math.sin(phase*2*Math.PI)*.007*env*sizeFactor/js;
  S.updateMatrixWorld(true);turn('torso',Z,.028*Math.sin(phase*2*Math.PI)*env);turn('head',Z,-.018*Math.sin(phase*2*Math.PI)*env);
  for(const [side,sign] of [['L',1],['R',-1]]){turn('arm.'+side,X,-sign*.22*Math.cos(phase*2*Math.PI)*env);turn('antenna.'+side,X,.035*Math.sin(phase*4*Math.PI-.6)*env)}
  S.updateMatrixWorld(true);
  for(const [side,offset] of [['L',0],['R',.5]]){
   const leg=bones['leg.'+side],boot=bones['foot.'+side],cycle=phase+offset,k=Math.floor(cycle),f=cycle-k,stance=.58;
   const anchor=(k-offset+.29)*L,u=f<stance?0:smooth((f-stance)/(1-stance)),point=trackAt(anchor+u*L),lateral=boot.wp.x;
   const target=new T.Vector3(point.p.x+point.t.z*lateral,boot.wp.y+(f<stance?0:.025*sizeFactor*Math.sin(Math.PI*(f-stance)/(1-stance)))*env,point.p.z-point.t.x*lateral);
   const neutral=carrier.localToWorld(new T.Vector3(boot.wp.x,boot.wp.y,boot.wp.z));target.lerp(neutral,1-env);
   const desired=leg.o.parent.worldToLocal(target.clone()).sub(leg.o.position),rest=boot.p.clone().applyQuaternion(leg.q);
   leg.o.quaternion.copy(new T.Quaternion().setFromUnitVectors(rest.normalize(),desired.normalize()).multiply(leg.q));S.updateMatrixWorld(true);
   const expected=leg.o.worldToLocal(target.clone()),correction=expected.clone().sub(boot.p),worldScale=leg.o.getWorldScale(new T.Vector3()).x;
   // Avoid lengthening the very short toy leg beyond its tested correction range.
   correction.clampLength(0,.042*sizeFactor/worldScale);boot.o.position.copy(boot.p).add(correction);
   boot.o.quaternion.copy(leg.o.getWorldQuaternion(new T.Quaternion()).invert().multiply(carrier.getWorldQuaternion(new T.Quaternion())).multiply(boot.wq));S.updateMatrixWorld(true);
  }
 }
 let last=0,gestureMode=null,gestureTime=0;
 function renderCurrent(){if(gestureMode)renderGesture(gestureMode,gestureTime);else render(last)}
 function render(progress){
  gestureMode=null;carrier.scale.setScalar(1);shadow.scale.setScalar(1);
  last=T.MathUtils.clamp(progress,0,1);
  // Parameterise the floor trajectory by the image path, preserving registration.
  const p=path.getPointAt(last),dir=path.getTangentAt(Math.min(last,.999)),dist=pathLength*last;
  carrier.position.set(p.x,0,p.z);const routeYaw=Math.atan2(dir.x,dir.z);const idleYaw=.45;const shortest=Math.atan2(Math.sin(routeYaw-idleYaw),Math.cos(routeYaw-idleYaw));carrier.rotation.y=idleYaw+shortest*smooth(last/.035);
  expression('Face_Idle',last*12);walk(dist);shadow.position.x=p.x;shadow.position.z=p.z;
  R.render(S,C);
  const screen=p.clone().project(C);const sx=(screen.x+1)*800,sy=(1-screen.y)*450;let nearest=0,min=Infinity;for(let i=0;i<=160;i++){const k=screenSamples[i],d=(k.x-sx)**2+(k.y-sy)**2;if(d<min){min=d;nearest=i/160}}return {x:sx,y:sy,routeProgress:nearest};
 }
 const Y=new T.Vector3(0,1,0);
 // Register the two stationary poses to the scene's actual tabletop and floor.
 const stations={qa:{x:448,y:785,height:610,yaw:.35},alert:{x:1030,y:815,height:550,yaw:-.38}};
 const D=new T.OrthographicCamera(-8,8,4.5,-4.5,.1,150);
 D.position.set(0,6,20);D.lookAt(0,2,0);D.updateMatrixWorld(true);
 function renderGesture(mode,t){
  gestureMode=mode;gestureTime=t;const st=stations[mode];if(!st)return;
  ray.setFromCamera(new T.Vector2(st.x/800-1,1-st.y/450),D);
  const p=ray.ray.intersectPlane(floor,new T.Vector3());carrier.position.copy(p);carrier.rotation.y=st.yaw;
  const projectHeight=f=>{const top=p.clone().addScaledVector(Y,1.9*sizeFactor*f);return (top.project(D).y-p.clone().project(D).y)*450};
  let lo=.25,hi=3;for(let i=0;i<22;i++){const mid=(lo+hi)/2;if(projectHeight(mid)<st.height)lo=mid;else hi=mid}
  const k=(lo+hi)/2;carrier.scale.setScalar(k);shadow.scale.setScalar(k);shadow.position.x=p.x;shadow.position.z=p.z;
  reset();S.updateMatrixWorld(true);
  const active=t>0,env=active?smooth((t-.25)/.8)*smooth((4.1-t)/.8):0;
  const look=active?smooth(t/.6):0;
  if(mode==='qa'){
    expression(active?(t<1?'Face_Thinking':'Face_Talking'):'Face_Idle',t);
    turn('head',new T.Vector3(.22,1,0).normalize(),(.16+.035*Math.sin(t*4))*env);
    turn('arm.L',new T.Vector3(-.42,0,.91).normalize(),.86*env);
    // Single axis per joint where possible, keeping the hand near the HMI.
    S.updateMatrixWorld(true);turn('forearm.L',X,-.24*env);turn('hand.L',Y,.18*env);
    turn('torso',Z,.035*env);
  }else{
    expression(active?'Face_Alert':'Face_Idle',t);
    turn('head',X,.10*look+.03*Math.sin(t*5)*env);
    turn('arm.R',Z,-.68*env);S.updateMatrixWorld(true);turn('forearm.R',X,-.28*env);
    turn('torso',Z,-.035*env);
  }
  S.updateMatrixWorld(true);R.render(S,D);
 }
 function resize(){const {clientWidth:w,clientHeight:h}=stage;if(w&&h){R.setSize(w,h,false);renderCurrent()}}
 new ResizeObserver(resize).observe(stage);resize();
 return {render,renderGesture, length:pathLength,canvas:R.domElement,dispose(){R.dispose();R.domElement.remove()}};
}
