/**
 * DJI Geo Track Viewer — app.js
 *
 * GPS source: subtitle track embedded in Addition.MP4
 *   75 samples at ~1 s intervals, parsed from DJI text telemetry.
 *   Format per frame: [latitude: X] [longitude: X] [rel_alt: X abs_alt: X]
 *                     [gb_yaw: X gb_pitch: X gb_roll: X]
 */

/* ─────────────────────────────────────────────────────────────
   1.  CESIUM TOKEN
───────────────────────────────────────────────────────────── */
Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MTBjN2Y3OS0wNGRmLTRjNTYtOTZmYS0yNTQzNWM5NTdjNTMiLCJpZCI6NDM5ODIsImlhdCI6MTc3MDA5NzMyNH0.5vQMpwKKsydT2jeqs61UKUmqkJ_TIC06VNNftQtT_T4";

/* ─────────────────────────────────────────────────────────────
   2.  VIDEO METADATA
   Recorded: 2026-02-24 10:53:17 PST → 2026-02-24T18:53:17Z UTC
   Duration: 73.4 s  |  Location: Los Angeles, CA
───────────────────────────────────────────────────────────── */
const VIDEO_DURATION_S = 73.4;
const VIDEO_START_ISO  = "2026-02-24T18:53:17Z";

/* ─────────────────────────────────────────────────────────────
   3.  GPS TRACK — real telemetry from Addition.MP4 subtitle track
   75 samples @ ~1 s intervals.  t = seconds from video start.
   alt = absolute altitude MSL (metres).
   yaw = gimbal yaw (°), pitch = gimbal pitch (°), roll = gimbal roll (°).
───────────────────────────────────────────────────────────── */
const GPS_TRACK = [
  { t:  0.000, lat:34.044463, lon:-118.232451, alt:96.884, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t:  1.000, lat:34.044463, lon:-118.232451, alt:96.892, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t:  2.002, lat:34.044463, lon:-118.232451, alt:96.892, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t:  3.003, lat:34.044462, lon:-118.232451, alt:96.887, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t:  4.003, lat:34.044457, lon:-118.232451, alt:96.884, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t:  5.004, lat:34.044444, lon:-118.232451, alt:96.884, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t:  6.006, lat:34.044425, lon:-118.232451, alt:96.898, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t:  7.007, lat:34.044401, lon:-118.232451, alt:96.928, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t:  8.013, lat:34.044389, lon:-118.232452, alt:96.952, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t:  9.016, lat:34.044362, lon:-118.232452, alt:96.985, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t: 10.015, lat:34.044335, lon:-118.232453, alt:97.009, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t: 11.016, lat:34.044308, lon:-118.232453, alt:97.026, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t: 12.018, lat:34.044279, lon:-118.232453, alt:97.038, yaw:-179.0, pitch:-18.7, roll:0.0 },
  { t: 13.019, lat:34.044249, lon:-118.232454, alt:97.054, yaw:-179.2, pitch:-18.7, roll:0.0 },
  { t: 14.020, lat:34.044219, lon:-118.232454, alt:97.066, yaw:-179.4, pitch:-18.7, roll:0.0 },
  { t: 15.021, lat:34.044186, lon:-118.232455, alt:97.059, yaw:-179.8, pitch:-18.7, roll:0.0 },
  { t: 16.023, lat:34.044151, lon:-118.232455, alt:97.055, yaw: 179.8, pitch:-18.7, roll:0.0 },
  { t: 17.023, lat:34.044117, lon:-118.232455, alt:97.055, yaw: 179.4, pitch:-18.7, roll:0.0 },
  { t: 18.025, lat:34.044084, lon:-118.232455, alt:97.045, yaw: 179.2, pitch:-18.7, roll:0.0 },
  { t: 19.024, lat:34.044051, lon:-118.232455, alt:97.043, yaw: 178.9, pitch:-18.7, roll:0.0 },
  { t: 20.025, lat:34.044021, lon:-118.232455, alt:97.033, yaw: 178.6, pitch:-18.7, roll:0.0 },
  { t: 21.027, lat:34.043991, lon:-118.232455, alt:97.013, yaw: 178.2, pitch:-18.7, roll:0.0 },
  { t: 22.028, lat:34.043962, lon:-118.232457, alt:96.992, yaw: 177.7, pitch:-18.7, roll:0.0 },
  { t: 23.029, lat:34.043934, lon:-118.232461, alt:96.969, yaw: 177.1, pitch:-18.7, roll:0.0 },
  { t: 24.029, lat:34.043906, lon:-118.232470, alt:96.933, yaw: 176.4, pitch:-18.7, roll:0.0 },
  { t: 25.030, lat:34.043879, lon:-118.232484, alt:96.898, yaw: 175.5, pitch:-18.7, roll:0.0 },
  { t: 26.031, lat:34.043852, lon:-118.232499, alt:96.858, yaw: 174.4, pitch:-18.7, roll:0.0 },
  { t: 27.000, lat:34.043822, lon:-118.232515, alt:96.817, yaw: 173.4, pitch:-18.7, roll:0.0 },
  { t: 28.000, lat:34.043792, lon:-118.232529, alt:96.769, yaw: 172.3, pitch:-18.7, roll:0.0 },
  { t: 29.001, lat:34.043753, lon:-118.232542, alt:96.720, yaw: 171.2, pitch:-18.7, roll:0.0 },
  { t: 30.002, lat:34.043720, lon:-118.232551, alt:96.684, yaw: 170.1, pitch:-18.7, roll:0.0 },
  { t: 31.003, lat:34.043679, lon:-118.232561, alt:96.632, yaw: 169.0, pitch:-18.7, roll:0.0 },
  { t: 32.004, lat:34.043643, lon:-118.232574, alt:96.588, yaw: 167.9, pitch:-18.7, roll:0.0 },
  { t: 33.005, lat:34.043609, lon:-118.232590, alt:96.539, yaw: 166.5, pitch:-18.7, roll:0.0 },
  { t: 34.006, lat:34.043576, lon:-118.232607, alt:96.505, yaw: 164.9, pitch:-18.7, roll:0.0 },
  { t: 35.007, lat:34.043544, lon:-118.232620, alt:96.469, yaw: 163.4, pitch:-18.7, roll:0.0 },
  { t: 36.007, lat:34.043512, lon:-118.232634, alt:96.430, yaw: 161.7, pitch:-18.7, roll:0.0 },
  { t: 37.009, lat:34.043481, lon:-118.232647, alt:96.412, yaw: 159.9, pitch:-18.7, roll:0.0 },
  { t: 38.010, lat:34.043447, lon:-118.232655, alt:96.394, yaw: 158.1, pitch:-18.7, roll:0.0 },
  { t: 39.012, lat:34.043410, lon:-118.232661, alt:96.379, yaw: 156.4, pitch:-18.7, roll:0.0 },
  { t: 40.012, lat:34.043371, lon:-118.232668, alt:96.349, yaw: 154.6, pitch:-18.7, roll:0.0 },
  { t: 41.013, lat:34.043333, lon:-118.232675, alt:96.350, yaw: 152.4, pitch:-18.7, roll:0.0 },
  { t: 42.014, lat:34.043295, lon:-118.232681, alt:96.361, yaw: 150.0, pitch:-18.7, roll:0.0 },
  { t: 43.015, lat:34.043256, lon:-118.232687, alt:96.372, yaw: 147.8, pitch:-18.7, roll:0.0 },
  { t: 44.016, lat:34.043213, lon:-118.232695, alt:96.361, yaw: 145.7, pitch:-18.7, roll:0.0 },
  { t: 45.017, lat:34.043167, lon:-118.232704, alt:96.330, yaw: 143.5, pitch:-18.7, roll:0.0 },
  { t: 46.018, lat:34.043119, lon:-118.232713, alt:96.292, yaw: 141.2, pitch:-18.7, roll:0.0 },
  { t: 47.020, lat:34.043075, lon:-118.232719, alt:96.243, yaw: 138.9, pitch:-18.7, roll:0.0 },
  { t: 48.021, lat:34.043035, lon:-118.232723, alt:96.209, yaw: 136.5, pitch:-18.7, roll:0.0 },
  { t: 49.022, lat:34.042997, lon:-118.232725, alt:96.204, yaw: 134.1, pitch:-18.7, roll:0.0 },
  { t: 50.023, lat:34.042958, lon:-118.232724, alt:96.207, yaw: 131.7, pitch:-18.7, roll:0.0 },
  { t: 51.023, lat:34.042920, lon:-118.232721, alt:96.220, yaw: 129.0, pitch:-18.7, roll:0.0 },
  { t: 52.025, lat:34.042885, lon:-118.232718, alt:96.230, yaw: 126.4, pitch:-18.7, roll:0.0 },
  { t: 53.025, lat:34.042850, lon:-118.232718, alt:96.226, yaw: 123.8, pitch:-18.7, roll:0.0 },
  { t: 54.026, lat:34.042813, lon:-118.232717, alt:96.230, yaw: 121.2, pitch:-18.7, roll:0.0 },
  { t: 55.028, lat:34.042774, lon:-118.232715, alt:96.234, yaw: 118.6, pitch:-18.7, roll:0.0 },
  { t: 56.035, lat:34.042735, lon:-118.232712, alt:96.241, yaw: 115.9, pitch:-18.7, roll:0.0 },
  { t: 57.029, lat:34.042696, lon:-118.232712, alt:96.236, yaw: 113.2, pitch:-18.7, roll:0.0 },
  { t: 58.030, lat:34.042656, lon:-118.232715, alt:96.243, yaw: 110.4, pitch:-18.7, roll:0.0 },
  { t: 59.031, lat:34.042614, lon:-118.232713, alt:96.229, yaw: 107.7, pitch:-18.7, roll:0.0 },
  { t: 60.001, lat:34.042570, lon:-118.232706, alt:96.215, yaw: 105.1, pitch:-18.7, roll:0.0 },
  { t: 61.000, lat:34.042527, lon:-118.232696, alt:96.209, yaw: 102.3, pitch:-18.7, roll:0.0 },
  { t: 62.002, lat:34.042483, lon:-118.232686, alt:96.191, yaw:  99.4, pitch:-18.7, roll:0.0 },
  { t: 63.002, lat:34.042438, lon:-118.232676, alt:96.202, yaw:  96.5, pitch:-18.7, roll:0.0 },
  { t: 64.004, lat:34.042394, lon:-118.232666, alt:96.226, yaw:  93.6, pitch:-18.7, roll:0.0 },
  { t: 65.004, lat:34.042351, lon:-118.232655, alt:96.253, yaw:  90.5, pitch:-18.7, roll:0.0 },
  { t: 66.005, lat:34.042308, lon:-118.232642, alt:96.283, yaw:  87.5, pitch:-18.7, roll:0.0 },
  { t: 67.006, lat:34.042265, lon:-118.232627, alt:96.317, yaw:  84.9, pitch:-18.7, roll:0.0 },
  { t: 68.027, lat:34.042218, lon:-118.232609, alt:96.336, yaw:  83.2, pitch:-18.7, roll:0.0 },
  { t: 69.028, lat:34.042178, lon:-118.232591, alt:96.349, yaw:  81.4, pitch:-18.7, roll:0.0 },
  { t: 70.029, lat:34.042139, lon:-118.232572, alt:96.359, yaw:  80.5, pitch:-18.7, roll:0.0 },
  { t: 71.030, lat:34.042099, lon:-118.232555, alt:96.377, yaw:  80.5, pitch:-18.7, roll:0.0 },
  { t: 72.031, lat:34.042063, lon:-118.232543, alt:96.388, yaw:  80.5, pitch:-18.7, roll:0.0 },
  { t: 73.033, lat:34.042052, lon:-118.232541, alt:97.014, yaw:  80.5, pitch:-18.7, roll:0.0 },
  { t: 73.432, lat:34.042053, lon:-118.232541, alt:97.601, yaw:  80.5, pitch:-18.7, roll:0.0 },
];

