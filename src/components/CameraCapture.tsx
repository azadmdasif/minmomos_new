import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, Upload, AlertTriangle } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
  title: string;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);

  // Check if multiple cameras are available
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setHasMultipleCameras(videoDevices.length > 1);
      })
      .catch(() => {
        setHasMultipleCameras(false);
      });
  }, []);

  // Initialize camera stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    setIsLoading(true);
    setError(null);

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Your browser or platform does not support camera access.');
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 1024 },
            height: { ideal: 768 }
          },
          audio: false
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = mediaStream;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setIsLoading(false);
      } catch (err: any) {
        console.error('Camera access error:', err);
        setError(err.message || 'Could not access your camera. Please check permissions.');
        setIsLoading(false);
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode]);

  // Toggle front/back camera
  const toggleFacingMode = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Capture image frame from video stream
  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to match video stream
    const videoWidth = video.videoWidth || 1024;
    const videoHeight = video.videoHeight || 768;

    // Maintain aspect ratio while sizing canvas to standard image dimensions
    let width = videoWidth;
    let height = videoHeight;
    const maxWidth = 800;
    const maxHeight = 600;

    if (width > height) {
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
    }

    canvas.width = width;
    canvas.height = height;

    // If front camera, mirror the image on canvas to match mirrored preview
    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);

    // Reset transform in case of mirror
    if (facingMode === 'user') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
    onCapture(compressedBase64);
  };

  // Fallback to select image from local device storage
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const originalBase64 = reader.result as string;
        if (!originalBase64.startsWith('data:image')) {
          onCapture(originalBase64);
          return;
        }

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxWidth = 800;
          const maxHeight = 600;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            onCapture(originalBase64);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.6);
          onCapture(compressed);
        };
        img.src = originalBase64;
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div id="camera-capture-overlay" className="fixed inset-0 bg-brand-brown/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div id="camera-capture-card" className="bg-brand-cream border-4 border-brand-brown w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col relative max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-brand-brown text-brand-yellow px-5 py-3.5 flex justify-between items-center border-b-2 border-brand-brown">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-brand-yellow animate-pulse" />
            <span className="font-black uppercase text-xs tracking-wider">{title}</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-brand-cream/10 rounded-full transition-colors text-brand-yellow"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Frame / Preview Area */}
        <div className="flex-1 bg-zinc-950 relative min-h-[300px] flex items-center justify-center overflow-hidden">
          
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-brand-yellow gap-3">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span className="text-xs font-black uppercase tracking-wider">Accessing Camera...</span>
            </div>
          )}

          {error ? (
            <div className="p-6 text-center space-y-4 max-w-sm">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-black text-white uppercase tracking-wider">Camera Access Blocked</p>
                <p className="text-xs text-brand-stone/70 leading-relaxed">
                  {error}
                </p>
              </div>
              <button
                onClick={triggerFileInput}
                className="inline-flex items-center gap-2 bg-brand-yellow text-brand-brown font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider hover:scale-102 active:scale-98 transition-all shadow-md"
              >
                <Upload className="w-4 h-4" />
                Upload Photo Instead
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover max-h-[50vh] ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              style={{ display: isLoading ? 'none' : 'block' }}
            />
          )}

          {/* Hidden Canvas and File Input for fallback */}
          <canvas ref={canvasRef} className="hidden" />
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Controls Bar */}
        <div className="bg-brand-cream p-5 flex flex-col gap-4 border-t-2 border-brand-stone/30">
          
          {!error && !isLoading && (
            <div className="flex justify-between items-center gap-4">
              
              {/* Left Button: Fallback device upload */}
              <button
                onClick={triggerFileInput}
                className="p-3 bg-white hover:bg-brand-stone/10 text-brand-brown rounded-full border border-brand-stone shadow-sm transition-all flex items-center justify-center"
                title="Choose from files"
              >
                <Upload className="w-5 h-5" />
              </button>

              {/* Center Shutter Button */}
              <button
                onClick={handleCapture}
                className="w-16 h-16 bg-red-600 hover:bg-red-700 active:scale-95 rounded-full border-4 border-white shadow-xl transition-all flex items-center justify-center group"
                title="Capture Photo"
              >
                <div className="w-8 h-8 bg-white rounded-full group-hover:scale-90 transition-transform" />
              </button>

              {/* Right Button: Toggle Camera Facing */}
              <button
                onClick={toggleFacingMode}
                disabled={!hasMultipleCameras}
                className={`p-3 bg-white text-brand-brown rounded-full border border-brand-stone shadow-sm transition-all flex items-center justify-center ${
                  hasMultipleCameras ? 'hover:bg-brand-stone/10 cursor-pointer' : 'opacity-40 cursor-not-allowed'
                }`}
                title="Switch Camera"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Prompt / Instructions */}
          <p className="text-[10px] text-brand-brown/50 text-center font-bold uppercase tracking-wider">
            {error 
              ? 'Please select or capture a saved photo from your device files.' 
              : 'Line up your subject and click the red button to snap a live photo.'}
          </p>
        </div>

      </div>
    </div>
  );
};
