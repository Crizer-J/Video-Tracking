# Cesium Video + Geo-Track Split-Screen — CLAUDE.md

**Goal:** Split-screen app — left half plays a video, right half shows a Cesium 3D globe that draws a live path and tracks a moving point synchronized to the video's playback time.

API docs: https://cesium.com/learn/ion-sdk/ref-doc/

---

## Architecture Overview

```
┌──────────────────────┬──────────────────────┐
│                      │                      │
│   <video> element    │   Cesium Viewer       │
│   (left 50%)         │   (right 50%)         │
│                      │                      │
│   plays MP4/WebM     │   - tracked entity   │
│                      │   - path trail draws  │
│   ← VideoSynchronizer links both via Clock → │
└──────────────────────┴──────────────────────┘
```

The **Cesium `Clock`** is the single source of truth. `VideoSynchronizer` binds the video's `currentTime` to the clock. The tracked entity's `SampledPositionProperty` returns the GPS position for any given clock time. `PathGraphics` automatically draws the trail behind the entity as time advances.

---

## 1. HTML Layout

```html
<!DOCTYPE html>
<html>
<head>
  <title>Geo Track Viewer</title>
  <link href="https://cesium.com/downloads/cesiumjs/releases/latest/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; height: 100vh; overflow: hidden; background: #000; }

    #video-panel {
      width: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #111;
    }

    #track-video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    #cesium-panel {
      width: 50%;
      position: relative;
    }

    #cesiumContainer {
      width: 100%;
      height: 100%;
    }

    /* Optional HUD overlay on Cesium panel */
    #hud {
      position: absolute;
      top: 12px;
      left: 12px;
      color: white;
      font-family: monospace;
      font-size: 13px;
      background: rgba(0,0,0,0.55);
      padding: 8px 12px;
      border-radius: 6px;
      pointer-events: none;
      z-index: 10;
    }
  </style>
</head>
<body>
  <div id="video-panel">
    <video id="track-video" controls>
      <source src="your-video.mp4" type="video/mp4">
    </video>
  </div>

  <div id="cesium-panel">
    <div id="cesiumContainer"></div>
    <div id="hud">
      <div id="hud-time">Time: —</div>
      <div id="hud-lat">Lat: —</div>
      <div id="hud-lon">Lon: —</div>
      <div id="hud-alt">Alt: —</div>
    </div>
  </div>

  <script src="https://cesium.com/downloads/cesiumjs/releases/latest/Build/Cesium/Cesium.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

---

## 2. GPS Data Format

Your GPS track must be an array of samples: `{ time, lat, lon, alt }`.

**Option A — inline JS array (simplest)**
```js
// Each entry: seconds offset from video start, lat/lon/alt
const gpxTrack = [
  { t: 0,    lat: 34.0522, lon: -118.2437, alt: 71  },
  { t: 5,    lat: 34.0530, lon: -118.2445, alt: 73  },
  { t: 10,   lat: 34.0538, lon: -118.2455, alt: 75  },
  // ... one sample per second or as dense as GPS allows
];
```

**Option B — CZML (load from file)**
CZML natively encodes time-tagged positions and is the most Cesium-native format. See Section 7.

**Option C — GPX file**
Load with `GpxDataSource.load("track.gpx")` — Cesium parses time-stamped waypoints automatically.

---

## 3. Core Setup (`app.js`)

```js
// === CONFIG ===
Ion.defaultAccessToken = "YOUR_ION_TOKEN";

// The real-world datetime that corresponds to t=0 of the video.
// If your GPS log uses UTC timestamps, set this to the actual start time.
const VIDEO_START_ISO = "2024-06-15T10:30:00Z";

// === VIEWER ===
const viewer = new Viewer("cesiumContainer", {
  terrain: Terrain.fromWorldTerrain(),
  timeline: true,
  animation: true,
  shouldAnimate: false, // video controls playback, not the animation widget
  homeButton: false,
  sceneModePicker: false,
  baseLayerPicker: false,
  navigationHelpButton: false,
  geocoder: false,
  infoBox: false,
  selectionIndicator: false,
});

