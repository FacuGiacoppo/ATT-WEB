#!/usr/bin/env python3
"""
Servidor local para ESTUDIO-ATT.
Sirve todos los archivos con Cache-Control: no-cache
para que el browser siempre cargue la versión más nueva.
"""
import http.server
import os

PORT = int(os.environ.get("PORT", 3000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Silenciar logs de assets para no llenar la consola
        if any(x in args[0] for x in [".css", ".png", ".ico", ".woff"]):
            return
        super().log_message(format, *args)

if __name__ == "__main__":
    with http.server.HTTPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"\n  ✅ Servidor corriendo en http://localhost:{PORT}")
        print(f"  📁 Sirviendo: {DIRECTORY}")
        print(f"  🔄 Sin caché — siempre carga la versión más nueva\n")
        print(f"  Para detener: Ctrl+C\n")
        httpd.serve_forever()
