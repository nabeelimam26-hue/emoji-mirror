import { useRef, useCallback } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * useFaceTracker - Custom hook for MediaPipe Hand Landmarker
 * Manages: initialization, video/webcam detection, image detection
 * 
 * Returns: { handLandmarkerRef, loadModel, detectFromImage, startDetectionLoop }
 */

// ─── LOAD HANDLANDMARKER ──────────────────────────────────────────────────────
async function loadHandLandmarkerModel(runningMode) {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  return await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "CPU",
    },
    runningMode,
    numHands: 1,
  });
}

export function useFaceTracker() {
  const handLandmarkerRef = useRef(null);
  
  // ── Load MediaPipe model ───────────────────────────────────────────────────
  const loadModel = useCallback(async (mode = "IMAGE") => {
    try {
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }
      const runningMode = mode === "image" ? "IMAGE" : "VIDEO";
      handLandmarkerRef.current = await loadHandLandmarkerModel(runningMode);
      return true;
    } catch (err) {
      console.error("MediaPipe load failed:", err);
      return false;
    }
  }, []);

  // ── Detect from static image ───────────────────────────────────────────────
  const detectFromImage = useCallback((img) => {
    if (!handLandmarkerRef.current) return null;
    try {
      const result = handLandmarkerRef.current.detect(img);
      return result.landmarks?.length > 0 ? result.landmarks[0] : null;
    } catch (err) {
      console.error("Detection error:", err);
      return null;
    }
  }, []);

  // ── Start detection loop for video/webcam ──────────────────────────────────
  const startDetectionLoop = useCallback((videoEl, canvasRef, onLandmarks, mirror = false) => {
    const loopRef = { id: null };

    const loop = () => {
      if (!videoEl || videoEl.paused || videoEl.ended || !handLandmarkerRef.current) {
        return;
      }

      if (videoEl.readyState < 2) {
        loopRef.id = requestAnimationFrame(loop);
        return;
      }

      // Update canvas dimensions
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = videoEl.videoWidth || 640;
        canvas.height = videoEl.videoHeight || 480;
      }

      try {
        const now = performance.now();
        const result = handLandmarkerRef.current.detectForVideo(videoEl, now);

        // Mirror landmarks if needed
        let landmarks = null;
        if (result.landmarks?.length > 0) {
          landmarks = result.landmarks[0];
          if (mirror) {
            landmarks = landmarks.map(p => ({ ...p, x: 1 - p.x }));
          }
        }

        // Call callback with landmarks (null if no hand detected)
        onLandmarks(landmarks, canvas);
      } catch (e) {
        // Skip frame silently
      }

      loopRef.id = requestAnimationFrame(loop);
    };

    loopRef.id = requestAnimationFrame(loop);
    return loopRef;
  }, []);

  // ── Stop detection loop ────────────────────────────────────────────────────
  const stopDetectionLoop = useCallback((loopRef) => {
    if (loopRef?.id) {
      cancelAnimationFrame(loopRef.id);
      loopRef.id = null;
    }
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (handLandmarkerRef.current) {
      handLandmarkerRef.current.close();
      handLandmarkerRef.current = null;
    }
  }, []);

  return {
    handLandmarkerRef,
    loadModel,
    detectFromImage,
    startDetectionLoop,
    stopDetectionLoop,
    cleanup,
  };
}
