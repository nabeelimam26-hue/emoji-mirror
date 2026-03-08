import { useState, useEffect, useRef, useCallback } from "react";
const handImage = "/images/hand.jpg";
import SpatialObjectController from "./components/SpatialObjectController"; // ← Spatial 3D controller
import { useFaceTracker } from "./utils/useFaceTracker"; // ← Hand tracking hook

// ─── HAND VISUALIZATION ───────────────────────────────────────────────────────
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

function drawHand(ctx, landmarks, w, h) {
  if (!landmarks || landmarks.length === 0) return;
  const pts = landmarks.map(lm => ({ x: lm.x * w, y: lm.y * h }));
  ctx.shadowColor = "#00ffcc"; ctx.shadowBlur = 12;
  ctx.strokeStyle = "rgba(0,255,204,0.7)"; ctx.lineWidth = 2.5;
  CONNECTIONS.forEach(([a, b]) => {
    ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
  });
  pts.forEach((pt, i) => {
    const isKnuckle = [0,5,9,13,17].includes(i);
    ctx.shadowColor = isKnuckle ? "#ff00aa" : "#00ffcc"; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, isKnuckle ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isKnuckle ? "#ff00aa" : "#00ffcc"; ctx.fill();
  });
}

// ─── GESTURE DETECTOR ─────────────────────────────────────────────────────────
function dist(a, b) { return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2); }

function getFingerStates(lm) {
  const MARGIN = 0.04;
  const index  = lm[8].y  < lm[5].y  - MARGIN;
  const middle = lm[12].y < lm[9].y  - MARGIN;
  const ring   = lm[16].y < lm[13].y - MARGIN;
  const pinky  = lm[20].y < lm[17].y - MARGIN;
  const thumbTip = lm[4], thumbIp = lm[3], wrist = lm[0], indexMcp = lm[5];
  const thumbUp   = thumbTip.y < wrist.y - 0.1  && thumbTip.y < thumbIp.y - 0.02;
  const thumbDown = thumbTip.y > wrist.y + 0.1  && thumbTip.y > thumbIp.y + 0.02;
  const thumbOut  = !thumbUp && !thumbDown && dist(thumbTip, indexMcp) > 0.15;
  return { index, middle, ring, pinky, thumbUp, thumbDown, thumbOut };
}

function classifyGesture(lm) {
  if (!lm || lm.length < 21) return "none";
  const f = getFingerStates(lm);
  const { index, middle, ring, pinky, thumbUp, thumbDown, thumbOut } = f;
  const allFolded = !index && !middle && !ring && !pinky;
  const allOut    = index && middle && ring && pinky;
  if (thumbUp   && allFolded)                                          return "thumbs_up";
  if (thumbDown && allFolded)                                          return "thumbs_down";
  if (allOut    && thumbOut)                                           return "open_palm";
  if (allFolded && !thumbUp && !thumbDown)                             return "fist";
  if (index && middle && !ring && !pinky)                              return "victory";
  if (index && !middle && !ring && !pinky && !thumbUp && !thumbOut)    return "point";
  if (index && !middle && !ring && pinky)                              return "rock_on";
  if (index && middle && ring && !pinky)                               return "three";
  if (allOut && !thumbOut && !thumbUp)                                 return "four";
  if (thumbOut && !index && !middle && !ring && pinky)                 return "call_me";
  if (thumbOut && index && !middle && !ring && !pinky)                 return "ok";
  if (allOut && !thumbUp && !thumbDown)                                return "vulcan";
  if (index && !middle && !ring && !pinky && (thumbUp||thumbOut))      return "finger_gun";
  return "unknown";
}