/* ─────────────────────────────────────────────────────────────
   4.  CESIUM VIEWER
───────────────────────────────────────────────────────────── */
const viewer = new Cesium.Viewer("cesiumContainer", {
  animation:              false,
  timeline:               true,
  shouldAnimate:          false,
  homeButton:             false,
  sceneModePicker:        false,
  baseLayerPicker:        false,
  navigationHelpButton:   false,
  geocoder:               false,
  infoBox:                false,
  selectionIndicator:     false,
  fullscreenButton:       false,
});

// Hide the Cesium globe — Google Photorealistic 3D Tiles replace it entirely
viewer.scene.globe.show = false;
viewer.scene.skyAtmosphere.show = true;

// Load Google Photorealistic 3D Tiles via Cesium Ion's built-in key
(async () => {
  try {
    const tileset = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(tileset);
  } catch (err) {
    console.warn("Google Photorealistic 3D Tiles failed, falling back to world terrain:", err);
    viewer.scene.globe.show = true;
    viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
  }
})();

/* ─────────────────────────────────────────────────────────────
   5.  CLOCK
───────────────────────────────────────────────────────────── */
const startTime = Cesium.JulianDate.fromIso8601(VIDEO_START_ISO);
const stopTime  = Cesium.JulianDate.addSeconds(startTime, VIDEO_DURATION_S, new Cesium.JulianDate());

