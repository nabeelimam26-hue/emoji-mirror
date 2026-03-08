/**
 * EmojiScene.jsx — Clean 3D Component with Smooth Lerp Movement
 * 
 * Features:
 * - Smooth movement with LERP_ALPHA = 0.1 (ideal for mobile performance)
 * - Gesture: fist → rotate; ok/pinch → scale; point → paint
 * - Optimized for Samsung Galaxy F12
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const WORLD_SCALE = 6;
const DEPTH_SCALE = 3;
const LERP_ALPHA = 0.1; // ← Key: smooth movement, mobile-friendly
const TRAIL_MAX = 100;
const TRAIL_RADIUS = 0.09;
const CAMERA_Z = 18;
const MODEL_SCALE = 0.02;

// ─── COORDINATE MAPPING ───────────────────────────────────────────────────────
// MediaPipe: 0→1 (top-left to bottom-right, Y down)
// THREE: -N→+N centered at 0, Y up
function lmToWorld(lm) {
  return {
    x: (lm.x - 0.5) * WORLD_SCALE,
    y: -(lm.y - 0.5) * WORLD_SCALE,
    z: lm.z * -DEPTH_SCALE,
  };
}

function lmDist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

// ─── SMOOTH LERP FUNCTION ─────────────────────────────────────────────────────
function lerpVec3(vec, target, alpha) {
  vec.x = THREE.MathUtils.lerp(vec.x, target.x, alpha);
  vec.y = THREE.MathUtils.lerp(vec.y, target.y, alpha);
  vec.z = THREE.MathUtils.lerp(vec.z, target.z, alpha);
}

// ─── PAINT DOT COLORS ────────────────────────────────────────────────────────
const PAINT_COLORS = [0x00ffcc, 0xff00aa, 0x8800ff, 0xffcc00, 0xff8800, 0x44ccff];

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function EmojiScene({ landmarksRef, gesture, modelPath = "/models/trainengine.glb" }) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);

  // Smooth movement targets + current
  const targetPos = useRef(new THREE.Vector3(0, 0, 0));
  const currentPos = useRef(new THREE.Vector3(0, 0, 0));
  const targetScale = useRef(1);
  const currentScale = useRef(1);

  // Fist rotation
  const fistRef = useRef({ lastX: 0, lastY: 0, rotX: 0, rotY: 0 });

  // Paint trail
  const trailRef = useRef([]);
  const paintColorI = useRef(0);
  const lastDropRef = useRef(0);

  // Idle
  const idleRef = useRef(true);
  const clockRef = useRef(0);

  const [status, setStatus] = useState("loading model...");
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || 640;
    const H = mount.clientHeight || 400;

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // ── Scene ──────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 200);
    camera.position.set(0, 0, CAMERA_Z);

    // ── Lights ─────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x222233, 1.5));

    const dirLight = new THREE.DirectionalLight(0x00ffcc, 3);
    dirLight.position.set(5, 10, 8);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const pLight1 = new THREE.PointLight(0xff00aa, 4, 30);
    pLight1.position.set(-6, 4, 4);
    scene.add(pLight1);

    const pLight2 = new THREE.PointLight(0x8800ff, 3, 25);
    pLight2.position.set(6, -4, 4);
    scene.add(pLight2);

    // ── Star field ─────────────────────────────────────────────────────────────
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(600 * 3);
    for (let i = 0; i < starPos.length; i++)
      starPos[i] = (Math.random() - 0.5) * 50;
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0x00ffcc,
        size: 0.06,
        transparent: true,
        opacity: 0.35,
      })
    );
    scene.add(stars);

    // ── Grid floor ─────────────────────────────────────────────────────────────
    const grid = new THREE.GridHelper(24, 24, 0x8800ff, 0x111133);
    grid.position.y = -6;
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    scene.add(grid);

    // ── Cursor (index finger tip marker) ───────────────────────────────────────
    const cursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff00aa })
    );
    const cursorRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.022, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.7,
      })
    );
    cursor.add(cursorRing);
    scene.add(cursor);

    // ── Paint trail group ──────────────────────────────────────────────────────
    const trailGroup = new THREE.Group();
    scene.add(trailGroup);

    // ── Fallback dodecahedron (shown while model loads) ───────────────────────
    const fallback = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.2, 0),
      new THREE.MeshPhongMaterial({
        color: 0x00ffcc,
        emissive: new THREE.Color(0x00ffcc).multiplyScalar(0.1),
        shininess: 120,
        wireframe: false,
        transparent: true,
        opacity: 0.85,
      })
    );
    const fallbackWire = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.2, 0),
      new THREE.MeshBasicMaterial({
        color: 0xff00aa,
        wireframe: true,
        transparent: true,
        opacity: 0.2,
      })
    );
    fallback.add(fallbackWire);
    scene.add(fallback);

    // Save refs before model loads
    stateRef.current = {
      renderer,
      scene,
      camera,
      cursor,
      trailGroup,
      pLight1,
      pLight2,
      stars,
      grid,
      hero: fallback,
    };

    // ── Load trainengine.glb ───────────────────────────────────────────────────
    const loader = new GLTFLoader();
    loader.load(
      modelPath,

      // ✅ Success
      (gltf) => {
        const model = gltf.scene;

        // Center the model at its own bounding box center
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center); // re-center to origin

        // Auto-scale: fit inside a ~2 unit sphere
        const size = box.getSize(new THREE.Vector3()).length();
        const autoScale = 1.8 / size;
        model.scale.setScalar(autoScale);

        // Apply neon material to all mesh children
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Keep original material but boost emissive for neon glow
            if (child.material) {
              child.material.emissive = new THREE.Color(0x00ffcc);
              child.material.emissiveIntensity = 0.08;
              child.material.needsUpdate = true;
            }
          }
        });

        // Remove fallback, add real model
        scene.remove(fallback);
        scene.add(model);
        stateRef.current.hero = model;
        stateRef.current._autoScale = autoScale;

        setModelLoaded(true);
        setStatus("model loaded ✓");
        console.log("✅ Model loaded, auto-scale:", autoScale.toFixed(3));
      },

      // 📦 Progress
      (xhr) => {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        setStatus(`loading model... ${pct}%`);
      },

      // ❌ Error
      (err) => {
        console.error("GLB load failed:", err);
        setStatus("⚠ model load failed — using fallback");
      }
    );

    // ── Animation loop ─────────────────────────────────────────────────────────
    let prevTime = performance.now();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;
      clockRef.current += dt;
      const t = clockRef.current;

      if (!stateRef.current) return;
      const {
        renderer,
        scene,
        camera,
        cursor,
        trailGroup,
        pLight1,
        pLight2,
        stars,
        hero,
      } = stateRef.current;
      const lm = landmarksRef?.current;

      // ── Read landmarks ─────────────────────────────────────────────────────
      if (lm && lm.length >= 21) {
        idleRef.current = false;
        const tip8 = lmToWorld(lm[8]); // index finger tip
        targetPos.current.set(tip8.x, tip8.y, tip8.z);

        // ✊ FIST — rotate model by hand delta
        if (gesture === "fist") {
          const palm = lmToWorld(lm[0]);
          const dx = palm.x - (fistRef.current.lastX || palm.x);
          const dy = palm.y - (fistRef.current.lastY || palm.y);
          fistRef.current.rotY += dx * 3;
          fistRef.current.rotX += dy * 3;
          fistRef.current.lastX = palm.x;
          fistRef.current.lastY = palm.y;
        } else {
          fistRef.current.lastX = 0;
          fistRef.current.lastY = 0;
        }

        // 👌 OK / PINCH — scale by thumb-to-index distance
        const pinch = lmDist(lm[4], lm[8]);
        if (gesture === "ok" || pinch < 0.08) {
          targetScale.current = THREE.MathUtils.clamp(
            THREE.MathUtils.mapLinear(pinch, 0.02, 0.15, 0.3, 2.8),
            0.2,
            3.0
          );
        } else {
          targetScale.current = 1.0;
        }

        // ☝️ POINT — drop paint spheres at finger tip
        if (gesture === "point" && now - lastDropRef.current > 90) {
          lastDropRef.current = now;
          const color = PAINT_COLORS[paintColorI.current % PAINT_COLORS.length];
          paintColorI.current++;
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(TRAIL_RADIUS, 8, 8),
            new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: 0.85,
            })
          );
          dot.position.set(tip8.x, tip8.y, tip8.z);
          dot._born = now;
          trailGroup.add(dot);
          trailRef.current.push(dot);
          if (trailRef.current.length > TRAIL_MAX) {
            const old = trailRef.current.shift();
            trailGroup.remove(old);
            old.geometry.dispose();
            old.material.dispose();
          }
        }

        // 🖐️ OPEN PALM — explode paint trail
        if (gesture === "open_palm") {
          trailRef.current.forEach((dot) => dot.position.multiplyScalar(1.05));
        }

        // 👎 THUMBS DOWN — clear paint trail
        if (gesture === "thumbs_down") {
          trailRef.current.forEach((dot) => {
            trailGroup.remove(dot);
            dot.geometry.dispose();
            dot.material.dispose();
          });
          trailRef.current = [];
        }
      } else {
        // No hand detected — go idle
        idleRef.current = true;
        targetPos.current.set(0, 0, 0);
        targetScale.current = 1.0;
        fistRef.current.lastX = 0;
        fistRef.current.lastY = 0;
      }

      // ── SMOOTH MOVEMENT: Lerp position & scale ─────────────────────────────
      // This is the key to smooth, mobile-friendly movement!
      lerpVec3(currentPos.current, targetPos.current, LERP_ALPHA);
      currentScale.current = THREE.MathUtils.lerp(
        currentScale.current,
        targetScale.current,
        LERP_ALPHA
      );

      // ── Move cursor to index finger tip ────────────────────────────────────
      cursor.position.copy(currentPos.current);
      cursorRing.rotation.z += 0.05;

      // ── Move / rotate hero model ───────────────────────────────────────────
      if (hero) {
        if (gesture === "fist") {
          // Lock to hand, rotate by fist delta
          hero.position.copy(currentPos.current);
          hero.rotation.x = fistRef.current.rotX;
          hero.rotation.y = fistRef.current.rotY;
        } else if (idleRef.current) {
          // Idle float + slow auto-rotate
          hero.position.x = Math.sin(t * 0.4) * 0.4;
          hero.position.y = Math.cos(t * 0.55) * 0.25;
          hero.position.z = 0;
          hero.rotation.y += 0.006;
          hero.rotation.x += 0.002;
        } else {
          // Loosely follow hand
          hero.position.x = THREE.MathUtils.lerp(
            hero.position.x,
            currentPos.current.x * 0.45,
            0.05
          );
          hero.position.y = THREE.MathUtils.lerp(
            hero.position.y,
            currentPos.current.y * 0.45,
            0.05
          );
          hero.position.z = THREE.MathUtils.lerp(
            hero.position.z,
            currentPos.current.z * 0.3,
            0.05
          );
          hero.rotation.y += 0.007;
          hero.rotation.x += 0.003;
        }

        // Scale
        const s = currentScale.current;
        hero.scale.setScalar(s * (modelLoaded ? stateRef.current._autoScale || 1 : 1));

        // Emissive pulse on active gesture
        hero.traverse((child) => {
          if (child.isMesh && child.material && child.material.emissive) {
            const pulse = 0.5 + 0.5 * Math.sin(t * 8);
            const target =
              gesture && gesture !== "none" && gesture !== "unknown"
                ? pulse * 0.35
                : 0.05;
            child.material.emissiveIntensity = THREE.MathUtils.lerp(
              child.material.emissiveIntensity,
              target,
              0.08
            );
          }
        });
      }

      // ── Orbit lights ───────────────────────────────────────────────────────
      pLight1.position.x = Math.sin(t * 0.5) * 8;
      pLight1.position.z = Math.cos(t * 0.5) * 6;
      pLight2.position.x = Math.cos(t * 0.4) * 7;
      pLight2.position.z = Math.sin(t * 0.4) * 6;

      // ── Rotate stars ───────────────────────────────────────────────────────
      stars.rotation.y += 0.0003;
      stars.rotation.x += 0.0001;

      // ── Fade old paint dots ────────────────────────────────────────────────
      trailRef.current.forEach((dot) => {
        dot.material.opacity = Math.max(0, 0.85 - (now - dot._born) / 7000);
      });

      renderer.render(scene, camera);
    };

    animate();

    // ── Resize handler ────────────────────────────────────────────────────────
    const onResize = () => {
      const W2 = mount.clientWidth,
        H2 = mount.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, [modelPath]);

  // ── Status label updates ───────────────────────────────────────────────────
  const gestureLabels = {
    fist: "✊ rotating model",
    ok: "👌 scaling model",
    point: "☝️ painting in 3D",
    open_palm: "🖐️ exploding trail",
    thumbs_down: "👎 trail cleared",
    thumbs_up: "👍 note saved",
    victory: "✌️ screenshot",
    none: "waiting for hand…",
    unknown: "waiting for hand…",
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* THREE.js canvas */}
      <div
        ref={mountRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      {/* Status bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 10,
          pointerEvents: "none",
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#00ffcc",
          textShadow: "0 0 8px #00ffcc",
          zIndex: 10,
        }}
      >
        <div>{status}</div>
        <div style={{ fontSize: "10px", opacity: 0.6, marginTop: "4px" }}>
          {gestureLabels[gesture] || "waiting…"}
        </div>
      </div>
    </div>
  );
}
