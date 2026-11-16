//! Loopback HTTP/1.1 для локального API. Слушает только 127.0.0.1.
//! Bearer проверяется здесь; тело уходит в webview, где лежит ключ vault.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};

const BASE_PORT: u16 = 47331;
const PORT_SPAN: u16 = 10;
const MAX_HEADER: usize = 16 * 1024;
const MAX_BODY: usize = 65_536;
const READ_TIMEOUT: Duration = Duration::from_secs(5);
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);
const APP_TIMEOUT: Duration = Duration::from_secs(8);

struct Reply {
    status: u16,
    body: String,
}

struct Shared {
    stop: AtomicBool,
    generation: AtomicU64,
    port: AtomicU16,
    token: Mutex<String>,
    pending: Mutex<HashMap<String, Sender<Reply>>>,
}

pub struct LocalApi {
    shared: Arc<Shared>,
}

impl LocalApi {
    pub fn new() -> Self {
        Self {
            shared: Arc::new(Shared {
                stop: AtomicBool::new(true),
                generation: AtomicU64::new(0),
                port: AtomicU16::new(0),
                token: Mutex::new(String::new()),
                pending: Mutex::new(HashMap::new()),
            }),
        }
    }
}

fn ct_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() || a.is_empty() {
        return false;
    }
    let mut diff: u8 = 0;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

fn is_loopback(addr: SocketAddr) -> bool {
    match addr.ip() {
        IpAddr::V4(ip) => ip.is_loopback(),
        IpAddr::V6(ip) => ip.is_loopback(),
    }
}

#[derive(Clone, serde::Serialize)]
struct LocalApiEvent {
    id: String,
    method: String,
    path: String,
    query: String,
    body: String,
}

fn json_response(status: u16, body: &str) -> String {
    let reason = match status {
        200 => "OK",
        201 => "Created",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        _ => "OK",
    };
    format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n\r\n{body}",
        body.len()
    )
}

fn read_headers(stream: &mut TcpStream) -> Result<String, ()> {
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    while buf.len() < MAX_HEADER {
        let n = stream.read(&mut byte).map_err(|_| ())?;
        if n == 0 {
            break;
        }
        buf.push(byte[0]);
        if buf.ends_with(b"\r\n\r\n") {
            return String::from_utf8(buf).map_err(|_| ());
        }
    }
    Err(())
}

struct ParsedRequest {
    method: String,
    path: String,
    query: String,
    bearer: Option<String>,
    body: String,
}

fn header_value<'a>(headers: &'a str, name: &str) -> Option<&'a str> {
    for line in headers.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.eq_ignore_ascii_case(name) {
            return Some(value.trim());
        }
    }
    None
}

fn parse_request(stream: &mut TcpStream) -> Result<ParsedRequest, u16> {
    let raw = read_headers(stream).map_err(|_| 400u16)?;
    let mut lines = raw.split("\r\n");
    let request_line = lines.next().ok_or(400u16)?;
    let mut parts = request_line.split(' ');
    let method = parts.next().unwrap_or("").to_ascii_uppercase();
    let target = parts.next().unwrap_or("");
    let version = parts.next().unwrap_or("");
    if !matches!(method.as_str(), "GET" | "POST" | "PUT" | "PATCH" | "DELETE") {
        return Err(405);
    }
    if version != "HTTP/1.1" && version != "HTTP/1.0" {
        return Err(400);
    }
    if !target.starts_with("/v1") || target.contains("..") || target.contains('\\') {
        return Err(400);
    }
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path.contains('%') {
        return Err(400);
    }
    let headers = raw.split_once("\r\n").map(|(_, rest)| rest).unwrap_or("");
    if header_value(headers, "transfer-encoding").is_some() {
        return Err(400);
    }
    let len: usize = header_value(headers, "content-length")
        .unwrap_or("0")
        .parse()
        .map_err(|_| 400u16)?;
    if len > MAX_BODY {
        return Err(413);
    }
    let mut body_buf = vec![0u8; len];
    if len > 0 {
        stream.read_exact(&mut body_buf).map_err(|_| 400u16)?;
    }
    let body = String::from_utf8(body_buf).map_err(|_| 400u16)?;
    let bearer = header_value(headers, "authorization").and_then(|value| {
        let rest = value.strip_prefix("Bearer ").or_else(|| value.strip_prefix("bearer "))?;
        let token = rest.trim();
        if token.is_empty() || token.contains(' ') {
            None
        } else {
            Some(token.to_string())
        }
    });
    Ok(ParsedRequest {
        method,
        path: path.to_string(),
        query: query.to_string(),
        bearer,
        body,
    })
}

fn write_all(stream: &mut TcpStream, payload: &str) {
    let _ = stream.write_all(payload.as_bytes());
    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Both);
}