const clock = viewer.clock;
clock.startTime   = startTime;
clock.stopTime    = stopTime;
clock.currentTime = startTime.clone();
clock.clockRange  = Cesium.ClockRange.CLAMP_TO_RANGE;
clock.clockStep   = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
clock.multiplier  = 1;

viewer.timeline.zoomTo(startTime, stopTime);

/* ─────────────────────────────────────────────────────────────
   6.  SAMPLED POSITION PROPERTY
───────────────────────────────────────────────────────────── */
const positionProperty = new Cesium.SampledPositionProperty();

positionProperty.setInterpolationOptions({
  interpolationAlgorithm: Cesium.HermitePolynomialApproximation,
  interpolationDegree: 3,
});
positionProperty.forwardExtrapolationType  = Cesium.ExtrapolationType.HOLD;
positionProperty.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;

GPS_TRACK.forEach(({ t, lat, lon, alt }) => {
  const sampleTime = Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate());
  positionProperty.addSample(sampleTime, Cesium.Cartesian3.fromDegrees(lon, lat, alt));
});

/* ─────────────────────────────────────────────────────────────
   7.  HEADING / ORIENTATION — sampled from gimbal yaw
   gb_yaw is measured clockwise from North (standard heading).
   Normalize wrap-around at ±180°.
───────────────────────────────────────────────────────────── */
const headingSamples = GPS_TRACK.map(({ t, yaw }) => ({
  t,
  heading: Cesium.Math.toRadians(((yaw % 360) + 360) % 360),
}));