const scene  = viewer.scene;
const clock  = viewer.clock;
const camera = viewer.camera;
```

---

## 4. Clock Configuration

The clock defines the absolute time range corresponding to the video.

```js
const startTime = JulianDate.fromIso8601(VIDEO_START_ISO);
const videoDurationSeconds = 300; // set to your actual video length
const stopTime = JulianDate.addSeconds(startTime, videoDurationSeconds, new JulianDate());

clock.startTime   = startTime;
clock.stopTime    = stopTime;
clock.currentTime = startTime.clone();
clock.clockRange  = ClockRange.CLAMP_TO_RANGE;
clock.clockStep   = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
clock.multiplier  = 1; // 1x real-time; VideoSynchronizer will override this

// Update HUD on every tick
clock.onTick.addEventListener(onClockTick);
```

---

## 5. VideoSynchronizer — Linking Video ↔ Clock

`VideoSynchronizer` is a built-in Cesium class that keeps `video.currentTime` in sync with the simulation clock. When the user scrubs the video, the clock updates. When the clock advances (e.g. animation widget), the video seeks.

```js
const videoElement = document.getElementById("track-video");

const videoSync = new VideoSynchronizer({
  clock: clock,
  element: videoElement,
  epoch: startTime,   // simulation time = video time 0
  tolerance: 1.0      // seconds of allowed drift before forcing a seek
});

// When video plays/pauses, mirror that to the clock
videoElement.addEventListener("play",  () => { clock.shouldAnimate = true;  });
videoElement.addEventListener("pause", () => { clock.shouldAnimate = false; });
videoElement.addEventListener("seeking", () => {
  // Sync clock to new video position
  const newTime = JulianDate.addSeconds(startTime, videoElement.currentTime, new JulianDate());
  clock.currentTime = newTime;
});

// Clean up on page unload
window.addEventListener("unload", () => videoSync.destroy());
```

**Key `VideoSynchronizer` properties:**
- `clock` — the Clock instance to drive
- `element` — the HTMLVideoElement
- `epoch` — JulianDate marking video t=0 in simulation time
- `tolerance` — seconds of drift allowed before forcing a video seek (lower = more accurate, higher = better performance)

---

## 6. Building the Tracked Entity

### 6a. SampledPositionProperty

Stores GPS samples keyed by simulation time. Cesium interpolates between samples automatically.

```js
const positionProperty = new SampledPositionProperty();

// Use smooth interpolation between GPS samples
positionProperty.setInterpolationOptions({
  interpolationAlgorithm: HermitePolynomialApproximation,
  interpolationDegree: 3
});

// Allow the property to hold its last value after the track ends
positionProperty.forwardExtrapolationType  = ExtrapolationType.HOLD;
positionProperty.backwardExtrapolationType = ExtrapolationType.HOLD;

// Feed in your GPS samples
gpxTrack.forEach(({ t, lat, lon, alt }) => {
  const sampleTime = JulianDate.addSeconds(startTime, t, new JulianDate());
  const position   = Cartesian3.fromDegrees(lon, lat, alt);
  positionProperty.addSample(sampleTime, position);
});
```

### 6b. Entity with Path Trail

```js
const trackEntity = viewer.entities.add({
  // Dynamic position from GPS samples
  position: positionProperty,

  // Auto-computes orientation from direction of travel
  orientation: new VelocityOrientationProperty(positionProperty),

  // Moving marker — use a point, billboard, or model
  point: {
    pixelSize: 14,
    color: Color.CYAN,
    outlineColor: Color.WHITE,
    outlineWidth: 2,
    heightReference: HeightReference.CLAMP_TO_GROUND, // snap to terrain
  },

  // Optional: swap point for a glTF model
  // model: { uri: "tracker.glb", scale: 2.0, minimumPixelSize: 32 },

  // Path trail — draws the line behind (and optionally ahead of) the entity
  path: {
    show: true,
    trailTime: undefined,  // undefined = draw entire past track
    leadTime: 0,           // 0 = don't draw future path
    width: 3,
    material: new PolylineGlowMaterialProperty({
      glowPower: 0.15,
      color: Color.fromCssColorString("#00FFFF"),
    }),
    resolution: 1,         // sample every 1 second for smooth curves
  },
});
```

**`PathGraphics` key properties:**
| Property | Type | Description |
|---|---|---|
| `trailTime` | seconds | How far behind current time to draw trail. `undefined` = entire history |
| `leadTime` | seconds | How far ahead to draw. Set `0` to hide future path |
| `width` | pixels | Line width |
| `material` | MaterialProperty | Line appearance |
| `resolution` | seconds | Max step size when sampling position for path drawing |

---

## 7. Camera Tracking

```js
// Option A: Lock camera to follow entity (third-person)
viewer.trackedEntity = trackEntity;