// ─── GESTURE CONFIG ───────────────────────────────────────────────────────────
const GESTURE_CONFIG = {
  thumbs_up:   { emoji:"👍", label:"Thumbs Up",   action:"save_note",  color:"#ffcc00", description:"Note saved!" },
  thumbs_down: { emoji:"👎", label:"Thumbs Down", action:"delete",     color:"#ff4444", description:"Last note deleted!" },
  victory:     { emoji:"✌️", label:"Victory",     action:"screenshot", color:"#00ffcc", description:"Screenshot taken!" },
  open_palm:   { emoji:"🖐️", label:"Open Palm",  action:"confetti",   color:"#ff66ff", description:"Confetti! 🎉" },
  fist:        { emoji:"✊", label:"Fist",         action:"clear",      color:"#ff4444", description:"Screen cleared!" },
  point:       { emoji:"☝️", label:"Point",       action:"draw",       color:"#8888ff", description:"Drawing mode!" },
  rock_on:     { emoji:"🤘", label:"Rock On",     action:"rock",       color:"#ff8800", description:"Rock on! 🎸" },
  three:       { emoji:"3️⃣", label:"Three",       action:"timer",      color:"#44ccff", description:"3 sec timer started!" },
  four:        { emoji:"4️⃣", label:"Four",        action:"notify",     color:"#44ffaa", description:"Notification!" },
  call_me:     { emoji:"🤙", label:"Call Me",     action:"call",       color:"#ff66aa", description:"Calling... 📞" },
  ok:          { emoji:"👌", label:"OK",           action:"confirm",    color:"#aaffaa", description:"Confirmed! ✅" },
  vulcan:      { emoji:"🖖", label:"Vulcan",      action:"starfleet",  color:"#8866ff", description:"Live long and prosper!" },
  finger_gun:  { emoji:"🫵", label:"Finger Gun",  action:"shoot",      color:"#ffaa44", description:"Pew pew! 💥" },
  none:        { emoji:"🤚", label:"No hand",     action:null,         color:"#555",    description:"" },
  unknown:     { emoji:"🤔", label:"Unknown",     action:null,         color:"#444",    description:"Gesture not recognized" },
};
const GESTURE_BUTTONS = Object.entries(GESTURE_CONFIG)
  .filter(([k]) => !["none","unknown"].includes(k))
  .map(([key,v]) => ({ key, emoji:v.emoji, label:v.label }));

// ─── SOUNDS ───────────────────────────────────────────────────────────────────
function playTone(freq=440, type="sine", dur=0.15, vol=0.18) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch(e) {}
}

const GESTURE_SOUNDS = {
  thumbs_up:   () => playTone(660,"sine",0.2,0.2),
  thumbs_down: () => playTone(220,"sawtooth",0.3,0.15),
  victory:     () => { playTone(523,"sine",0.1); setTimeout(()=>playTone(659,"sine",0.15),100); setTimeout(()=>playTone(784,"sine",0.2),200); },
  open_palm:   () => playTone(440,"sine",0.4,0.1),
  fist:        () => playTone(120,"square",0.2,0.25),
  point:       () => playTone(880,"sine",0.1,0.15),
  rock_on:     () => { playTone(110,"sawtooth",0.15); setTimeout(()=>playTone(165,"sawtooth",0.15),100); setTimeout(()=>playTone(220,"sawtooth",0.3),200); },
  three:       () => { [523,659,784].forEach((f,i)=>setTimeout(()=>playTone(f,"sine",0.15,0.2),i*120)); },
  four:        () => playTone(587,"sine",0.2,0.2),
  call_me:     () => { [700,600,700].forEach((f,i)=>setTimeout(()=>playTone(f,"sine",0.18,0.15),i*200)); },
  ok:          () => { playTone(523,"sine",0.08); setTimeout(()=>playTone(659,"sine",0.12),80); setTimeout(()=>playTone(1047,"sine",0.2),160); },
  vulcan:      () => { [400,500,600,500,400].forEach((f,i)=>setTimeout(()=>playTone(f,"sine",0.12,0.1),i*80)); },
  finger_gun:  () => { playTone(800,"square",0.05,0.3); setTimeout(()=>playTone(200,"sawtooth",0.3,0.2),50); },
};

// ─── PARTICLES ────────────────────────────────────────────────────────────────
function createParticles(count=80) {
  return Array.from({ length: count }, (_,i) => ({
    id: Date.now()+i, x: Math.random()*100, y: -10-Math.random()*20,
    vx: (Math.random()-0.5)*3, vy: 2+Math.random()*3,
    color: ["#ff00aa","#00ffcc","#ffcc00","#ff8800","#8888ff","#44ccff"][Math.floor(Math.random()*6)],
    size: 6+Math.random()*8, rot: Math.random()*360,
  }));
}
function createEmojiRain(emoji) {
  return Array.from({ length: 30 }, (_,i) => ({
    id: Date.now()+i+1000, emoji,
    x: Math.random()*100, y: -5-Math.random()*10,
    vx: (Math.random()-0.5)*1, vy: 1.5+Math.random()*2,
    rot: Math.random()*30-15, size: 20+Math.random()*20,
  }));
}

