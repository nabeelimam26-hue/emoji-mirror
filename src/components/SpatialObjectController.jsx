/**
 * SpatialObjectController.jsx — Professional 3D Spatial Physics Engine
 * 
 * Features:
 * - TorusKnot geometry with chrome finish (MeshStandardMaterial)
 * - Dual-hand control for physics-based manipulation
 * - Two-hand scaling: Distance between hands controls object scale
 * - Two-hand rotation: Vector between hands maps to Y & Z rotation (steering wheel effect)
 * - Water-smooth LERP: rotation(0.05), position(0.1), scale(0.1)
 * - Dynamic lighting: PointLight color changes based on hand distance
 * - Optimized for Samsung Galaxy F12 (60fps target)
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const WORLD_SCALE = 6;
const DEPTH_SCALE = 3;
const LERP_ROTATION = 0.05;    // ← Smooth rotation steering wheel effect
const LERP_POSITION = 0.1;     // ← Smooth position following
const LERP_SCALE = 0.1;        // ← Smooth scale interpolation
const CAMERA_Z = 12;

// Hand distance thresholds for lighting
const HAND_DISTANCE_MIN = 0.15; // Close (red light)
const HAND_DISTANCE_MAX = 1.2;  // Far (cyan light)

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

// Calculate 3D distance using x, y, z coordinates
function distance3D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─── SMOOTH LERP FOR VECTORS ──────────────────────────────────────────────────
function lerpVec3(vec, target, alpha) {
  vec.x = THREE.MathUtils.lerp(vec.x, target.x, alpha);
  vec.y = THREE.MathUtils.lerp(vec.y, target.y, alpha);
  vec.z = THREE.MathUtils.lerp(vec.z, target.z, alpha);
}

// ─── LERP FOR EULERS (ANGLES) ─────────────────────────────────────────────────
function lerpEuler(euler, target, alpha) {
  euler.x = THREE.MathUtils.lerp(euler.x, target.x, alpha);
  euler.y = THREE.MathUtils.lerp(euler.y, target.y, alpha);
  euler.z = THREE.MathUtils.lerp(euler.z, target.z, alpha);
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function SpatialObjectController({ handsRef }) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);

  // Smooth animation targets
  const targetPos = useRef(new THREE.Vector3(0, 0, 0));
  const currentPos = useRef(new THREE.Vector3(0, 0, 0));
  const targetRotEuler = useRef(new THREE.Euler(0, 0, 0));
  const currentRotEuler = useRef(new THREE.Euler(0, 0, 0));
  const targetScale = useRef(1);
  const currentScale = useRef(1);

  // Hand tracking state
  const handDistanceRef = useRef(1);

  const [status, setStatus] = useState("waiting for hands…");
  const [handCount, setHandCount] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || 640;
    const H = mount.clientHeight || 400;

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a0f, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowShadowMap;
    mount.appendChild(renderer.domElement);

    // ── Scene ──────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0a0f, 50, 100);

    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 200);
    camera.position.set(0, 0, CAMERA_Z);

    // ── Lighting ───────────────────────────────────────────────────────────────
    // Ambient light for base illumination
    scene.add(new THREE.AmbientLight(0x1a1a2e, 0.8));

    // Directional light for shadows
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(8, 10, 8);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // Three dynamic point lights with hand-responsive colors
    const pLight1 = new THREE.PointLight(0xff0066, 2, 40);
    pLight1.position.set(-8, 4, 6);
    pLight1.castShadow = true;
    scene.add(pLight1);

    const pLight2 = new THREE.PointLight(0x00ffcc, 2, 40);
    pLight2.position.set(8, -4, 6);
    pLight2.castShadow = true;
    scene.add(pLight2);

    const pLight3 = new THREE.PointLight(0x8844ff, 1.5, 30);
    pLight3.position.set(0, 6, -8);
    scene.add(pLight3);

    // ── Grid floor ─────────────────────────────────────────────────────────────
    const grid = new THREE.GridHelper(30, 30, 0x444466, 0x222233);
    grid.position.y = -6;
    grid.material.transparent = true;
    grid.material.opacity = 0.3;
    scene.add(grid);

    // ── Create TorusKnot geometry with chrome material ───────────────────────────
    const torusKnotGeo = new THREE.TorusKnotGeometry(1.2, 0.4, 128, 16);
    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,         // ← High metalness for chrome
      roughness: 0.1,          // ← Low roughness for mirror-like finish
      envMapIntensity: 1,
    });
    const torusKnot = new THREE.Mesh(torusKnotGeo, chromeMaterial);
    torusKnot.castShadow = true;
    torusKnot.receiveShadow = true;
    torusKnot.scale.setScalar(0.8);
    scene.add(torusKnot);

    // ── Hand position markers (visual debugging) ───────────────────────────────
    const handMarkers = [];
    for (let i = 0; i < 2; i++) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xff0066 : 0x00ffcc,
          transparent: true,
          opacity: 0.6,
        })
      );
      marker.visible = false;
      scene.add(marker);
      handMarkers.push(marker);
    }

    // Save refs
    stateRef.current = {
      renderer,
      scene,
      camera,
      torusKnot,
      handMarkers,
      pLight1,
      pLight2,
      pLight3,
      dirLight,
    };

    // ── Animation loop ─────────────────────────────────────────────────────────
    let prevTime = performance.now();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;

      if (!stateRef.current) return;
      const {
        renderer,
        scene,
        camera,
        torusKnot,
        handMarkers,
        pLight1,
        pLight2,
      } = stateRef.current;

      const handsData = handsRef?.current;

      if (handsData && handsData.hands && handsData.hands.length >= 2) {
        // ─── TWO-HAND CONTROLLER ──────────────────────────────────────────────
        const leftHand = handsData.hands.find(h => h.handedness === "Left");
        const rightHand = handsData.hands.find(h => h.handedness === "Right");

        if (leftHand && rightHand) {
          setStatus("tracking 2 hands ✓");
          setHandCount(2);

          // Get palm position (landmark 0)
          const leftPalm = lmToWorld(leftHand.landmarks[0]);
          const rightPalm = lmToWorld(rightHand.landmarks[0]);

          // ── POSITION: Center between both palms ────────────────────────────
          targetPos.current.x = (leftPalm.x + rightPalm.x) * 0.5;
          targetPos.current.y = (leftPalm.y + rightPalm.y) * 0.5;
          targetPos.current.z = (leftPalm.z + rightPalm.z) * 0.5;

          // ── SCALE: Distance between hands ─────────────────────────────────
          const handDist = distance3D(leftPalm, rightPalm);
          handDistanceRef.current = handDist;
          // Map distance [0.15, 1.2] to scale [0.3, 2.5]
          targetScale.current = THREE.MathUtils.mapLinear(
            handDist,
            HAND_DISTANCE_MIN,
            HAND_DISTANCE_MAX,
            0.3,
            2.5
          );

          // ── ROTATION: Vector between hands (steering wheel) ───────────────
          const handVector = new THREE.Vector3(
            rightPalm.x - leftPalm.x,
            rightPalm.y - leftPalm.y,
            rightPalm.z - leftPalm.z
          ).normalize();

          // Map hand vector to euler angles
          // Y rotation: left-right tilt (hand vector X component)
          // Z rotation: front-back tilt (hand vector Y component)
          targetRotEuler.current.x = 0;
          targetRotEuler.current.y = handVector.x * Math.PI * 0.6; // ← Steering Y
          targetRotEuler.current.z = handVector.y * Math.PI * 0.4; // ← Steering Z

          // Update hand markers
          const lp = lmToWorld(leftHand.landmarks[9]); // Middle finger middle
          handMarkers[0].position.set(lp.x, lp.y, lp.z);
          handMarkers[0].visible = true;

          const rp = lmToWorld(rightHand.landmarks[9]);
          handMarkers[1].position.set(rp.x, rp.y, rp.z);
          handMarkers[1].visible = true;
        } else if (handsData.hands.length === 1) {
          // Single hand: just track position
          const hand = handsData.hands[0];
          setStatus(`tracking 1 hand (${hand.handedness})`);
          setHandCount(1);

          const palm = lmToWorld(hand.landmarks[0]);
          targetPos.current.set(palm.x, palm.y, palm.z);
          targetScale.current = 1.0;

          handMarkers[0].position.copy(targetPos.current);
          handMarkers[0].visible = true;
          handMarkers[1].visible = false;
        }
      } else {
        setStatus("waiting for hands…");
        setHandCount(0);
        handMarkers.forEach(m => m.visible = false);
      }

      // ── SMOOTH INTERPOLATION ──────────────────────────────────────────────
      lerpVec3(currentPos.current, targetPos.current, LERP_POSITION);
      lerpEuler(currentRotEuler.current, targetRotEuler.current, LERP_ROTATION);
      currentScale.current = THREE.MathUtils.lerp(
        currentScale.current,
        targetScale.current,
        LERP_SCALE
      );

      // ── UPDATE OBJECT ────────────────────────────────────────────────────
      torusKnot.position.copy(currentPos.current);
      torusKnot.rotation.setFromEuler(currentRotEuler.current);
      torusKnot.scale.setScalar(currentScale.current);

      // ── DYNAMIC LIGHTING: Color by hand distance ────────────────────────
      if (handCount === 2) {
        const handDist = handDistanceRef.current;
        // Close (< 0.3) → Red, Far (> 0.8) → Cyan
        const t = Math.max(
          0,
          Math.min(1, (handDist - HAND_DISTANCE_MIN) / (HAND_DISTANCE_MAX - HAND_DISTANCE_MIN))
        );
        const closeColor = new THREE.Color(0xff3366); // Red
        const farColor = new THREE.Color(0x00ffcc);   // Cyan
        const lerpColor = new THREE.Color().lerpColors(closeColor, farColor, t);
        pLight1.color.copy(lerpColor);
        pLight1.intensity = 2 + Math.sin(now * 0.003) * 0.5;
      }

      // ── ORBITING SECONDARY LIGHTS ────────────────────────────────────────
      const t = now * 0.0005;
      pLight2.position.x = Math.sin(t) * 10;
      pLight2.position.z = Math.cos(t) * 8;

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
      torusKnotGeo.dispose();
      chromeMaterial.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* THREE.js canvas */}
      <div
        ref={mountRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      {/* Status info (clean, no gesture text) */}
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
          hands: {handCount} | scale: {currentScale.current.toFixed(2)}x
        </div>
      </div>

      {/* Info panel */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          pointerEvents: "none",
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#888899",
          background: "rgba(0,0,0,0.3)",
          padding: "8px 12px",
          borderRadius: "4px",
          border: "1px solid rgba(0,255,204,0.1)",
        }}
      >
        <div>🎯 Spatial 3D Controller</div>
        <div style={{ fontSize: "9px", marginTop: "4px", opacity: 0.7 }}>
          • Dual hand control
          <br />• Distance → scale
          <br />• Vector → rotation
          <br />• Responsive lighting
        </div>
      </div>
    </div>
  );
}
