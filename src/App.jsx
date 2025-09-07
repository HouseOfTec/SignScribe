import { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [landmarker, setLandmarker] = useState(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Click ‘Enable camera’ to start.");


    // Convert raw transcript into fluent text
const [fluentText, setFluentText] = useState("");
const [gesture, setGesture] = useState("");
const [transcript, setTranscript] = useState("");

  // Speak fluent text aloud
const speakText = (text) => {
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US"; // set language
  window.speechSynthesis.speak(utterance);
};




const cleanTranscript = async (text) => {
  if (!text) return;
  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/gpt2",
      {
        method: "POST",
        headers: {
         Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
            
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: text,
          parameters: { max_new_tokens: 50 },
        }),
      }
    );
    const data = await res.json();
    if (data && data[0]?.generated_text) {
      setFluentText(data[0].generated_text);
      speakText(data[0].generated_text);

    }
  } catch (err) {
    console.error("Hugging Face API error:", err);
  }
};
 

  // Enable the webcam
  const enableCamera = async () => {
    try {
      setStatus("Requesting camera…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (!landmarker) await initLandmarker();
      setReady(true);
      setStatus("Camera on. Detecting hands…");
      requestAnimationFrame(detectFrame);
    } catch (err) {
      console.error(err);
      setStatus("Camera permission was denied or not available.");
    }
  };

  // Initialize MediaPipe model
  const initLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    const handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
      },
      numHands: 2,
      runningMode: "VIDEO",
    });
    setLandmarker(handLandmarker);
  };

  // Draw hand landmarks
  const drawLandmarks = (landmarksList, ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2;
    for (const landmarks of landmarksList) {
      for (const pt of landmarks) {
        const x = pt.x * w;
        const y = pt.y * h;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // Very simple "gesture recognizer"
  const classifyGesture = (landmarks) => {
    if (!landmarks || landmarks.length === 0) return "";

    const hand = landmarks[0]; // just the first hand
    const thumbTip = hand[4];
    const indexTip = hand[8];

    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Example rules
    if (dist < 0.05) return "OK"; // thumb + index together
    if (indexTip.y < hand[6].y) return "Point"; // index finger extended
    return "";
  };

  // Detection loop
  const detectFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !landmarker) {
      requestAnimationFrame(detectFrame);
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) {
      requestAnimationFrame(detectFrame);
      return;
    }
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const results = landmarker.detectForVideo(video, performance.now());

    const ctx = canvas.getContext("2d");
    if (results && results.landmarks && results.landmarks.length > 0) {
      drawLandmarks(results.landmarks, ctx, w, h);

      // 🔥 classify gesture + update transcript
      const gestureName = classifyGesture(results.landmarks);
      if (gestureName && gestureName !== gesture) {
        setGesture(gestureName);
        setTranscript((prev) => prev + " " + gestureName);
        cleanTranscript(transcript + " " + gestureName);

      }
    } else {
      ctx.clearRect(0, 0, w, h);
    }
    requestAnimationFrame(detectFrame);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // UI
  return (
    <div
      style={{
        minHeight: "100svh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 820 }}>
        <h1 style={{ marginBottom: 8 }}>SignScribe — Live Hand Tracking</h1>
        <p style={{ margin: "8px 0 16px", opacity: 0.8 }}>{status}</p>

        {/* NEW: gesture + transcript */}
        <p>
          <strong>Gesture:</strong> {gesture}
        </p>
        <p>
          <strong>Transcript:</strong> {transcript}
        </p>
        <p>
         <strong>Fluent Text:</strong> {fluentText}
        </p>
        <button
          onClick={() => speakText(fluentText)}
          style={{
          marginTop: 8,
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #ccc",
          cursor: "pointer",
  }}
>
  Speak
</button>



        <div
          style={{
            position: "relative",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              transform: "scaleX(-1)",
            }}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              transform: "scaleX(-1)",
            }}
          />
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <button
            onClick={enableCamera}
            disabled={ready}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: ready ? "#eaeaea" : "white",
              cursor: ready ? "not-allowed" : "pointer",
            }}
          >
            {ready ? "Camera Enabled" : "Enable camera"}
          </button>
        </div>
      </div>
    </div>
  );
}




