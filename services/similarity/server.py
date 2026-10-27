"""
HTTP front for the similarity service (ADR-0007). The model loads once at start; one request at a time.

  POST /score   body: a SimilarityInput (lib/analysis/contracts.ts)  ->  the SimilarityOutput JSON of
                similarity_service.py. A package the service cannot score still answers 200 with
                status "error" and a message in the body; only a body that is not JSON answers 400.
  GET /health   -> {"ok": true, "model": <bundle id>, "version": <service version>}

  python services/similarity/server.py      # 127.0.0.1, port $SIMILARITY_PORT (default 8765)

The app reaches it at SIMILARITY_URL=http://127.0.0.1:8765/score (.env.local). Local only: it binds
127.0.0.1 and has no authentication, so it must never be exposed beyond the machine.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from similarity_service import SERVICE_VERSION, SimilarityService  # noqa: E402

MAX_BODY = 64 * 1024 * 1024  # a whole set's keypoint file; a minute at 60 fps is about 6 MB


class Handler(BaseHTTPRequestHandler):
    service = None  # set once in main()

    def send_json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != "/health":
            return self.send_json(404, {"error": "not found"})
        self.send_json(200, {"ok": True, "model": self.service.bundle["id"], "version": SERVICE_VERSION})

    def do_POST(self):
        if self.path != "/score":
            return self.send_json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BODY:
            return self.send_json(400, {"error": f"body must be 1 to {MAX_BODY} bytes, got {length}"})
        try:
            target = json.loads(self.rfile.read(length))
        except ValueError as e:
            return self.send_json(400, {"error": f"body is not JSON: {e}"})
        self.send_json(200, self.service.process(target))  # never raises; the outcome is in "status"


def main():
    port = int(os.environ.get("SIMILARITY_PORT", "8765"))
    Handler.service = SimilarityService()
    print(f"similarity {SERVICE_VERSION}, model {Handler.service.bundle['id']}, on http://127.0.0.1:{port}", flush=True)
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