/* ─────────────────────────────────────────────────────────────
   8.  FULL STATIC PATH LINE (always visible complete route)
───────────────────────────────────────────────────────────── */
const fullPathPositions = GPS_TRACK.map(({ lon, lat, alt }) =>
  Cesium.Cartesian3.fromDegrees(lon, lat, alt)
);

viewer.entities.add({
  polyline: {
    positions:  fullPathPositions,
    width:      4,
    material:   new Cesium.ColorMaterialProperty(Cesium.Color.RED.withAlpha(0.45)),
    clampToGround: false,
  },
});

/* ─────────────────────────────────────────────────────────────
   9.  TRACKED ENTITY (moving dot + animated live trail)
───────────────────────────────────────────────────────────── */
const trackEntity = viewer.entities.add({
  position:    positionProperty,
  orientation: new Cesium.VelocityOrientationProperty(positionProperty),

  point: {
    pixelSize:    18,
    color:        Cesium.Color.CYAN,
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
    scaleByDistance: new Cesium.NearFarScalar(100, 1.5, 80000, 0.5),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  },

  path: {
    show:       true,
    trailTime:  undefined,   // draw full history from t=0
    leadTime:   0,
    width:      10,
    material:   new Cesium.ColorMaterialProperty(Cesium.Color.RED),
    resolution: 1,
  },
});

/* ─────────────────────────────────────────────────────────────
   10.  CAMERA FRUSTUM INDICATOR  (Blender-style)

   Draws the DJI gimbal FOV as a frustum wireframe:
     • 4 lines from the drone position to the far-plane corners
     • 4 edges forming the rectangular far-plane frame
     • A small up-triangle above the top edge (like Blender's camera icon)

   Uses gimbal yaw/pitch from the GPS_TRACK telemetry.
   Updated every clock tick via onClockTick().
───────────────────────────────────────────────────────────── */
const _D2R    = Math.PI / 180;
const FR_DIST = 9;                                               // display distance (m)
const FR_HW   = FR_DIST * Math.tan(42 * _D2R);                  // half-width  (84° HFOV)
const FR_HH   = FR_DIST * Math.tan(Math.atan(Math.tan(42 * _D2R) / (16 / 9))); // half-height

const _enuMatrix = new Cesium.Matrix4();
const _inV4      = new Cesium.Cartesian4();
const _outV4     = new Cesium.Cartesian4();

function _frustumCorner(enuMat, origin, fe, fn, fu) {
  // Rotate ENU offset (fe, fn, fu) into ECEF and add to origin
  _inV4.x = fe; _inV4.y = fn; _inV4.z = fu; _inV4.w = 0;
  Cesium.Matrix4.multiplyByVector(enuMat, _inV4, _outV4);
  return new Cesium.Cartesian3(
    origin.x + _outV4.x,
    origin.y + _outV4.y,
    origin.z + _outV4.z
  );
}

