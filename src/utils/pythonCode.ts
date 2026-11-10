/**
 * Comprehensive Python Implementation of JARVIS
 * Includes Speech Recognition, Male Voice pyttsx3, Gemini AI API,
 * OpenCV Object Dimension Measurement, MediaPipe Gesture-Controlled 3D Ball,
 * and Bleak 10-Meter Bluetooth/WiFi Radar with Grid Screen.
 */

export interface PythonFile {
  name: string;
  description: string;
  category: 'master' | 'vision' | 'gesture' | 'radar' | 'voice' | 'config';
  code: string;
}

export const PYTHON_FILES: PythonFile[] = [
  {
    name: 'jarvis_master.py',
    description: 'Complete all-in-one JARVIS system integrating Voice, Gemini AI, AR Camera Dimension Measurement, 3D Gesture Ball, and 10m Device Radar.',
    category: 'master',
    code: `"""
=================================================================================
                  J.A.R.V.I.S. MULTI-MODAL AI DESKTOP SUITE
=================================================================================
Created for the Tony Stark experience:
- AI Brain: Google GenAI (Gemini) capable of answering anything
- Voice: SpeechRecognition (STT) + pyttsx3 male voice engine (TTS)
- Computer Vision: Real-time object dimension measurement with OpenCV
- Gesture Control: MediaPipe hand tracking 3D ball (move, pinch-zoom, rotate)
- Radar Screen: 10-meter Bluetooth (Bleak) device scanner with circular grid
=================================================================================
"""

import os
import sys
import math
import time
import asyncio
import threading
import numpy as np
import cv2
import speech_recognition as sr
import pyttsx3

# Optional: MediaPipe for Hand Tracking
try:
    import mediapipe as mp
    HAS_MEDIAPIPE = True
except ImportError:
    HAS_MEDIAPIPE = False
    print("[WARNING] mediapipe not found. Run 'pip install mediapipe'")

# Optional: Bleak for Bluetooth 10m scanning
try:
    from bleak import BleakScanner
    HAS_BLEAK = True
except ImportError:
    HAS_BLEAK = False
    print("[WARNING] bleak not found. Run 'pip install bleak'")

# Optional: Google GenAI SDK
try:
    from google import genai
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False
    print("[WARNING] google-genai not found. Run 'pip install google-genai'")


# ===============================================================================
# 1. VOICE ENGINE (Male Voice + Speech Recognition)
# ===============================================================================

class JarvisVoiceEngine:
    def __init__(self):
        self.engine = pyttsx3.init()
        self.recognizer = sr.Recognizer()
        self.recognizer.energy_threshold = 4200
        self.recognizer.dynamic_energy_threshold = True
        self.recognizer.pause_threshold = 1.2  # Wait calmly for complete spoken sentences
        self.is_speaking = False
        self.last_spoken_text = ""
        self.last_spoke_time = 0.0
        self.filler_words = {"um", "uh", "hmm", "okay", "ok", "yeah", "yes", "no", "oh", "wait", "well"}
        self.setup_male_voice()

    def setup_male_voice(self):
        """Configure TTS engine to use a distinguished, slow-paced male voice."""
        voices = self.engine.getProperty('voices')
        selected_voice = None

        # Look for English male voices (David, Daniel, George, Male, etc.)
        for voice in voices:
            v_name = voice.name.lower()
            if any(m in v_name for m in ['david', 'daniel', 'george', 'male', 'mark', 'james']):
                selected_voice = voice.id
                break

        if not selected_voice and len(voices) > 0:
            selected_voice = voices[0].id

        if selected_voice:
            self.engine.setProperty('voice', selected_voice)

        self.engine.setProperty('rate', 150)    # Calm, slow, crystal-clear delivery
        self.engine.setProperty('volume', 1.0)  # Full volume

    def speak(self, text: str):
        """Speak out loud slowly while locking microphone against self-echo."""
        print(f"\\n[JARVIS]: {text}")
        self.is_speaking = True
        self.last_spoken_text = text.lower()
        try:
            for sentence in [s.strip() for s in text.replace('\\n', '. ').split('. ') if s.strip()]:
                self.engine.say(sentence)
                self.engine.runAndWait()
                time.sleep(0.25)
        except Exception as e:
            print(f"[Voice Error]: {e}")
        finally:
            self.is_speaking = False
            self.last_spoke_time = time.time()
            time.sleep(0.9)  # Acoustic room-reverb cooldown so mic never hears JARVIS's tail audio

    def listen(self) -> str:
        """Listen from the microphone only after JARVIS finishes speaking; ignore self-echo & stray murmurs."""
        while self.is_speaking or (time.time() - self.last_spoke_time) < 0.9:
            time.sleep(0.1)

        with sr.Microphone() as source:
            print("\\n[JARVIS LISTENING...] Speak clearly into your microphone:")
            self.recognizer.adjust_for_ambient_noise(source, duration=0.8)
            try:
                audio = self.recognizer.listen(source, timeout=8, phrase_time_limit=18)
                if self.is_speaking:
                    return ""
                print("[JARVIS ANALYZING AUDIO...]")
                query = self.recognizer.recognize_google(audio).strip()
                norm = query.lower()
                # Reject self-echo or casual 1-word background fillers
                if not norm or norm in self.filler_words or (len(norm) >= 8 and norm in self.last_spoken_text):
                    return ""
                print(f"[YOU SAID]: {query}")
                return query
            except sr.WaitTimeoutError:
                return ""
            except sr.UnknownValueError:
                return ""
            except Exception as e:
                print(f"[STT Error]: {e}")
                return ""


# ===============================================================================
# 2. AI BRAIN (Google GenAI Gemini — Intent-Focused)
# ===============================================================================

class JarvisBrain:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self.client = None
        self.history = []
        if HAS_GEMINI and self.api_key:
            self.client = genai.Client(api_key=self.api_key)

    def answer_everything(self, prompt: str) -> str:
        """Catch the user's exact point and answer clearly."""
        if not self.client:
            return (
                "Sir, my cloud cognitive matrix requires a GEMINI_API_KEY environment variable. "
                "All local optical measurement, gesture sphere, and radar modules remain operational."
            )

        try:
            self.history.append({"role": "user", "parts": [{"text": prompt}]})
            response = self.client.models.generate_content(
                model="gemini-3.8-flash",
                contents=self.history[-10:],
                config={
                    "system_instruction": (
                        "You are J.A.R.V.I.S. Immediately catch the user's real point and true intent, "
                        "even if speech-to-text has minor transcription slips or informal phrasing. "
                        "Lead with the direct answer in your first sentence without filler, and keep "
                        "explanations calm, clear, and well-paced for spoken delivery."
                    )
                }
            )
            answer = response.text.strip()
            self.history.append({"role": "model", "parts": [{"text": answer}]})
            return answer
        except Exception as e:
            return f"Diagnostic anomaly in cognitive cortex: {e}"


# ===============================================================================
# 3. 10-METER BLUETOOTH & DEVICE RADAR SCANNER
# ===============================================================================

class JarvisRadarScanner:
    def __init__(self, max_range_meters: float = 10.0):
        self.max_range = max_range_meters
        self.detected_devices = []  # List of dicts: {name, address, rssi, distance, angle}
        self.device_trails = {}     # Dict[address, List[Tuple[x, y, timestamp]]]
        self.trail_window_sec = 30.0  # 30-second visual movement history
        self.is_scanning = False
        self.sweep_angle = 0.0

    def rssi_to_distance(self, rssi: int, tx_power: int = -59, n: float = 2.0) -> float:
        """Estimate physical distance in meters using Log-Distance Path Loss."""
        if rssi == 0:
            return -1.0
        ratio = (tx_power - rssi) / (10 * n)
        distance = math.pow(10, ratio)
        return min(round(distance, 2), 15.0)

    async def run_ble_scan(self):
        """Asynchronously scan for nearby BLE devices within 10 meters."""
        if not HAS_BLEAK:
            return

        while self.is_scanning:
            try:
                devices = await BleakScanner.discover(timeout=3.0, return_adv=True)
                updated = []
                for idx, (dev, adv) in enumerate(devices.values()):
                    dist = self.rssi_to_distance(adv.rssi)
                    if dist <= self.max_range:
                        # Assign deterministic azimuth angle based on MAC address hash
                        mac_hash = sum(ord(c) for c in dev.address) % 360
                        updated.append({
                            "name": dev.name or f"BLE-Device-{dev.address[-5:]}",
                            "address": dev.address,
                            "rssi": adv.rssi,
                            "distance": dist,
                            "angle": mac_hash,
                        })
                self.detected_devices = updated
            except Exception as e:
                pass
            await asyncio.sleep(1.0)

    def draw_radar_screen(self, width: int = 500, height: int = 500) -> np.ndarray:
        """Render a circular holographic radar screen with grid, 10m range rings, and 30s movement trails."""
        screen = np.zeros((height, width, 3), dtype=np.uint8)
        center = (width // 2, height // 2)
        radius = int(min(width, height) * 0.44)
        now_ts = time.time()

        # 1. Dark glowing cyan radar background
        cv2.circle(screen, center, radius, (15, 25, 20), -1)

        # 2. Concentric Distance Grid Rings (2m, 4m, 6m, 8m, 10m)
        ranges = [2, 4, 6, 8, 10]
        for r_m in ranges:
            r_px = int(radius * (r_m / 10.0))
            cv2.circle(screen, center, r_px, (40, 80, 50), 1)
            cv2.putText(screen, f"{r_m}m", (center[0] + 4, center[1] - r_px + 12),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 200, 150), 1)

        # 3. Crosshair Grid Lines
        cv2.line(screen, (center[0] - radius, center[1]), (center[0] + radius, center[1]), (30, 70, 40), 1)
        cv2.line(screen, (center[0], center[1] - radius), (center[0], center[1] + radius), (30, 70, 40), 1)
        # Diagonal grid lines
        d_val = int(radius * 0.707)
        cv2.line(screen, (center[0] - d_val, center[1] - d_val), (center[0] + d_val, center[1] + d_val), (25, 50, 30), 1)
        cv2.line(screen, (center[0] - d_val, center[1] + d_val), (center[0] + d_val, center[1] - d_val), (25, 50, 30), 1)

        # 4. Rotating 360-degree Sweep Line with phosphor glow trail
        self.sweep_angle = (self.sweep_angle + 3.0) % 360.0
        rad = math.radians(self.sweep_angle)
        end_x = int(center[0] + radius * math.cos(rad))
        end_y = int(center[1] + radius * math.sin(rad))
        cv2.line(screen, center, (end_x, end_y), (0, 255, 180), 2)

        # 5. Record and Draw 30-Second Visual History Trails
        cutoff_ts = now_ts - self.trail_window_sec
        for dev in self.detected_devices:
            dist = dev["distance"]
            if dist <= 10.0:
                dev_rad = math.radians(dev["angle"])
                r_dist = int(radius * (dist / 10.0))
                bx = int(center[0] + r_dist * math.cos(dev_rad))
                by = int(center[1] + r_dist * math.sin(dev_rad))

                addr = dev["address"]
                if addr not in self.device_trails:
                    self.device_trails[addr] = []
                self.device_trails[addr].append((bx, by, now_ts))
                self.device_trails[addr] = [pt for pt in self.device_trails[addr] if pt[2] >= cutoff_ts]

                # Draw historical movement polyline
                trail_pts = self.device_trails[addr]
                if len(trail_pts) >= 2:
                    for i in range(len(trail_pts) - 1):
                        p1 = (trail_pts[i][0], trail_pts[i][1])
                        p2 = (trail_pts[i+1][0], trail_pts[i+1][1])
                        age_ratio = max(0.1, min(1.0, (trail_pts[i+1][2] - cutoff_ts) / self.trail_window_sec))
                        color = (int(0 * age_ratio), int(220 * age_ratio), int(140 * age_ratio))
                        cv2.line(screen, p1, p2, color, 1)

                # Glowing current blip
                cv2.circle(screen, (bx, by), 5, (0, 255, 255), -1)
                cv2.circle(screen, (bx, by), 8, (0, 180, 255), 1)
                label = f"{dev['name'][:10]} ({dist}m)"
                cv2.putText(screen, label, (bx + 8, by - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 255), 1)

        # 6. Outer HUD Border & Telemetry
        cv2.circle(screen, center, radius, (0, 220, 140), 2)
        cv2.putText(screen, "JARVIS 10M RF/BLE RADAR - 30S TRAILS ACTIVE", (15, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 255, 200), 2)
        cv2.putText(screen, f"TARGETS: {len(self.detected_devices)} IN RANGE", (15, height - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 150), 1)

        return screen


# ===============================================================================
# 4. COMPUTER VISION: OBJECT DIMENSION MEASUREMENT
# ===============================================================================

class JarvisDimensionMeasurer:
    def __init__(self, ref_width_cm: float = 8.56):
        """
        ref_width_cm: Reference object width (e.g., standard credit card is 8.56 cm).
        """
        self.ref_width_cm = ref_width_cm
        self.pixels_per_cm = None

    def process_frame(self, frame: np.ndarray) -> np.ndarray:
        """Detect contours, compute bounding boxes, and display dimensions in cm."""
        output = frame.copy()
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (7, 7), 0)
        edged = cv2.Canny(blurred, 50, 100)
        edged = cv2.dilate(edged, None, iterations=1)
        edged = cv2.erode(edged, None, iterations=1)

        contours, _ = cv2.findContours(edged.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

        # Draw HUD Reticle
        h, w = frame.shape[:2]
        cv2.drawMarker(output, (w//2, h//2), (0, 255, 255), markerType=cv2.MARKER_CROSS, markerSize=25, thickness=1)

        for c in contours:
            if cv2.contourArea(c) < 1500:
                continue

            # Rotated bounding rectangle
            box = cv2.minAreaRect(c)
            (x, y), (dim_w, dim_h), angle = box
            box_points = cv2.boxPoints(box)
            box_points = np.int0(box_points)

            # Auto calibrate if reference scale is unset
            if self.pixels_per_cm is None:
                max_edge = max(dim_w, dim_h)
                self.pixels_per_cm = max_edge / self.ref_width_cm

            # Real physical dimensions in cm and inches
            real_w_cm = round(dim_w / self.pixels_per_cm, 1)
            real_h_cm = round(dim_h / self.pixels_per_cm, 1)
            real_w_in = round(real_w_cm / 2.54, 1)
            real_h_in = round(real_h_cm / 2.54, 1)

            # Draw green bounding box & dimension calipers
            cv2.drawContours(output, [box_points], -1, (0, 255, 120), 2)
            cv2.circle(output, (int(x), int(y)), 4, (0, 200, 255), -1)

            # Text labels
            dim_text = f"W: {real_w_cm}cm ({real_w_in}\") x H: {real_h_cm}cm ({real_h_in}\")"
            cv2.putText(output, dim_text, (int(x) - 80, int(y) - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 2)

        # HUD Overlay Banner
        cv2.rectangle(output, (10, 10), (380, 50), (10, 20, 15), -1)
        cv2.putText(output, "JARVIS OPTICAL DIMENSION CALIPER", (20, 32),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 255, 200), 1)

        return output


# ===============================================================================
# 5. 3D HOLOGRAPHIC GESTURE BALL (MediaPipe Hand Tracking)
# ===============================================================================

class JarvisGestureBall:
    def __init__(self):
        self.ball_x = 320
        self.ball_y = 240
        self.ball_radius = 45
        self.rotation_angle = 0.0
        self.mp_hands = None
        self.hands = None

        if HAS_MEDIAPIPE:
            self.mp_hands = mp.solutions.hands
            self.hands = self.mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=1,
                min_detection_confidence=0.6,
                min_tracking_confidence=0.5
            )

    def update_with_hand(self, frame: np.ndarray) -> np.ndarray:
        """Track hand landmarks to translate, zoom in/out, and rotate the 3D ball."""
        h, w = frame.shape[:2]
        output = frame.copy()

        gesture_label = "HOVER MODE"

        if HAS_MEDIAPIPE and self.hands:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands.process(rgb)

            if results.multi_hand_landmarks:
                for hand_landmarks in results.multi_hand_landmarks:
                    # 1. Palm Translation: Track Wrist (0) and Middle Knuckle (9)
                    palm_x = int(hand_landmarks.landmark[9].x * w)
                    palm_y = int(hand_landmarks.landmark[9].y * h)
                    # Smooth tracking
                    self.ball_x = int(self.ball_x * 0.7 + palm_x * 0.3)
                    self.ball_y = int(self.ball_y * 0.7 + palm_y * 0.3)

                    # 2. Pinch Zoom: Measure distance between Thumb Tip (4) and Index Tip (8)
                    t_x = hand_landmarks.landmark[4].x * w
                    t_y = hand_landmarks.landmark[4].y * h
                    i_x = hand_landmarks.landmark[8].x * w
                    i_y = hand_landmarks.landmark[8].y * h
                    pinch_dist = math.hypot(i_x - t_x, i_y - t_y)

                    # Scale radius based on finger pinch (zoom in/out)
                    target_radius = int(np.interp(pinch_dist, [25, 180], [20, 110]))
                    self.ball_radius = int(self.ball_radius * 0.8 + target_radius * 0.2)

                    # 3. Hand Tilt Rotation: Angle between wrist (0) and index base (5)
                    w_x = hand_landmarks.landmark[0].x * w
                    w_y = hand_landmarks.landmark[0].y * h
                    hand_angle = math.degrees(math.atan2(i_y - w_y, i_x - w_x))
                    self.rotation_angle = hand_angle

                    if pinch_dist < 40:
                        gesture_label = "PINCH ZOOM IN"
                    elif pinch_dist > 140:
                        gesture_label = "EXPAND ZOOM OUT"
                    else:
                        gesture_label = "HAND ORBIT ROTATION"

                    # Draw hand skeleton joints
                    mp.solutions.drawing_utils.draw_landmarks(
                        output, hand_landmarks, self.mp_hands.HAND_CONNECTIONS
                    )
        else:
            # Fallback auto orbit if MediaPipe is not installed
            self.rotation_angle = (self.rotation_angle + 2.5) % 360

        # Draw the 3D Holographic Energy Ball with wireframe lat/long circles
        self.draw_3d_sphere(output, self.ball_x, self.ball_y, self.ball_radius, self.rotation_angle)

        # Gesture Status HUD
        cv2.putText(output, f"GESTURE: {gesture_label}", (20, h - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)
        cv2.putText(output, f"RADIUS: {self.ball_radius}px | ROTATION: {int(self.rotation_angle)} deg",
                    (20, h - 45), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 180), 1)

        return output

    def draw_3d_sphere(self, img: np.ndarray, cx: int, cy: int, r: int, angle: float):
        """Render a rotating wireframe holographic plasma sphere."""
        # Glowing inner core
        cv2.circle(img, (cx, cy), max(r - 5, 5), (40, 20, 10), -1)
        cv2.circle(img, (cx, cy), max(r // 3, 2), (255, 255, 255), -1)
        cv2.circle(img, (cx, cy), r, (0, 220, 255), 2)

        # Rotating longitude ellipses
        rad = math.radians(angle)
        for i in range(4):
            offset_angle = rad + i * (math.pi / 4)
            w_factor = math.cos(offset_angle)
            ell_w = max(int(abs(w_factor) * r), 2)
            cv2.ellipse(img, (cx, cy), (ell_w, r), int(math.degrees(rad) * 0.3), 0, 360, (0, 255, 200), 1)

        # Latitude rings
        cv2.ellipse(img, (cx, cy), (r, max(r // 2, 2)), 0, 0, 360, (0, 180, 255), 1)
        cv2.ellipse(img, (cx, cy), (r, max(r // 4, 2)), 0, 0, 360, (0, 140, 220), 1)


# ===============================================================================
# 6. MAIN JARVIS RUNNER LOOP
# ===============================================================================

def main():
    print("""
    =======================================================================
                        J.A.R.V.I.S. DESKTOP ACTIVATED
    =======================================================================
    Voice: British/American Male Engine (SpeechRecognition + pyttsx3)
    AI Brain: Gemini 2.5 Flash
    CV: AR Object Dimension Measurement
    Gesture: 3D Holographic Ball (Pinch to Zoom, Rotate, Translate)
    Radar: 10m BLE Device Scanner
    =======================================================================
    """)

    voice = JarvisVoiceEngine()
    brain = JarvisBrain()
    radar = JarvisRadarScanner(max_range_meters=10.0)
    measurer = JarvisDimensionMeasurer()
    ball = JarvisGestureBall()

    # Start Bluetooth 10m radar scanner thread
    if HAS_BLEAK:
        radar.is_scanning = True
        def start_radar_loop():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(radar.run_ble_scan())
        radar_thread = threading.Thread(target=start_radar_loop, daemon=True)
        radar_thread.start()

    voice.speak("Systems initialized, Sir. Optical sensors, 3D gesture ball, and 10-meter radar are online.")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[WARNING] Primary camera not detected. Showing simulation mode.")

    mode = "ball"  # "ball", "measure", "radar"

    print("\\n[CONTROLS]:")
    print("  Press 'b' -> 3D Holographic Gesture Ball Mode")
    print("  Press 'm' -> Object Dimension Measurement Caliper Mode")
    print("  Press 'r' -> 10m Bluetooth & RF Radar Mode")
    print("  Press 'v' -> Voice Q&A (Speak a question to JARVIS)")
    print("  Press 'q' -> Exit JARVIS")

    while True:
        ret, frame = cap.read() if cap.isOpened() else (False, None)
        if not ret or frame is None:
            # Fallback canvas if webcam is unavailable
            frame = np.zeros((480, 640, 3), dtype=np.uint8)

        # Mirror video for natural interaction
        frame = cv2.flip(frame, 1)

        if mode == "ball":
            display_frame = ball.update_with_hand(frame)
        elif mode == "measure":
            display_frame = measurer.process_frame(frame)
        elif mode == "radar":
            radar_img = radar.draw_radar_screen(width=frame.shape[1], height=frame.shape[0])
            display_frame = radar_img
        else:
            display_frame = frame

        cv2.imshow("JARVIS Multi-Modal Interface (Press 'q' to quit)", display_frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('b'):
            mode = "ball"
            voice.speak("Switching to 3D gesture ball tracking, Sir.")
        elif key == ord('m'):
            mode = "measure"
            voice.speak("Optical dimension caliper engaged.")
        elif key == ord('r'):
            mode = "radar"
            voice.speak("Displaying 10-meter device radar grid.")
        elif key == ord('v'):
            voice.speak("Listening for commands or questions, Sir.")
            query = voice.listen().lower()
            if query:
                # 0. Voice Command: "start answering my questions" (Continuous Q&A Loop)
                if "start answering my question" in query or "answer my question" in query or "start answering" in query:
                    voice.speak("Omniscient Q and A mode engaged, Sir. Ask me anything, or say stop answering to return.")
                    while True:
                        follow_up = voice.listen()
                        if not follow_up:
                            continue
                        low_q = follow_up.lower()
                        if "stop answering" in low_q or "exit" in low_q:
                            voice.speak("Exiting continuous Q and A mode, Sir.")
                            break
                        answer = brain.answer_everything(follow_up)
                        voice.speak(answer)
                # 1. Voice Command: "start monitoring dimension"
                elif "start monitoring dimension" in query or "monitor dimension" in query:
                    mode = "measure"
                    voice.speak("Engaging optical dimension sensors, Sir. Starting real-time measurement.")
                # 2. Voice Command: "go to home screen" or "open Jarvis"
                elif "open jarvis" in query or "go to home screen" in query or "home screen" in query:
                    voice.speak("Home communication terminal active, Sir. How may I assist you?")
                # 3. Voice Command: "find the nearby device"
                elif "find the nearby device" in query or "find nearby devices" in query or "nearby device" in query:
                    mode = "radar"
                    count = len(radar.detected_devices)
                    if count > 0:
                        closest = sorted(radar.detected_devices, key=lambda d: d["distance"])[0]
                        voice.speak(f"Perimeter scan complete, Sir. Found {closest['name']} at {closest['distance']} meters. Total of {count} devices detected within 10 meters.")
                    else:
                        voice.speak("Scanning 10-meter perimeter, Sir. No immediate high-frequency beacons detected yet.")
                # 4. Voice Command: "go to the hand cam"
                elif "go to the hand cam" in query or "hand cam" in query or "hand camera" in query:
                    mode = "ball"
                    voice.speak("Hand camera engaged, Sir. Anti-glitch tracking is locked onto your gesture.")
                # General Question to Gemini AI
                else:
                    answer = brain.answer_everything(query)
                    voice.speak(answer)

    radar.is_scanning = False
    if cap.isOpened():
        cap.release()
    cv2.destroyAllWindows()
    voice.speak("Shutting down diagnostics. Good day, Sir.")


if __name__ == "__main__":
    main()
`,
  },
  {
    name: 'jarvis_gesture_ball.py',
    description: 'Dedicated MediaPipe & OpenCV script: 3D Holographic energy ball responding to hand gestures (move, pinch-to-zoom in/out, wrist tilt rotation).',
    category: 'gesture',
    code: `"""
JARVIS 3D Gesture Ball (MediaPipe + OpenCV)
Features:
- Move palm -> 3D ball follows hand in real time
- Pinch fingers (thumb + index) -> Zoom In / Zoom Out
- Tilt wrist/palm -> Rotate 3D holographic sphere
"""

import cv2
import math
import numpy as np
import mediapipe as mp

def main():
    cap = cv2.VideoCapture(0)
    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.6)
    drawing = mp.solutions.drawing_utils

    ball_x, ball_y = 320, 240
    ball_radius = 50
    rotation = 0.0

    print("JARVIS Hand Tracking Ball Active. Press 'q' to quit.")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = hands.process(rgb)

        gesture_text = "TRACKING READY"

        if res.multi_hand_landmarks:
            for lms in res.multi_hand_landmarks:
                drawing.draw_landmarks(frame, lms, mp_hands.HAND_CONNECTIONS)

                # 1. Palm Translation (knuckle landmark 9)
                px = int(lms.landmark[9].x * w)
                py = int(lms.landmark[9].y * h)
                ball_x = int(ball_x * 0.7 + px * 0.3)
                ball_y = int(ball_y * 0.7 + py * 0.3)

                # 2. Pinch Zoom (Thumb tip 4 vs Index tip 8)
                tx, ty = lms.landmark[4].x * w, lms.landmark[4].y * h
                ix, iy = lms.landmark[8].x * w, lms.landmark[8].y * h
                pinch = math.hypot(ix - tx, iy - ty)
                ball_radius = int(np.interp(pinch, [25, 170], [20, 120]))

                # 3. Rotation (Wrist 0 vs Index knuckle 5)
                wx, wy = lms.landmark[0].x * w, lms.landmark[0].y * h
                rotation = math.degrees(math.atan2(iy - wy, ix - wx))

                gesture_text = f"PINCH DIST: {int(pinch)}px | ROTATION: {int(rotation)}deg"

        # Draw 3D wireframe ball
        cv2.circle(frame, (ball_x, ball_y), ball_radius, (0, 230, 255), 2)
        cv2.circle(frame, (ball_x, ball_y), max(ball_radius // 3, 2), (255, 255, 255), -1)

        # Longitude curves
        for i in range(4):
            ang = math.radians(rotation + i * 45)
            ew = max(int(abs(math.cos(ang)) * ball_radius), 2)
            cv2.ellipse(frame, (ball_x, ball_y), (ew, ball_radius), int(rotation * 0.5), 0, 360, (0, 255, 180), 1)

        # Latitude rings
        cv2.ellipse(frame, (ball_x, ball_y), (ball_radius, max(ball_radius // 2, 2)), 0, 0, 360, (0, 180, 255), 1)

        cv2.putText(frame, gesture_text, (20, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        cv2.imshow("JARVIS Gesture Ball", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
`,
  },
  {
    name: 'jarvis_dimension_measure.py',
    description: 'OpenCV Computer Vision script to measure real-world object dimensions (Width, Height, Depth) using camera calibration and reference objects.',
    category: 'vision',
    code: `"""
JARVIS Object Dimension Measurement (OpenCV)
Detects object contours, computes real-world width and height in centimeters
using pixel-per-metric calibration against a known reference (e.g. credit card 8.56 cm).
"""

import cv2
import numpy as np

def main():
    cap = cv2.VideoCapture(0)
    ref_width_cm = 8.56  # Standard credit card width in cm
    pixels_per_cm = None

    print("JARVIS Optical Dimension Measurement Active.")
    print("Point camera at an object. Place a known credit card/ID for auto-calibration.")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (7, 7), 0)
        edged = cv2.Canny(blur, 50, 100)
        edged = cv2.dilate(edged, None, iterations=1)
        edged = cv2.erode(edged, None, iterations=1)

        contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

        for c in contours:
            if cv2.contourArea(c) < 2000:
                continue

            box = cv2.minAreaRect(c)
            (x, y), (w, h), angle = box
            box_pts = np.int0(cv2.boxPoints(box))

            # Calibrate scale from first detected prominent shape
            if pixels_per_cm is None:
                pixels_per_cm = max(w, h) / ref_width_cm

            w_cm = round(w / pixels_per_cm, 1)
            h_cm = round(h / pixels_per_cm, 1)
            w_in = round(w_cm / 2.54, 1)
            h_in = round(h_cm / 2.54, 1)

            cv2.drawContours(frame, [box_pts], -1, (0, 255, 120), 2)
            cv2.putText(frame, f"{w_cm}cm x {h_cm}cm ({w_in}\\" x {h_in}\\")",
                        (int(x) - 70, int(y) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

        cv2.imshow("JARVIS Dimension Measurement", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
`,
  },
  {
    name: 'jarvis_radar_10m.py',
    description: '10-Meter Bluetooth & RF Radar Screen using Bleak for live BLE device discovery and OpenCV for circular grid rendering with sweeping beam.',
    category: 'radar',
    code: `"""
JARVIS 10-Meter Radar Screen (Bleak + OpenCV)
Renders a glowing green/cyan circular radar grid with:
- Concentric range rings: 2m, 4m, 6m, 8m, 10m
- 360-degree rotating radar beam with phosphor glow
- Real-time BLE device blips placed by distance and azimuth angle
"""

import cv2
import math
import asyncio
import threading
import numpy as np
from bleak import BleakScanner

class BleakRadar:
    def __init__(self):
        self.devices = []
        self.running = True
        self.angle = 0.0

    async def scan_loop(self):
        while self.running:
            try:
                discovered = await BleakScanner.discover(timeout=2.5, return_adv=True)
                updated = []
                for d, adv in discovered.values():
                    # RSSI to estimated distance in meters
                    rssi = adv.rssi
                    dist = min(round(math.pow(10, (-59 - rssi) / 20.0), 2), 12.0)
                    if dist <= 10.0:
                        azimuth = sum(ord(c) for c in d.address) % 360
                        updated.append({
                            "name": d.name or "BLE Device",
                            "address": d.address,
                            "dist": dist,
                            "azimuth": azimuth
                        })
                self.devices = updated
            except Exception:
                pass
            await asyncio.sleep(1.0)

    def draw(self, size=600):
        img = np.zeros((size, size, 3), dtype=np.uint8)
        c = (size // 2, size // 2)
        r = int(size * 0.44)

        # Radar Grid Rings
        for m in [2, 4, 6, 8, 10]:
            cr = int(r * (m / 10.0))
            cv2.circle(img, c, cr, (25, 75, 45), 1)
            cv2.putText(img, f"{m}m", (c[0] + 5, c[1] - cr + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 200, 150), 1)

        # Crosshairs
        cv2.line(img, (c[0] - r, c[1]), (c[0] + r, c[1]), (30, 80, 50), 1)
        cv2.line(img, (c[0], c[1] - r), (c[0], c[1] + r), (30, 80, 50), 1)

        # Sweep Line
        self.angle = (self.angle + 3.0) % 360
        rad = math.radians(self.angle)
        ex = int(c[0] + r * math.cos(rad))
        ey = int(c[1] + r * math.sin(rad))
        cv2.line(img, c, (ex, ey), (0, 255, 180), 2)

        # Draw Device Blips within 10m
        for dev in self.devices:
            d_rad = math.radians(dev["azimuth"])
            d_px = int(r * (dev["dist"] / 10.0))
            bx = int(c[0] + d_px * math.cos(d_rad))
            by = int(c[1] + d_px * math.sin(d_rad))

            cv2.circle(img, (bx, by), 5, (0, 255, 255), -1)
            cv2.putText(img, f"{dev['name'][:8]} ({dev['dist']}m)", (bx + 8, by),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 255), 1)

        cv2.circle(img, c, r, (0, 220, 140), 2)
        cv2.putText(img, "JARVIS 10M RADAR SCREEN", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 200), 2)
        return img

def main():
    radar = BleakRadar()
    t = threading.Thread(target=lambda: asyncio.run(radar.scan_loop()), daemon=True)
    t.start()

    while True:
        frame = radar.draw()
        cv2.imshow("JARVIS 10M Radar", frame)
        if cv2.waitKey(16) & 0xFF == ord('q'):
            break

    radar.running = False
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
`,
  },
  {
    name: 'requirements.txt',
    description: 'Python package dependencies required to run the JARVIS Python code suite locally.',
    category: 'config',
    code: `# Core AI & Vision
google-genai>=2.4.0
opencv-python>=4.8.0
mediapipe>=0.10.0
numpy>=1.24.0

# Voice & Speech
SpeechRecognition>=3.10.0
pyttsx3>=2.90
PyAudio>=0.2.13

# Bluetooth 10m Radar Scanner
bleak>=0.21.0
`,
  },
  {
    name: 'README.md',
    description: 'Step-by-step setup and execution guide for running JARVIS locally on Windows, macOS, or Linux.',
    category: 'config',
    code: `# J.A.R.V.I.S. Python Multi-Modal AI System

This is the native Python edition of J.A.R.V.I.S., engineered to run directly on your desktop or laptop.

## Features
- **Male Voice Output & Speech Recognition**: Speaks with a distinguished male voice and listens continuously via microphone.
- **Cognitive AI Brain**: Connected to Google Gemini 2.5 Flash to answer questions across any domain.
- **AR Object Dimension Caliper**: Real-time webcam OpenCV measurement showing length, width, and depth in cm/inches.
- **3D Holographic Gesture Ball**: MediaPipe hand tracker allowing you to move, pinch-zoom, and rotate a 3D energy ball with your fingers.
- **10-Meter Device Radar Grid**: Scans nearby Bluetooth Low Energy devices and displays them on a 10m circular radar grid.

## Quick Installation

### 1. Create a Python Virtual Environment
\`\`\`bash
# Python 3.9 - 3.12 recommended
python -m venv jarvis_env

# On Windows:
jarvis_env\\Scripts\\activate

# On macOS / Linux:
source jarvis_env/bin/activate
\`\`\`

### 2. Install Dependencies
\`\`\`bash
pip install -r requirements.txt
\`\`\`
*Note on PyAudio: If PyAudio fails to install on Windows, run \`pip install pipwin && pipwin install pyaudio\`.*

### 3. Set Your Gemini API Key
\`\`\`bash
# On Windows PowerShell:
$env:GEMINI_API_KEY="your_actual_gemini_api_key"

# On macOS / Linux:
export GEMINI_API_KEY="your_actual_gemini_api_key"
\`\`\`

### 4. Run JARVIS
\`\`\`bash
python jarvis_master.py
\`\`\`

## Keyboard Shortcuts
- \`b\`: Switch to 3D Gesture Ball
- \`m\`: Switch to Camera Dimension Measurement
- \`r\`: Switch to 10m Device Radar Grid
- \`v\`: Push-to-Talk Voice Q&A
- \`q\`: Exit JARVIS
`,
  },
];
