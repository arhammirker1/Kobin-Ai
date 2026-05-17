/**
 * lib/meeting-bot/audio-recorder.ts
 * 
 * Client-side audio capture and transcription module.
 * Runs in the Electron renderer (Next.js app) to capture:
 *   - Microphone audio → user/host voice
 *   - System audio → participant voices (via Electron desktopCapturer)
 * 
 * Audio chunks are sent to Groq Whisper API for transcription,
 * then the text is forwarded to Electron main via IPC.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface RecordingOptions {
  meetingTitle: string
  meetingUrl?: string
  participantEmails?: string[]
  calendarEventId?: string
}

export interface TranscriptSegment {
  time: string
  text: string
  type: "host" | "participant"
}

export interface RecorderState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  meetingTitle: string
  segments: TranscriptSegment[]
}

// ── Globals ──────────────────────────────────────────────────────────────────

let micStream: MediaStream | null = null
let systemStream: MediaStream | null = null
let micRecorder: MediaRecorder | null = null
let systemRecorder: MediaRecorder | null = null
let micChunks: Blob[] = []
let systemChunks: Blob[] = []
let chunkInterval: ReturnType<typeof setInterval> | null = null
let recordingStartTime: number = 0

const CHUNK_DURATION_MS = 30_000 // 30 seconds per chunk for transcription

// ── Helpers ──────────────────────────────────────────────────────────────────

function getElectron(): any | null {
  if (typeof window !== "undefined" && (window as any).electron) {
    return (window as any).electron
  }
  return null
}

function formatTimestamp(elapsedMs: number): string {
  const totalSec = Math.floor(elapsedMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Start capturing audio from microphone and system sources.
 * Chunks are automatically sent to Groq Whisper every 30s.
 */
export async function startAudioCapture(options: RecordingOptions): Promise<void> {
  const electron = getElectron()
  if (!electron) {
    console.warn("[recorder] Not running in Electron — skipping audio capture")
    return
  }

  // Check mic permission (macOS)
  await electron.checkMicPermission()

  recordingStartTime = Date.now()

  // 1. Capture microphone (user/host voice)
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000, // Whisper-optimal sample rate
      },
    })
    console.log("[recorder] Microphone capture started")
  } catch (err) {
    console.error("[recorder] Failed to access microphone:", err)
    throw new Error("Microphone access denied. Please allow microphone access in system settings.")
  }

  // 2. Capture system audio (participant voices via desktopCapturer)
  try {
    const sources = await electron.getAudioSources()
    if (sources.length > 0) {
      // Use the primary screen source for system audio
      const screenSource = sources.find((s: any) => s.id.startsWith("screen:")) || sources[0]

      systemStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-ignore — Electron-specific constraint
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: screenSource.id,
          },
        } as any,
        video: false, // We don't need video, but Electron requires it for desktopCapturer
      })

      // If Electron requires video for desktopCapturer, try with video then discard
      if (!systemStream) {
        const combinedStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: screenSource.id,
            },
          } as any,
          video: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: screenSource.id,
              maxWidth: 1,
              maxHeight: 1,
            },
          } as any,
        })
        // Extract only audio tracks
        const audioTracks = combinedStream.getAudioTracks()
        systemStream = new MediaStream(audioTracks)
        // Stop video tracks
        combinedStream.getVideoTracks().forEach((t) => t.stop())
      }

      console.log("[recorder] System audio capture started")
    }
  } catch (err) {
    console.warn("[recorder] System audio capture not available:", err)
    // Continue with mic-only recording
  }

  // 3. Start MediaRecorders for chunked audio capture
  if (micStream) {
    micRecorder = new MediaRecorder(micStream, { mimeType: "audio/webm;codecs=opus" })
    micChunks = []
    micRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) micChunks.push(e.data)
    }
    micRecorder.start()
  }

  if (systemStream) {
    systemRecorder = new MediaRecorder(systemStream, { mimeType: "audio/webm;codecs=opus" })
    systemChunks = []
    systemRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) systemChunks.push(e.data)
    }
    systemRecorder.start()
  }

  // 4. Tell Electron main process to start recording state
  await electron.startRecording({
    meetingTitle: options.meetingTitle,
    meetingUrl: options.meetingUrl || "",
    participantEmails: options.participantEmails || [],
    calendarEventId: options.calendarEventId || "",
  })

  // 5. Set up periodic chunk processing (every 30s)
  chunkInterval = setInterval(() => processAudioChunks(), CHUNK_DURATION_MS)

  console.log("[recorder] Recording started:", options.meetingTitle)
}