// Option B: Smooth follow with fixed offset
viewer.trackedEntity = trackEntity;
viewer.trackedEntityOffset = new HeadingPitchRange(
  0,                          // heading (0 = north)
  CesiumMath.toRadians(-30),  // pitch (look slightly down)
  500                         // range in meters
);

// Option C: Overview — frame the entire track, don't follow
viewer.zoomTo(trackEntity, new HeadingPitchRange(0, CesiumMath.toRadians(-60), 2000));

// Option D: Manual fly-to start position
camera.flyTo({
  destination: Cartesian3.fromDegrees(gpxTrack[0].lon, gpxTrack[0].lat, 800),
  orientation: { heading: 0, pitch: CesiumMath.toRadians(-45), roll: 0 },
  duration: 2
});

// Un-track to let user pan freely
// viewer.trackedEntity = undefined;
```

---

## 8. HUD Update on Clock Tick

```js
function onClockTick(clock) {
  const time = clock.currentTime;

  // Get current interpolated position
  const pos = positionProperty.getValue(time);
  if (!pos) return;

  const carto = Cartographic.fromCartesian(pos);
  const lat   = CesiumMath.toDegrees(carto.latitude).toFixed(6);
  const lon   = CesiumMath.toDegrees(carto.longitude).toFixed(6);
  const alt   = carto.height.toFixed(1);

  document.getElementById("hud-lat").textContent  = `Lat: ${lat}°`;
  document.getElementById("hud-lon").textContent  = `Lon: ${lon}°`;
  document.getElementById("hud-alt").textContent  = `Alt: ${alt} m`;
  document.getElementById("hud-time").textContent =
    `T+${videoElement.currentTime.toFixed(1)}s`;
}
```

---

## 9. CZML Format (Alternative to Inline Array)

CZML is Cesium's native time-dynamic JSON format. It's the best approach when loading track data from a server or file.

```json
[
  {
    "id": "document",
    "name": "GPS Track",
    "version": "1.0",
    "clock": {
      "interval": "2024-06-15T10:30:00Z/2024-06-15T10:35:00Z",
      "currentTime": "2024-06-15T10:30:00Z",
      "multiplier": 1,
      "range": "CLAMPED",
      "step": "SYSTEM_CLOCK_MULTIPLIER"
    }
  },
  {
    "id": "tracker",
    "name": "Vehicle",
    "availability": "2024-06-15T10:30:00Z/2024-06-15T10:35:00Z",
    "position": {
      "interpolationAlgorithm": "HERMITE",
      "interpolationDegree": 3,
      "referenceFrame": "FIXED",
      "epoch": "2024-06-15T10:30:00Z",
      "cartographicDegrees": [
        0,   -118.2437, 34.0522, 71,
        5,   -118.2445, 34.0530, 73,
        10,  -118.2455, 34.0538, 75
      ]
    },
    "point": {
      "pixelSize": 14,
      "color": { "rgba": [0, 255, 255, 255] },
      "outlineColor": { "rgba": [255, 255, 255, 255] },
      "outlineWidth": 2
    },
    "path": {
      "show": true,
      "width": 3,
      "material": {
        "polylineGlow": {
          "color": { "rgba": [0, 255, 255, 200] },
          "glowPower": 0.15
        }
      },
      "resolution": 1,
      "trailTime": 1e9,
      "leadTime": 0
    }
  }
]
```

**`cartographicDegrees` format:** `[secondsFromEpoch, longitude, latitude, altitude, ...]`

**Loading CZML:**
```js
const ds = await CzmlDataSource.load("track.czml");
viewer.dataSources.add(ds);
viewer.clock.startTime  = ds.clock.startTime;
viewer.clock.stopTime   = ds.clock.stopTime;
viewer.clock.currentTime = ds.clock.startTime.clone();

