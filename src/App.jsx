import { useState, useEffect, useRef, useCallback } from "react";
const handImage = "/images/hand.jpg";
import EmojiScene from "./components/EmojiScene";      // ← NEW: 3D scene component
import { useFaceTracker } from "./utils/useFaceTracker"; // ← NEW: custom hook for hand tracking

// ─── HAND RENDERER ────────────────────────────────────────────────────────────
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
  ctx.shadowBlur = 0;
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

// ─── MEDIAPIPE ────────────────────────────────────────────────────────────────
// Now handled by useFaceTracker hook - see utils/useFaceTracker.js


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
  const landmarksRef      = useRef(null);   // ← feeds live landmarks into EmojiScene

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
  const [show3D, setShow3D]                 = useState(false);  // ← NEW
  const [selectedModel, setSelectedModel]   = useState("/models/trainengine.glb");  // ← NEW: Model switcher
  const [uploadedModels, setUploadedModels] = useState([]);    // ← NEW: User-uploaded models
  const [uploadedImages, setUploadedImages] = useState([]);    // ← NEW: User-uploaded images
  const [uploadedVideos, setUploadedVideos] = useState([]);    // ← NEW: User-uploaded videos
  const [showUploadUI, setShowUploadUI]     = useState(false); // ← NEW: Upload panel toggle

  // ─── AVAILABLE MODELS (Static + Dynamic) ──────────────────────────────────────
  const DEFAULT_MODELS = [
    { path: "/models/trainengine.glb", label: "🚂 Train Engine", name: "trainengine" },
    { path: "/models/ImageToStl.com_trphystar.glb", label: "⭐ Trophy Star", name: "trophy" },
  ];
  
  const AVAILABLE_MODELS = [
    ...DEFAULT_MODELS,
    ...uploadedModels,
  ];

  // ── Theme ──────────────────────────────────────────────────────────────────
  const T = theme === "neon"
    ? { bg:"#0a0020", border:"rgba(180,0,255,0.3)", accent:"#cc00ff", dim:"#440066", text:"#e0c0ff", grid:"rgba(180,0,255,0.06)" }
    : { bg:"#080c10", border:"rgba(0,255,204,0.2)", accent:"#00ffcc", dim:"#333",    text:"#e0e0e0", grid:"rgba(0,255,204,0.05)" };

  // ── Session timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setSessionTime(Math.floor((Date.now()-sessionStart)/1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  // ── Notification ───────────────────────────────────────────────────────────
  const showNotif = useCallback((msg, color="#00ffcc") => {
    setNotification({ msg, color });
    setTimeout(() => setNotification(null), 2500);
  }, []);

  // ── FILE UPLOAD HANDLERS ──────────────────────────────────────────────────────
  const handleModelUpload = useCallback((e) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.name.toLowerCase().endsWith(".glb")) {
        showNotif(`⚠ ${file.name} is not GLB format`, "#ff8800");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const blob = new Blob([ev.target.result], { type: "model/gltf-binary" });
        const blobUrl = URL.createObjectURL(blob);
        const modelName = file.name.replace(".glb", "");
        const newModel = {
          path: blobUrl,
          label: `📤 ${modelName}`,
          name: modelName.toLowerCase().replace(/[^a-z0-9]/g, ""),
          isUploaded: true,
        };
        setUploadedModels(prev => [...prev, newModel]);
        setSelectedModel(blobUrl);
        showNotif(`✅ Model loaded: ${file.name}`, "#00ffcc");
      };
      reader.readAsArrayBuffer(file);
    });
    e.target.value = "";
  }, [showNotif]);

  const handleImageUpload = useCallback((e) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!["jpg", "jpeg", "png", "gif", "webp"].some(ext => file.name.toLowerCase().endsWith(ext))) {
        showNotif(`⚠ ${file.name} is not an image format`, "#ff8800");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imageUrl = ev.target.result;
        setUploadedImages(prev => [...prev, { name: file.name, url: imageUrl, isUploaded: true }]);
        showNotif(`✅ Image loaded: ${file.name}`, "#00ffcc");
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, [showNotif]);

  const handleVideoUpload = useCallback((e) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!["mp4", "webm", "ogg"].some(ext => file.name.toLowerCase().endsWith(ext))) {
        showNotif(`⚠ ${file.name} is not a video format`, "#ff8800");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const blob = new Blob([ev.target.result], { type: file.type });
        const videoUrl = URL.createObjectURL(blob);
        setUploadedVideos(prev => [...prev, { name: file.name, url: videoUrl, isUploaded: true }]);
        showNotif(`✅ Video loaded: ${file.name}`, "#00ffcc");
      };
      reader.readAsArrayBuffer(file);
    });
    e.target.value = "";
  }, [showNotif]);

  const removeUploadedModel = useCallback((index) => {
    setUploadedModels(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].path);
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  const removeUploadedImage = useCallback((index) => {
    setUploadedImages(prev => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  const removeUploadedVideo = useCallback((index) => {
    setUploadedVideos(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  // ── Stop everything ────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (loopRef.current)   { cancelAnimationFrame(loopRef.current); loopRef.current=null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; }
    if (videoRef.current)  { videoRef.current.pause(); videoRef.current.srcObject=null; }
    setVideoPlaying(false); setWebcamActive(false); setVideoError(null);
    setCurrentGesture("none"); setFps(0);
    landmarksRef.current = null;   // ← clear landmarks so 3D goes idle
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
      landmarksRef.current = lm;   // ← NEW: always keep latest landmarks in ref for ThreeCanvas
    } else {
      landmarksRef.current = null;
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
        const lm = hookDetectFromImage(img);
        if (lm) {
          landmarksRef.current = lm;
          drawHand(ctx,lm,canvas.width,canvas.height);
          const gesture = classifyGesture(lm);
          triggerAction(gesture,lm);
        } else {
          landmarksRef.current = null;
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
    const onLandmarks = (landmarks, canvas) => {
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
      if (landmarks) {
        drawHand(ctx,landmarks,canvas.width,canvas.height);
        updateDrawing(landmarks,canvas.width,canvas.height);
        const gesture = classifyGesture(landmarks);
        triggerAction(gesture,landmarks);
      } else {
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
    landmarksRef.current=null; renderGrid();
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
    landmarksRef.current=null; renderGrid();
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
      local=local.map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,rot:p.rot+(Math.random()-0.5)*2})).filter(p=>p.y<110);
      setEmojiRain([...local]); if(local.length>0) frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick); return()=>cancelAnimationFrame(frame);
  },[emojiRain.length>0&&emojiRain[0]?.id]);

  const topGesture = Object.entries(gestureCount).sort((a,b)=>b[1]-a[1])[0];
  const cfg    = GESTURE_CONFIG[currentGesture] || GESTURE_CONFIG.none;
  const isLive = videoPlaying || webcamActive;
  const ALL_ACTIONS = ["save_note","delete","screenshot","confetti","clear","draw","rock","call","confirm","notify","timer","shoot","starfleet"];

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:T.bg, fontFamily:"'Courier New',monospace", color:T.text, position:"relative", overflow:"hidden" }}>

      {/* Scanlines */}
      <div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:50,background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px)" }} />

      {/* Confetti */}
      {particles.map(p=><div key={p.id} style={{ position:"fixed",left:`${p.x}%`,top:`${p.y}%`,width:p.size,height:p.size,background:p.color,transform:`rotate(${p.rot}deg)`,pointerEvents:"none",zIndex:60,borderRadius:"2px" }} />)}

      {/* Emoji rain */}
      {emojiRain.map(p=><div key={p.id} style={{ position:"fixed",left:`${p.x}%`,top:`${p.y}%`,fontSize:p.size,transform:`rotate(${p.rot}deg)`,pointerEvents:"none",zIndex:61,lineHeight:1,userSelect:"none" }}>{p.emoji}</div>)}

      {/* Clear flash */}
      {cleared && <div style={{ position:"fixed",inset:0,background:"rgba(255,68,68,0.15)",zIndex:55,pointerEvents:"none" }} />}

      {/* Notification banner */}
      {notification && (
        <div style={{ position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",zIndex:80,padding:"10px 24px",background:`${notification.color}22`,border:`1px solid ${notification.color}`,borderRadius:4,fontSize:13,color:notification.color,letterSpacing:2,fontFamily:"'Courier New',monospace",boxShadow:`0 0 20px ${notification.color}44` }}>
          {notification.msg}
        </div>
      )}

      {/* Timer overlay */}
      {timerActive && (
        <div style={{ position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:90,fontSize:120,fontWeight:"bold",color:"#44ccff",textShadow:"0 0 40px #44ccff",pointerEvents:"none",fontFamily:"'Courier New',monospace",opacity:0.9 }}>
          {timerCount}
        </div>
      )}

      <video ref={videoRef} style={{ display:"none" }} playsInline muted />

      {/* ── HIDDEN FILE INPUTS ── */}
      <input type="file" id="model-upload" multiple accept=".glb,.gltf" onChange={handleModelUpload} style={{ display:"none" }} />
      <input type="file" id="image-upload" multiple accept="image/*" onChange={handleImageUpload} style={{ display:"none" }} />
      <input type="file" id="video-upload" multiple accept="video/*" onChange={handleVideoUpload} style={{ display:"none" }} />

      {/* ── HEADER ── */}
      <div style={{ borderBottom:`1px solid ${T.border}`,padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:`${T.accent}05` }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <span style={{ fontSize:24 }}>🪞</span>
          <div>
            <div style={{ fontSize:16,fontWeight:"bold",letterSpacing:4,color:T.accent }}>EMOJI MIRROR</div>
            <div style={{ fontSize:9,color:T.dim,letterSpacing:2 }}>GESTURE RECOGNITION v3.0  ·  {GESTURE_BUTTONS.length} GESTURES  ·  {fmtTime(sessionTime)}</div>
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-end" }}>
          <div style={{ fontSize:9,color:modelReady?"#00ffcc":"#ff8800",letterSpacing:2 }}>{modelReady?"● READY":"○ LOADING"}</div>
          {isLive && <div style={{ fontSize:9,color:"#888",letterSpacing:1 }}>{fps} FPS</div>}
          {streak.count > 1 && <div style={{ fontSize:9,color:GESTURE_CONFIG[streak.gesture]?.color||"#fff",letterSpacing:1 }}>🔥 x{streak.count}</div>}
          {[
            { key:"sound",  label:"🔊", active:soundEnabled,  toggle:()=>setSoundEnabled(s=>!s)  },
            { key:"speech", label:"🗣️", active:speechEnabled, toggle:()=>setSpeechEnabled(s=>!s) },
            { key:"debug",  label:"🔬", active:showDebug,      toggle:()=>setShowDebug(s=>!s)     },
            { key:"remap",  label:"🔧", active:showMapper,     toggle:()=>setShowMapper(s=>!s)    },
            { key:"theme",  label:theme==="dark"?"🌙":"🌈", active:false, toggle:()=>setTheme(t=>t==="dark"?"neon":"dark") },
          ].map(b=>(
            <button key={b.key} onClick={b.toggle} style={{ padding:"4px 8px",fontSize:10,background:b.active?`${T.accent}22`:"transparent",border:`1px solid ${b.active?T.accent:T.border}`,color:b.active?T.accent:T.dim,cursor:"pointer",borderRadius:2 }}>{b.label}</button>
          ))}
          {["mirror","upload","stats","log","notes","screenshots","combos"].map(tab=>(
            <button key={tab} onClick={()=>setActiveTab(tab)} style={{ padding:"5px 10px",fontSize:9,letterSpacing:2,textTransform:"uppercase",background:activeTab===tab?`${T.accent}18`:"transparent",border:`1px solid ${activeTab===tab?T.accent:T.border}`,color:activeTab===tab?T.accent:T.dim,cursor:"pointer",borderRadius:2 }}>{tab}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:18,maxWidth:1280,margin:"0 auto" }}>

        {/* ── MIRROR TAB ── */}
        {activeTab==="mirror" && (
          <div style={{ display:"grid",gridTemplateColumns:"1fr 340px",gap:18 }}>
            <div>

              {/* Mode switcher */}
              <div style={{ marginBottom:12,display:"flex" }}>
                {[{key:"image",icon:"📷",label:"STATIC IMAGE",sub:"hand.jpg"},{key:"video",icon:"🎞️",label:"VIDEO FILE",sub:"hand.mp4"},{key:"webcam",icon:"🎥",label:"LIVE WEBCAM",sub:"real-time"}].map(({key,icon,label,sub},i,arr)=>(
                  <button key={key} onClick={()=>switchMode(key)} style={{ flex:1,padding:"10px 6px",cursor:"pointer",background:inputMode===key?`${T.accent}12`:"rgba(255,255,255,0.02)",border:`1px solid ${inputMode===key?T.accent:"rgba(255,255,255,0.07)"}`,borderLeft:i>0?"none":undefined,borderRadius:i===0?"3px 0 0 3px":i===arr.length-1?"0 3px 3px 0":"0",color:inputMode===key?T.accent:T.dim,fontFamily:"'Courier New',monospace",transition:"all 0.2s" }}>
                    <div style={{ fontSize:10,letterSpacing:2 }}>{icon}  {label}</div>
                    <div style={{ fontSize:8,color:inputMode===key?`${T.accent}66`:"#2a2a2a",marginTop:2,letterSpacing:1 }}>{sub}</div>
                  </button>
                ))}
              </div>

              {/* Gesture status bar */}
              <div style={{ marginBottom:12,padding:"10px 16px",border:`1px solid ${cfg.color}44`,background:`${cfg.color}08`,borderRadius:4,display:"flex",alignItems:"center",gap:14 }}>
                <span style={{ fontSize:36 }}>{cfg.emoji}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:18,fontWeight:"bold",color:cfg.color,letterSpacing:2 }}>{cfg.label.toUpperCase()}</div>
                  {lastAction && <div style={{ fontSize:10,color:"#888",marginTop:2 }}>{lastAction.cfg.description}</div>}
                </div>
                {drawMode && <div style={{ fontSize:9,color:"#ff66ff",letterSpacing:2,border:"1px solid #ff66ff44",padding:"2px 6px",borderRadius:2 }}>✏️ DRAW ON</div>}
                {show3D   && <div style={{ fontSize:9,color:"#8800ff",letterSpacing:2,border:"1px solid #8800ff44",padding:"2px 6px",borderRadius:2 }}>◈ 3D ON</div>}
                {(scanning||isLive) && (
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <div style={{ width:7,height:7,borderRadius:"50%",background:isLive?"#ff4444":T.accent,animation:"pulse 0.8s infinite" }} />
                    <span style={{ fontSize:10,color:isLive?"#ff6666":T.accent,letterSpacing:2 }}>{isLive?"LIVE":"SCANNING"}</span>
                  </div>
                )}
              </div>

              {/* ── CANVAS WRAPPER ── */}
              <div style={{ position:"relative",border:`1px solid ${show3D?"rgba(136,0,255,0.35)":T.border}`,borderRadius:4,overflow:"hidden",background:"#050810",transition:"border-color 0.3s" }}>

                {/* 2D MediaPipe canvas — dims when 3D is active */}
                <canvas
                  ref={canvasRef}
                  width={600} height={380}
                  style={{ display:"block", width:"100%", height:"auto",
                           opacity: show3D ? 0.18 : 1,
                           transition: "opacity 0.4s" }}
                />

                {/* 3D Three.js layer — overlays canvas absolutely */}
                {show3D && (
                  <div style={{ position:"absolute", inset:0 }}>
                    <EmojiScene landmarksRef={landmarksRef} gesture={currentGesture} modelPath={selectedModel} />
                  </div>
                )}

                {/* Corner labels */}
                <div style={{ position:"absolute",top:8,left:10,fontSize:8,color:`${T.accent}44`,letterSpacing:2,pointerEvents:"none" }}>
                  {inputMode==="webcam"?"LIVE WEBCAM":inputMode==="video"?"VIDEO FILE":"STATIC IMAGE"}
                  {drawMode?" · DRAW MODE":""}
                  {show3D?" · 3D ACTIVE":""}
                </div>
                {isLive && <div style={{ position:"absolute",top:8,right:10,fontSize:9,color:"#444",letterSpacing:1,pointerEvents:"none" }}>{fps} FPS</div>}
                <div style={{ position:"absolute",bottom:8,right:10,fontSize:8,color:`${T.accent}33`,letterSpacing:1,pointerEvents:"none" }}>21 KP · MEDIAPIPE{show3D?" · THREE.JS":""}</div>
              </div>

              {/* ── 3D TOGGLE BUTTON ── */}
              <button
                onClick={() => setShow3D(s=>!s)}
                style={{ marginTop:8, width:"100%", padding:"10px", cursor:"pointer",
                         background: show3D ? "rgba(136,0,255,0.15)" : "rgba(255,255,255,0.02)",
                         border: `1px solid ${show3D ? "#8800ff" : "rgba(255,255,255,0.07)"}`,
                         borderRadius:3, color: show3D ? "#cc00ff" : "#555",
                         fontSize:11, letterSpacing:3, fontFamily:"'Courier New',monospace", transition:"all 0.2s" }}>
                {show3D ? "◈  3D MODE ON — ✊ rotate · 👌 scale · ☝️ paint · click to disable" : "◇  ENABLE 3D LAYER (Three.js)"}
              </button>

              {/* ── MODEL SELECTOR (when 3D is ON) ── */}
              {show3D && (
                <div style={{ marginTop:8,padding:"8px 10px",border:"1px solid rgba(136,0,255,0.2)",background:"rgba(136,0,255,0.03)",borderRadius:3 }}>
                  <div style={{ fontSize:8,color:T.dim,letterSpacing:2,marginBottom:6 }}>▸ SELECT 3D MODEL</div>
                  <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
                    {AVAILABLE_MODELS.map(m => (
                      <button key={m.name} onClick={() => setSelectedModel(m.path)}
                        style={{ flex:"1 1 auto", padding:"6px 10px", fontSize:9, letterSpacing:1,
                                 background: selectedModel === m.path ? "rgba(136,0,255,0.18)" : "rgba(255,255,255,0.02)",
                                 border: `1px solid ${selectedModel === m.path ? "#8800ff" : "rgba(255,255,255,0.07)"}`,
                                 color: selectedModel === m.path ? "#cc00ff" : "#555",
                                 cursor:"pointer", borderRadius:2, fontFamily:"'Courier New',monospace", transition:"all 0.2s" }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug panel */}
              {showDebug && gestureDebug && (
                <div style={{ marginTop:8,padding:"8px 12px",border:"1px solid rgba(255,204,0,0.18)",background:"rgba(255,204,0,0.03)",borderRadius:3,display:"flex",flexWrap:"wrap",gap:6 }}>
                  <div style={{ fontSize:8,color:T.dim,letterSpacing:2,width:"100%",marginBottom:2 }}>▸ FINGER STATE DEBUG</div>
                  {Object.entries(gestureDebug).map(([k,v])=>(
                    <div key={k} style={{ padding:"2px 7px",border:`1px solid ${v?"#00ffcc44":"rgba(255,255,255,0.05)"}`,background:v?"rgba(0,255,204,0.07)":"transparent",borderRadius:2,fontSize:9,color:v?T.accent:"#444",letterSpacing:1 }}>
                      {k.toUpperCase()}: {v?"✓":"✗"}
                    </div>
                  ))}
                </div>
              )}

              {/* Gesture remapper */}
              {showMapper && (
                <div style={{ marginTop:8,padding:"10px 14px",border:"1px solid rgba(255,136,0,0.2)",background:"rgba(255,136,0,0.03)",borderRadius:3 }}>
                  <div style={{ fontSize:8,color:T.dim,letterSpacing:2,marginBottom:8 }}>▸ CUSTOM GESTURE → ACTION MAP</div>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6 }}>
                    {GESTURE_BUTTONS.map(g=>(
                      <div key={g.key} style={{ display:"flex",alignItems:"center",gap:6 }}>
                        <span style={{ fontSize:14 }}>{g.emoji}</span>
                        <select value={gestureMap[g.key]||GESTURE_CONFIG[g.key].action||""} onChange={e=>setGestureMap(m=>({...m,[g.key]:e.target.value}))}
                          style={{ flex:1,background:"#111",border:"1px solid #333",color:"#aaa",fontSize:9,padding:"2px 4px",borderRadius:2,fontFamily:"'Courier New',monospace" }}>
                          {ALL_ACTIONS.map(a=><option key={a} value={a}>{a.replace(/_/g," ")}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setGestureMap({})} style={{ marginTop:8,padding:"4px 10px",fontSize:8,letterSpacing:2,background:"transparent",border:"1px solid #444",color:"#666",cursor:"pointer",borderRadius:2 }}>RESET TO DEFAULT</button>
                </div>
              )}

              {/* Input controls */}
              <div style={{ marginTop:12 }}>
                {inputMode==="image" && (
                  <>
                    <div style={{ fontSize:8,color:T.dim,letterSpacing:3,marginBottom:6 }}>▸ SELECT IMAGE & DETECT</div>
                    
                    {/* Image selector with uploaded images */}
                    {uploadedImages.length > 0 && (
                      <div style={{ marginBottom:8,padding:"8px",border:"1px solid rgba(0,255,204,0.15)",background:"rgba(0,255,204,0.03)",borderRadius:3 }}>
                        <select id="image-selector" style={{ width:"100%",padding:"6px",fontSize:9,background:"#111",border:"1px solid #333",color:"#00ffcc",borderRadius:2,marginBottom:6,fontFamily:"'Courier New',monospace" }}>
                          <option value="static">📷 Default (hand.jpg)</option>
                          {uploadedImages.map((img, i) => (
                            <option key={i} value={`uploaded-${i}`}>📤 {img.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <button onClick={() => {
                      const selector = document.getElementById("image-selector");
                      const selected = selector ? selector.value : "static";
                      if (selected.startsWith("uploaded-")) {
                        const idx = parseInt(selected.split("-")[1]);
                        const img = new Image();
                        img.src = uploadedImages[idx].url;
                        img.onload = () => {
                          if (!handLandmarkerRef.current || !modelReady) return;
                          setScanning(true);
                          try {
                            const canvas = canvasRef.current;
                            const ctx = canvas.getContext("2d");
                            canvas.width = img.width;
                            canvas.height = img.height;
                            ctx.drawImage(img, 0, 0);
                            const lm = hookDetectFromImage(img);
                            if (lm) {
                              landmarksRef.current = lm;
                              drawHand(ctx, lm, canvas.width, canvas.height);
                              const gesture = classifyGesture(lm);
                              triggerAction(gesture, lm);
                              showNotif("✅ Detection complete!", "#00ffcc");
                            } else {
                              landmarksRef.current = null;
                              triggerAction("none", null);
                              renderGrid();
                            }
                          } catch (e) { console.error(e); }
                          setScanning(false);
                        };
                      } else {
                        detectFromImage();
                      }
                    }} disabled={!modelReady||scanning}
                      style={{ width:"100%",padding:"12px",cursor:modelReady&&!scanning?"pointer":"not-allowed",background:modelReady?`${T.accent}12`:"rgba(255,255,255,0.02)",border:`1px solid ${modelReady?T.accent:"rgba(255,255,255,0.07)"}`,borderRadius:3,color:modelReady?T.accent:"#444",fontSize:12,letterSpacing:3,fontFamily:"'Courier New',monospace",transition:"all 0.2s" }}>
                      {scanning?"⏳ DETECTING...":modelReady?"▶  RUN DETECTION":"⏳ LOADING MEDIAPIPE..."}
                    </button>
                  </>
                )}
                {inputMode==="video" && (
                  <>
                    <div style={{ fontSize:8,color:T.dim,letterSpacing:3,marginBottom:6 }}>▸ VIDEO FILE CONTROLS</div>
                    {videoError&&<div style={{ marginBottom:6,padding:"7px 10px",background:"rgba(255,68,68,0.07)",border:"1px solid rgba(255,68,68,0.2)",borderRadius:3,fontSize:9,color:"#ff6666" }}>⚠ {videoError}</div>}
                    
                    {/* Video selector */}
                    {uploadedVideos.length > 0 && (
                      <div style={{ marginBottom:8,padding:"8px",border:"1px solid rgba(255,204,0,0.15)",background:"rgba(255,204,0,0.03)",borderRadius:3 }}>
                        <select id="video-selector" style={{ width:"100%",padding:"6px",fontSize:9,background:"#111",border:"1px solid #333",color:"#ffcc00",borderRadius:2,marginBottom:6,fontFamily:"'Courier New',monospace" }}>
                          <option value="static">🎞️ Default (hand.mp4)</option>
                          {uploadedVideos.map((vid, i) => (
                            <option key={i} value={`uploaded-${i}`}>📤 {vid.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <div style={{ display:"flex",gap:8 }}>
                      <button onClick={() => {
                        const selector = document.getElementById("video-selector");
                        const selected = selector ? selector.value : "static";
                        if (selected.startsWith("uploaded-")) {
                          const idx = parseInt(selected.split("-")[1]);
                          const video = videoRef.current;
                          video.src = uploadedVideos[idx].url;
                          video.onloadeddata = () => {
                            video.play().then(() => {
                              setVideoPlaying(true);
                              startDetectionLoop(video, false);
                            }).catch(e => setVideoError(`${e.message}`));
                          };
                          video.onerror = () => setVideoError(`Could not load ${uploadedVideos[idx].name}`);
                          video.muted = true;
                          video.playsInline = true;
                          video.loop = true;
                          video.load();
                        } else {
                          startVideo();
                        }
                      }} disabled={!modelReady||videoPlaying}
                        style={{ flex:1,padding:"12px",cursor:modelReady&&!videoPlaying?"pointer":"not-allowed",background:videoPlaying?"rgba(255,68,68,0.05)":modelReady?`${T.accent}12`:"rgba(255,255,255,0.02)",border:`1px solid ${videoPlaying?"rgba(255,68,68,0.2)":modelReady?T.accent:"rgba(255,255,255,0.07)"}`,borderRadius:3,color:videoPlaying?"#555":modelReady?T.accent:"#444",fontSize:11,letterSpacing:3,fontFamily:"'Courier New',monospace" }}>
                        {!modelReady?"⏳ LOADING...":videoPlaying?"● PLAYING":"▶ PLAY VIDEO"}
                      </button>
                      {videoPlaying&&<button onClick={stopVideo} style={{ padding:"12px 16px",cursor:"pointer",background:"rgba(255,68,68,0.08)",border:"1px solid rgba(255,68,68,0.25)",borderRadius:3,color:"#ff6666",fontSize:11,letterSpacing:2,fontFamily:"'Courier New',monospace" }}>■ STOP</button>}
                    </div>
                    {!videoPlaying&&!videoError&&modelReady&&uploadedVideos.length===0&&<div style={{ marginTop:4,fontSize:8,color:"#2a2a2a",letterSpacing:1 }}>Place video at <span style={{ color:"#444" }}>public/videos/hand.mp4</span></div>}
                  </>
                )}
                {inputMode==="webcam" && (
                  <>
                    <div style={{ fontSize:8,color:T.dim,letterSpacing:3,marginBottom:6 }}>▸ WEBCAM CONTROLS</div>
                    {videoError&&<div style={{ marginBottom:6,padding:"7px 10px",background:"rgba(255,68,68,0.07)",border:"1px solid rgba(255,68,68,0.2)",borderRadius:3,fontSize:9,color:"#ff6666" }}>⚠ {videoError}</div>}
                    <div style={{ display:"flex",gap:8 }}>
                      <button onClick={startWebcam} disabled={!modelReady||webcamActive}
                        style={{ flex:1,padding:"12px",cursor:modelReady&&!webcamActive?"pointer":"not-allowed",background:webcamActive?"rgba(255,68,68,0.05)":modelReady?`${T.accent}12`:"rgba(255,255,255,0.02)",border:`1px solid ${webcamActive?"rgba(255,68,68,0.2)":modelReady?T.accent:"rgba(255,255,255,0.07)"}`,borderRadius:3,color:webcamActive?"#555":modelReady?T.accent:"#444",fontSize:11,letterSpacing:3,fontFamily:"'Courier New',monospace" }}>
                        {!modelReady?"⏳ LOADING...":webcamActive?"● RUNNING":"▶ START WEBCAM"}
                      </button>
                      {webcamActive&&<button onClick={stopWebcam} style={{ padding:"12px 16px",cursor:"pointer",background:"rgba(255,68,68,0.08)",border:"1px solid rgba(255,68,68,0.25)",borderRadius:3,color:"#ff6666",fontSize:11,letterSpacing:2,fontFamily:"'Courier New',monospace" }}>■ STOP</button>}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div>
              <div style={{ fontSize:8,color:T.dim,letterSpacing:3,marginBottom:8 }}>▸ GESTURE → ACTION MAP ({GESTURE_BUTTONS.length})</div>
              <div style={{ display:"flex",flexDirection:"column",gap:4,maxHeight:480,overflowY:"auto",paddingRight:3 }}>
                {GESTURE_BUTTONS.map(g=>{
                  const c=GESTURE_CONFIG[g.key]; const active=currentGesture===g.key;
                  const effectiveAction=gestureMap[g.key]||c.action;
                  return (
                    <div key={g.key} style={{ padding:"7px 10px",border:`1px solid ${active?c.color:"rgba(255,255,255,0.05)"}`,background:active?`${c.color}10`:"rgba(255,255,255,0.012)",borderRadius:3,display:"flex",alignItems:"center",gap:8,transition:"all 0.2s" }}>
                      <span style={{ fontSize:16,width:22,textAlign:"center" }}>{g.emoji}</span>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:9,color:active?c.color:"#666",letterSpacing:1 }}>{g.label}</div>
                        <div style={{ fontSize:8,color:"#2a2a2a",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{c.description}</div>
                      </div>
                      <div style={{ fontSize:7,padding:"1px 4px",letterSpacing:1,border:`1px solid ${c.color}44`,color:active?c.color:`${c.color}77`,borderRadius:2,whiteSpace:"nowrap",flexShrink:0 }}>
                        {effectiveAction?.replace(/_/g," ").toUpperCase()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stats */}
              <div style={{ marginTop:12,padding:10,border:`1px solid rgba(255,255,255,0.05)`,borderRadius:3 }}>
                <div style={{ fontSize:8,color:"#2a2a2a",letterSpacing:3,marginBottom:8 }}>SYSTEM STATS</div>
                {[
                  ["INPUT",       inputMode.toUpperCase()],
                  ["SESSION",     fmtTime(sessionTime)],
                  ["GESTURES",    log.length],
                  ["NOTES",       notes.length],
                  ["SCREENSHOTS", screenshots.length],
                  ["COMBOS HIT",  comboLog.length],
                  ["STREAK",      streak.count>1?`${streak.gesture.replace(/_/g," ")} x${streak.count}`:"—"],
                  ["TOP GESTURE", topGesture?`${topGesture[0].replace(/_/g," ")} (${topGesture[1]})`:"—"],
                  ["FPS",         isLive?fps:"—"],
                  ["3D MODE",     show3D?"ON":"OFF"],
                  ["3D MODEL",    show3D ? AVAILABLE_MODELS.find(m=>m.path===selectedModel)?.label.replace(/^[^\s]+\s/, "") : "—"],
                ].map(([k,v])=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                    <span style={{ fontSize:8,color:"#333",letterSpacing:1 }}>{k}</span>
                    <span style={{ fontSize:8,color:T.accent,maxWidth:120,textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STATS TAB ── */}
        {activeTab==="stats" && (
          <div>
            <div style={{ fontSize:9,color:T.dim,letterSpacing:3,marginBottom:16 }}>▸ GESTURE HEATMAP & ANALYTICS</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
              <div>
                <div style={{ fontSize:9,color:T.dim,letterSpacing:2,marginBottom:10 }}>GESTURE FREQUENCY</div>
                {GESTURE_BUTTONS.map(g=>{
                  const count=gestureCount[g.key]||0;
                  const max=Math.max(...Object.values(gestureCount),1);
                  const pct=(count/max)*100;
                  const c=GESTURE_CONFIG[g.key];
                  return (
                    <div key={g.key} style={{ marginBottom:6 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                        <span style={{ fontSize:9,color:count>0?c.color:"#333" }}>{g.emoji} {g.label}</span>
                        <span style={{ fontSize:9,color:count>0?c.color:"#222" }}>{count}</span>
                      </div>
                      <div style={{ height:4,background:"rgba(255,255,255,0.04)",borderRadius:2,overflow:"hidden" }}>
                        <div style={{ height:"100%",width:`${pct}%`,background:c.color,borderRadius:2,transition:"width 0.5s",boxShadow:`0 0 6px ${c.color}` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <div style={{ fontSize:9,color:T.dim,letterSpacing:2,marginBottom:10 }}>SESSION SUMMARY</div>
                {[
                  ["Session Duration",  fmtTime(sessionTime)],
                  ["Total Gestures",    log.length],
                  ["Unique Gestures",   Object.keys(gestureCount).length],
                  ["Notes Created",     notes.length],
                  ["Screenshots Taken", screenshots.length],
                  ["Combos Triggered",  comboLog.length],
                  ["Best Streak",       streak.count>1?`${streak.count}x ${streak.gesture.replace(/_/g," ")}`:"—"],
                  ["Most Used",         topGesture?`${topGesture[0].replace(/_/g," ")} (${topGesture[1]}x)`:"—"],
                  ["Sound",             soundEnabled?"ON":"OFF"],
                  ["Speech",            speechEnabled?"ON":"OFF"],
                  ["3D Layer",          show3D?"ACTIVE":"OFF"],
                ].map(([k,v])=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                    <span style={{ fontSize:9,color:"#555",letterSpacing:1 }}>{k}</span>
                    <span style={{ fontSize:9,color:T.accent }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── LOG TAB ── */}
        {activeTab==="log" && (
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
              <div style={{ fontSize:9,color:T.dim,letterSpacing:3 }}>▸ GESTURE EVENT LOG ({log.length})</div>
              <button onClick={()=>setLog([])} style={{ padding:"3px 8px",fontSize:8,letterSpacing:2,background:"transparent",border:"1px solid #333",color:"#555",cursor:"pointer",borderRadius:2 }}>CLEAR LOG</button>
            </div>
            {log.length===0
              ? <div style={{ color:"#1a1a1a",fontSize:12,padding:40,textAlign:"center",border:"1px dashed #111",borderRadius:4 }}>No gestures yet.</div>
              : <div style={{ display:"flex",flexDirection:"column",gap:3,maxHeight:520,overflowY:"auto" }}>
                  {log.map((entry,i)=>{
                    const c=GESTURE_CONFIG[entry.gesture];
                    return (
                      <div key={i} style={{ padding:"7px 12px",border:`1px solid ${c.color}1a`,background:`${c.color}06`,borderRadius:3,display:"flex",alignItems:"center",gap:10,opacity:1-i*0.015 }}>
                        <span style={{ fontSize:14 }}>{c.emoji}</span>
                        <span style={{ fontSize:10,color:c.color,letterSpacing:1,flex:1 }}>{entry.gesture.toUpperCase().replace(/_/g," ")}</span>
                        <span style={{ fontSize:8,color:"#444" }}>{c.action}</span>
                        <span style={{ fontSize:8,color:"#2a2a2a" }}>{entry.time}</span>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}

        {/* ── NOTES TAB ── */}
        {activeTab==="notes" && (
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
              <div style={{ fontSize:9,color:T.dim,letterSpacing:3 }}>▸ SAVED NOTES ({notes.length})  ·  👍 save  ·  👎 delete</div>
              <button onClick={()=>setNotes([])} style={{ padding:"3px 8px",fontSize:8,letterSpacing:2,background:"transparent",border:"1px solid #333",color:"#555",cursor:"pointer",borderRadius:2 }}>CLEAR ALL</button>
            </div>
            {notes.length===0
              ? <div style={{ color:"#1a1a1a",fontSize:12,padding:40,textAlign:"center",border:"1px dashed #111",borderRadius:4 }}>No notes yet.</div>
              : <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10 }}>
                  {notes.map((n,i)=>(
                    <div key={i} style={{ padding:12,border:"1px solid rgba(255,204,0,0.15)",background:"rgba(255,204,0,0.03)",borderRadius:4 }}>
                      <div style={{ fontSize:20,marginBottom:6 }}>📝</div>
                      <div style={{ fontSize:10,color:"#ccc" }}>{n.text}</div>
                      <div style={{ fontSize:8,color:"#444",marginTop:6 }}>{new Date(n.time).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── SCREENSHOTS TAB ── */}
        {activeTab==="screenshots" && (
          <div>
            <div style={{ fontSize:9,color:T.dim,letterSpacing:3,marginBottom:12 }}>▸ SCREENSHOTS ({screenshots.length})  ·  ✌️ victory to capture + download</div>
            {screenshots.length===0
              ? <div style={{ color:"#1a1a1a",fontSize:12,padding:40,textAlign:"center",border:"1px dashed #111",borderRadius:4 }}>No screenshots yet.</div>
              : <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10 }}>
                  {screenshots.map((s,i)=>(
                    <div key={i} style={{ border:"1px solid rgba(0,255,204,0.12)",borderRadius:4,overflow:"hidden" }}>
                      {s.dataUrl&&<img src={s.dataUrl} alt={s.label} style={{ width:"100%",display:"block",opacity:0.8 }} />}
                      <div style={{ padding:"8px 10px",background:"rgba(0,255,204,0.03)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                        <div>
                          <div style={{ fontSize:10,color:T.accent }}>{s.label}</div>
                          <div style={{ fontSize:8,color:"#444",marginTop:2 }}>{s.time}</div>
                        </div>
                        {s.dataUrl&&<a href={s.dataUrl} download={`emoji-mirror-${i+1}.png`} style={{ fontSize:8,padding:"3px 7px",border:`1px solid ${T.accent}44`,color:T.accent,borderRadius:2,textDecoration:"none",letterSpacing:1 }}>↓ SAVE</a>}
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── UPLOAD TAB ── */}
        {activeTab==="upload" && (
          <div>
            <div style={{ fontSize:9,color:T.dim,letterSpacing:3,marginBottom:16 }}>▸ FILE MANAGEMENT · Upload GLB, Images, Videos</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
              {/* Models Upload */}
              <div>
                <div style={{ fontSize:9,color:T.dim,letterSpacing:2,marginBottom:10 }}>3D MODELS (.glb)</div>
                <button onClick={()=>document.getElementById("model-upload").click()}
                  style={{ width:"100%",padding:"10px",marginBottom:10,cursor:"pointer",background:"rgba(136,0,255,0.1)",border:"1px dashed rgba(136,0,255,0.3)",color:"#8800ff",fontSize:10,borderRadius:3,transition:"all 0.2s" }}>
                  ➕ UPLOAD GLB MODELS
                </button>
                <div style={{ fontSize:8,color:"#2a2a2a",marginBottom:8 }}>Uploaded: {uploadedModels.length}</div>
                <div style={{ display:"flex",flexDirection:"column",gap:2,maxHeight:300,overflowY:"auto" }}>
                  {uploadedModels.map((model, i) => (
                    <div key={i} style={{ padding:"6px 8px",border:"1px solid rgba(136,0,255,0.2)",background:"rgba(136,0,255,0.05)",borderRadius:2,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ fontSize:8,color:"#aaa",overflow:"hidden",textOverflow:"ellipsis" }}>{model.name}</span>
                      <button onClick={()=>removeUploadedModel(i)} style={{ padding:"2px 6px",fontSize:7,background:"rgba(255,68,68,0.2)",border:"1px solid rgba(255,68,68,0.4)",color:"#ff6666",cursor:"pointer",borderRadius:2 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Images Upload */}
              <div>
                <div style={{ fontSize:9,color:T.dim,letterSpacing:2,marginBottom:10 }}>IMAGES (.jpg, .png, .gif)</div>
                <button onClick={()=>document.getElementById("image-upload").click()}
                  style={{ width:"100%",padding:"10px",marginBottom:10,cursor:"pointer",background:"rgba(0,255,204,0.1)",border:"1px dashed rgba(0,255,204,0.3)",color:"#00ffcc",fontSize:10,borderRadius:3,transition:"all 0.2s" }}>
                  ➕ UPLOAD IMAGES
                </button>
                <div style={{ fontSize:8,color:"#2a2a2a",marginBottom:8 }}>Uploaded: {uploadedImages.length}</div>
                <div style={{ display:"flex",flexDirection:"column",gap:2,maxHeight:300,overflowY:"auto" }}>
                  {uploadedImages.map((img, i) => (
                    <div key={i} style={{ padding:"6px 8px",border:"1px solid rgba(0,255,204,0.2)",background:"rgba(0,255,204,0.05)",borderRadius:2,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ fontSize:8,color:"#aaa",overflow:"hidden",textOverflow:"ellipsis" }}>{img.name}</span>
                      <button onClick={()=>removeUploadedImage(i)} style={{ padding:"2px 6px",fontSize:7,background:"rgba(255,68,68,0.2)",border:"1px solid rgba(255,68,68,0.4)",color:"#ff6666",cursor:"pointer",borderRadius:2 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Videos Upload */}
              <div>
                <div style={{ fontSize:9,color:T.dim,letterSpacing:2,marginBottom:10 }}>VIDEOS (.mp4, .webm)</div>
                <button onClick={()=>document.getElementById("video-upload").click()}
                  style={{ width:"100%",padding:"10px",marginBottom:10,cursor:"pointer",background:"rgba(255,204,0,0.1)",border:"1px dashed rgba(255,204,0,0.3)",color:"#ffcc00",fontSize:10,borderRadius:3,transition:"all 0.2s" }}>
                  ➕ UPLOAD VIDEOS
                </button>
                <div style={{ fontSize:8,color:"#2a2a2a",marginBottom:8 }}>Uploaded: {uploadedVideos.length}</div>
                <div style={{ display:"flex",flexDirection:"column",gap:2,maxHeight:300,overflowY:"auto" }}>
                  {uploadedVideos.map((vid, i) => (
                    <div key={i} style={{ padding:"6px 8px",border:"1px solid rgba(255,204,0,0.2)",background:"rgba(255,204,0,0.05)",borderRadius:2,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ fontSize:8,color:"#aaa",overflow:"hidden",textOverflow:"ellipsis" }}>{vid.name}</span>
                      <button onClick={()=>removeUploadedVideo(i)} style={{ padding:"2px 6px",fontSize:7,background:"rgba(255,68,68,0.2)",border:"1px solid rgba(255,68,68,0.4)",color:"#ff6666",cursor:"pointer",borderRadius:2 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div style={{ marginTop:20,padding:12,border:`1px solid ${T.border}`,borderRadius:3,background:`${T.accent}08` }}>
              <div style={{ fontSize:9,color:T.dim,letterSpacing:2,marginBottom:8 }}>ℹ️ USAGE</div>
              <ul style={{ fontSize:8,color:"#888",lineHeight:1.6,paddingLeft:16 }}>
                <li>Upload GLB models to use in 3D mode</li>
                <li>Upload images to detect hand gestures from photos</li>
                <li>Upload MP4 videos for continuous gesture tracking</li>
                <li>Files are stored in browser memory (session)</li>
                <li>Use Mirror tab to select uploaded files for detection</li>
              </ul>
            </div>
          </div>
        )}

        {/* ── COMBOS TAB ── */}
        {activeTab==="combos" && (
          <div>
            <div style={{ fontSize:9,color:T.dim,letterSpacing:3,marginBottom:16 }}>▸ COMBO SYSTEM</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
              <div>
                <div style={{ fontSize:9,color:T.dim,letterSpacing:2,marginBottom:10 }}>AVAILABLE COMBOS</div>
                <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
                  {Object.entries(COMBOS).map(([key,label])=>{
                    const [g1,g2]=key.split(",");
                    const c1=GESTURE_CONFIG[g1], c2=GESTURE_CONFIG[g2];
                    return (
                      <div key={key} style={{ padding:"7px 10px",border:"1px solid rgba(255,204,0,0.1)",background:"rgba(255,204,0,0.03)",borderRadius:3,display:"flex",alignItems:"center",gap:8 }}>
                        <span style={{ fontSize:16 }}>{c1?.emoji}</span>
                        <span style={{ fontSize:10,color:"#444" }}>+</span>
                        <span style={{ fontSize:16 }}>{c2?.emoji}</span>
                        <span style={{ fontSize:10,color:"#ffcc00",flex:1,marginLeft:4 }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize:9,color:T.dim,letterSpacing:2,marginBottom:10 }}>COMBO HISTORY ({comboLog.length})</div>
                {comboLog.length===0
                  ? <div style={{ color:"#1a1a1a",fontSize:12,padding:20,textAlign:"center",border:"1px dashed #111",borderRadius:4 }}>No combos triggered yet.</div>
                  : <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
                      {comboLog.map((c,i)=>(
                        <div key={i} style={{ padding:"6px 10px",border:"1px solid rgba(255,204,0,0.15)",background:"rgba(255,204,0,0.04)",borderRadius:3,display:"flex",justifyContent:"space-between" }}>
                          <span style={{ fontSize:10,color:"#ffcc00" }}>{c.combo}</span>
                          <span style={{ fontSize:8,color:"#444" }}>{c.time}</span>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(0.8);}}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:#0a0a0a;}::-webkit-scrollbar-thumb{background:rgba(0,255,204,0.15);border-radius:2px;}
      `}</style>
    </div>
  );
}
