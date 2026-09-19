#!/usr/bin/env python3
"""Plain TCP forwarder: listen on LISTEN_PORT (all ifaces), forward each
connection to TARGET_HOST:TARGET_PORT. Used to work around an issue where
vLLM's listener binding doesn't reach external traffic via WSL2 mirrored
mode, but a standard-socket Python listener does."""

import socket
import sys
import threading

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8100
TARGET_HOST = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
TARGET_PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8101
BUF = 65536
TIMEOUT = 600  # 10 minutes idle timeout to prevent connection/thread leaks


def pipe(src, dst):
    try:
        while True:
            data = src.recv(BUF)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def handle(client):
    client.settimeout(TIMEOUT)
    try:
        upstream = socket.create_connection((TARGET_HOST, TARGET_PORT))
        upstream.settimeout(TIMEOUT)
    except OSError as e:
        print(f"upstream connect failed: {e}", flush=True)
        client.close()
        return
    t1 = threading.Thread(target=pipe, args=(client, upstream), daemon=True)
    t2 = threading.Thread(target=pipe, args=(upstream, client), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    client.close()
    upstream.close()


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((LISTEN_HOST, LISTEN_PORT))
    srv.listen(128)
    print(f"forwarder: {LISTEN_HOST}:{LISTEN_PORT} -> {TARGET_HOST}:{TARGET_PORT}", flush=True)
    while True:
        client, addr = srv.accept()
        threading.Thread(target=handle, args=(client,), daemon=True).start()


if __name__ == "__main__":
    main()