function computeFrustumGeometry(posC3, yawDeg, pitchDeg) {
  const H = yawDeg   * _D2R;
  const P = pitchDeg * _D2R;
  const d = FR_DIST, hw = FR_HW, hh = FR_HH;

  // Camera axes in local ENU (East=col0, North=col1, Up=col2)
  const fE =  Math.sin(H) * Math.cos(P),  fN =  Math.cos(H) * Math.cos(P),  fU = Math.sin(P);
  const rE =  Math.cos(H),                rN = -Math.sin(H),                 rU = 0;
  const uE = -Math.sin(H) * Math.sin(P),  uN = -Math.cos(H) * Math.sin(P),  uU = Math.cos(P);

  Cesium.Transforms.eastNorthUpToFixedFrame(posC3, undefined, _enuMatrix);

  function pt(df, dr, du) {
    return _frustumCorner(_enuMatrix, posC3,
      df * fE + dr * rE + du * uE,
      df * fN + dr * rN + du * uN,
      df * fU + dr * rU + du * uU);
  }

  return {
    O:  posC3,
    TR: pt(d,  hw,  hh),  TL: pt(d, -hw,  hh),
    BR: pt(d,  hw, -hh),  BL: pt(d, -hw, -hh),
  };
}

function interpYawDeg(videoTimeSec) {
  const trk = GPS_TRACK;
  if (videoTimeSec <= trk[0].t) return trk[0].yaw;
  if (videoTimeSec >= trk[trk.length - 1].t) return trk[trk.length - 1].yaw;
  for (let i = 0; i < trk.length - 1; i++) {
    if (videoTimeSec >= trk[i].t && videoTimeSec <= trk[i + 1].t) {
      const frac = (videoTimeSec - trk[i].t) / (trk[i + 1].t - trk[i].t);
      let diff = trk[i + 1].yaw - trk[i].yaw;
      if (diff >  180) diff -= 360;
      if (diff < -180) diff += 360;
      return trk[i].yaw + frac * diff;
    }
  }
  return trk[trk.length - 1].yaw;
}

let _frust = null;

const _frustColor = new Cesium.ColorMaterialProperty(Cesium.Color.WHITE);

function _fLine(getA, getB) {
  viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => _frust ? [getA(), getB()] : [], false),
      width:     0.9,
      material:  _frustColor,
      clampToGround: false,
    },
  });
}

// 4 apex rays
_fLine(() => _frust.O,   () => _frust.TR);
_fLine(() => _frust.O,   () => _frust.TL);
_fLine(() => _frust.O,   () => _frust.BR);
_fLine(() => _frust.O,   () => _frust.BL);
// Far-plane rectangle
_fLine(() => _frust.TL,  () => _frust.TR);
_fLine(() => _frust.TR,  () => _frust.BR);
_fLine(() => _frust.BR,  () => _frust.BL);
_fLine(() => _frust.BL,  () => _frust.TL);

/* ─────────────────────────────────────────────────────────────
   11.  BIDIRECTIONAL SYNC: video ↔ Cesium clock

   • rAF loop: reads video.currentTime every frame → sets clock.
     Handles normal playback and live dragging of the video scrubber.

   • 'seeking' event: fires immediately when the user starts dragging
     the video progress bar, giving instant visual response on the map
     before the browser finishes buffering the new frame.

   • Cesium timeline 'settime': fires when the user clicks/drags the
     Cesium timeline on the right panel → seeks the video to match,
     then the rAF loop takes over from there.
───────────────────────────────────────────────────────────── */
const videoElement = document.getElementById("track-video");

// Clock never self-advances — video drives it
clock.shouldAnimate = false;

// Reusable JulianDate to avoid GC churn
const _syncTime = new Cesium.JulianDate();

function _videoTimeToJulian(sec) {
  return Cesium.JulianDate.addSeconds(startTime, sec, _syncTime);
}

// rAF loop: keep clock current with video every rendered frame
(function syncLoop() {
  clock.currentTime = _videoTimeToJulian(videoElement.currentTime);
  requestAnimationFrame(syncLoop);
})();

// Immediate clock update the moment a video seek begins (no wait for buffering)
videoElement.addEventListener("seeking", () => {
  clock.currentTime = _videoTimeToJulian(videoElement.currentTime);
});

