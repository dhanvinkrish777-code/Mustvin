import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Download,
  Hand,
  Rotate3d,
  ShieldCheck,
  Video,
  VideoOff,
} from 'lucide-react';
import { jarvisAudio } from '../utils/audioSystem';
import { useJarvisPreferences } from '../contexts/JarvisPreferencesContext';

interface GestureBall3DProps {
  onStatusUpdate?: (status: string) => void;
  autoStartCamera?: boolean | number;
}

type GeometryPreset = 'sphere' | 'torusKnot' | 'octahedron';

export const GestureBall3D: React.FC<GestureBall3DProps> = ({
  onStatusUpdate,
  autoStartCamera = false,
}) => {
  const { backgroundColor } = useJarvisPreferences();
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [handDetected, setHandDetected] = useState<boolean>(false);
  const [gestureMode, setGestureMode] = useState<string>('Touch / Pointer Ready');
  const [geometryPreset, setGeometryPreset] = useState<GeometryPreset>('sphere');
  const [autoSpin, setAutoSpin] = useState<boolean>(true);
  const [telemetry, setTelemetry] = useState({
    posX: 0,
    posY: 0,
    scale: 1.0,
    rotX: 0,
    rotY: 0,
  });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const camera3DRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const ballGroupRef = useRef<THREE.Group | null>(null);
  const coreMeshRef = useRef<THREE.Mesh | null>(null);
  const wireMeshRef = useRef<THREE.Mesh | null>(null);
  const outerMeshRef = useRef<THREE.Mesh | null>(null);
  const ring1Ref = useRef<THREE.Mesh | null>(null);
  const ring2Ref = useRef<THREE.Mesh | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const autoSpinRef = useRef<boolean>(autoSpin);

  const targetPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const targetScaleRef = useRef<number>(1.0);
  const targetRotRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const recentPinchDistsRef = useRef<number[]>([]);
  const lastValidPalmRef = useRef<{ x: number; y: number } | null>(null);

  const isDraggingRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const previousPointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animFrameIdRef = useRef<number | null>(null);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const handsDetectorRef = useRef<any>(null);
  const isProcessingVideoRef = useRef<boolean>(false);

  useEffect(() => {
    autoSpinRef.current = autoSpin;
  }, [autoSpin]);

  // Swap inner wireframe geometry cleanly when user switches preset
  useEffect(() => {
    if (!wireMeshRef.current) return;
    const oldGeo = wireMeshRef.current.geometry;
    if (geometryPreset === 'torusKnot') {
      wireMeshRef.current.geometry = new THREE.TorusKnotGeometry(0.95, 0.26, 96, 16);
    } else if (geometryPreset === 'octahedron') {
      wireMeshRef.current.geometry = new THREE.OctahedronGeometry(1.45, 2);
    } else {
      wireMeshRef.current.geometry = new THREE.IcosahedronGeometry(1.4, 2);
    }
    oldGeo.dispose();
  }, [geometryPreset]);

  // Sync WebGL Scene Background & Wireframe Contrast with Background Colors (White vs Black)
  useEffect(() => {
    const isWhite = backgroundColor === 'white';
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(isWhite ? 0xffffff : 0x000000);
    }
    if (wireMeshRef.current) {
      const mat = wireMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setHex(isWhite ? 0x171717 : 0xe5e5e5);
    }
    if (outerMeshRef.current) {
      const mat = outerMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setHex(isWhite ? 0xa3a3a3 : 0x525252);
    }
    if (ring1Ref.current) {
      const mat = ring1Ref.current.material as THREE.MeshBasicMaterial;
      mat.color.setHex(isWhite ? 0x000000 : 0xffffff);
    }
    if (particlesRef.current) {
      const mat = particlesRef.current.material as THREE.PointsMaterial;
      mat.color.setHex(isWhite ? 0x262626 : 0xd4d4d4);
      mat.blending = isWhite ? THREE.NormalBlending : THREE.AdditiveBlending;
      mat.needsUpdate = true;
    }
  }, [backgroundColor]);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || 600;
    const height = mountRef.current.clientHeight || 480;
    const isWhite = backgroundColor === 'white';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isWhite ? 0xffffff : 0x000000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 6;
    camera3DRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ballGroup = new THREE.Group();
    scene.add(ballGroup);
    ballGroupRef.current = ballGroup;

    const coreGeo = new THREE.SphereGeometry(0.82, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x10b981,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.85,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    ballGroup.add(coreMesh);
    coreMeshRef.current = coreMesh;

    const wireGeo = new THREE.IcosahedronGeometry(1.4, 2);
    const wireMat = new THREE.MeshBasicMaterial({
      color: isWhite ? 0x171717 : 0xe5e5e5,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    ballGroup.add(wireMesh);
    wireMeshRef.current = wireMesh;

    const outerGeo = new THREE.SphereGeometry(1.72, 24, 24);
    const outerMat = new THREE.MeshBasicMaterial({
      color: isWhite ? 0xa3a3a3 : 0x525252,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    ballGroup.add(outerMesh);
    outerMeshRef.current = outerMesh;

    const ringGeo1 = new THREE.TorusGeometry(2.0, 0.02, 16, 100);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: isWhite ? 0x000000 : 0xffffff,
      transparent: true,
      opacity: 0.75,
    });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI / 2;
    ballGroup.add(ring1);
    ring1Ref.current = ring1;

    const ringGeo2 = new THREE.TorusGeometry(2.22, 0.018, 16, 100);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.55,
    });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.y = Math.PI / 4;
    ballGroup.add(ring2);
    ring2Ref.current = ring2;

    const particleCount = 240;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const radius = 1.85 + Math.random() * 0.9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      particlePositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = radius * Math.cos(phi);
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: isWhite ? 0x262626 : 0xd4d4d4,
      size: 0.045,
      transparent: true,
      opacity: 0.75,
      blending: isWhite ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    ballGroup.add(particles);
    particlesRef.current = particles;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 3.5, 20);
    pointLight.position.set(3, 4, 4);
    scene.add(pointLight);

    const clock = new THREE.Clock();
    let frameCounter = 0;

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      if (ballGroupRef.current) {
        const lerpFactor = 0.14;
        ballGroupRef.current.position.x +=
          (targetPosRef.current.x - ballGroupRef.current.position.x) * lerpFactor;
        ballGroupRef.current.position.y +=
          (targetPosRef.current.y - ballGroupRef.current.position.y) * lerpFactor;
        ballGroupRef.current.position.z +=
          (targetPosRef.current.z - ballGroupRef.current.position.z) * lerpFactor;

        const currentScale = ballGroupRef.current.scale.x;
        const newScale = currentScale + (targetScaleRef.current - currentScale) * 0.12;
        ballGroupRef.current.scale.set(newScale, newScale, newScale);

        ballGroupRef.current.rotation.x +=
          (targetRotRef.current.x - ballGroupRef.current.rotation.x) * 0.1;
        ballGroupRef.current.rotation.y +=
          (targetRotRef.current.y - ballGroupRef.current.rotation.y) * 0.1;
        ballGroupRef.current.rotation.z +=
          (targetRotRef.current.z - ballGroupRef.current.rotation.z) * 0.1;

        if (autoSpinRef.current) {
          targetRotRef.current.y += 0.006;
        }
      }

      if (coreMeshRef.current) {
        const pulse = 1 + Math.sin(elapsedTime * 3.5) * 0.05;
        coreMeshRef.current.scale.set(pulse, pulse, pulse);
      }
      if (ring1Ref.current) ring1Ref.current.rotation.z += 0.01;
      if (ring2Ref.current) {
        ring2Ref.current.rotation.x += 0.009;
        ring2Ref.current.rotation.y += 0.007;
      }
      if (particlesRef.current) particlesRef.current.rotation.y -= 0.0035;

      renderer.render(scene, camera);

      frameCounter++;
      if (frameCounter % 4 === 0 && ballGroupRef.current) {
        setTelemetry({
          posX: Number(ballGroupRef.current.position.x.toFixed(2)),
          posY: Number(ballGroupRef.current.position.y.toFixed(2)),
          scale: Number(ballGroupRef.current.scale.x.toFixed(2)),
          rotX: Math.round(((ballGroupRef.current.rotation.x * 180) / Math.PI) % 360),
          rotY: Math.round(((ballGroupRef.current.rotation.y * 180) / Math.PI) % 360),
        });
      }
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !camera3DRef.current) return;
      const w = Math.max(300, mountRef.current.clientWidth || 600);
      const h = Math.max(360, mountRef.current.clientHeight || 480);
      camera3DRef.current.aspect = w / h;
      camera3DRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => handleResize()) : null;
    if (resizeObserver && mountRef.current) {
      resizeObserver.observe(mountRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (renderer.domElement && mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const shouldStart =
      typeof autoStartCamera === 'number' ? autoStartCamera > 0 : Boolean(autoStartCamera);
    if (shouldStart && !cameraActive) {
      startCamera();
    }
  }, [autoStartCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      onStatusUpdate?.('Starting hand gesture camera...');
      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      cameraStreamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      jarvisAudio.playAcknowledgeSound();
      initMediaPipeHands();
      onStatusUpdate?.('Hand camera active — move palm to translate, pinch to scale.');
    } catch {
      onStatusUpdate?.(
        'Camera permission not granted. Drag or scroll directly on the 3D sphere.'
      );
      setGestureMode('Touch / Pointer Active');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    isProcessingVideoRef.current = false;
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setHandDetected(false);
    setGestureMode('Touch / Pointer Ready');
  };

  const initMediaPipeHands = async () => {
    try {
      const mpHands = (window as any).Hands;
      if (mpHands) {
        const hands = new mpHands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65,
        });

        hands.onResults(onHandResults);
        handsDetectorRef.current = hands;
        isProcessingVideoRef.current = true;
        let consecutiveErrors = 0;

        const processFrame = async () => {
          if (
            isProcessingVideoRef.current &&
            videoRef.current &&
            videoRef.current.readyState >= 2 &&
            handsDetectorRef.current
          ) {
            try {
              await handsDetectorRef.current.send({ image: videoRef.current });
              consecutiveErrors = 0;
            } catch {
              consecutiveErrors++;
              if (consecutiveErrors >= 2) {
                handsDetectorRef.current = null;
                startFallbackTracker();
                return;
              }
            }
          }
          if (cameraStreamRef.current && isProcessingVideoRef.current && handsDetectorRef.current) {
            requestAnimationFrame(processFrame);
          }
        };
        processFrame();
      } else {
        startFallbackTracker();
      }
    } catch {
      startFallbackTracker();
    }
  };

  const onHandResults = (results: any) => {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      setHandDetected(false);
      lastValidPalmRef.current = null;
      return;
    }

    setHandDetected(true);
    const landmarks = results.multiHandLandmarks[0];
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleKnuckle = landmarks[9];

    const rawX = 1 - middleKnuckle.x;
    const rawY = middleKnuckle.y;

    if (lastValidPalmRef.current) {
      const dist = Math.hypot(
        rawX - lastValidPalmRef.current.x,
        rawY - lastValidPalmRef.current.y
      );
      if (dist > 0.45) {
        return;
      }
    }
    lastValidPalmRef.current = { x: rawX, y: rawY };

    targetPosRef.current.x = (rawX - 0.5) * 6.5;
    targetPosRef.current.y = (0.5 - rawY) * 4.5;

    const dx = (thumbTip.x - indexTip.x) * 640;
    const dy = (thumbTip.y - indexTip.y) * 480;
    const currentPinch = Math.hypot(dx, dy);

    recentPinchDistsRef.current.push(currentPinch);
    if (recentPinchDistsRef.current.length > 5) {
      recentPinchDistsRef.current.shift();
    }
    const avgPinch =
      recentPinchDistsRef.current.reduce((a, b) => a + b, 0) /
      recentPinchDistsRef.current.length;

    const clampedScale = Math.max(0.5, Math.min(2.6, 0.4 + (avgPinch / 65) * 0.9));
    targetScaleRef.current = clampedScale;

    const handDx = (middleKnuckle.x - wrist.x) * 640;
    const handDy = (middleKnuckle.y - wrist.y) * 480;
    targetRotRef.current.z = Math.atan2(handDy, handDx);
    targetRotRef.current.x = (rawY - 0.5) * 2.2;
    targetRotRef.current.y += (rawX - 0.5) * 0.05;

    if (avgPinch < 38) {
      setGestureMode('Pinch Compact');
    } else if (avgPinch > 110) {
      setGestureMode('Open Palm Expand');
    } else {
      setGestureMode('Hand Orbit Locked');
    }
  };

  const startFallbackTracker = () => {
    const loop = () => {
      if (!cameraStreamRef.current || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (video.readyState >= 2 && ctx) {
        canvas.width = 160;
        canvas.height = 120;
        ctx.drawImage(video, 0, 0, 160, 120);
        const data = ctx.getImageData(0, 0, 160, 120).data;

        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
            sumX += (i / 4) % 160;
            sumY += Math.floor(i / 4 / 160);
            count++;
          }
        }

        if (count > 90) {
          setHandDetected(true);
          const cx = sumX / count / 160;
          const cy = sumY / count / 120;
          targetPosRef.current.x = (0.5 - cx) * 6;
          targetPosRef.current.y = (0.5 - cy) * 4;
          targetScaleRef.current = Math.max(0.6, Math.min(2.4, count / 320));
          setGestureMode('Local Optical Lock');
        } else {
          setHandDetected(false);
        }
      }
      if (isProcessingVideoRef.current) requestAnimationFrame(loop);
    };
    isProcessingVideoRef.current = true;
    loop();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    isPanningRef.current = e.button === 2 || e.shiftKey;
    previousPointerPosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - previousPointerPosRef.current.x;
    const deltaY = e.clientY - previousPointerPosRef.current.y;
    previousPointerPosRef.current = { x: e.clientX, y: e.clientY };

    if (isPanningRef.current) {
      targetPosRef.current.x += deltaX * 0.015;
      targetPosRef.current.y -= deltaY * 0.015;
      setGestureMode('Panning');
    } else {
      targetRotRef.current.y += deltaX * 0.015;
      targetRotRef.current.x += deltaY * 0.015;
      setGestureMode('Orbit Rotation');
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    isPanningRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * -0.002;
      targetScaleRef.current = Math.max(0.4, Math.min(3.2, targetScaleRef.current + zoomDelta));
      setGestureMode(zoomDelta > 0 ? 'Zoom In' : 'Zoom Out');
      jarvisAudio.playHoloHum(targetScaleRef.current);
    };

    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelNative);
    };
  }, []);

  const resetBall = () => {
    targetPosRef.current.set(0, 0, 0);
    targetScaleRef.current = 1.0;
    targetRotRef.current = { x: 0, y: 0, z: 0 };
    jarvisAudio.playAcknowledgeSound();
    setGestureMode('Centered');
  };

  const captureSnapshot = () => {
    if (!rendererRef.current) return;
    const url = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-3d-sphere-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    jarvisAudio.playDimensionLockedSound();
  };

  return (
    <div className="relative w-full h-full min-h-[500px] flex flex-col bg-white dark:bg-[#060606] rounded-2xl border border-neutral-300 dark:border-neutral-800 overflow-hidden text-black dark:text-white">
      {/* Control Header */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0a0a0a] z-10 gap-3">
        <div>
          <h3 className="text-sm font-display font-bold text-black dark:text-white">
            3D Hand Gesture Sphere
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Voice trigger:{' '}
            <span className="font-mono text-black dark:text-neutral-200">"go to the hand cam"</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mesh Presets */}
          <div className="flex items-center bg-white dark:bg-black border border-neutral-300 dark:border-neutral-800 rounded-lg p-0.5 text-xs">
            {(
              [
                ['sphere', 'Geodesic'],
                ['torusKnot', 'Torus Knot'],
                ['octahedron', 'Lattice'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setGeometryPreset(key)}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  geometryPreset === key
                    ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                    : 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAutoSpin((s) => !s)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
              autoSpin
                ? 'bg-neutral-200 text-black border-neutral-400 dark:bg-[#141414] dark:text-white dark:border-neutral-700'
                : 'bg-white text-neutral-500 border-neutral-300 dark:bg-black dark:text-neutral-500 dark:border-neutral-800'
            }`}
          >
            Spin: {autoSpin ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => {
              if (cameraActive) stopCamera();
              else startCamera();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              cameraActive
                ? 'bg-emerald-500 text-black'
                : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
            }`}
          >
            {cameraActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
            <span>{cameraActive ? 'Hand Cam ON' : 'Activate Hand Cam'}</span>
          </button>

          <button
            onClick={resetBall}
            className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-[#141414] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-black dark:text-neutral-200 rounded-lg text-xs transition cursor-pointer"
          >
            Center
          </button>

          <button
            onClick={captureSnapshot}
            className="p-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-[#141414] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-black dark:text-neutral-300 dark:hover:text-white rounded-lg transition cursor-pointer"
            title="Save 3D PNG snapshot"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3D WebGL Stage */}
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className="relative flex-1 w-full min-h-[420px] bg-white dark:bg-black cursor-grab active:cursor-grabbing select-none touch-none"
      >
        {/* Top-Left Tabular Telemetry */}
        <div className="absolute top-4 left-4 p-3 bg-white/90 dark:bg-[#0a0a0a]/90 border border-neutral-300 dark:border-neutral-800 rounded-xl pointer-events-none text-xs font-mono tabular-nums space-y-1">
          <div className="flex items-center gap-1.5 text-black dark:text-white font-semibold border-b border-neutral-200 dark:border-neutral-800 pb-1">
            <Rotate3d className="w-3.5 h-3.5" />
            <span>SPATIAL STATE</span>
          </div>
          <div className="text-neutral-800 dark:text-neutral-300 flex justify-between gap-4">
            <span className="text-neutral-500">Coords</span>
            <span>
              {telemetry.posX.toFixed(2)}, {telemetry.posY.toFixed(2)}
            </span>
          </div>
          <div className="text-neutral-800 dark:text-neutral-300 flex justify-between gap-4">
            <span className="text-neutral-500">Scale</span>
            <span className="text-black dark:text-white font-semibold">
              {telemetry.scale.toFixed(2)}x
            </span>
          </div>
          <div className="text-neutral-800 dark:text-neutral-300 flex justify-between gap-4">
            <span className="text-neutral-500">Angles</span>
            <span>
              {telemetry.rotX}° / {telemetry.rotY}°
            </span>
          </div>
          <div className="text-neutral-800 dark:text-neutral-300 flex justify-between gap-4">
            <span className="text-neutral-500">Input</span>
            <span className="text-emerald-600 dark:text-emerald-400">{gestureMode}</span>
          </div>
        </div>

        {/* Live Hand Camera PiP */}
        <div
          className={`absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden border border-neutral-400 dark:border-neutral-700 bg-black z-20 transition-all ${
            cameraActive
              ? 'opacity-100 scale-100 pointer-events-auto'
              : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/85 border border-neutral-700 text-[10px] font-mono text-white">
            {handDetected ? 'HAND LOCKED' : 'SCANNING PALM'}
          </div>
        </div>

        {/* Quick Scale Buttons + Controls Guide */}
        <div className="absolute bottom-4 left-4 p-3 bg-white/90 dark:bg-[#0a0a0a]/90 border border-neutral-300 dark:border-neutral-800 rounded-xl text-xs space-y-2 max-w-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-black dark:text-white font-semibold flex items-center gap-1.5">
              <Hand className="w-3.5 h-3.5" />
              <span>Controls</span>
            </span>
            <div className="flex items-center gap-1 font-mono">
              {[0.75, 1.0, 1.6].map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => {
                    targetScaleRef.current = sc;
                  }}
                  className="px-1.5 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-[10px] text-black dark:text-neutral-300 cursor-pointer"
                >
                  {sc}x
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Wave palm in front of webcam or drag on canvas. Pinch thumb &amp; index finger or scroll
            wheel to scale smoothly.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-2 bg-neutral-50 dark:bg-[#0a0a0a] border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-500 font-mono">
        <span className="flex items-center gap-1.5 text-black dark:text-neutral-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>EMA Damped Motion Filter</span>
        </span>
        <span>60 FPS WebGL</span>
      </div>
    </div>
  );
};