// ─── SPEECH ───────────────────────────────────────────────────────────────────
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1; u.pitch = 1; u.volume = 0.7;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch(e) {}
}

// ─── COMBOS ───────────────────────────────────────────────────────────────────
const COMBOS = {
  "thumbs_up,victory":     "🌟 SUPER SAVE!",
  "rock_on,fist":          "💥 ROCK SMASH!",
  "open_palm,fist":        "🤜 HIGH FIVE!",
  "victory,victory":       "✌️✌️ DOUBLE PEACE!",
  "thumbs_up,thumbs_up":   "👍👍 DOUBLE YES!",
  "point,point":           "☝️☝️ DOUBLE POINT!",
  "vulcan,open_palm":      "🖖🖐️ GREETINGS!",
  "finger_gun,finger_gun": "💥💥 DOUBLE SHOT!",
  "ok,thumbs_up":          "✅👍 PERFECT!",
  "fist,rock_on":          "🤘 UNLEASH THE ROCK!",
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function EmojiMirror() {
  // ── Initialize custom hook for hand tracking ───────────────────────────────
  const { 
    handLandmarkerRef, loadModel, detectFromImage: hookDetectFromImage, 
    startDetectionLoop: hookStartDetectionLoop
  } = useFaceTracker();

  // ── Refs ───────────────────────────────────────────────────────────────────
  const canvasRef         = useRef(null);
  const videoRef          = useRef(null);
  const cooldownRef       = useRef(false);
  const lastGestureRef    = useRef("none");
  const loopRef           = useRef(null);
  const streamRef         = useRef(null);
  const fpsRef            = useRef({ frames:0, last:Date.now(), fps:0 });
  const drawingRef        = useRef(false);
  const drawPathRef       = useRef([]);
  const comboRef          = useRef([]);
  const comboTimerRef     = useRef(null);
  const lastLmRef         = useRef(null);
  const handsRef          = useRef(null);   // ← Feeds raw hand data to SpatialObjectController

  // ── State ──────────────────────────────────────────────────────────────────
  const [inputMode, setInputMode]           = useState("image");
  const [modelReady, setModelReady]         = useState(false);
  const [scanning, setScanning]             = useState(false);
  const [videoPlaying, setVideoPlaying]     = useState(false);
  const [webcamActive, setWebcamActive]     = useState(false);
  const [videoError, setVideoError]         = useState(null);
  const [currentGesture, setCurrentGesture] = useState("none");
  const [gestureDebug, setGestureDebug]     = useState(null);
  const [lastAction, setLastAction]         = useState(null);
  const [log, setLog]                       = useState([]);
  const [particles, setParticles]           = useState([]);
  const [emojiRain, setEmojiRain]           = useState([]);
  const [notes, setNotes]                   = useState([]);
  const [screenshots, setScreenshots]       = useState([]);
  const [cleared, setCleared]               = useState(false);
  const [activeTab, setActiveTab]           = useState("mirror");
  const [showDebug, setShowDebug]           = useState(false);
  const [soundEnabled, setSoundEnabled]     = useState(true);
  const [speechEnabled, setSpeechEnabled]   = useState(false);
  const [fps, setFps]                       = useState(0);
  const [sessionStart]                      = useState(Date.now());
  const [sessionTime, setSessionTime]       = useState(0);
  const [gestureCount, setGestureCount]     = useState({});
  const [comboLog, setComboLog]             = useState([]);
  const [timerActive, setTimerActive]       = useState(false);
  const [timerCount, setTimerCount]         = useState(0);
  const [drawMode, setDrawMode]             = useState(false);
  const [theme, setTheme]                   = useState("dark");
  const [gestureMap, setGestureMap]         = useState({});
  const [showMapper, setShowMapper]         = useState(false);
  const [streak, setStreak]                 = useState({ gesture:"none", count:0 });
  const [notification, setNotification]     = useState(null);
  const [show3D, setShow3D]                 = useState(true);
  const [uploadedModels, setUploadedModels] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploadedVideos, setUploadedVideos] = useState([]);

  // ── Theme ──────────────────────────────────────────────────────────────────
  const T = theme === "dark"
    ? { bg:"#080c10", border:"rgba(0,255,204,0.2)", accent:"#00ffcc", dim:"#333",    text:"#e0e0e0", grid:"rgba(0,255,204,0.05)" }
    : { bg:"#0a0020", border:"rgba(180,0,255,0.3)", accent:"#cc00ff", dim:"#440066", text:"#e0c0ff", grid:"rgba(180,0,255,0.06)" };

  // ── Session timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setSessionTime(Math.floor((Date.now()-sessionStart)/1000)), 1000);
    return () => clearInterval(t);
  }, [sessionStart]);
  const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  // ── Notification ───────────────────────────────────────────────────────────
  const showNotif = useCallback((msg, color="#00ffcc") => {
    setNotification({ msg, color });
    setTimeout(() => setNotification(null), 2500);
  }, []);

  // ── Stop everything ────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (loopRef.current)   { cancelAnimationFrame(loopRef.current); loopRef.current=null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; }
    if (videoRef.current)  { videoRef.current.pause(); videoRef.current.srcObject=null; }
    setVideoPlaying(false); setWebcamActive(false); setVideoError(null);
    setCurrentGesture("none"); setFps(0);
    handsRef.current = null;
  }, []);

  // ── Load MediaPipe model (using custom hook) ───────────────────────────────
  const loadModelWrapper = useCallback(async (mode) => {
    const success = await loadModel(mode);
    if (success) {
      setModelReady(true);
    }
  }, [loadModel]);

  const switchMode = useCallback((mode) => {
    stopAll(); setInputMode(mode); setDrawMode(false); drawPathRef.current=[];
    renderGrid(); loadModelWrapper(mode);
  }, [stopAll, loadModelWrapper]);

  // ── Canvas grid ────────────────────────────────────────────────────────────
  const renderGrid = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
    for (let x=0; x<canvas.width;  x+=30) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for (let y=0; y<canvas.height; y+=30) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
    if (drawPathRef.current.length > 1) {
      ctx.strokeStyle="#ff66ff"; ctx.lineWidth=3; ctx.shadowColor="#ff66ff"; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.moveTo(drawPathRef.current[0].x, drawPathRef.current[0].y);
      drawPathRef.current.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); ctx.shadowBlur=0;
    }
  }, [T.grid]);

  useEffect(() => { renderGrid(); loadModelWrapper("image"); }, [renderGrid, loadModelWrapper]);

  // ── Combo checker ──────────────────────────────────────────────────────────
  const checkCombo = useCallback((gesture) => {
    const combo = comboRef.current;
    combo.push(gesture);
    if (combo.length > 2) combo.shift();
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => { comboRef.current = []; }, 2500);
    const key = combo.join(",");
    if (COMBOS[key]) {
      showNotif("COMBO: " + COMBOS[key], "#ffcc00");
      if (soundEnabled) {
        playTone(880,"sine",0.05,0.3);
        setTimeout(()=>playTone(1047,"sine",0.1,0.3),100);
        setTimeout(()=>playTone(1319,"sine",0.2,0.3),200);
      }
      setComboLog(prev => [{ combo: COMBOS[key], time: new Date().toLocaleTimeString() }, ...prev.slice(0,9)]);
      comboRef.current = [];
    }
  }, [soundEnabled, showNotif]);

  // ── Trigger action ─────────────────────────────────────────────────────────
  const triggerAction = useCallback((gesture, lm) => {
    if (lm) {
      setGestureDebug(getFingerStates(lm));
      lastLmRef.current = lm;
      handsRef.current = { hands: [{landmarks: lm, handedness: "Right"}], count: 1 };  // ← Feed to spatial controller
    } else {
      handsRef.current = null;
    }
    setCurrentGesture(gesture);
    if (gesture === "none" || gesture === "unknown") return;
    if (cooldownRef.current) return;
    if (gesture === lastGestureRef.current) return;

    cooldownRef.current = true;
    lastGestureRef.current = gesture;

    setStreak(prev => prev.gesture === gesture ? { gesture, count: prev.count+1 } : { gesture, count: 1 });
    setGestureCount(prev => ({ ...prev, [gesture]: (prev[gesture]||0)+1 }));
    if (soundEnabled && GESTURE_SOUNDS[gesture]) GESTURE_SOUNDS[gesture]();
    if (speechEnabled) speak(GESTURE_CONFIG[gesture]?.label || gesture);

    const effectiveAction = gestureMap[gesture] || GESTURE_CONFIG[gesture]?.action;
    const cfg = GESTURE_CONFIG[gesture];
    setLastAction({ gesture, cfg, time: Date.now() });
    setLog(prev => [{ gesture, cfg, time: new Date().toLocaleTimeString() }, ...prev.slice(0,49)]);

    if (effectiveAction === "confetti")   setParticles(createParticles());
    if (effectiveAction === "clear")      { setCleared(true); setTimeout(()=>setCleared(false),800); drawPathRef.current=[]; renderGrid(); }
    if (effectiveAction === "save_note")  setNotes(prev => [{ text:`Note saved at ${new Date().toLocaleTimeString()}`, time:Date.now() }, ...prev]);
    if (effectiveAction === "delete")     setNotes(prev => prev.slice(1));
    if (effectiveAction === "draw")       { setDrawMode(m=>!m); drawingRef.current=!drawingRef.current; showNotif(drawingRef.current?"✏️ Draw mode ON":"✏️ Draw mode OFF","#8888ff"); }
    if (effectiveAction === "rock")       setEmojiRain(createEmojiRain("🎸"));
    if (effectiveAction === "call")       setEmojiRain(createEmojiRain("📞"));
    if (effectiveAction === "starfleet")  setEmojiRain(createEmojiRain("🖖"));
    if (effectiveAction === "shoot")      setEmojiRain(createEmojiRain("💥"));
    if (effectiveAction === "confirm")    showNotif("✅ Confirmed!", "#aaffaa");
    if (effectiveAction === "notify")     showNotif("🔔 Notification sent!", "#44ffaa");
    if (effectiveAction === "timer") {
      setTimerActive(true); setTimerCount(3);
      let c=3;
      if (soundEnabled) playTone(660,"sine",0.15,0.2);
      const t = setInterval(()=>{
        c--; setTimerCount(c);
        if (soundEnabled) playTone(c===0?880:550,"sine",0.15,0.2);
        if (c<=0) { clearInterval(t); setTimerActive(false); showNotif("⏱ Time's up!","#44ccff"); }
      },1000);
    }
    if (effectiveAction === "screenshot") {
      const canvas = canvasRef.current;
      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");
        setScreenshots(prev => [{ label:`Screenshot ${prev.length+1}`, time:new Date().toLocaleTimeString(), dataUrl }, ...prev]);
        showNotif("📸 Screenshot saved!", "#00ffcc");
        const a = document.createElement("a");
        a.href = dataUrl; a.download = `emoji-mirror-${Date.now()}.png`; a.click();
      }
    }

    checkCombo(gesture);
    setTimeout(() => { cooldownRef.current=false; lastGestureRef.current="none"; }, 1500);
  }, [soundEnabled, speechEnabled, gestureMap, checkCombo, renderGrid, showNotif]);

  // ── Draw mode: track index tip ─────────────────────────────────────────────
  const updateDrawing = useCallback((lm, w, h) => {
    if (!drawingRef.current || !lm) return;
    const tip = lm[8];
    const x = tip.x * w, y = tip.y * h;
    drawPathRef.current.push({ x, y });
    if (drawPathRef.current.length > 200) drawPathRef.current = drawPathRef.current.slice(-200);
  }, []);

  // ── FPS ────────────────────────────────────────────────────────────────────
  const updateFps = useCallback(() => {
    const now = Date.now(); fpsRef.current.frames++;
    if (now - fpsRef.current.last >= 1000) {
      setFps(fpsRef.current.frames);
      fpsRef.current = { frames:0, last:now, fps:fpsRef.current.frames };
    }
  }, []);

  // ── MODE 1: Static image (using custom hook) ───────────────────────────────
  const detectFromImage = useCallback(() => {
    if (!handLandmarkerRef.current || !modelReady) return;
    setScanning(true);
    const img = new Image(); img.src = handImage;
    img.onload = () => {
      try {
        const canvas = canvasRef.current; const ctx = canvas.getContext("2d");
        canvas.width=img.width; canvas.height=img.height;
        ctx.drawImage(img,0,0);
        const result = hookDetectFromImage(img);
        // Handle both single landmark and multi-hand detection formats
        const lm = result?.hands ? result.hands[0]?.landmarks : result;
        if (lm) {
          drawHand(ctx,lm,canvas.width,canvas.height);
          const gesture = classifyGesture(lm);
          triggerAction(gesture,lm);
        } else {
          handsRef.current = null;
          triggerAction("none",null);
          renderGrid();
        }
      } catch(e) { console.error(e); }
      setScanning(false);
    };
    img.onerror = ()=>setScanning(false);
  }, [modelReady, handLandmarkerRef, hookDetectFromImage, triggerAction, renderGrid]);

  // ── Shared video/webcam loop (using custom hook) ──────────────────────────
  const startDetectionLoop = useCallback((videoEl, mirror=false) => {
    const onLandmarks = (handsData, canvas) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      
      // Redraw canvas with grid
      ctx.strokeStyle = T.grid; ctx.lineWidth=1;
      for(let x=0;x<canvas.width;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
      for(let y=0;y<canvas.height;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
      
      // Mirror video if needed
      if (mirror) { ctx.save(); ctx.scale(-1,1); ctx.drawImage(videoEl,-canvas.width,0,canvas.width,canvas.height); ctx.restore(); }
      else ctx.drawImage(videoEl,0,0,canvas.width,canvas.height);
      
      // Draw paint trail
      if (drawPathRef.current.length>1) {
        ctx.strokeStyle="#ff66ff"; ctx.lineWidth=3; ctx.shadowColor="#ff66ff"; ctx.shadowBlur=8;
        ctx.beginPath(); ctx.moveTo(drawPathRef.current[0].x,drawPathRef.current[0].y);
        drawPathRef.current.forEach(p=>ctx.lineTo(p.x, p.y)); ctx.stroke(); ctx.shadowBlur=0;
      }
      
      // Detect gesture and trigger action
      if (handsData) {
        // Handle multi-hand format from hook
        const landmarks = handsData.hands ? handsData.hands[0]?.landmarks : handsData;
        handsRef.current = handsData;  // ← Feed full data to spatial controller
        if (landmarks) {
          drawHand(ctx,landmarks,canvas.width,canvas.height);
          updateDrawing(landmarks,canvas.width,canvas.height);
          const gesture = classifyGesture(landmarks);
          triggerAction(gesture,landmarks);
        }
      } else {
        handsRef.current = null;
        triggerAction("none",null);
      }
      
      updateFps();
    };
    
    // Start the detection loop using the hook
    loopRef.current = hookStartDetectionLoop(videoEl, canvasRef, onLandmarks, mirror);
  }, [T.grid, hookStartDetectionLoop, triggerAction, updateDrawing, updateFps]);

  // ── MODE 2: Video file ─────────────────────────────────────────────────────
  const startVideo = useCallback(() => {
    if (!handLandmarkerRef.current||!modelReady) return;
    setVideoError(null);
    const video = videoRef.current;
    video.src="/videos/hand.mp4"; video.loop=true; video.muted=true; video.playsInline=true;
    video.onloadeddata=()=>{ video.play().then(()=>{setVideoPlaying(true);startDetectionLoop(video,false);}).catch(e=>setVideoError(`${e.message}`)); };
    video.onerror=()=>setVideoError("Could not load /videos/hand.mp4");
    video.load();
  }, [modelReady,startDetectionLoop]);

  const stopVideo = useCallback(() => {
    if (loopRef.current){cancelAnimationFrame(loopRef.current);loopRef.current=null;}
    if (videoRef.current){videoRef.current.pause();videoRef.current.src="";}
    setVideoPlaying(false); setCurrentGesture("none"); setFps(0);
    handsRef.current=null; renderGrid();
  }, [renderGrid]);

  // ── MODE 3: Webcam ─────────────────────────────────────────────────────────
  const startWebcam = useCallback(async () => {
    if (!handLandmarkerRef.current||!modelReady) return;
    setVideoError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:{width:640,height:480}});
      streamRef.current=stream;
      const video=videoRef.current; video.srcObject=stream; video.muted=true; video.playsInline=true;
      await video.play(); setWebcamActive(true); startDetectionLoop(video,true);
    } catch(err) {
      if (err.name==="NotFoundError") setVideoError("No camera found.");
      else if (err.name==="NotAllowedError") setVideoError("Camera access denied.");
      else setVideoError(`Camera error: ${err.message}`);
    }
  }, [modelReady,startDetectionLoop]);

  const stopWebcam = useCallback(() => {
    if (loopRef.current){cancelAnimationFrame(loopRef.current);loopRef.current=null;}
    if (streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
    if (videoRef.current){videoRef.current.pause();videoRef.current.srcObject=null;}
    setWebcamActive(false); setCurrentGesture("none"); setFps(0);
    handsRef.current=null; renderGrid();
  }, [renderGrid]);

  useEffect(()=>()=>stopAll(),[stopAll]);

  // ── Particle animations ────────────────────────────────────────────────────
  useEffect(() => {
    if (!particles.length) return;
    let local=[...particles]; let frame;
    const tick=()=>{
      local=local.map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,rot:p.rot+3,vy:p.vy+0.08})).filter(p=>p.y<120);
      setParticles([...local]); if(local.length>0) frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick); return()=>cancelAnimationFrame(frame);
  },[particles.length>0&&particles[0]?.id]);

  useEffect(() => {
    if (!emojiRain.length) return;
    let local=[...emojiRain]; let frame;
    const tick=()=>{
      local=local.map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,rot:p.rot+2,vy:p.vy+0.1})).filter(p=>p.y<120);
      setEmojiRain([...local]); if(local.length>0) frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick); return()=>cancelAnimationFrame(frame);
  },[emojiRain.length>0&&emojiRain[0]?.id]);

  const topGesture = Object.entries(gestureCount).sort((a,b)=>b[1]-a[1])[0];
  const cfg = GESTURE_CONFIG[currentGesture] || GESTURE_CONFIG.none;

  return (
    <div style={{ background:T.bg, color:T.text, fontFamily:"'Courier New',monospace", minHeight:"100vh" }}>
      {/* Particle effects */}
      {particles.map(p=><div key={p.id} style={{ position:"fixed",left:`${p.x}%`,top:`${p.y}%`,width:p.size,height:p.size,background:p.color,transform:`rotate(${p.rot}deg)`,pointerEvents:"none",zIndex:60,borderRadius:"50%" }} />)}
      {emojiRain.map(p=><div key={p.id} style={{ position:"fixed",left:`${p.x}%`,top:`${p.y}%`,fontSize:p.size,transform:`rotate(${p.rot}deg)`,pointerEvents:"none",zIndex:61,lineHeight:1,userSelect:"none" }}>{p.emoji}</div>)}
      {cleared && <div style={{ position:"fixed",inset:0,background:"rgba(255,68,68,0.15)",zIndex:55,pointerEvents:"none" }} />}
      {notification && <div style={{ position:"fixed",top:20,right:20,padding:"12px 18px",background:notification.color+"30",border:`2px solid ${notification.color}`,borderRadius:4,zIndex:100,letterSpacing:2,fontSize:12 }}>{notification.msg}</div>}
      {timerActive && (
        <div style={{ position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,pointerEvents:"none",fontSize:200,fontWeight:"bold",color:"rgba(0,255,204,0.3)" }}>
          {timerCount}
        </div>
      )}

      <div style={{ padding:20,maxWidth:1280,margin:"0 auto" }}>
        {/* Main content */}
        <div style={{ marginBottom:20 }}>
          <h1 style={{ marginBottom:2,fontSize:28,letterSpacing:3 }}>👁️ EMOJI MIRROR</h1>
          <p style={{ fontSize:10,color:T.dim,letterSpacing:2,margin:0 }}>Gesture Recognition • Hand Tracking • 3D Physics Engine</p>
        </div>

        {/* 3D Controller or Canvas */}
        <div style={{ marginBottom:20,border:`1px solid ${T.border}`,borderRadius:4,overflow:"hidden",background:"#050810" }}>
          {show3D && (
            <div style={{ position:"relative",width:"100%",height:"400px" }}>
              <SpatialObjectController handsRef={handsRef} />
            </div>
          )}
          <canvas ref={canvasRef} width={600} height={380} style={{ display:show3D?"none":"block",width:"100%",height:"auto" }} />
          <div style={{ padding:10,borderTop:`1px solid ${T.border}`,fontSize:9,color:T.dim }}>
            {inputMode==="webcam"?"LIVE":"STATIC"} • {fps} FPS • {fmtTime(sessionTime)}
          </div>
        </div>

        {/* Controls */}
        <div style={{ marginBottom:20,display:"flex",gap:10,flexWrap:"wrap" }}>
          {[{key:"image",label:"IMAGE"},{key:"video",label:"VIDEO"},{key:"webcam",label:"WEBCAM"}].map(m=>(
            <button key={m.key} onClick={()=>switchMode(m.key)} style={{flex:1,padding:"10px",background:inputMode===m.key?`${T.accent}22`:"transparent",border:`1px solid ${inputMode===m.key?T.accent:T.border}`,color:inputMode===m.key?T.accent:T.dim,cursor:"pointer",borderRadius:3,fontSize:11,letterSpacing:2}}>
              {m.label}
            </button>
          ))}
          <button onClick={()=>setShow3D(s=>!s)} style={{flex:1,padding:"10px",background:show3D?`${T.accent}22`:"transparent",border:`1px solid ${show3D?T.accent:T.border}`,color:show3D?T.accent:T.dim,cursor:"pointer",borderRadius:3,fontSize:11,letterSpacing:2}}>
            3D
          </button>
        </div>

        {/* Mode-specific buttons */}
        {inputMode==="image" && <button onClick={detectFromImage} disabled={scanning} style={{width:"100%",padding:"12px",background:scanning?"#444":"#00ffcc33",border:"1px solid #00ffcc55",color:"#00ffcc",cursor:scanning?"not-allowed":"pointer",borderRadius:3,marginBottom:20,fontSize:11,letterSpacing:2}}>
          {scanning?"SCANNING...":"RUN DETECTION"}
        </button>}
        {inputMode==="video" && <button onClick={startVideo} disabled={videoPlaying} style={{width:"100%",padding:"12px",marginBottom:20,background:videoPlaying?"rgba(255,68,68,0.2)":"#44ffaa33",border:"1px solid #44ffaa66",color:"#44ffaa",cursor:videoPlaying?"not-allowed":"pointer",borderRadius:3,fontSize:11,letterSpacing:2}}>
          {videoPlaying?"PLAYING":"PLAY VIDEO"}
        </button>}
        {inputMode==="webcam" && (
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            <button onClick={startWebcam} disabled={webcamActive} style={{flex:1,padding:"12px",background:webcamActive?"rgba(255,68,68,0.2)":"#ff66ff33",border:"1px solid #ff66ff66",color:"#ff66ff",cursor:webcamActive?"not-allowed":"pointer",borderRadius:3,fontSize:11,letterSpacing:2}}>
              {webcamActive?"ACTIVE":"START"}
            </button>
            {webcamActive && <button onClick={stopWebcam} style={{flex:1,padding:"12px",background:"rgba(255,68,68,0.3)",border:"1px solid rgba(255,68,68,0.8)",color:"#ff6666",cursor:"pointer",borderRadius:3,fontSize:11,letterSpacing:2}}>
              STOP
            </button>}
          </div>
        )}

        {/* Status */}
        <div style={{padding:12,border:`1px solid ${T.border}`,background:`${T.accent}08`,borderRadius:3,marginBottom:20,fontSize:11}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:32}}>{cfg.emoji}</span>
            <div>
              <div style={{fontSize:14,fontWeight:"bold",color:cfg.color,letterSpacing:2}}>{cfg.label}</div>
              <div style={{fontSize:9,color:T.dim}}>{cfg.description}</div>
            </div>
          </div>
        </div>

        {/* Log */}
        <div style={{padding:12,border:`1px solid ${T.border}`,borderRadius:3,fontSize:8}}>
          <div style={{marginBottom:8,letterSpacing:2,color:T.dim}}>RECENT</div>
          {log.slice(0,10).map((entry,i)=>(
            <div key={i} style={{padding:4,borderBottom:"1px solid "+T.border,display:"flex",justifyContent:"space-between",color:entry.cfg?.color}}>
              <span>{entry.cfg?.emoji} {entry.cfg?.label}</span>
              <span>{entry.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