// Get the entity for tracking
const trackEntity = ds.entities.getById("tracker");
viewer.trackedEntity = trackEntity;

// Then set up VideoSynchronizer as above using ds.clock.startTime as epoch
```

---

## 10. GPX File Loading (Simplest GPS Input)

If you have a `.gpx` file from a GPS device:

```js
const ds = await GpxDataSource.load("track.gpx");
viewer.dataSources.add(ds);

// GPX entities will have time-dynamic positions
const entity = ds.entities.values[0];
viewer.trackedEntity = entity;

// Add a path trail to the loaded entity
entity.path = {
  show: true,
  trailTime: undefined,
  leadTime: 0,
  width: 3,
  material: new PolylineGlowMaterialProperty({ glowPower: 0.15, color: Color.CYAN }),
  resolution: 1
};
```

---

## 11. Key Classes Summary

| Class | Package | Role in this app |
|---|---|---|
| `Viewer` | `@cesium/widgets` | Main Cesium widget, holds clock, scene, camera |
| `Clock` | `@cesium/engine` | Single source of truth for current time |
| `VideoSynchronizer` | `@cesium/engine` | Keeps `video.currentTime` ↔ `clock.currentTime` in sync |
| `SampledPositionProperty` | `@cesium/engine` | Stores GPS samples, interpolates position at any time |
| `VelocityOrientationProperty` | `@cesium/engine` | Auto-computes heading from direction of travel |
| `PathGraphics` | `@cesium/engine` | Draws the trail line behind the tracked entity |
| `Entity` | `@cesium/engine` | The moving tracked object on the globe |
| `CzmlDataSource` | `@cesium/engine` | Loads CZML file with time-dynamic track data |
| `GpxDataSource` | `@cesium/engine` | Loads GPX file with timestamped waypoints |
| `JulianDate` | `@cesium/engine` | Cesium's time representation |
| `Cartesian3` | `@cesium/engine` | 3D ECEF position |
| `Cartographic` | `@cesium/engine` | Geodetic position (lat/lon/alt in radians) |
| `HermitePolynomialApproximation` | `@cesium/engine` | Smooth interpolation between GPS samples |
| `ExtrapolationType` | `@cesium/engine` | Controls position behavior before/after track data |
| `HeightReference` | `@cesium/engine` | `CLAMP_TO_GROUND` snaps marker to terrain surface |
| `PolylineGlowMaterialProperty` | `@cesium/engine` | Glowing neon path line material |

---

## 12. Common Pitfalls & Tips

**Time alignment is everything.** The `epoch` passed to `VideoSynchronizer` must exactly match the JulianDate that corresponds to `video.currentTime = 0`. If your GPS log uses UTC timestamps, parse them as `JulianDate.fromIso8601("...")` and use that as both the `clock.startTime` and the `epoch`.

**GPS sample density.** One sample per second is usually sufficient. With `HermitePolynomialApproximation` and `interpolationDegree: 3`, Cesium will draw a smooth curve between sparse samples. Very sparse GPS (one per 10+ seconds) may cause visible snapping — increase density or lower the interpolation degree to 1 (linear).

**Terrain clamping.** `HeightReference.CLAMP_TO_GROUND` on the entity's `point` or `model` requires terrain to be loaded. Always set a terrain provider; use `Terrain.fromWorldTerrain()` for best results.

**`trailTime: undefined` vs a number.** Setting `trailTime` to `undefined` draws the full track history from the beginning. Setting it to a number (e.g. `60`) draws only the last 60 seconds. For a "draw as you go" effect, use `undefined`.

**Video seeking vs clock.** When the user drags the video scrubber, `VideoSynchronizer` automatically seeks the clock. When the user drags the Cesium timeline, the clock changes and `VideoSynchronizer` seeks the video. Both directions work automatically once wired up.

**`shouldAnimate: false` at init.** Start the viewer with animation paused so the path doesn't advance before the video plays.

**Performance.** For very long tracks (hours of GPS data), consider reducing `path.resolution` to 5 or 10 seconds and limiting `trailTime` to a rolling window instead of drawing the full history.

---

## 13. Full Minimal Working Example

```js
// app.js — minimal wiring

