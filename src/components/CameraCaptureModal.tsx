import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, X } from 'lucide-react';
import { jarvisAudio } from '../utils/audioSystem';

interface CameraCaptureModalProps {
  isOpen: boolean;
  remainingPhotoSlots: number;
  onCapturePhoto: (photo: { name: string; mimeType: string; dataUrl: string }) => void;
  onClose: () => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  remainingPhotoSlots,
  onCapturePhoto,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string>('');
  const [streamReady, setStreamReady] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      return;
    }
    startStream(facingMode);
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamReady(false);
  };

  const startStream = async (mode: 'environment' | 'user') => {
    stopStream();
    setCameraError('');
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreamReady(true);
    } catch {
      setCameraError(
        'Live webcam could not be opened directly. Use the camera capture button below to snap or pick a photo.'
      );
      setStreamReady(false);
    }
  };

  const handleSnap = () => {
    if (!videoRef.current || remainingPhotoSlots <= 0) return;
    const video = videoRef.current;
    const w = video.videoWidth || 1024;
    const h = video.videoHeight || 768;
    const scale = Math.min(1, 1024 / Math.max(w, h));

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    jarvisAudio.playDimensionLockedSound();

    onCapturePhoto({
      name: `camera-photo-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      dataUrl,
    });

    if (remainingPhotoSlots - 1 <= 0) {
      onClose();
    }
  };

  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || remainingPhotoSlots <= 0) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onCapturePhoto({
          name: file.name || `photo-${Date.now()}.jpg`,
          mimeType: file.type || 'image/jpeg',
          dataUrl: reader.result,
        });
        onClose();
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl border border-neutral-300 dark:border-neutral-800 bg-white text-black dark:bg-[#080808] dark:text-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-[#0d0d0d]">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4" />
            <span className="text-sm font-display font-bold">Take Photo</span>
            <span className="text-xs font-mono text-neutral-500">
              ({remainingPhotoSlots} slot{remainingPhotoSlots === 1 ? '' : 's'} remaining of 15)
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
          {!cameraError ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="p-6 text-center space-y-3 text-white">
              <p className="text-xs text-neutral-300 max-w-sm mx-auto">{cameraError}</p>
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Capture / Choose Camera Photo</span>
              </button>
              <input
                ref={fallbackInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFallbackFile}
                className="hidden"
              />
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-neutral-50 dark:bg-[#0d0d0d]">
          <button
            type="button"
            onClick={() =>
              setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
            }
            className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Flip Camera</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-neutral-800 transition cursor-pointer"
            >
              Done
            </button>
            <button
              type="button"
              disabled={!streamReady || remainingPhotoSlots <= 0}
              onClick={handleSnap}
              className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition cursor-pointer"
            >
              Capture Photo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
