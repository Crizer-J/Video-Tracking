#!/usr/bin/env python3
"""
HTTP server with byte-range (206 Partial Content) support.
Required for video seeking in the browser.
"""

import os
import sys
import http.server
import socketserver

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
DIR  = os.path.dirname(os.path.abspath(__file__))

class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler extended with Range request support."""

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()

        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        fs   = os.fstat(f.fileno())
        size = fs.st_size

        range_header = self.headers.get("Range")
        if not range_header:
            # Regular full-file response
            self.send_response(200)
            self.send_header("Content-type",   self.guess_type(path))
            self.send_header("Content-Length", str(size))
            self.send_header("Accept-Ranges",  "bytes")
            self.end_headers()
            return f

        # Parse "bytes=start-end"
        try:
            ranges = range_header.strip().replace("bytes=", "")
            start_str, end_str = ranges.split("-")
            start = int(start_str) if start_str else 0
            end   = int(end_str)   if end_str   else size - 1
        except (ValueError, AttributeError):
            self.send_error(400, "Invalid Range header")
            f.close()
            return None

        if start > end or start >= size:
            self.send_error(416, "Requested Range Not Satisfiable")
            self.send_header("Content-Range", f"bytes */{size}")
            f.close()
            return None

        end = min(end, size - 1)
        chunk_size = end - start + 1

        f.seek(start)
        self.send_response(206)
        self.send_header("Content-type",   self.guess_type(path))
        self.send_header("Content-Range",  f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(chunk_size))
        self.send_header("Accept-Ranges",  "bytes")
        self.end_headers()
        return f

    def log_message(self, fmt, *args):
        # Suppress per-request noise; only show startup message
        pass


os.chdir(DIR)
print("──────────────────────────────────────────")
print("  DJI Geo Track Viewer  (range-capable)")
print(f"  Serving: {DIR}")
print(f"  URL:     http://localhost:{PORT}")
print("──────────────────────────────────────────")
print("  Press Ctrl+C to stop\n")

with socketserver.TCPServer(("", PORT), RangeHTTPRequestHandler) as httpd:
    httpd.allow_reuse_address = True
    httpd.serve_forever()
