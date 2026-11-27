import * as THREE from 'three';
import {GLTFLoader} from './viewer_lib/addons/loaders/GLTFLoader.js';
import {HDRLoader} from './viewer_lib/addons/loaders/HDRLoader.js';

const stage = document.querySelector('#stage');
const reset = document.querySelector('#view-reset');
const status = document.querySelector('#model-status');
const controls = [...document.querySelectorAll('[data-motion]')];
const playback = document.querySelector('#hero-playback');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

async function start() {
  const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
  try {
    const gltf = await new GLTFLoader().loadAsync(new URL('./libao.glb', import.meta.url).href);
    mount(renderer, gltf);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}

function makeContactShadow(height, floorY) {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 128;
  const context = surface.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(9, 17, 28, .95)');
  gradient.addColorStop(.42, 'rgba(9, 17, 28, .64)');
  gradient.addColorStop(1, 'rgba(9, 17, 28, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(surface);
  map.colorSpace = THREE.SRGBColorSpace;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(height * .7, height * .57),
    new THREE.MeshBasicMaterial({map, transparent:true, depthWrite:false})
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = floorY + height * .002;
  return shadow;
}

function directWave(clip) {
  // Bake an outward lift and two small wrist accents into the current clip.
  const arm = THREE.PropertyBinding.sanitizeNodeName('arm.L');
  const wrist = THREE.PropertyBinding.sanitizeNodeName('hand.L');
  const z = new THREE.Vector3(0,0,1);
  const y = new THREE.Vector3(0,1,0);
  const offset = new THREE.Quaternion();
  const value = new THREE.Quaternion();
  const forward = new THREE.Quaternion();
  const revised = clip.clone();
  for (const track of revised.tracks) {
    if (track.name !== arm + '.quaternion' && track.name !== wrist + '.quaternion') continue;
    for (const [i,t] of track.times.entries()) {
      const hold = THREE.MathUtils.smoothstep(t,.24,.96) * (1 - THREE.MathUtils.smoothstep(t,3.70,4.87));
      const beat = Math.sin((t - .82) * 4.7);
      value.fromArray(track.values, i * 4);
      if (track.name === arm + '.quaternion') {
        offset.setFromAxisAngle(z, hold * (.36 + .055 * beat));
        forward.setFromAxisAngle(y, -.29 * hold);
        value.premultiply(offset).premultiply(forward);
      } else {
        offset.setFromAxisAngle(y, hold * (.17 + .31 * beat));
        value.multiply(offset);
      }
      value.normalize().toArray(track.values, i * 4);
    }
  }
  return revised;
}

// Three original guide gestures, authored against the preserved joint rest poses.
function guideClips(model) {
  model.updateMatrixWorld(true);
  const axis={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
  const ease=x=>THREE.MathUtils.smoothstep(x,0,1);
  const gestures={
    Guide_Welcome:{'torso':{x:.04},'head':{x:.07},'arm.L':{z:.98,x:-.42},'forearm.L':{z:.32},'hand.L':{wave:.24}},
    Guide_Explain:{'head':{y:.27},'arm.L':{z:.78,x:-.40},'forearm.L':{x:-.18},'hand.L':{y:.17}},
    Guide_Verify:{'torso':{x:-.035},'head':{x:.10},'arm.R':{z:-.76,x:-.42},'forearm.R':{z:-.12}}
  };
  return Object.entries(gestures).map(([name,poses])=>{
    const tracks=[];
    for(const [label,motion] of Object.entries(poses)){
      const joint=model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(label))||model.getObjectByName(label);
      if(!joint)continue;
      const parentInverse=joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      const axes=Object.fromEntries(Object.entries(axis).map(([k,v])=>[k,v.clone().applyQuaternion(parentInverse)]));
      const rest=joint.quaternion.clone(),times=[],values=[];
      for(let i=0;i<=120;i++){
        const t=i/24,env=ease((t-.35)/.9)*ease((4.6-t)/.9),q=rest.clone();
        const keys=['z','x','y'];
        for(const k of keys) if(motion[k]) q.premultiply(new THREE.Quaternion().setFromAxisAngle(axes[k],motion[k]*env));
        if(motion.wave)q.premultiply(new THREE.Quaternion().setFromAxisAngle(axes.z,motion.wave*Math.sin((t-1.2)*Math.PI*2/.85)*env));
        times.push(t);values.push(...q.normalize().toArray());
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(joint.name+'.quaternion',times,values));
    }
    return new THREE.AnimationClip(name,5,tracks);
  });
}

function mount(renderer, {scene: model, animations}) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = .94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);

  const scene = new THREE.Scene();
  // Poly Haven CC0 softbox HDR: light and reflections only, no panorama visible.
  new HDRLoader().loadAsync(new URL('./environment/studio-small-08.hdr',import.meta.url).href).then(map=>{
    map.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = map;
    scene.environmentIntensity = .32;
    stage.dataset.environment = 'studio-small-08';
  }).catch(()=>{stage.dataset.environment='fallback'});
  const carrier = new THREE.Group();
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.getSize(new THREE.Vector3()).y;
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  carrier.add(model);
  model.traverse(object => {
    if (object.isMesh) object.castShadow = true;
  });
  const floorY = -height / 2 - height * .002;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(height * 5, height * 4),
    new THREE.ShadowMaterial({color:0x050c18, opacity:.42, depthWrite:false})
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  const contact = makeContactShadow(height, floorY);
  contact.renderOrder = 1;
  scene.add(floor, contact);
  scene.add(carrier, new THREE.HemisphereLight(0xe4edff, 0x8294a7, .62));
  for (const [color, intensity, x, y, z] of [
    [0xe1eaff, .8, -3, 2, 2], [0x4c94ee, 1.98, 3, 1.4, -3]
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x,y,z);
    scene.add(light);
  }

  const key = new THREE.DirectionalLight(0xffe7ce, 2.02);
  key.position.set(-height * 1.24, height * 3.7, height * 1.3);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, {
    left:-height * 1.2, right:height * 1.2,
    top:height * 1.2, bottom:-height * 1.2,
    near:height * 2.6, far:height * 5.4
  });
  key.shadow.normalBias = height * .003;
  key.shadow.radius = 9;
  scene.add(key);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 50);
  camera.position.set(0, height * .64, height * 4);
  camera.lookAt(0, -height * .025, 0);
  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map([...animations,...guideClips(model)].map(clip => [
    clip.name, clip.name === 'Wave_Greeting' ? directWave(clip) : clip
  ]));
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let index = 0;
  let body, face, pointerStart;
  let visible = true;
  let elapsed = 0;
  let yaw = -Math.PI / 10; // Default to a subtle three-quarter front view.
  let tilt = 0;
  let paused = reduced.matches;
  let lift = 0;
  let flightPitch = 0;
  let flightBank = 0;


  function resize() {
    const {clientWidth: width, clientHeight: pixels} = stage;
    if (!width || !pixels) return;
    const viewHeight = height * (width < 570 ? 1.32 : 1.25);
    const viewWidth = viewHeight * width / pixels;
    Object.assign(camera, {left: -viewWidth / 2, right: viewWidth / 2, top: viewHeight / 2, bottom: -viewHeight / 2});
    camera.updateProjectionMatrix();
    renderer.setSize(width, pixels, false);
  }

  function select(next, explicit = false) {
    index = next;
    elapsed = 0;
    if (explicit) setPaused(false);
    const button = controls[index];
    playback.disabled = button.dataset.motion === 'Static';
    controls.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    for (const action of [body, face]) action?.stop();
    body = face = null;
    if (explicit || !reduced.matches) {
      const clip = clips.get(button.dataset.motion);
      if (clip) {
        body = mixer.clipAction(clip).reset();
        if (button.dataset.motion === 'Wave_Greeting' || button.dataset.motion.startsWith('Guide_')) {
          body.setLoop(THREE.LoopOnce,1);
          body.clampWhenFinished = true;
        }
        body.play();
      }
      const expression = clips.get(button.dataset.face || 'Face_Idle');
      if (expression) face = mixer.clipAction(expression).reset().play();
    }
    status.textContent = button.textContent + '动作';
  }

  function hit(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(2 * (event.clientX - rect.x) / rect.width - 1, 1 - 2 * (event.clientY - rect.y) / rect.height);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(carrier, true).length > 0;
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointerStart = {x:event.clientX, y:event.clientY, yaw, tilt, onModel:hit(event)};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (Math.hypot(dx,dy) < 5) return;
    yaw = pointerStart.yaw + dx * .012;
    tilt = THREE.MathUtils.clamp(pointerStart.tilt + dy * .01, -.52, .52);
  });
  canvas.addEventListener('pointerup', event => {
    if (!pointerStart) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    const {onModel} = pointerStart;
    pointerStart = null;
    if (onModel && distance < 7) select((index + 1) % controls.length, true);
  });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; });
  reset.disabled = false;
  reset.addEventListener('click', () => { yaw = tilt = 0; });
  stage.addEventListener('keydown', event => {
    switch (event.key) {
      case 'ArrowLeft': yaw -= .2; break;
      case 'ArrowRight': yaw += .2; break;
      case 'ArrowUp': tilt = Math.max(-.52, tilt - .14); break;
      case 'ArrowDown': tilt = Math.min(.52, tilt + .14); break;
      case 'Enter': select((index + 1) % controls.length, true); break;
      default: return;
    }
    event.preventDefault();
  });
  function setPaused(value) {
    paused = value;
    playback.textContent = paused ? '▶' : 'Ⅱ';
    playback.setAttribute('aria-label', paused ? '播放角色动作' : '暂停角色动作');
  }

  mixer.addEventListener('finished', ({action}) => {
    if (action === body) {
      setPaused(true);
      playback.setAttribute('aria-label', '重播角色动作');
    }
  });
  playback.disabled = false;
  setPaused(paused);
  playback.addEventListener('click', () => {
    if (paused && (!body || body.paused)) select(index, true);
    else setPaused(!paused);
  });
  controls.forEach((button, i) => {
    button.disabled = false;
    button.addEventListener('click', () => select(i, true));
  });

  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(stage);
  reduced.addEventListener('change', () => {
    setPaused(reduced.matches);
    select(index);
  });
  resize();
  select(0);
  document.querySelector('#poster').hidden = true;
  stage.dataset.ready = 'true';
  let previous = performance.now();
  renderer.setAnimationLoop(now => {
    const delta = Math.min((now - previous) / 1000, .2);
    previous = now;
    if (!visible) return;
    if (!paused && !pointerStart) {
      elapsed += delta;
      mixer.update(delta);
    }
    const flying = body && controls[index].dataset.motion === 'Fly_Loop';
    const cycle = flying ? elapsed * Math.PI * 2 / body.getClip().duration : 0;
    const blend = 1 - Math.exp(-delta * 7);
    if ((!paused && !pointerStart) || !flying) {
      lift = THREE.MathUtils.lerp(lift, flying ? .102 + .038 * Math.sin(cycle) : 0, blend);
      flightPitch = THREE.MathUtils.lerp(flightPitch, flying ? -.06 + .13 * Math.cos(cycle) : 0, blend);
      flightBank = THREE.MathUtils.lerp(flightBank, flying ? .18 * Math.sin(cycle - .55) : 0, blend);
    }
    carrier.position.set(0, height * lift, 0);
    // Vertical drag orbits the camera so the shoes stay on the same floor.
    camera.position.y = height * Math.max(.16, .64 + tilt * 2.35);
    camera.lookAt(0, height * (-.025 + lift * .30), 0);
    const zoom = 1 - lift * .88;
    if (Math.abs(camera.zoom - zoom) > .0003) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
    carrier.rotation.set(flightPitch, yaw, flightBank);
    contact.material.opacity = Math.max(.18, .86 - lift * 4.2);
    contact.scale.setScalar(1 + lift * 2.1);
    stage.dataset.motion = controls[index].dataset.motion;
    renderer.render(scene, camera);
  });
}

start().catch(error => {
  console.warn('Interactive model unavailable:', error);
  status.textContent = '当前显示栗宝正面预览';
});
