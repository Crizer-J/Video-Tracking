#!/usr/bin/env python3
"""GeoTrack Viewer — Flask backend
Handles project CRUD, file uploads, and static serving.
"""
from flask import Flask, request, jsonify, send_file, send_from_directory, abort
import os, json, uuid
from datetime import datetime, timezone
from werkzeug.utils import secure_filename

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR  = os.path.join(BASE_DIR, "uploads")
DATA_DIR    = os.path.join(BASE_DIR, "data")
PROJECTS_DB = os.path.join(DATA_DIR, "projects.json")
CLIENTS_DB  = os.path.join(DATA_DIR, "clients.json")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024 * 1024  # 8 GB


# ── Project persistence ──────────────────────────────────────

def _load():
    if not os.path.exists(PROJECTS_DB):
        return []
    with open(PROJECTS_DB) as f:
        return json.load(f)


def _save(projects):
    with open(PROJECTS_DB, "w") as f:
        json.dump(projects, f, indent=2)


def _load_clients():
    if not os.path.exists(CLIENTS_DB):
        return []
    with open(CLIENTS_DB) as f:
        return json.load(f)


def _save_clients(clients):
    with open(CLIENTS_DB, "w") as f:
        json.dump(clients, f, indent=2)


# ── API ──────────────────────────────────────────────────────

@app.route("/api/clients")
def api_list_clients():
    return jsonify(_load_clients())


@app.route("/api/clients", methods=["POST"])
def api_create_client():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    client = {
        "id":      str(uuid.uuid4()),
        "name":    name,
        "created": datetime.now(timezone.utc).isoformat(),
    }
    clients = _load_clients()
    clients.append(client)
    _save_clients(clients)
    return jsonify(client), 201


@app.route("/api/clients/<cid>", methods=["PATCH"])
def api_update_client(cid):
    clients = _load_clients()
    c = next((c for c in clients if c["id"] == cid), None)
    if not c:
        abort(404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        c["name"] = (data["name"] or "").strip()
    _save_clients(clients)
    return jsonify(c)


@app.route("/api/clients/<cid>", methods=["DELETE"])
def api_delete_client(cid):
    clients = _load_clients()
    if not any(c["id"] == cid for c in clients):
        abort(404)
    # Unassign projects that belonged to this client
    projects = _load()
    for p in projects:
        if p.get("client_id") == cid:
            p["client_id"] = None
    _save(projects)
    _save_clients([c for c in clients if c["id"] != cid])
    return "", 204


def _summarize(p):
    s = {k: v for k, v in p.items() if k != "gps_track"}
    track = p.get("gps_track", [])
    if track:
        s["gps_start"] = {"lat": track[0]["lat"], "lon": track[0]["lon"], "alt": track[0].get("alt", 0)}
    return s


@app.route("/api/projects")
def api_list():
    client_filter = request.args.get("client_id")
    projects = _load()
    if client_filter == "__none__":
        projects = [p for p in projects if not p.get("client_id")]
    elif client_filter:
        projects = [p for p in projects if p.get("client_id") == client_filter]
    return jsonify([_summarize(p) for p in projects])


@app.route("/api/projects/<pid>")
def api_get(pid):
    p = next((p for p in _load() if p["id"] == pid), None)
    if not p:
        abort(404)
    return jsonify(p)


@app.route("/api/projects", methods=["POST"])
def api_create():
    name      = (request.form.get("name") or "Untitled").strip()
    start_iso = (request.form.get("start_iso") or "").strip()
    try:
        duration = float(request.form.get("duration") or 0)
    except ValueError:
        duration = 0.0

    video = request.files.get("video")
    gps   = request.files.get("gps")

    if not video or not video.filename:
        return jsonify({"error": "No video file provided"}), 400

    pid      = str(uuid.uuid4())
    filename = f"{pid}_{secure_filename(video.filename)}"
    video.save(os.path.join(UPLOAD_DIR, filename))

    client_id   = request.form.get("client_id") or None
    description = (request.form.get("description") or "").strip()

    gps_track = []
    if gps and gps.filename:
        try:
            gps_track = json.load(gps)
        except Exception:
            pass

    project = {
        "id":        pid,
        "name":      name,
        "video_url": f"/uploads/{filename}",
        "start_iso": start_iso,
        "duration":  duration,
        "client_id":   client_id,
        "description": description,
        "gps_track":   gps_track,
        "created":   datetime.now(timezone.utc).isoformat(),
    }

    projects = _load()
    projects.insert(0, project)
    _save(projects)

    return jsonify({k: v for k, v in project.items() if k != "gps_track"}), 201


@app.route("/api/projects/<pid>", methods=["PATCH"])
def api_update(pid):
    projects = _load()
    p = next((p for p in projects if p["id"] == pid), None)
    if not p:
        abort(404)

    data = request.get_json(silent=True) or {}
    for field in ("name", "start_iso", "duration", "client_id", "description"):
        if field in data:
            p[field] = data[field]

    _save(projects)
    return jsonify({k: v for k, v in p.items() if k != "gps_track"})


@app.route("/api/projects/<pid>", methods=["DELETE"])
def api_delete(pid):
    projects = _load()
    p = next((p for p in projects if p["id"] == pid), None)
    if not p:
        abort(404)

    url = p.get("video_url", "")
    if url.startswith("/uploads/"):
        path = os.path.join(UPLOAD_DIR, os.path.basename(url))
        if os.path.exists(path):
            os.remove(path)

    _save([p for p in projects if p["id"] != pid])
    return "", 204


# ── Static / page routes ─────────────────────────────────────

@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename, conditional=True)


@app.route("/player/<pid>")
def serve_player(pid):
    return send_file(os.path.join(BASE_DIR, "player.html"))


@app.route("/")
def serve_dashboard():
    return send_file(os.path.join(BASE_DIR, "dashboard.html"))


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(BASE_DIR, filename, conditional=True)


# ── Main ─────────────────────────────────────────────────────

if __name__ == "__main__":
    print("─" * 52)
    print("  GeoTrack Viewer")
    print("  http://localhost:8080")
    print("─" * 52)
    app.run(host="0.0.0.0", port=8080, debug=False, threaded=True)
