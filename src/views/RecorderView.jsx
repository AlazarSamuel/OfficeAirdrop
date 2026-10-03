import React, { useState, useEffect, useRef } from "react";
import {
  Monitor,
  Video,
  Disc3,
  Mic,
  MicOff,
  Settings,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  Save,
  RefreshCw,
  X,
  Trash2,
  FolderOpen,
  Crop,
  Film,
  Cpu,
  HardDrive,
  CheckCircle2,
  Maximize2,
  MoreVertical,
  Share2,
  CheckCircle,
  Smartphone,
  ArrowLeft,
  AppWindow,
  ChevronDown,
  Layers,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export default function RecorderView({ isPro, triggerToast }) {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);

  const [useSystemAudio, setUseSystemAudio] = useState(true);
  const [mics, setMics] = useState([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [resolution, setResolution] = useState("native");
  const [fps, setFps] = useState("60");
  const [format, setFormat] = useState("mp4");

  // 'idle', 'recording', 'finalizing', 'done'
  const [status, setStatus] = useState("idle");
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [bytesWritten, setBytesWritten] = useState(0);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [finalVideoPath, setFinalVideoPath] = useState(null);
  const [orphanedFiles, setOrphanedFiles] = useState([]);
  const [cropBounds, setCropBounds] = useState(null);
  const [physicalCropBounds, setPhysicalCropBounds] = useState(null);
  const [history, setHistory] = useState([]);
  const [countdown, setCountdown] = useState(null);
  const [isMicMuted, setIsMicMuted] = useState(false);

  const [showAirdropMenu, setShowAirdropMenu] = useState(false);
  const [peers, setPeers] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [localIp, setLocalIp] = useState("");
  const [port, setPort] = useState(0);

  const [showWindowModal, setShowWindowModal] = useState(false);
  const [showScreenModal, setShowScreenModal] = useState(false);
  const [selectedWindowSource, setSelectedWindowSource] = useState(null);
  const [selectedScreenId, setSelectedScreenId] = useState(null);

  // Custom video player state
  const previewVideoRef = useRef(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);

  const isPausedRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const timerRef = useRef(null);
  const uuidRef = useRef(null);
  const tempPathRef = useRef(null);
  const hasAudioRef = useRef(false);

  useEffect(() => {
    fetchSources();
    fetchMics();

    let unsubOrphaned = null;
    let unsubHotkey = null;
    let unsubProgress = null;
    let unsubFloatingPause = null;
    let unsubFloatingStop = null;

    if (window.electronAPI) {
      if (window.electronAPI.onOrphanedRecordingsFound) {
        unsubOrphaned = window.electronAPI.onOrphanedRecordingsFound((files) => {
          if (files.length > 0 && status === "idle") {
            setOrphanedFiles(files);
          }
        });
      }

      if (window.electronAPI.onToggleRecording) {
        unsubHotkey = window.electronAPI.onToggleRecording(() => {
          if (status === "idle") handleStartRecording();
          else if (status === "recording") handleStopRecording();
        });
      }

      if (window.electronAPI.onEncodeProgress) {
        unsubProgress = window.electronAPI.onEncodeProgress((data) => {
          setEncodeProgress(data.percent);
        });
      }

      if (window.electronAPI.onFloatingPause) {
        unsubFloatingPause = window.electronAPI.onFloatingPause(() => {
          handlePauseResume();
        });
      }

      if (window.electronAPI.onFloatingStop) {
        unsubFloatingStop = window.electronAPI.onFloatingStop(() => {
          handleStopRecording();
        });
      }
    }

    return () => {
      if (unsubOrphaned) unsubOrphaned();
      if (unsubHotkey) unsubHotkey();
      if (unsubProgress) unsubProgress();
      if (unsubFloatingPause) unsubFloatingPause();
      if (unsubFloatingStop) unsubFloatingStop();
    };
  }, [status, selectedSource, selectedMic, useSystemAudio, isPro, cropBounds, isPaused]); // include all dependencies so hotkey uses fresh state

  useEffect(() => {
    return () => {
      cleanupRecording();
    };
  }, []); // cleanup on unmount only

  useEffect(() => {
    if (!isPro && status === "recording" && elapsed >= 300) {
      handleStopRecording();
    }
    if (status === "recording" && window.electronAPI.updateRecordingTimer) {
      window.electronAPI.updateRecordingTimer(formatTime(elapsed));
    }
  }, [elapsed, isPro, status]);

  const fetchSources = async () => {
    try {
      const src = await window.electronAPI.getCaptureSources();
      setSources(src);
      const screens = src.filter((s) => s.id.startsWith("screen"));
      const windows = src.filter((s) => s.id.startsWith("window"));
      if (screens.length > 0 && !selectedScreenId) {
        setSelectedScreenId(screens[0].id);
      }
      if (windows.length > 0 && !selectedWindowSource) {
        setSelectedWindowSource(windows[0]);
      }
      if (src.length > 0 && !selectedSource) {
        setSelectedSource(screens[0]?.id || src[0].id);
        setCropBounds(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    if (window.electronAPI && window.electronAPI.getRecordingHistory) {
      const hist = await window.electronAPI.getRecordingHistory();
      setHistory(hist);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    let unsub = null;
    if (showAirdropMenu) {
      if (window.electronAPI.onDiscoveredPeers) {
        unsub = window.electronAPI.onDiscoveredPeers((newPeers) => {
          setPeers(newPeers);
        });
      }
      if (window.electronAPI.getPeers) {
        window.electronAPI.getPeers().then(setPeers);
      }
      if (window.electronAPI.getLocalIp) {
        window.electronAPI.getLocalIp().then(setLocalIp);
      }
      if (window.electronAPI.getPort) {
        window.electronAPI.getPort().then(setPort);
      }
    } else {
      // Reset QR view when menu closes
      setShowQR(false);
    }
    return () => {
      if (unsub) unsub();
    };
  }, [showAirdropMenu]);

  const fetchMics = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      setMics(audioInputs);
    } catch (e) {
      console.error(e);
    }
  };

  const generateUUID = () => {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  };

  const cleanupRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    clearInterval(timerRef.current);
    window.electronAPI.notifyRecordingStopped();
  };

  const handleStartRecording = async () => {
    if (!selectedSource) return;

    const hasSpace = await window.electronAPI.checkDiskSpace();
    if (!hasSpace) {
      triggerToast("Not enough disk space for temp files (Need 2GB).");
      return;
    }

    if (cropBounds) {
      window.electronAPI.showRecordingBorder(cropBounds);
    }
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      if (cropBounds && window.electronAPI.sendCountdownTick) {
        window.electronAPI.sendCountdownTick(countdown);
      }
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    } else {
      if (cropBounds && window.electronAPI.sendCountdownTick) {
        window.electronAPI.sendCountdownTick(0);
      }
      setCountdown(null);
      startActualRecording();
    }
  }, [countdown]);

  const startActualRecording = async () => {
    try {
      let combinedStream = new MediaStream();
      let audioCtx = null;
      let destNode = null;

      // Get video stream
      const videoMandatory = {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: selectedSource,
        maxFrameRate: isPro ? parseInt(fps, 10) : 30,
      };

      if (resolution === "1080p") {
        videoMandatory.maxWidth = 1920;
        videoMandatory.maxHeight = 1080;
      } else if (resolution === "720p") {
        videoMandatory.maxWidth = 1280;
        videoMandatory.maxHeight = 720;
      } else {
        // Native: force high minimums to grab full physical pixels
        videoMandatory.minWidth = 1920;
        videoMandatory.minHeight = 1080;
      }

      const constraints = {
        audio: useSystemAudio
          ? {
              mandatory: {
                chromeMediaSource: "desktop",
              },
            }
          : false,
        video: {
          mandatory: videoMandatory,
        },
      };

      const desktopStream =
        await navigator.mediaDevices.getUserMedia(constraints);

      // Always add the video track to our combined stream
      desktopStream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));

      let micStream = null;
      if (isPro && selectedMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: selectedMic } },
            video: false,
          });
        } catch (e) {
          triggerToast(
            "Microphone blocked by Windows. Check Privacy Settings.",
          );
          desktopStream.getTracks().forEach((t) => t.stop());
          return;
        }
      }

      // If we have BOTH system audio and mic, we MUST mix them
      if (
        useSystemAudio &&
        desktopStream.getAudioTracks().length > 0 &&
        micStream &&
        micStream.getAudioTracks().length > 0
      ) {
        audioCtx = new AudioContext();
        destNode = audioCtx.createMediaStreamDestination();

        const sysSource = audioCtx.createMediaStreamSource(
          new MediaStream([desktopStream.getAudioTracks()[0]]),
        );
        const micSource = audioCtx.createMediaStreamSource(micStream);

        sysSource.connect(destNode);
        micSource.connect(destNode);

        // Add the mixed track
        combinedStream.addTrack(destNode.stream.getAudioTracks()[0]);
      }
      // If we only have mic
      else if (micStream && micStream.getAudioTracks().length > 0) {
        combinedStream.addTrack(micStream.getAudioTracks()[0]);
      }
      // If we only have system audio
      else if (useSystemAudio && desktopStream.getAudioTracks().length > 0) {
        combinedStream.addTrack(desktopStream.getAudioTracks()[0]);
      }

      streamRef.current = combinedStream;
      audioContextRef.current = audioCtx;
      hasAudioRef.current = combinedStream.getAudioTracks().length > 0;

      // Setup temp file
      uuidRef.current = generateUUID();
      tempPathRef.current = await window.electronAPI.startRecordingStream(
        uuidRef.current,
      );

      // Start recorder
      let bps = 8000000;
      if (resolution === "native") bps = fps === "60" ? 15000000 : 10000000;
      else if (resolution === "1080p") bps = fps === "60" ? 8000000 : 5000000;
      else if (resolution === "720p") bps = fps === "60" ? 5000000 : 2500000;

      const options = {
        mimeType: "video/webm",
        videoBitsPerSecond: bps,
      };
      const recorder = new MediaRecorder(combinedStream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const buffer = await e.data.arrayBuffer();
          const res = await window.electronAPI.saveRecordingChunk(
            uuidRef.current,
            new Uint8Array(buffer),
          );
          if (res.success) {
            setBytesWritten(res.bytesWritten);
          }
        }
      };

      recorder.start(2000); // Flush every 2s

      setStatus("recording");
      setElapsed(0);
      setBytesWritten(0);
      setIsPaused(false);
      window.electronAPI.notifyRecordingStarted();

      timerRef.current = setInterval(() => {
        if (!isPausedRef.current) {
          setElapsed((prev) => prev + 1);
        }
      }, 1000);
    } catch (e) {
      console.error(e);
      triggerToast("Failed to start recording: " + e.message);
    }
  };

  const handleStopRecording = async () => {
    if (countdown !== null) {
      // Abort countdown
      setCountdown(null);
      if (cropBounds && window.electronAPI.sendCountdownTick) {
        window.electronAPI.sendCountdownTick(0);
      }
      window.electronAPI.hideRecordingBorder();
      setStatus("idle");
      return;
    }
    
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();
    window.electronAPI.notifyRecordingStopped();
    window.electronAPI.hideRecordingBorder();

    setStatus("finalizing");

    // Wait slightly for final chunks to flush
    setTimeout(async () => {
      const res = await window.electronAPI.finishRecordingStream(
        uuidRef.current,
      );
      if (res.success) {
        startFFmpegEncode(res.path);
      } else {
        triggerToast("Failed to finalize recording stream.");
        setStatus("idle");
      }
    }, 1000);
  };

  const handlePauseResume = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      isPausedRef.current = false;
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      isPausedRef.current = true;
    }
  };

  const recoverOrphaned = (tempPath) => {
    setStatus("finalizing");
    startFFmpegEncode(tempPath);
  };

  const startFFmpegEncode = async (inputPath) => {
    try {
      const settings = await window.electronAPI.getSettings();

      // Generate nice filename
      const sourceObj = sources.find((s) => s.id === selectedSource);
      let sourceName = sourceObj
        ? sourceObj.name.replace(/[^a-z0-9]/gi, "_").substring(0, 15)
        : "Screen";
      if (!sourceName) sourceName = "Screen";
      const dateStr = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .substring(0, 19);
      const fileName = `GrabCut_${sourceName}_${dateStr}.mp4`;

      const outPath = (settings.savePath || "C:\\Downloads") + "\\" + fileName;

      setEncodeProgress(0);
      const res = await window.electronAPI.encodeRecording({
        inputPath,
        outputPath: outPath,
        crop: physicalCropBounds || cropBounds,
        hasAudio: hasAudioRef.current,
      });

      if (res.success) {
        setFinalVideoPath(res.outputPath);
        setStatus("done");
        triggerToast("Recording saved successfully!");
        fetchHistory();
      } else {
        triggerToast("Encoding failed: " + res.error);
        setStatus("idle");
      }
    } catch (e) {
      triggerToast("Encoding error: " + e.message);
      setStatus("idle");
    }
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 MB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  };

  const togglePreviewPlay = () => {
    if (!previewVideoRef.current) return;
    if (previewVideoRef.current.paused) {
      previewVideoRef.current.play();
      setPreviewPlaying(true);
    } else {
      previewVideoRef.current.pause();
      setPreviewPlaying(false);
    }
  };

  const togglePreviewMute = () => {
    if (!previewVideoRef.current) return;
    previewVideoRef.current.muted = !previewVideoRef.current.muted;
    setPreviewMuted(previewVideoRef.current.muted);
  };

  const handlePreviewScrub = (e) => {
    if (!previewVideoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    previewVideoRef.current.currentTime = pos * previewDuration;
  };

  return (
    <div className="page-container">
      {countdown !== null && !cropBounds && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            backdropFilter: "blur(8px)",
            zIndex: 99999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: "8rem",
              fontWeight: 900,
              color: "#f8fafc",
              animation: "pulse 1s infinite",
            }}
          >
            {countdown === 0 ? "GO!" : countdown}
          </div>
          <div
            style={{
              color: "#94a3b8",
              marginTop: "1rem",
              fontWeight: 600,
              fontSize: "1.2rem",
            }}
          >
            Get Ready...
          </div>
        </div>
      )}

      {/* Top Recording Bar (when recording) */}
      {status === "recording" && (
        <div className="top-recording-bar">
          <div className="live-timer-cluster">
            <span className="rec-live-tag">
              <span className="live-dot"></span>
              <span>RECORDING LIVE</span>
            </span>
            <span className="timer-digits">{formatTime(elapsed)}</span>
            <span className="size-pill">
              Size: <strong>~ {formatBytes(bytesWritten)}</strong>
            </span>
          </div>

          <div className="bar-controls-group">
            <button
              className={`btn-icon-control ${isPaused ? "active" : ""}`}
              title="Pause / Resume"
              onClick={handlePauseResume}
            >
              {isPaused ? (
                <Play size={15} color="#34d399" />
              ) : (
                <Pause size={15} />
              )}
            </button>

            <button
              className={`btn-icon-control ${isMicMuted ? "active" : ""}`}
              title="Mute / Unmute Mic"
              onClick={() => {
                setIsMicMuted(!isMicMuted);
                if (streamRef.current) {
                  streamRef.current
                    .getAudioTracks()
                    .forEach((t) => (t.enabled = isMicMuted));
                }
              }}
            >
              {isMicMuted ? (
                <MicOff size={15} color="#ef4444" />
              ) : (
                <Mic size={15} />
              )}
            </button>

            <button className="btn-stop-bar" onClick={handleStopRecording}>
              <span className="stop-square"></span>
              <span>Stop Recording</span>
            </button>
          </div>
        </div>
      )}

      {/* Header (when idle) */}
      {status === "idle" && (
        <div className="page-header" style={{ width: '100%', textAlign: 'left' }}>
          <div>
            <h1 className="page-title" style={{ justifyContent: 'flex-start' }}>
              <Monitor size={24} style={{ color: "#818cf8" }} />
              Screen Recorder
            </h1>
            <p className="subtitle">
              Capture native desktop screens, windows, or custom regions directly
              to MP4
            </p>
          </div>

          <button
            onClick={fetchSources}
            className="btn-refresh"
            title="Refresh Windows"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      )}

      {(status === "idle" || status === "recording") && (
        <div
          className={`transition-all duration-300 ${status === "recording" ? "pointer-events-none opacity-[0.35] blur-[1.5px]" : ""}`}
        >
          {/* Source Selection Tabs */}
          <div className="source-tabs mb-6">
            <button className="tab-btn active">
              <Monitor size={15} /> Screens & Windows ({sources.length})
            </button>
            <button className="tab-btn opacity-50 cursor-not-allowed" disabled>
              <Video size={15} /> Webcam Overlay
            </button>
            <button className="tab-btn opacity-50 cursor-not-allowed" disabled>
              <Mic size={15} /> Audio Only
            </button>
          </div>

          {orphanedFiles.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <Save size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-blue-400">
                    Unsaved Recording Found
                  </h3>
                  <p className="text-xs text-blue-300/70">
                    An interrupted recording was found from a previous session.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    orphanedFiles.forEach((f) =>
                      window.electronAPI.deleteOrphanedRecording(f),
                    );
                    setOrphanedFiles([]);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={() => {
                    recoverOrphaned(orphanedFiles[0]);
                    setOrphanedFiles([]);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                >
                  Recover to MP4
                </button>
              </div>
            </div>
          )}

          {/* Audio & Format Options Ribbon */}
          <div className="config-card mb-8">
            <div className="config-row">
              <div className="config-item">
                <Volume2
                  size={15}
                  style={{ color: useSystemAudio ? "#818cf8" : "#64748b" }}
                />
                <span>System Audio</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={useSystemAudio}
                    onChange={(e) => setUseSystemAudio(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="config-item">
                <Mic
                  size={15}
                  style={{ color: selectedMic ? "#34d399" : "#64748b" }}
                />
                <span>Microphone:</span>
                <select
                  className="select-pill"
                  value={selectedMic}
                  onChange={(e) => setSelectedMic(e.target.value)}
                  disabled={!isPro}
                >
                  <option value="">None (Muted)</option>
                  {mics.map((m) => (
                    <option key={m.deviceId} value={m.deviceId}>
                      {m.label || "Mic"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="config-row"
              style={{
                borderTop: "1px solid rgba(255, 255, 255, 0.04)",
                paddingTop: "10px",
              }}
            >
              <div className="config-item">
                <span>Resolution:</span>
                <select
                  className="select-pill"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  <option value="native">Native</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                </select>
              </div>

              <div className="config-item">
                <span>FPS:</span>
                <select
                  className="select-pill"
                  value={fps}
                  onChange={(e) => setFps(e.target.value)}
                >
                  <option value="60" disabled={!isPro}>
                    60 FPS {!isPro && "(Pro)"}
                  </option>
                  <option value="30">30 FPS</option>
                  <option value="120" disabled={!isPro}>
                    120 FPS {!isPro && "(Pro)"}
                  </option>
                </select>
              </div>

              <div className="config-item">
                <span>Format:</span>
                <select
                  className="select-pill"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="mp4">MP4 (H.264)</option>
                  <option value="mkv">MKV (Lossless)</option>
                  <option value="webm">WebM</option>
                </select>
              </div>
            </div>
          </div>

          <div className="target-grid mb-9">
            {/* Card 1: Custom Region */}
            <div
              onClick={async () => {
                const region = await window.electronAPI.startRegionSelection();
                if (region && region.bounds) {
                  const match = sources.find(
                    (s) => String(s.display_id) === String(region.display_id),
                  );
                  const newSourceId = match ? match.id : sources[0]?.id;
                  setSelectedSource(newSourceId);
                  setCropBounds(region.bounds);
                  setPhysicalCropBounds(region.physicalBounds);

                  if (newSourceId) {
                    const hasSpace = await window.electronAPI.checkDiskSpace();
                    if (!hasSpace) {
                      triggerToast("Not enough disk space for temp files (Need 2GB).");
                      return;
                    }
                    if (window.electronAPI.showRecordingBorder) {
                      window.electronAPI.showRecordingBorder(region.bounds);
                    }
                    setCountdown(3);
                  }
                }
              }}
              className={`target-card custom-region-box ${cropBounds ? "selected" : ""}`}
            >
              <Crop size={28} style={{ color: "#818cf8" }} />
              <span
                style={{
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  color: "#f1f5f9",
                }}
              >
                Custom Region
              </span>
              {cropBounds ? (
                <span style={{ fontSize: "0.72rem", color: "var(--accent)" }}>
                  {cropBounds.width} × {cropBounds.height} px
                </span>
              ) : (
                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                  Drag to select area
                </span>
              )}
              {/* Pop-up trigger if selected */}
              {cropBounds && (
                <div className="record-popup-overlay">
                  <button
                    className="btn-popup-record"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRecording();
                    }}
                  >
                    <span className="rec-dot"></span>
                    <span>Start Record</span>
                  </button>
                </div>
              )}
            </div>

            {/* Card 2: Entire Screen */}
            {(() => {
              const screenSources = sources.filter((s) => s.id.startsWith("screen"));
              const activeScreen = screenSources.find((s) => s.id === (selectedScreenId || selectedSource)) || screenSources[0];
              const isScreenSelected = !cropBounds && selectedSource && selectedSource.startsWith("screen");

              return (
                <div
                  onClick={() => {
                    if (activeScreen) {
                      setSelectedSource(activeScreen.id);
                      setSelectedScreenId(activeScreen.id);
                      setCropBounds(null);
                      setPhysicalCropBounds(null);
                    }
                  }}
                  className={`target-card ${isScreenSelected ? "selected" : ""}`}
                >
                  <div className="target-thumb">
                    {activeScreen?.thumbnail ? (
                      <img src={activeScreen.thumbnail} alt={activeScreen.name} />
                    ) : (
                      <Monitor size={36} style={{ color: "#64748b" }} />
                    )}

                    {/* Multi-screen switcher badge */}
                    {screenSources.length > 1 && (
                      <button
                        className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/10 text-xs font-semibold text-indigo-300 rounded-lg flex items-center gap-1.5 transition-all shadow-lg z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowScreenModal(true);
                        }}
                      >
                        <Monitor size={12} />
                        <span>Display ({screenSources.length})</span>
                        <ChevronDown size={12} />
                      </button>
                    )}
                  </div>

                  <div className="target-info justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Monitor size={14} style={{ color: "#818cf8" }} />
                      <span className="target-name">{activeScreen?.name || "Entire Screen"}</span>
                    </div>
                  </div>

                  {/* Floating Pop-up Action Overlay */}
                  <div className="record-popup-overlay">
                    <button
                      className="btn-popup-record"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRecording();
                      }}
                    >
                      <span className="rec-dot"></span>
                      <span>Start Record</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Card 3: Capture Window */}
            {(() => {
              const windowSources = sources.filter((s) => s.id.startsWith("window"));
              const activeWindow = windowSources.find((s) => s.id === (selectedWindowSource?.id || selectedSource)) || selectedWindowSource || windowSources[0];
              const isWindowSelected = !cropBounds && selectedSource && selectedSource.startsWith("window");

              if (activeWindow && (isWindowSelected || selectedWindowSource)) {
                return (
                  <div
                    onClick={() => {
                      setSelectedSource(activeWindow.id);
                      setSelectedWindowSource(activeWindow);
                      setCropBounds(null);
                      setPhysicalCropBounds(null);
                    }}
                    className={`target-card ${isWindowSelected ? "selected" : ""}`}
                  >
                    <div className="target-thumb">
                      {activeWindow.thumbnail ? (
                        <img src={activeWindow.thumbnail} alt={activeWindow.name} />
                      ) : (
                        <AppWindow size={36} style={{ color: "#64748b" }} />
                      )}

                      {/* Switch Window button */}
                      <button
                        className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/10 text-xs font-semibold text-indigo-300 rounded-lg flex items-center gap-1.5 transition-all shadow-lg z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowWindowModal(true);
                        }}
                      >
                        <Layers size={12} />
                        <span>Change App ({windowSources.length})</span>
                        <ChevronDown size={12} />
                      </button>
                    </div>

                    <div className="target-info">
                      {activeWindow.appIcon ? (
                        <img src={activeWindow.appIcon} style={{ width: 14, height: 14 }} />
                      ) : (
                        <AppWindow size={14} style={{ color: "#818cf8" }} />
                      )}
                      <span className="target-name">{activeWindow.name}</span>
                    </div>

                    {/* Floating Pop-up Action Overlay */}
                    <div className="record-popup-overlay">
                      <button
                        className="btn-popup-record"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRecording();
                        }}
                      >
                        <span className="rec-dot"></span>
                        <span>Start Record</span>
                      </button>
                    </div>
                  </div>
                );
              }

              // Fallback placeholder card if no window picked yet
              return (
                <div
                  onClick={() => setShowWindowModal(true)}
                  className={`target-card custom-region-box ${isWindowSelected ? "selected" : ""}`}
                >
                  <AppWindow size={28} style={{ color: "#818cf8" }} />
                  <span
                    style={{
                      fontSize: "0.86rem",
                      fontWeight: 700,
                      color: "#f1f5f9",
                    }}
                  >
                    Capture Window
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                    {windowSources.length > 0 ? `${windowSources.length} Windows Open ▾` : "Select Window to Record"}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Recording History Section */}
          <div className="mt-9">
            <h2 className="text-sm font-bold text-slate-300 mb-4 px-2 uppercase tracking-wider">
              Recorded History
            </h2>
            <div className="history-list" role="list">
              {history.length > 0 ? (
                history.map((item) => (
                  <div
                    className="history-row relative"
                    role="listitem"
                    key={item.id}
                  >
                    <div className="file-icon-wrap fi-video">
                      <Film size={16} />
                    </div>

                    <div className="history-info">
                      <div className="history-fname">{item.fileName}</div>
                      <div className="history-meta">
                        MP4 · {formatBytes(item.fileSize)} ·{" "}
                        {new Date(item.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <div className="row-actions flex items-center gap-1">
                      <button
                        className="icon-btn"
                        title="Open file location"
                        onClick={() =>
                          window.electronAPI.openPath &&
                          window.electronAPI.openPath(item.filePath)
                        }
                      >
                        <FolderOpen size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-white/30 text-xs py-8">
                  No recordings found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {status === "finalizing" && (
        <div 
          className="modal-overlay fixed z-[999] flex items-center justify-center bg-black/60 backdrop-blur-md"
          style={{ 
            top: '44px', 
            left: 'clamp(190px, 20vw, 240px)', 
            right: 0, 
            bottom: 0 
          }}
        >
          <div className="modal-card bg-[#1e293b] border border-white/10 rounded-2xl p-6 shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="processing-stage flex flex-col items-center py-8">
              <div className="spinner-ring-wrap">
                <div className="spinner-ring"></div>
                <div className="spinner-icon-box">
                  <Cpu size={24} />
                </div>
              </div>

              <div className="stage-text-group">
                <h2 className="stage-title">Optimizing MP4...</h2>
                <p className="stage-desc">
                  Applying hardware-accelerated H.264 encoding and finalizing
                  audio tracks.
                </p>
              </div>

              <div className="progress-box">
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${encodeProgress}%` }}
                  ></div>
                </div>
                <div className="progress-meta-row">
                  <div className="progress-status">
                    <HardDrive size={14} color="#818cf8" />
                    <span>Muxing video container</span>
                  </div>
                  <span className="progress-percentage">
                    {encodeProgress}%
                  </span>
                </div>
              </div>

              <div className="background-notice">
                <CheckCircle2 size={14} color="#34d399" />
                <span>
                  You can safely switch tabs — this will complete in the
                  background
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {status === "done" && (
        <div 
          className="modal-overlay fixed z-[999] flex items-center justify-center bg-black/60 backdrop-blur-md"
          style={{ 
            top: '44px', 
            left: 'clamp(190px, 20vw, 240px)', 
            right: 0, 
            bottom: 0 
          }}
        >
          <div className="recording-complete-card relative mx-4 max-h-[95vh] overflow-y-auto">
            <button
                  className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white z-10"
                  onClick={() => setStatus("idle")}
                  title="Close"
                >
                  <X size={20} />
                </button>

                <div className="card-header-center">
                  <div className="header-title-row">
                    <Video size={20} color="#818cf8" />
                    <h2>Recording Complete</h2>
                  </div>
                  <p className="file-name-meta">
                    Saved as{" "}
                    <strong>
                      {finalVideoPath
                        ? finalVideoPath.split("\\").pop()
                        : "video.mp4"}
                    </strong>
                  </p>
                  <span className="ready-pill">
                    <CheckCircle2 size={12} />
                    Ready to Share
                  </span>
                </div>

                <div className="player-stage relative group">
                  <div className="video-frame">
                    {finalVideoPath ? (
                      <video
                        ref={previewVideoRef}
                        src={`file://${finalVideoPath}`}
                        className="w-full h-full object-contain"
                        onTimeUpdate={() =>
                          setPreviewTime(
                            previewVideoRef.current?.currentTime || 0,
                          )
                        }
                        onLoadedMetadata={() =>
                          setPreviewDuration(
                            previewVideoRef.current?.duration || 0,
                          )
                        }
                        onEnded={() => setPreviewPlaying(false)}
                        onClick={togglePreviewPlay}
                      />
                    ) : (
                      <Disc3
                        size={40}
                        className="text-slate-700 animate-spin"
                      />
                    )}

                    {!previewPlaying && (
                      <button
                        className="play-center-btn"
                        onClick={togglePreviewPlay}
                        title="Play Recording"
                      >
                        <Play size={20} style={{ marginLeft: 2 }} />
                      </button>
                    )}
                  </div>

                  <div className="player-control-strip">
                    <div
                      className="player-scrubber"
                      onClick={handlePreviewScrub}
                    >
                      <div
                        className="player-scrubber-fill"
                        style={{
                          width: `${previewDuration ? (previewTime / previewDuration) * 100 : 0}%`,
                        }}
                      ></div>
                    </div>

                    <div className="player-controls-row">
                      <div className="player-ctrl-left">
                        <button
                          className="ctrl-btn"
                          onClick={togglePreviewPlay}
                          title="Play/Pause"
                        >
                          {previewPlaying ? (
                            <Pause size={15} />
                          ) : (
                            <Play size={15} />
                          )}
                        </button>
                        <button
                          className="ctrl-btn"
                          onClick={togglePreviewMute}
                          title="Mute/Unmute"
                        >
                          {previewMuted ? (
                            <VolumeX size={15} />
                          ) : (
                            <Volume2 size={15} />
                          )}
                        </button>
                        <span className="time-digits">
                          {formatTime(Math.floor(previewTime))} /{" "}
                          {formatTime(Math.floor(previewDuration))}
                        </span>
                      </div>

                      <div className="player-ctrl-right">
                        <button
                          className="ctrl-btn"
                          onClick={() =>
                            previewVideoRef.current?.requestFullscreen()
                          }
                          title="Fullscreen"
                        >
                          <Maximize2 size={14} />
                        </button>
                        <button className="ctrl-btn" title="More Options">
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* AirDrop Overlay */}
                  <div
                    className={`airdrop-overlay ${showAirdropMenu ? "visible" : ""}`}
                  >
                    <div className="airdrop-header">
                      <div className="airdrop-title">
                        {showQR ? (
                          <button
                            className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors"
                            onClick={() => setShowQR(false)}
                          >
                            <ArrowLeft size={16} /> Back to PCs
                          </button>
                        ) : (
                          <>
                            <Share2 size={16} className="text-indigo-400" />
                            Share via AirDrop
                          </>
                        )}
                      </div>
                      <button
                        className="btn-close-airdrop"
                        onClick={() => setShowAirdropMenu(false)}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {showQR ? (
                      <div className="airdrop-qr-container">
                        <div className="qr-box">
                          <QRCodeSVG
                            value={`http://${localIp}:${port}`}
                            size={120}
                            bgColor={"#ffffff"}
                            fgColor={"#000000"}
                            level={"Q"}
                          />
                        </div>
                        <p className="qr-instructions">
                          Scan this code with your phone's camera to download
                          the recording instantly.
                        </p>
                      </div>
                    ) : (
                      <>
                        {peers.length === 0 ? (
                          <div className="empty-peers">
                            <div className="empty-peers-radar">
                              <div className="radar-pulse"></div>
                              <Monitor size={24} />
                            </div>
                            <span>Looking for nearby devices...</span>
                          </div>
                        ) : (
                          <div className="airdrop-peers-grid">
                            <div
                              className="peer-avatar"
                              onClick={() => {
                                if (window.electronAPI.stageFileForPhone) {
                                  window.electronAPI.stageFileForPhone(
                                    finalVideoPath,
                                  );
                                }
                                setShowQR(true);
                              }}
                            >
                              <div className="peer-ring">
                                <Smartphone
                                  size={20}
                                  className="text-indigo-400"
                                />
                              </div>
                              <span className="peer-name text-indigo-400">
                                Phone (QR)
                              </span>
                            </div>

                            {peers.map((peer) => (
                              <div
                                key={peer.id}
                                className="peer-avatar"
                                onClick={async () => {
                                  if (window.electronAPI.sendFiles) {
                                    window.electronAPI.sendFiles(peer.id, [
                                      finalVideoPath,
                                    ]);
                                    triggerToast(
                                      `Sending to ${peer.displayName || peer.hostname || peer.name || "Device"}...`,
                                    );
                                    setShowAirdropMenu(false);
                                  }
                                }}
                              >
                                <div
                                  className={`peer-ring ${peer.isSelf ? "self" : ""}`}
                                >
                                  <Monitor size={20} />
                                </div>
                                <span className="peer-name">
                                  {peer.displayName ||
                                    peer.hostname ||
                                    peer.name ||
                                    "Device"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {peers.length === 0 && (
                          <div className="mt-4 flex justify-center w-full">
                            <button
                              onClick={() => {
                                if (window.electronAPI.stageFileForPhone) {
                                  window.electronAPI.stageFileForPhone(
                                    finalVideoPath,
                                  );
                                }
                                setShowQR(true);
                              }}
                              className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors"
                            >
                              <Smartphone size={14} /> Send to Phone via QR Code
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="bottom-action-bar">
                  <div className="action-group-left">
                    <button
                      className="btn-action-outline"
                      onClick={() => setStatus("idle")}
                    >
                      <Video size={14} />
                      Record Another
                    </button>
                    <button
                      className="btn-action-outline"
                      onClick={() =>
                        window.electronAPI.openFolder(finalVideoPath)
                      }
                    >
                      <FolderOpen size={14} />
                      Open Folder
                    </button>
                    <button
                      className="btn-action-danger"
                      title="Delete Recording"
                      onClick={async () => {
                        const confirmed =
                          await window.electronAPI.showConfirmDialog(
                            "Delete Recording?",
                            "Are you sure you want to permanently delete this video? This cannot be undone.",
                          );
                        if (confirmed) {
                          setStatus("idle");
                          setTimeout(async () => {
                            const res =
                              await window.electronAPI.deleteFile(
                                finalVideoPath,
                              );
                            if (res.success) {
                              triggerToast("Recording deleted.");
                              fetchHistory();
                            } else {
                              triggerToast("Error deleting file: " + res.error);
                            }
                          }, 150);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>

                  <button
                    className="btn-action-primary"
                    onClick={() => setShowAirdropMenu(true)}
                  >
                    <Share2 size={15} />
                    Send to Phone
                  </button>
                </div>
              </div>
            </div>
          )}

      {/* Window Selection Modal */}
      {showWindowModal && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setShowWindowModal(false)}
        >
          <div
            className="bg-[#0b0c16] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <AppWindow size={18} className="text-indigo-400" />
                <h3 className="text-base font-bold text-white">Select Application Window</h3>
                <span className="px-2 py-0.5 text-xs bg-indigo-500/10 text-indigo-400 rounded-full font-semibold border border-indigo-500/20">
                  {sources.filter((s) => s.id.startsWith("window")).length} Open
                </span>
              </div>
              <button
                onClick={() => setShowWindowModal(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {sources.filter((s) => s.id.startsWith("window")).length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-500 text-sm">
                  No active application windows found.
                </div>
              ) : (
                sources
                  .filter((s) => s.id.startsWith("window"))
                  .map((w) => {
                    const isCur = selectedSource === w.id;
                    return (
                      <div
                        key={w.id}
                        onClick={() => {
                          setSelectedSource(w.id);
                          setSelectedWindowSource(w);
                          setCropBounds(null);
                          setPhysicalCropBounds(null);
                          setShowWindowModal(false);
                        }}
                        className={`group relative bg-[#121324] border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
                          isCur ? "border-indigo-500 shadow-indigo-500/20 shadow-lg ring-2 ring-indigo-500/50" : "border-white/5 hover:border-indigo-500/40"
                        }`}
                      >
                        <div className="h-32 bg-black/40 overflow-hidden flex items-center justify-center relative">
                          {w.thumbnail ? (
                            <img src={w.thumbnail} alt={w.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <AppWindow size={32} className="text-slate-600" />
                          )}
                        </div>
                        <div className="p-3 bg-[#0e0f1e] flex items-center gap-2 border-t border-white/5">
                          {w.appIcon ? (
                            <img src={w.appIcon} alt="" className="w-4 h-4 flex-shrink-0" />
                          ) : (
                            <AppWindow size={14} className="text-indigo-400 flex-shrink-0" />
                          )}
                          <span className="text-xs font-semibold text-slate-200 truncate">{w.name}</span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Screen Selection Modal */}
      {showScreenModal && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setShowScreenModal(false)}
        >
          <div
            className="bg-[#0b0c16] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <Monitor size={18} className="text-indigo-400" />
                <h3 className="text-base font-bold text-white">Select Display Screen</h3>
              </div>
              <button
                onClick={() => setShowScreenModal(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sources
                .filter((s) => s.id.startsWith("screen"))
                .map((scr) => {
                  const isCur = selectedSource === scr.id;
                  return (
                    <div
                      key={scr.id}
                      onClick={() => {
                        setSelectedSource(scr.id);
                        setSelectedScreenId(scr.id);
                        setCropBounds(null);
                        setPhysicalCropBounds(null);
                        setShowScreenModal(false);
                      }}
                      className={`group relative bg-[#121324] border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
                        isCur ? "border-indigo-500 shadow-indigo-500/20 shadow-lg ring-2 ring-indigo-500/50" : "border-white/5 hover:border-indigo-500/40"
                      }`}
                    >
                      <div className="h-36 bg-black/40 overflow-hidden flex items-center justify-center relative">
                        {scr.thumbnail ? (
                          <img src={scr.thumbnail} alt={scr.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <Monitor size={36} className="text-slate-600" />
                        )}
                      </div>
                      <div className="p-3.5 bg-[#0e0f1e] flex items-center gap-2 border-t border-white/5">
                        <Monitor size={15} className="text-indigo-400 flex-shrink-0" />
                        <span className="text-xs font-semibold text-slate-200 truncate">{scr.name}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