fn serve_connection(mut stream: TcpStream, app: &AppHandle, shared: &Shared) {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let _ = stream.set_write_timeout(Some(WRITE_TIMEOUT));
    let parsed = match parse_request(&mut stream) {
        Ok(req) => req,
        Err(status) => {
            write_all(
                &mut stream,
                &json_response(status, r#"{"error":"bad_request","message":"Некорректный HTTP-запрос"}"#),
            );
            return;
        }
    };

    let expected = shared.token.lock().map(|g| g.clone()).unwrap_or_default();
    let presented = parsed.bearer.unwrap_or_default();
    if !ct_eq(&expected, &presented) {
        write_all(
            &mut stream,
            &json_response(401, r#"{"error":"unauthorized","message":"Нужен заголовок Authorization: Bearer"}"#),
        );
        return;
    }

    let id = format!("d{}", shared.pending.lock().map(|g| g.len()).unwrap_or(0));
    // id должен быть уникальным даже при быстрых запросах
    let id = format!("{id}-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    let (tx, rx): (Sender<Reply>, Receiver<Reply>) = mpsc::channel();
    if let Ok(mut pending) = shared.pending.lock() {
        pending.insert(id.clone(), tx);
    }
    let event = LocalApiEvent {
        id: id.clone(),
        method: parsed.method,
        path: parsed.path,
        query: parsed.query,
        body: parsed.body,
    };
    if app.emit("lcc-local-api", event).is_err() {
        if let Ok(mut pending) = shared.pending.lock() {
            pending.remove(&id);
        }
        write_all(
            &mut stream,
            &json_response(503, r#"{"error":"unavailable","message":"Окно LCC недоступно"}"#),
        );
        return;
    }
    match rx.recv_timeout(APP_TIMEOUT) {
        Ok(reply) => {
            let status = if (100..600).contains(&reply.status) { reply.status } else { 500 };
            let body = if reply.body.len() > MAX_BODY {
                r#"{"error":"too_large","message":"Ответ слишком большой"}"#.to_string()
            } else if reply.body.is_empty() {
                "{}".to_string()
            } else {
                reply.body
            };
            write_all(&mut stream, &json_response(status, &body));
        }
        Err(_) => {
            if let Ok(mut pending) = shared.pending.lock() {
                pending.remove(&id);
            }
            write_all(
                &mut stream,
                &json_response(504, r#"{"error":"timeout","message":"LCC не ответил вовремя"}"#),
            );
        }
    }
}

fn accept_loop(listener: TcpListener, app: AppHandle, shared: Arc<Shared>, generation: u64) {
    for stream in listener.incoming() {
        if shared.stop.load(Ordering::SeqCst) || shared.generation.load(Ordering::SeqCst) != generation {
            break;
        }
        let Ok(stream) = stream else { continue };
        let Ok(addr) = stream.peer_addr() else { continue };
        if !is_loopback(addr) {
            continue;
        }
        serve_connection(stream, &app, &shared);
        if shared.stop.load(Ordering::SeqCst) || shared.generation.load(Ordering::SeqCst) != generation {
            break;
        }
    }
}

#[tauri::command]
pub fn local_api_start(app: AppHandle, state: State<'_, LocalApi>) -> Result<u16, String> {
    let port = state.shared.port.load(Ordering::SeqCst);
    if !state.shared.stop.load(Ordering::SeqCst) && port != 0 {
        return Ok(port);
    }
    let generation = state.shared.generation.fetch_add(1, Ordering::SeqCst) + 1;
    state.shared.stop.store(false, Ordering::SeqCst);
    for offset in 0..PORT_SPAN {
        let candidate = BASE_PORT + offset;
        let addr = SocketAddr::from(([127, 0, 0, 1], candidate));
        if let Ok(listener) = TcpListener::bind(addr) {
            state.shared.port.store(candidate, Ordering::SeqCst);
            let shared = Arc::clone(&state.shared);
            thread::Builder::new()
                .name("lcc-local-api".into())
                .spawn(move || accept_loop(listener, app, shared, generation))
                .map_err(|err| err.to_string())?;
            return Ok(candidate);
        }
    }
    state.shared.stop.store(true, Ordering::SeqCst);
    Err("Не удалось занять 127.0.0.1:47331–47340".into())
}

#[tauri::command]
pub fn local_api_stop(state: State<'_, LocalApi>) -> Result<(), String> {
    state.shared.generation.fetch_add(1, Ordering::SeqCst);
    state.shared.stop.store(true, Ordering::SeqCst);
    let port = state.shared.port.load(Ordering::SeqCst);
    state.shared.port.store(0, Ordering::SeqCst);
    if let Ok(mut pending) = state.shared.pending.lock() {
        pending.clear();
    }
    if port != 0 {
        let _ = TcpStream::connect_timeout(
            &SocketAddr::from(([127, 0, 0, 1], port)),
            Duration::from_millis(200),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn local_api_set_token(state: State<'_, LocalApi>, token: String) -> Result<(), String> {
    if token.len() > 200 || token.chars().any(|ch| ch.is_control() || ch.is_whitespace()) {
        return Err("Некорректный токен API".into());
    }
    if !token.is_empty() && !token.starts_with("lcc_") {
        return Err("Некорректный токен API".into());
    }
    let mut guard = state.shared.token.lock().map_err(|_| "lock")?;
    *guard = token;
    Ok(())
}

#[tauri::command]
pub fn local_api_respond(
    state: State<'_, LocalApi>,
    id: String,
    status: u16,
    body: String,
) -> Result<(), String> {
    if id.len() > 80 || body.len() > MAX_BODY {
        return Err("Некорректный ответ".into());
    }
    let mut pending = state.shared.pending.lock().map_err(|_| "lock")?;
    if let Some(tx) = pending.remove(&id) {
        let _ = tx.send(Reply { status, body });
    }
    Ok(())
}