// Cesium timeline scrub → seek video to match
viewer.timeline.addEventListener("settime", () => {
  const sec = Cesium.JulianDate.secondsDifference(clock.currentTime, startTime);
  const clamped = Math.max(0, Math.min(VIDEO_DURATION_S, sec));
  if (Math.abs(clamped - videoElement.currentTime) > 0.05) {
    videoElement.currentTime = clamped;
  }
}, false);

videoElement.addEventListener("play",  () => showStatus("Playing ▶"));
videoElement.addEventListener("pause", () => showStatus("Paused ⏸"));

clock.onTick.addEventListener(onClockTick);

/* ─────────────────────────────────────────────────────────────
   11.  CAMERA MODES
───────────────────────────────────────────────────────────── */
let cameraMode = "follow";

function setCamMode(mode) {
  cameraMode = mode;

  document.querySelectorAll(".cam-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById(`btn-${mode}`).classList.add("active");

  if (mode === "follow") {
    viewer.trackedEntity = trackEntity;
    viewer.trackedEntityOffset = new Cesium.HeadingPitchRange(
      0,
      Cesium.Math.toRadians(-35),
      500,
    );
  } else if (mode === "overview") {
    viewer.trackedEntity = undefined;
    // Centre on the mid-point of the track
    const mid = GPS_TRACK[Math.floor(GPS_TRACK.length / 2)];
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(mid.lon, mid.lat, 2500),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 },
      duration: 1.5,
    });
  } else {
    viewer.trackedEntity = undefined;
  }
}

setCamMode("follow");

/* ─────────────────────────────────────────────────────────────
   12.  HUD + CLOCK TICK
───────────────────────────────────────────────────────────── */
let prevPos  = null;
let prevTime = null;

// Pre-build a lookup: t_seconds → heading_radians (for nearest sample)
function getNearestHeading(videoTimeSec) {
  let best = headingSamples[0];
  let bestDiff = Math.abs(videoTimeSec - best.t);
  for (const s of headingSamples) {
    const diff = Math.abs(videoTimeSec - s.t);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  return best.heading;
}

function onClockTick(clk) {
  const time = clk.currentTime;
  const pos  = positionProperty.getValue(time);
  if (!pos) return;

  const carto = Cesium.Cartographic.fromCartesian(pos);
  const lat   = Cesium.Math.toDegrees(carto.latitude);
  const lon   = Cesium.Math.toDegrees(carto.longitude);
  const alt   = carto.height;

  // Ground speed
  let speedText = "—";
  if (prevPos && prevTime) {
    const dt = Cesium.JulianDate.secondsDifference(time, prevTime);
    if (dt > 0) {
      const dist = Cesium.Cartesian3.distance(pos, prevPos);
      speedText  = `${(dist / dt).toFixed(1)} m/s`;
    }
  }
  prevPos  = pos.clone();
  prevTime = time.clone();

  // Heading from GPS_TRACK yaw data
  const headingRad = getNearestHeading(videoElement.currentTime);
  const headingDeg = Cesium.Math.toDegrees(headingRad).toFixed(1);

  // Update camera frustum indicator
  const yawDeg = interpYawDeg(videoElement.currentTime);
  _frust = computeFrustumGeometry(pos, yawDeg, -18.7);

  document.getElementById("hud-time").textContent    = `${videoElement.currentTime.toFixed(1)} s`;
  document.getElementById("hud-lat").textContent     = `${lat.toFixed(6)}°`;
  document.getElementById("hud-lon").textContent     = `${lon.toFixed(6)}°`;
  document.getElementById("hud-alt").textContent     = `${alt.toFixed(1)} m`;
  document.getElementById("hud-speed").textContent   = speedText;
  document.getElementById("hud-heading").textContent = `${headingDeg}°`;
}

/* ─────────────────────────────────────────────────────────────
   13.  STATUS BAR HELPER
───────────────────────────────────────────────────────────── */
let statusTimer = null;

function showStatus(msg) {
  const bar = document.getElementById("status-bar");
  bar.textContent = msg;
  bar.style.display = "block";
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { bar.style.display = "none"; }, 2000);
}

/* ─────────────────────────────────────────────────────────────
   14.  INITIAL CAMERA — fly to start of track
───────────────────────────────────────────────────────────── */
(function initialFlyTo() {
  const first = GPS_TRACK[0];
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(first.lon, first.lat, 1200),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
    duration: 0,
  });
})();
