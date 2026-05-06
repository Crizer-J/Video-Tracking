/**
 * player_app.js — dynamic Cesium player
 * Reads project ID from URL, fetches data from /api/projects/<id>,
 * then sets up the same Cesium viewer as the original app.js.
 */

async function initPlayer() {
  /* ── 1. Load project from API ──────────────────────────────── */
  const pid = location.pathname.split("/").pop();
  let project;
  try {
    const r = await fetch(`/api/projects/${pid}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    project = await r.json();
  } catch (e) {
    document.getElementById("loading-overlay").innerHTML =
      `<div style="color:#ef4444;font-size:14px">Failed to load project: ${e.message}</div>
       <a href="/" style="color:#0af;font-size:13px;margin-top:12px">← Back to Dashboard</a>`;
    return;
  }

  const GPS_TRACK        = project.gps_track || [];
  const hasGps           = GPS_TRACK.length > 0;
  const VIDEO_DURATION_S = project.duration || 60;
  const VIDEO_START_ISO  = project.start_iso || new Date().toISOString();

  /* ── 2. Update page UI ─────────────────────────────────────── */
  document.title = `${project.name} — GeoTrack`;
  document.getElementById("project-title").textContent = project.name;

  const videoEl = document.getElementById("track-video");
  videoEl.src   = project.video_url;

  const fname = project.video_url.split("/").pop();
  document.getElementById("video-filename").textContent =
    `${fname}${VIDEO_DURATION_S ? ` | ${fmtDuration(VIDEO_DURATION_S)}` : ""}`;

  if (!hasGps) {
    document.getElementById("no-gps-badge").style.display = "block";
    // Disable tracking-only buttons
    ["btn-follow","btn-overview"].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.disabled = true; b.title = "No GPS data"; }
    });
  }

  /* ── 3. Cesium token & viewer ──────────────────────────────── */
  Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MTBjN2Y3OS0wNGRmLTRjNTYtOTZmYS0yNTQzNWM5NTdjNTMiLCJpZCI6NDM5ODIsImlhdCI6MTc3MDA5NzMyNH0.5vQMpwKKsydT2jeqs61UKUmqkJ_TIC06VNNftQtT_T4";

  const viewer = new Cesium.Viewer("cesiumContainer", {
    terrain:              Cesium.Terrain.fromWorldTerrain(),
    animation:            false,
    timeline:             true,
    shouldAnimate:        false,
    homeButton:           false,
    sceneModePicker:      false,
    baseLayerPicker:      false,
    navigationHelpButton: false,
    geocoder:             false,
    infoBox:              false,
    selectionIndicator:   false,
    fullscreenButton:     false,
  });

  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.globe.show         = true;

  /* ── 4. Clock ──────────────────────────────────────────────── */
  const startTime = Cesium.JulianDate.fromIso8601(VIDEO_START_ISO);
  const stopTime  = Cesium.JulianDate.addSeconds(startTime, VIDEO_DURATION_S, new Cesium.JulianDate());

  const clock = viewer.clock;
  clock.startTime   = startTime;
  clock.stopTime    = stopTime;
  clock.currentTime = startTime.clone();
  clock.clockRange  = Cesium.ClockRange.CLAMP_TO_RANGE;
  clock.clockStep   = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
  clock.multiplier  = 1;
  clock.shouldAnimate = false;

  viewer.timeline.zoomTo(startTime, stopTime);

  /* ── 5. Position property (GPS) ────────────────────────────── */
  let positionProperty = null;
  let trackEntity      = null;
  let headingSamples   = [];

  if (hasGps) {
    positionProperty = new Cesium.SampledPositionProperty();
    positionProperty.setInterpolationOptions({
      interpolationAlgorithm: Cesium.HermitePolynomialApproximation,
      interpolationDegree:    3,
    });
    positionProperty.forwardExtrapolationType  = Cesium.ExtrapolationType.HOLD;
    positionProperty.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;

    GPS_TRACK.forEach(({ t, lat, lon, alt }) => {
      positionProperty.addSample(
        Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate()),
        Cesium.Cartesian3.fromDegrees(lon, lat, alt)
      );
    });

    headingSamples = GPS_TRACK.map(({ t, yaw }) => ({
      t,
      heading: Cesium.Math.toRadians(((yaw % 360) + 360) % 360),
    }));

    /* ── 6. Full static path line ───────────────────────────── */
    const fullPathPositions = GPS_TRACK.map(({ lon, lat, alt }) =>
      Cesium.Cartesian3.fromDegrees(lon, lat, alt)
    );

    viewer.entities.add({
      polyline: {
        positions:     fullPathPositions,
        width:         4,
        material:      new Cesium.ColorMaterialProperty(Cesium.Color.RED.withAlpha(0.45)),
        clampToGround: false,
      },
    });

    /* ── 7. Tracked entity (dot + live trail) ───────────────── */
    trackEntity = viewer.entities.add({
      position:    positionProperty,
      orientation: new Cesium.VelocityOrientationProperty(positionProperty),
      point: {
        pixelSize:    18,
        color:        Cesium.Color.CYAN,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        scaleByDistance:          new Cesium.NearFarScalar(100, 1.5, 80000, 0.5),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      path: {
        show:       true,
        trailTime:  undefined,
        leadTime:   0,
        width:      10,
        material:   new Cesium.ColorMaterialProperty(Cesium.Color.RED),
        resolution: 1,
      },
    });
  }

  /* ── 8. Camera frustum indicator ───────────────────────────── */
  const _D2R    = Math.PI / 180;
  const FR_DIST = 9;
  const FR_HW   = FR_DIST * Math.tan(42 * _D2R);
  const FR_HH   = FR_DIST * Math.tan(Math.atan(Math.tan(42 * _D2R) / (16 / 9)));

  const _enuMatrix = new Cesium.Matrix4();
  const _inV4      = new Cesium.Cartesian4();
  const _outV4     = new Cesium.Cartesian4();

  function _frustumCorner(enuMat, origin, fe, fn, fu) {
    _inV4.x = fe; _inV4.y = fn; _inV4.z = fu; _inV4.w = 0;
    Cesium.Matrix4.multiplyByVector(enuMat, _inV4, _outV4);
    return new Cesium.Cartesian3(origin.x + _outV4.x, origin.y + _outV4.y, origin.z + _outV4.z);
  }

  function computeFrustumGeometry(posC3, yawDeg, pitchDeg) {
    const H = yawDeg * _D2R, P = pitchDeg * _D2R;
    const d = FR_DIST, hw = FR_HW, hh = FR_HH;
    const fE =  Math.sin(H)*Math.cos(P), fN =  Math.cos(H)*Math.cos(P), fU = Math.sin(P);
    const rE =  Math.cos(H),             rN = -Math.sin(H),             rU = 0;
    const uE = -Math.sin(H)*Math.sin(P), uN = -Math.cos(H)*Math.sin(P), uU = Math.cos(P);
    Cesium.Transforms.eastNorthUpToFixedFrame(posC3, undefined, _enuMatrix);
    function pt(df, dr, du) {
      return _frustumCorner(_enuMatrix, posC3,
        df*fE + dr*rE + du*uE, df*fN + dr*rN + du*uN, df*fU + dr*rU + du*uU);
    }
    return { O: posC3, TR: pt(d,hw,hh), TL: pt(d,-hw,hh), BR: pt(d,hw,-hh), BL: pt(d,-hw,-hh) };
  }

  function interpYawDeg(sec) {
    const trk = GPS_TRACK;
    if (!trk.length) return 0;
    if (sec <= trk[0].t) return trk[0].yaw;
    if (sec >= trk[trk.length - 1].t) return trk[trk.length - 1].yaw;
    for (let i = 0; i < trk.length - 1; i++) {
      if (sec >= trk[i].t && sec <= trk[i+1].t) {
        const f = (sec - trk[i].t) / (trk[i+1].t - trk[i].t);
        let d = trk[i+1].yaw - trk[i].yaw;
        if (d >  180) d -= 360;
        if (d < -180) d += 360;
        return trk[i].yaw + f * d;
      }
    }
    return trk[trk.length - 1].yaw;
  }

  let _frust = null;
  const _frustColor = new Cesium.ColorMaterialProperty(Cesium.Color.WHITE);

  if (hasGps) {
    const _fLine = (getA, getB) => {
      viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => _frust ? [getA(), getB()] : [], false),
          width:     0.9,
          material:  _frustColor,
          clampToGround: false,
        },
      });
    };
    _fLine(() => _frust.O, () => _frust.TR);
    _fLine(() => _frust.O, () => _frust.TL);
    _fLine(() => _frust.O, () => _frust.BR);
    _fLine(() => _frust.O, () => _frust.BL);
    _fLine(() => _frust.TL, () => _frust.TR);
    _fLine(() => _frust.TR, () => _frust.BR);
    _fLine(() => _frust.BR, () => _frust.BL);
    _fLine(() => _frust.BL, () => _frust.TL);
  }

  /* ── 9. Video ↔ clock sync ─────────────────────────────────── */
  const _syncTime = new Cesium.JulianDate();

  function _videoTimeToJulian(sec) {
    return Cesium.JulianDate.addSeconds(startTime, sec, _syncTime);
  }

  (function syncLoop() {
    clock.currentTime = _videoTimeToJulian(videoEl.currentTime);
    requestAnimationFrame(syncLoop);
  })();

  videoEl.addEventListener("seeking", () => {
    clock.currentTime = _videoTimeToJulian(videoEl.currentTime);
  });

  viewer.timeline.addEventListener("settime", () => {
    const sec = Cesium.JulianDate.secondsDifference(clock.currentTime, startTime);
    const clamped = Math.max(0, Math.min(VIDEO_DURATION_S, sec));
    if (Math.abs(clamped - videoEl.currentTime) > 0.05) videoEl.currentTime = clamped;
  }, false);

  videoEl.addEventListener("play",  () => showStatus("Playing ▶"));
  videoEl.addEventListener("pause", () => showStatus("Paused ⏸"));

  /* ── 10. Clock tick → HUD ──────────────────────────────────── */
  let prevPos = null, prevTime = null;

  function getNearestHeading(sec) {
    if (!headingSamples.length) return 0;
    let best = headingSamples[0], bestDiff = Math.abs(sec - best.t);
    for (const s of headingSamples) {
      const diff = Math.abs(sec - s.t);
      if (diff < bestDiff) { bestDiff = diff; best = s; }
    }
    return best.heading;
  }

  clock.onTick.addEventListener(clk => {
    const time = clk.currentTime;
    document.getElementById("hud-time").textContent = `${videoEl.currentTime.toFixed(1)} s`;

    if (!hasGps || !positionProperty) return;

    const pos = positionProperty.getValue(time);
    if (!pos) return;

    const carto = Cesium.Cartographic.fromCartesian(pos);
    const lat   = Cesium.Math.toDegrees(carto.latitude);
    const lon   = Cesium.Math.toDegrees(carto.longitude);
    const alt   = carto.height;

    let speedText = "—";
    if (prevPos && prevTime) {
      const dt = Cesium.JulianDate.secondsDifference(time, prevTime);
      if (dt > 0) {
        speedText = `${(Cesium.Cartesian3.distance(pos, prevPos) / dt).toFixed(1)} m/s`;
      }
    }
    prevPos  = pos.clone();
    prevTime = time.clone();

    const headingRad = getNearestHeading(videoEl.currentTime);
    const headingDeg = Cesium.Math.toDegrees(headingRad).toFixed(1);
    const yawDeg     = interpYawDeg(videoEl.currentTime);
    _frust = computeFrustumGeometry(pos, yawDeg, -18.7);

    document.getElementById("hud-lat").textContent     = `${lat.toFixed(6)}°`;
    document.getElementById("hud-lon").textContent     = `${lon.toFixed(6)}°`;
    document.getElementById("hud-alt").textContent     = `${alt.toFixed(1)} m`;
    document.getElementById("hud-speed").textContent   = speedText;
    document.getElementById("hud-heading").textContent = `${headingDeg}°`;
  });

  /* ── 11. Map mode (Google 3D Tiles / terrain) ──────────────── */
  let _googleTileset = null, _mapMode = "map", _googleApiKey = localStorage.getItem("googleMapsApiKey") || "";

  async function _loadGoogleTiles(key) {
    if (_googleTileset) { viewer.scene.primitives.remove(_googleTileset); _googleTileset = null; }
    _googleTileset = await Cesium.createGooglePhotorealistic3DTileset(key ? { key } : {});
    viewer.scene.primitives.add(_googleTileset);
  }

  window.setMapMode = async function(mode) {
    if (mode === "3d") {
      if (!_googleApiKey) {
        const key = window.prompt(
          "Enter your Google Maps Platform API key\n(Map Tiles API must be enabled)\n\nLeave blank to try the shared Cesium key."
        );
        if (key === null) return;
        _googleApiKey = key.trim();
        if (_googleApiKey) localStorage.setItem("googleMapsApiKey", _googleApiKey);
      }
      try {
        await _loadGoogleTiles(_googleApiKey);
        viewer.scene.globe.show = false;
        _mapMode = "3d";
        showStatus("Google 3D Tiles loaded ✓");
      } catch (err) {
        const code = err.statusCode || "";
        showStatus(code === 429 ? "Rate limited (429) — try your own API key" : `3D Tiles error: ${code || err.message}`);
        _googleApiKey = "";
        localStorage.removeItem("googleMapsApiKey");
        viewer.scene.globe.show = true;
        _mapMode = "map";
      }
    } else {
      if (_googleTileset) { viewer.scene.primitives.remove(_googleTileset); _googleTileset = null; }
      viewer.scene.globe.show = true;
      _mapMode = "map";
    }
    document.getElementById("btn-3dtiles")?.classList.toggle("active", _mapMode === "3d");
    document.getElementById("btn-2dmap")?.classList.toggle("active",   _mapMode === "map");
  };

  /* ── 12. Camera modes ──────────────────────────────────────── */
  let cameraMode = hasGps ? "follow" : "free";

  window.setCamMode = function(mode) {
    if (!hasGps && (mode === "follow" || mode === "overview")) return;
    cameraMode = mode;
    document.querySelectorAll(".cam-btn").forEach(b => b.classList.remove("active"));
    document.getElementById(`btn-${mode}`)?.classList.add("active");

    if (mode === "follow" && trackEntity) {
      viewer.trackedEntity = trackEntity;
      const yawDeg = ((interpYawDeg(videoEl.currentTime) % 360) + 360) % 360;
      viewer.trackedEntityOffset = new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(yawDeg),
        Cesium.Math.toRadians(-35),
        500,
      );
    } else if (mode === "overview" && trackEntity) {
      viewer.trackedEntity = undefined;
      const pos  = positionProperty.getValue(clock.currentTime);
      const yawDeg = interpYawDeg(videoEl.currentTime);
      viewer.camera.flyTo({
        destination: (() => {
          const c = pos ? Cesium.Cartographic.fromCartesian(pos) : null;
          const mid = GPS_TRACK[Math.floor(GPS_TRACK.length / 2)];
          return c
            ? Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 2500)
            : Cesium.Cartesian3.fromDegrees(mid.lon, mid.lat, 2500);
        })(),
        orientation: {
          heading: Cesium.Math.toRadians(((yawDeg % 360) + 360) % 360),
          pitch:   Cesium.Math.toRadians(-60),
          roll:    0,
        },
        duration: 1.5,
      });
    } else {
      viewer.trackedEntity = undefined;
    }
  };

  /* ── 13. Drag-to-scrub on entity ───────────────────────────── */
  if (hasGps && trackEntity) {
    const canvas = viewer.scene.canvas;
    let dragging = false, entityHovered = false;

    const hoverHandler = new Cesium.ScreenSpaceEventHandler(canvas);
    hoverHandler.setInputAction((mv) => {
      if (dragging) return;
      const hit = viewer.scene.pick(mv.endPosition);
      entityHovered = Cesium.defined(hit) && hit.id === trackEntity;
      canvas.style.cursor = entityHovered ? "grab" : "";
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !entityHovered) return;
      dragging = true;
      canvas.style.cursor = "grabbing";
      viewer.scene.screenSpaceCameraController.enableInputs = false;
      videoEl.pause();
      e.preventDefault();
      e.stopImmediatePropagation();
    }, { capture: true });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const pos2D = new Cesium.Cartesian2(e.clientX - rect.left, e.clientY - rect.top);
      const cartesian = viewer.camera.pickEllipsoid(pos2D, Cesium.Ellipsoid.WGS84);
      if (!Cesium.defined(cartesian)) return;
      const carto  = Cesium.Cartographic.fromCartesian(cartesian);
      const curLat = Cesium.Math.toDegrees(carto.latitude);
      const curLon = Cesium.Math.toDegrees(carto.longitude);
      let minDist = Infinity, nearestT = videoEl.currentTime;
      for (const s of GPS_TRACK) {
        const d = (curLat - s.lat) ** 2 + (curLon - s.lon) ** 2;
        if (d < minDist) { minDist = d; nearestT = s.t; }
      }
      if (Math.abs(nearestT - videoEl.currentTime) > 0.01) videoEl.currentTime = nearestT;
    });

    window.addEventListener("mouseup", (e) => {
      if (!dragging || e.button !== 0) return;
      dragging = entityHovered = false;
      canvas.style.cursor = "";
      viewer.scene.screenSpaceCameraController.enableInputs = true;
    });
  }

  /* ── 14. Initial camera position ───────────────────────────── */
  if (hasGps) {
    const first = GPS_TRACK[0];
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(first.lon, first.lat, 1200),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
      duration: 0,
    });
    setCamMode("follow");
  } else {
    viewer.camera.flyHome(0);
    setCamMode("free");
  }

  /* ── 15. Status bar helper ─────────────────────────────────── */
  let statusTimer = null;
  window.showStatus = function(msg) {
    const bar = document.getElementById("status-bar");
    bar.textContent = msg;
    bar.style.display = "block";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { bar.style.display = "none"; }, 2000);
  };

  /* ── 16. Reveal UI ─────────────────────────────────────────── */
  document.getElementById("loading-overlay").style.display = "none";
}

/* ── Utilities ─────────────────────────────────────────────── */
function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

initPlayer().catch(err => {
  console.error(err);
  document.getElementById("loading-overlay").innerHTML =
    `<div style="color:#ef4444;font-size:14px">Error: ${err.message}</div>
     <a href="/" style="color:#0af;font-size:13px;margin-top:12px">← Back to Dashboard</a>`;
});
