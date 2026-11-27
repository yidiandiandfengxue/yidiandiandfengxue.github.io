import {createWalker} from './workbench-walker.js?v=40b';
// A state-synchronised simulated digital twin workbench. No external device connection.
const scenePreview=document.querySelector('.assistant-visual');
const dialogue=document.querySelector('#dialogue');
const form=document.querySelector('#assistant-form');
const input=document.querySelector('#message');
const example=document.querySelector('#example');
const assistantState=document.querySelector('#assistant-state');
const actionButton=document.querySelector('#workbench-action');
const tiles=[...document.querySelectorAll('.scene-tile')];
const switches=[...document.querySelectorAll('[data-switch]')];
const questionButtons=[...document.querySelectorAll('[data-question]')];
const routeSteps=[...document.querySelectorAll('[data-route-step]')];
const routeBase=document.querySelector('#route-base');
const routeTrace=document.querySelector('#route-trace');
const routePin=document.querySelector('#route-pin');
const routeNote=document.querySelector('#route-note');
const walkerStage=document.querySelector('#workbench-walker');
const walkFallback=document.querySelector('#workbench-walk-fallback');
let walker=null, walkerPromise=null, walkerFailed=false;
function ensureWalker(){
 if(walkerPromise)return walkerPromise;
 walkerPromise=createWalker(walkerStage,routeBase).then(w=>{walker=w;scenePreview.dataset.walker='ready';if(active==='tour')walker.render(0);else walker.renderGesture(active,0);return w}).catch(error=>{console.warn('Guide model could not load',error);walkerFailed=true;scenePreview.dataset.walker='unavailable';return null});
 return walkerPromise
}
new IntersectionObserver((entries,observer)=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();ensureWalker()}},{rootMargin:'260px'}).observe(scenePreview);
const stageLocation=document.querySelector('#stage-location');
const stageCoordinate=document.querySelector('#stage-coordinate');
const stageState=document.querySelector('#stage-state');
const stageCallout=document.querySelector('#scene-callout');
const assistantMode=document.querySelector('#assistant-mode');
const recordState=document.querySelector('#record-state');
const alertStatus=document.querySelector('#alert-status');
const scenes={
 tour:{coordinate:'01 / PATROL',location:'A-03 加工区',state:'准备接待',callout:'路线预览 · 加工区入口',mode:'工位路线向导',label:'导航中',action:'开始巡游',sample:'带我去 03 号工位',intro:'你好，我是栗宝。我们现在位于加工区入口，今天可以沿主通道参观 A-03 加工中心。',answer:'好，跟我来。我将沿数字孪生路线从入口走到 A-03 工位。',source:'模拟路线 · 加工区入口 → 主通道 → A-03'},
 qa:{coordinate:'02 / INSPECTION',location:'A-03 加工中心',state:'等待查询',callout:'设备已定位 · 点检台账',mode:'设备信息助手',label:'已回答',action:'查询点检记录',sample:'点检记录在哪？',intro:'这里是 A-03 加工中心。我可以帮你查看当班点检、设备台账和当前提醒。',answer:'A-03 加工中心的本班次点检已于 08:40 记录。台账中还有一条待核查的温度提醒。你可以继续查看温度趋势。',source:'模拟台账 · A-03 / 当班点检 / 08:40'},
 alert:{coordinate:'03 / ALERT',location:'A-03 温度监测',state:'待核查',callout:'模拟温度 · 超过提醒阈值',mode:'设备异常助手',label:'提示中',action:'查看温度提醒',sample:'温度异常怎么确认？',intro:'03 号工位有一条温度提醒。需要我告诉你先看哪里吗？',answer:'模拟数据中，A-03 当前温度为 68°C，超过演示提醒阈值 65°C。请结合现场情况核查状态，并查看温度趋势。',source:'模拟数据 · A-03 / 68°C / 提醒阈值 65°C'}
};
let active='tour',timer=0,raf=0,flow=0,busy=false;
const sendButton=form.querySelector('button[type=submit]');
const arrow='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function buttonLabel(button,label){button.textContent=label;if(button!==actionButton)button.insertAdjacentHTML('beforeend',arrow)}
function updateComposer(){sendButton.disabled=busy||!input.value.trim()}
function setBusy(on,label){busy=on;actionButton.disabled=on;actionButton.setAttribute('aria-busy',String(on));example.disabled=on;questionButtons.forEach(b=>b.disabled=on);updateComposer();if(label)buttonLabel(actionButton,label)}
input.addEventListener('input',updateComposer);
function cancelFlow(){flow++;clearTimeout(timer);cancelAnimationFrame(raf);setBusy(false);dialogue.querySelector('.pending')?.remove();walkFallback.pause();walkFallback.hidden=true;if(walker)scenePreview.dataset.walker='ready';}
function append(text,type,source){
 const message=document.createElement('div');message.className='message '+type;message.textContent=text;
 if(source){const detail=document.createElement('small');detail.textContent=source;message.append(detail)}
 dialogue.append(message);dialogue.scrollTop=dialogue.scrollHeight;return message
}
function pathPosition(progress){
 const actual=walker&&active==='tour'?walker.render(progress):null;
 const p=actual||routeBase.getPointAtLength(routeBase.getTotalLength()*progress);
 routePin.setAttribute('transform',`translate(${p.x} ${p.y})`);
 routeTrace.style.strokeDashoffset=String(100-(actual?.routeProgress??progress)*100);
}
function setProgress(step,note,progress){
 scenePreview.dataset.progress=String(step);routeNote.textContent=note;
 routeSteps.forEach(e=>e.dataset.passed=String(Number(e.dataset.routeStep)<=step));
 pathPosition(progress);
}
function resetDetails(){
 setProgress(0,'等待出发指令',0);
 for(const node of document.querySelectorAll('[data-record]'))node.textContent='—';
 recordState.textContent='等待查询';alertStatus.textContent='待确认';
 scenePreview.dataset.phase='idle';scenePreview.dataset.motionProgress='0';
}
function showScene(key,resetDialogue){
 if(!scenes[key]||(key===active&&resetDialogue&&dialogue.children.length))return;cancelFlow();active=key;const scene=scenes[key];
 scenePreview.dataset.context=key;resetDetails();if(walker&&key!=='tour')walker.renderGesture(key,0);
 for(const k of Object.keys(scenes))document.querySelector('#'+(k==='tour'?'route':k)+'-context').hidden=k!==key;
 stageCoordinate.textContent=scene.coordinate;stageLocation.textContent=scene.location;stageState.textContent=scene.state;stageCallout.textContent=scene.callout;assistantMode.textContent=scene.mode;
 assistantState.textContent='待命';
 for(const btn of switches)btn.setAttribute('aria-pressed',String(btn.dataset.switch===key));
 for(const btn of tiles){btn.setAttribute('aria-pressed',String(btn.dataset.scene===key));btn.closest('.scene-card').dataset.active=String(btn.dataset.scene===key)}
 for(const reel of document.querySelectorAll('[data-reel]')){reel.hidden=reel.dataset.reel!==key;if(reel.hidden)reel.querySelector('video').pause()}
 buttonLabel(actionButton,scene.action);
 buttonLabel(example,scene.sample);
 Object.keys(scenes).filter(k=>k!==key).forEach((k,i)=>{questionButtons[i].dataset.question=scenes[k].sample;buttonLabel(questionButtons[i],scenes[k].sample)});
 if(resetDialogue){dialogue.replaceChildren();append(scene.intro,'reply')}
 refreshGallery();
}
async function runRoute(token){
 scenePreview.dataset.phase='active';setBusy(true,'巡游中…');stageState.textContent='准备行走';assistantState.textContent='导航中';stageCallout.textContent='正在准备巡游';
 const guide=await ensureWalker();
 if(token!==flow||active!=='tour')return;
 stageState.textContent='导航中';stageCallout.textContent='栗宝沿路线行走 · 前往 A-03';
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const duration=reduce?150:guide?Math.max(10000,Math.min(18000,guide.length/.68*1000)):12000;
 if(!guide&&!reduce){scenePreview.dataset.walker='fallback';walkFallback.src='assets/libao/films/route-v32.mp4';walkFallback.hidden=false;walkFallback.currentTime=0;walkFallback.play().catch(()=>{walkFallback.hidden=true;scenePreview.dataset.walker='unavailable'})}
 const start=performance.now();
 function tick(now){
   if(token!==flow||active!=='tour')return;
   const t=Math.min(1,(now-start)/duration);
   const step=t>=.96?2:t>=.24?1:0;
   setProgress(step,t===1?'已抵达 A-03 工位':step===0?'从加工区入口出发':step===1?'沿主通道导航中':'正在抵达',t);
   if(t<1)raf=requestAnimationFrame(tick);
   else{
     scenePreview.dataset.phase='done';stageState.textContent='已到站';stageLocation.textContent='A-03 加工中心';stageCallout.textContent='栗宝已抵达 A-03';assistantState.textContent='已到站';setBusy(false,'重新巡游');
     append('已经到达 A-03 加工中心。你可以继续问我当班点检记录或温度提醒。','reply','模拟路线 · 已抵达目标工位');
   }
 }
 raf=requestAnimationFrame(tick);
}
function completeStation(key,scene,pending){
 pending.remove();append(scene.answer,'reply',scene.source);assistantState.textContent=scene.label;stageState.textContent=scene.label;
 scenePreview.dataset.phase='done';setBusy(false,key==='qa'?'重新查询':'重新查看');
 if(key==='qa'){document.querySelector('[data-record=time]').textContent='08:40';document.querySelector('[data-record=status]').textContent='已记录';document.querySelector('[data-record=warning]').textContent='温度提醒';recordState.textContent='已检索';stageCallout.textContent='台账检索完成 · A-03';}
 else{alertStatus.textContent='超阈值 +3°C';stageCallout.textContent='温度 68°C · 建议现场核查';}
}
async function runStation(key,token,pending){
 const scene=scenes[key],guide=await ensureWalker();if(token!==flow||active!==key)return;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,duration=reduce?150:4200;
 const start=performance.now();
 function tick(now){
  if(token!==flow||active!==key)return;
  const progress=Math.min(1,(now-start)/duration),t=progress*4.2;
  scenePreview.dataset.phase='active';
  scenePreview.dataset.motionProgress=String(progress);
  const checking=progress<.35;
  stageState.textContent=key==='qa'?(checking?'正在检索':'正在讲解'):(checking?'正在核查':'确认超阈值');
  stageCallout.textContent=key==='qa'?(checking?'读取 A-03 点检台账':'栗宝讲解点检记录'):(checking?'读取当前温度':'栗宝核查温度趋势');
  assistantState.textContent=key==='qa'?(checking?'检索中':'讲解中'):(checking?'核查中':'提示中');
  if(guide)guide.renderGesture(key,t);
  if(progress<1){raf=requestAnimationFrame(tick);return}
  completeStation(key,scene,pending);
 }
 raf=requestAnimationFrame(tick);
}
function respond(message){
 if(busy||!message.trim())return;const question=message.trim();
 let key;if(/异常|温度|报警|告警/.test(question))key='alert';else if(/点检|记录|设备详情|设备台账|加工中心.*(状态|信息)|工位.*(状态|信息)|设备.*(状态|状况|怎么样)/.test(question))key='qa';else if(/巡游|带我|路线|怎么走|工位.*(哪|走)/.test(question))key='tour';
 if([...question.matchAll(/(\d+)\s*号?\s*工位/g)].some(m=>Number(m[1])!==3))key=undefined;
 cancelFlow();if(key)showScene(key,false);
 const token=flow;append(question,'user');const pending=append('正在查看…','reply pending');
 assistantState.textContent='思考中';stageState.textContent='查询中';scenePreview.dataset.phase='pending';setBusy(true,key==='tour'?'准备导航…':key==='alert'?'核查中…':'查询中…');
 timer=setTimeout(()=>{
   if(token!==flow)return;
   if(!key){pending.remove();setBusy(false,scenes[active].action);append('这段演示只包含 03 号工位。你可以让我带路、查点检记录，或查看温度提醒。','reply');assistantState.textContent='待命';stageState.textContent=scenes[active].state;scenePreview.dataset.phase='idle';return}
   if(key==='tour'){pending.remove();const scene=scenes[key];append(scene.answer,'reply',scene.source);runRoute(token);return}
   runStation(key,token,pending);
 },key==='tour'?620:180);
}
form.addEventListener('submit',e=>{e.preventDefault();if(busy||!input.value.trim())return;const question=input.value;input.value='';respond(question);updateComposer()});
example.addEventListener('click',()=>respond(scenes[active].sample));
actionButton.addEventListener('click',()=>respond(scenes[active].sample));
questionButtons.forEach(b=>b.addEventListener('click',()=>respond(b.dataset.question)));
switches.forEach(b=>b.addEventListener('click',()=>showScene(b.dataset.switch,true)));
tiles.forEach(b=>b.addEventListener('click',()=>showScene(b.dataset.scene,true)));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clips = [...document.querySelectorAll('video[data-src]')];
const visible = new Set();
const motionToggle = document.querySelector('#media-toggle');
let auto = !reduced.matches;

function load(video) {
  if (!video.hasAttribute('src')) video.src = video.dataset.src;
}

function refreshGallery() {
  for (const video of clips) {
    if (video.controls) continue;
    const card = video.closest('.scene-card');
    if (auto && visible.has(video) && (!card || card.dataset.active === 'true')) {
      load(video);
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }
}

function setAuto(enabled) {
  auto = enabled;
  motionToggle.textContent = auto ? '暂停动作预览' : '播放动作预览';
  refreshGallery();
}
motionToggle.addEventListener('click', () => setAuto(!auto));
reduced.addEventListener('change', () => setAuto(!reduced.matches));
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const video = entry.target;
    if (entry.isIntersecting) {
      visible.add(video);
      if (video.controls) load(video);
    } else {
      visible.delete(video);
    }
  }
  refreshGallery();
}, {threshold: .23});
for (const video of clips) observer.observe(video);
for (const details of document.querySelectorAll('.scene-reels')) {
  details.addEventListener('toggle', event => {
    if (!event.target.open) {
      for (const clip of event.target.querySelectorAll('video')) clip.pause();
    }
  });
}
setAuto(auto);
showScene(active, true);