Ion.defaultAccessToken = "YOUR_ION_TOKEN";

// --- GPS data (seconds from video start, lon, lat, alt) ---
const track = [
  { t: 0,   lon: -118.2437, lat: 34.0522, alt: 71 },
  { t: 10,  lon: -118.2455, lat: 34.0538, alt: 75 },
  { t: 20,  lon: -118.2470, lat: 34.0560, alt: 80 },
  { t: 30,  lon: -118.2485, lat: 34.0580, alt: 83 },
];

const VIDEO_START = JulianDate.fromIso8601("2024-06-15T10:30:00Z");
const VIDEO_END   = JulianDate.addSeconds(VIDEO_START, 30, new JulianDate());

// --- Viewer ---
const viewer = new Viewer("cesiumContainer", {
  terrain: Terrain.fromWorldTerrain(),
  shouldAnimate: false,
  animation: true,
  timeline: true,
});

viewer.clock.startTime   = VIDEO_START;
viewer.clock.stopTime    = VIDEO_END;
viewer.clock.currentTime = VIDEO_START.clone();
viewer.clock.clockRange  = ClockRange.CLAMP_TO_RANGE;

// --- Position property ---
const position = new SampledPositionProperty();
position.setInterpolationOptions({
  interpolationAlgorithm: HermitePolynomialApproximation,
  interpolationDegree: 3
});
position.forwardExtrapolationType = ExtrapolationType.HOLD;

track.forEach(({ t, lon, lat, alt }) => {
  position.addSample(
    JulianDate.addSeconds(VIDEO_START, t, new JulianDate()),
    Cartesian3.fromDegrees(lon, lat, alt)
  );
});

// --- Tracked entity ---
const entity = viewer.entities.add({
  position,
  orientation: new VelocityOrientationProperty(position),
  point: {
    pixelSize: 14,
    color: Color.CYAN,
    outlineColor: Color.WHITE,
    outlineWidth: 2,
    heightReference: HeightReference.CLAMP_TO_GROUND,
  },
  path: {
    show: true,
    trailTime: undefined,
    leadTime: 0,
    width: 3,
    material: new PolylineGlowMaterialProperty({ glowPower: 0.15, color: Color.CYAN }),
    resolution: 1,
  },
});

viewer.trackedEntity = entity;

// --- Video sync ---
const video = document.getElementById("track-video");
const sync = new VideoSynchronizer({ clock: viewer.clock, element: video, epoch: VIDEO_START });

video.addEventListener("play",  () => { viewer.clock.shouldAnimate = true;  });
video.addEventListener("pause", () => { viewer.clock.shouldAnimate = false; });
```

---

## Resources

- **VideoSynchronizer:** https://cesium.com/learn/ion-sdk/ref-doc/VideoSynchronizer.html
- **SampledPositionProperty:** https://cesium.com/learn/ion-sdk/ref-doc/SampledPositionProperty.html
- **PathGraphics:** https://cesium.com/learn/ion-sdk/ref-doc/PathGraphics.html
- **CzmlDataSource:** https://cesium.com/learn/ion-sdk/ref-doc/CzmlDataSource.html
- **CZML Guide:** https://github.com/AnalyticalGraphicsInc/czml-writer/wiki/CZML-Guide
- **Sandcastle CZML Demo:** https://sandcastle.cesium.com/?id=czml
- **Sandcastle Video Demo:** https://sandcastle.cesium.com/?id=video
- **Cesium Forum:** https://community.cesium.com/