/**
 * Process accumulated audio chunks — send to Groq Whisper for transcription.
 */
async function processAudioChunks(): Promise<void> {
  const electron = getElectron()
  if (!electron) return

  const timestamp = formatTimestamp(Date.now() - recordingStartTime)

  // Process mic chunks (host)
  if (micRecorder && micChunks.length > 0) {
    const blob = new Blob(micChunks, { type: "audio/webm" })
    micChunks = []

    // Restart mic recorder for next chunk
    micRecorder.stop()
    micRecorder.start()

    try {
      const text = await transcribeWithGroqWhisper(blob)
      if (text && text.trim().length > 0) {
        await electron.addTranscriptChunk({
          type: "host",
          time: timestamp,
          text: text.trim(),
        })
        console.log(`[recorder] Host transcript: [${timestamp}] ${text.trim().slice(0, 80)}...`)
      }
    } catch (err) {
      console.error("[recorder] Host transcription failed:", err)
    }
  }

  // Process system audio chunks (participants)
  if (systemRecorder && systemChunks.length > 0) {
    const blob = new Blob(systemChunks, { type: "audio/webm" })
    systemChunks = []

    systemRecorder.stop()
    systemRecorder.start()

    try {
      const text = await transcribeWithGroqWhisper(blob)
      if (text && text.trim().length > 0) {
        await electron.addTranscriptChunk({
          type: "participant",
          time: timestamp,
          text: text.trim(),
        })
        console.log(`[recorder] Participant transcript: [${timestamp}] ${text.trim().slice(0, 80)}...`)
      }
    } catch (err) {
      console.error("[recorder] Participant transcription failed:", err)
    }
  }
}

/**
 * Stop recording and process final audio chunks.
 */
export async function stopAudioCapture(): Promise<void> {
  const electron = getElectron()

  // Stop chunk processing interval
  if (chunkInterval) {
    clearInterval(chunkInterval)
    chunkInterval = null
  }

  // Process any remaining audio chunks before stopping
  await processAudioChunks()

  // Stop recorders
  if (micRecorder && micRecorder.state !== "inactive") {
    micRecorder.stop()
  }
  if (systemRecorder && systemRecorder.state !== "inactive") {
    systemRecorder.stop()
  }

  // Release audio streams
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop())
    micStream = null
  }
  if (systemStream) {
    systemStream.getTracks().forEach((t) => t.stop())
    systemStream = null
  }

  micRecorder = null
  systemRecorder = null
  micChunks = []
  systemChunks = []

  // Tell Electron main to finalize and upload
  if (electron) {
    await electron.stopRecording()
  }

  console.log("[recorder] Recording stopped and submitted for processing")
}

/**
 * Pause/resume recording.
 */
export async function pauseAudioCapture(): Promise<void> {
  const electron = getElectron()
  if (micRecorder?.state === "recording") micRecorder.pause()
  if (systemRecorder?.state === "recording") systemRecorder.pause()
  if (electron) await electron.pauseRecording()
}

export async function resumeAudioCapture(): Promise<void> {
  const electron = getElectron()
  if (micRecorder?.state === "paused") micRecorder.resume()
  if (systemRecorder?.state === "paused") systemRecorder.resume()
  if (electron) await electron.resumeRecording()
}

/**
 * Check if running in desktop app with recording capabilities.
 */
export function isDesktopApp(): boolean {
  return getElectron()?.isDesktop === true
}

// ── Groq Whisper Transcription ───────────────────────────────────────────────

/**
 * Send an audio blob to Groq Whisper API for transcription.
 * Uses the Whisper Large V3 Turbo model — $0.04/hour.
 */
async function transcribeWithGroqWhisper(audioBlob: Blob): Promise<string> {
  // We call our own API route which proxies to Groq (avoids exposing API key in client)
  const formData = new FormData()
  formData.append("file", audioBlob, "audio.webm")
  formData.append("model", "whisper-large-v3-turbo")
  formData.append("language", "en")

  const response = await fetch("/api/meeting-bot/transcribe", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status}`)
  }

  const result = await response.json()
  return result.text || ""
}
