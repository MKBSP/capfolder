// F-10: talk to a local model server (Ollama :11434, LM Studio :1234) from Rust, because the webview's fetch is
// subject to CORS and those servers don't allow the app's origin by default. Only these two ports on 127.0.0.1.
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};

const PORTS: [u16; 2] = [11434, 1234];
const MAX_RESPONSE: usize = 8 * 1024 * 1024;

#[derive(serde::Serialize)]
pub struct LocalResponse {
    status: u16,
    body: String,
}

fn request(port: u16, method: &str, path: &str, body: Option<&str>, timeout: Duration) -> Result<LocalResponse, String> {
    if !PORTS.contains(&port) {
        return Err("only local AI ports are allowed".into());
    }
    if !path.starts_with('/') || path.contains(['\r', '\n', ' ']) {
        return Err("bad path".into());
    }
    send(port, method, path, body, timeout)
}

fn send(port: u16, method: &str, path: &str, body: Option<&str>, timeout: Duration) -> Result<LocalResponse, String> {
    let method = if method == "POST" { "POST" } else { "GET" };
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_secs(2)).map_err(|e| e.to_string())?;
    s.set_write_timeout(Some(Duration::from_secs(10))).map_err(|e| e.to_string())?;
    let body = body.unwrap_or("");
    // HTTP/1.0: the server answers with a plain body and closes, so no chunked decoding is needed
    let head = format!(
        "{method} {path} HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        body.len()
    );
    s.write_all(head.as_bytes()).and_then(|_| s.write_all(body.as_bytes())).map_err(|e| e.to_string())?;
    // one deadline for the whole answer and a size cap, so a slow or chatty local server can't hold a thread forever
    let deadline = Instant::now() + timeout;
    let mut raw = Vec::new();
    let mut buf = [0u8; 16 * 1024];
    loop {
        let left = deadline.checked_duration_since(Instant::now()).ok_or("the local AI took too long")?;
        let _ = s.set_read_timeout(Some(left.max(Duration::from_millis(1)))); // macOS refuses once the peer closed; the read then ends
        let n = s.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        raw.extend_from_slice(&buf[..n]);
        if raw.len() > MAX_RESPONSE {
            return Err("the local AI's answer is too large".into());
        }
    }
    let text = String::from_utf8_lossy(&raw);
    let (head, body) = text.split_once("\r\n\r\n").ok_or("no response")?;
    let status = head.split(' ').nth(1).and_then(|c| c.parse().ok()).ok_or("bad status line")?;
    Ok(LocalResponse { status, body: body.to_string() })
}

#[tauri::command]
pub async fn local_ai(port: u16, method: String, path: String, body: Option<String>, timeout_ms: u64) -> Result<LocalResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        request(port, &method, &path, body.as_deref(), Duration::from_millis(timeout_ms.clamp(1000, 300_000)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Shutdown, TcpListener};

    /// Replies, then reads whatever the client still sends before closing: closing with unread input makes the OS
    /// send a reset, which the client can see before it has read the reply (flaky on macOS CI).
    fn answer(mut c: TcpStream, reply: &[u8]) {
        let mut buf = [0u8; 1024];
        let _ = c.read(&mut buf);
        let _ = c.write_all(reply);
        let _ = c.shutdown(Shutdown::Write);
        let _ = c.read_to_end(&mut Vec::new());
    }

    #[test]
    fn refuses_other_ports_and_bad_paths() {
        assert!(request(8787, "GET", "/", None, Duration::from_secs(1)).is_err());
        assert!(request(11434, "GET", "/x HTTP/1.1\r\nHost: evil", None, Duration::from_secs(1)).is_err());
    }

    fn serve(reply: Vec<u8>) -> u16 {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (c, _) = l.accept().unwrap();
            answer(c, &reply);
        });
        port
    }

    #[test]
    fn refuses_huge_answers() {
        let mut reply = b"HTTP/1.0 200 OK\r\n\r\n".to_vec();
        reply.resize(MAX_RESPONSE + 1024, b'x');
        assert!(send(serve(reply), "GET", "/", None, Duration::from_secs(5)).is_err());
    }

    #[test]
    fn reads_status_and_body() {
        // a fake server on a free port, then the same parsing the real call uses
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (c, _) = l.accept().unwrap();
            answer(c, b"HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n{\"models\":[]}");
        });
        let r = send(port, "POST", "/api/chat", Some("{}"), Duration::from_secs(2)).unwrap();
        assert_eq!((r.status, r.body.as_str()), (200, "{\"models\":[]}"));
    }
}
