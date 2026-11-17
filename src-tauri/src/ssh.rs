//! SSH только к адресу, который передал UI, и только фиксированными командами.
//! Свободный ввод есть лишь у PTY-консоли. Пароль и ключ в ошибки не попадают.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use russh::client::{self, AuthResult, Handle};
use russh::keys::{decode_secret_key, HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::ChannelMsg;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex as AsyncMutex;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(12);
const EXEC_CAP: usize = 256_000;
const SFTP_CAP: usize = 8 * 1024 * 1024;
const LIST_CAP: usize = 500;

struct SeenKey {
    fingerprint: Mutex<Option<String>>,
    expected: Option<String>,
}

struct SshHandler {
    seen: Arc<SeenKey>,
}

impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let fingerprint = fingerprint_of(server_public_key);
        if let Ok(mut slot) = self.seen.fingerprint.lock() {
            *slot = Some(fingerprint.clone());
        }
        Ok(self.seen.expected.as_ref() == Some(&fingerprint))
    }
}

#[derive(Clone, serde::Deserialize)]
pub struct SshAuth {
    host: String,
    port: u16,
    user: String,
    auth: String,
    material: String,
    fingerprint: String,
}

#[derive(Serialize)]
pub struct SshProbe {
    fingerprint: String,
    accepted: bool,
}

#[derive(Serialize)]
pub struct MetricsOut {
    cpu: f64,
    ram: f64,
    disk: f64,
    rx_bytes: u64,
    tx_bytes: u64,
    uptime_sec: u64,
}

#[derive(Serialize)]
pub struct ServiceRow {
    unit: String,
    active: String,
}

#[derive(Serialize)]
pub struct FileRow {
    name: String,
    dir: bool,
    size: u64,
}

struct PtyLive {
    _session: Handle<SshHandler>,
    write: russh::ChannelWriteHalf<client::Msg>,
}

pub struct PtyHub {
    sessions: AsyncMutex<HashMap<String, PtyLive>>,
}

impl PtyHub {
    pub fn new() -> Self {
        Self {
            sessions: AsyncMutex::new(HashMap::new()),
        }
    }
}

fn clean_host(raw: &str) -> Result<String, String> {
    let host = raw.trim();
    if host.is_empty() || host.len() > 253 {
        return Err("Некорректный адрес SSH".into());
    }
    if host.contains([' ', '/', '\\', '@', '?', '#']) || host.contains("..") {
        return Err("Некорректный адрес SSH".into());
    }
    Ok(host.to_string())
}

fn clean_user(raw: &str) -> Result<String, String> {
    let user = raw.trim();
    let ok = user.len() <= 32
        && user
            .chars()
            .next()
            .is_some_and(|ch| ch == '_' || ch.is_ascii_lowercase())
        && user
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' || ch == '-');
    if !ok {
        return Err("Некорректный пользователь SSH".into());
    }
    Ok(user.to_string())
}

fn b64_nopad(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i + 3 <= bytes.len() {
        let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8) | bytes[i + 2] as u32;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(TABLE[((n >> 6) & 63) as usize] as char);
        out.push(TABLE[(n & 63) as usize] as char);
        i += 3;
    }
    if i < bytes.len() {
        let mut n = (bytes[i] as u32) << 16;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        if i + 1 < bytes.len() {
            n |= (bytes[i + 1] as u32) << 8;
            out.push(TABLE[((n >> 12) & 63) as usize] as char);
            out.push(TABLE[((n >> 6) & 63) as usize] as char);
        } else {
            out.push(TABLE[((n >> 12) & 63) as usize] as char);
        }
    }
    out
}

fn fingerprint_of(key: &PublicKeyOrCertificate) -> String {
    let digest = match key {
        PublicKeyOrCertificate::PublicKey { key, .. } => key.fingerprint(HashAlg::Sha256),
        PublicKeyOrCertificate::Certificate(cert) => cert.public_key().fingerprint(HashAlg::Sha256),
    };
    format!("SHA256:{}", b64_nopad(digest.as_bytes()))
}

fn posix_path(raw: &str) -> Result<String, String> {
    let path = raw.trim();
    if path.is_empty() || path.len() > 240 || !path.starts_with('/') || path.contains('\\') {
        return Err("Некорректный путь".into());
    }
    if path.chars().any(|ch| ch.is_control() || ch.is_whitespace()) {
        return Err("Некорректный путь".into());
    }
    let mut stack: Vec<&str> = Vec::new();
    for part in path.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            stack.pop();
            continue;
        }
        stack.push(part);
    }
    if stack.is_empty() {
        return Ok("/".into());
    }
    Ok(format!("/{}", stack.join("/")))
}

async fn open_session(auth: &SshAuth, expect: Option<String>) -> Result<Handle<SshHandler>, String> {
    let host = clean_host(&auth.host)?;
    let user = clean_user(&auth.user)?;
    if auth.port == 0 {
        return Err("Некорректный порт SSH".into());
    }
    let seen = Arc::new(SeenKey {
        fingerprint: Mutex::new(None),
        expected: expect,
    });
    let handler = SshHandler { seen: seen.clone() };
    let mut config = client::Config::default();
    config.inactivity_timeout = Some(Duration::from_secs(600));
    let config = Arc::new(config);
    let connect = client::connect(config, (host.as_str(), auth.port), handler);
    let mut session = tokio::time::timeout(CONNECT_TIMEOUT, connect)
        .await
        .map_err(|_| "SSH не ответил вовремя".to_string())?
        .map_err(|_| "SSH отклонил ключ хоста или соединение".to_string())?;
    let authed = match auth.auth.as_str() {
        "password" => session
            .authenticate_password(user, auth.material.clone())
            .await
            .map_err(|_| "SSH не принял пароль".to_string())?,
        "key" => {
            let key = decode_secret_key(&auth.material, None).map_err(|_| {
                "Не удалось прочитать ключ. Снимите passphrase и вставьте PEM".to_string()
            })?;
            let wrapped = PrivateKeyWithHashAlg::new(Arc::new(key), Some(HashAlg::Sha256));
            session
                .authenticate_publickey(user, wrapped)
                .await
                .map_err(|_| "SSH не принял ключ".to_string())?
        }
        _ => return Err("ssh.auth: key или password".into()),
    };
    if !matches!(authed, AuthResult::Success) {
        return Err("SSH не пустил с этими данными".into());
    }
    Ok(session)
}

async fn exec_fixed(session: &Handle<SshHandler>, command: &str) -> Result<String, String> {
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|_| "Не удалось открыть канал SSH".to_string())?;
    channel
        .exec(false, command.as_bytes().to_vec())
        .await
        .map_err(|_| "Команда SSH отклонена".to_string())?;
    let mut stdout = Vec::new();
    loop {
        let Some(msg) = channel.wait().await else {
            break;
        };
        match msg {
            ChannelMsg::Data { data } => {
                if stdout.len() < EXEC_CAP {
                    let room = EXEC_CAP - stdout.len();
                    let take = room.min(data.len());
                    stdout.extend_from_slice(&data[..take]);
                }
            }
            ChannelMsg::Eof | ChannelMsg::Close | ChannelMsg::ExitStatus { .. } => {
                if matches!(msg, ChannelMsg::ExitStatus { .. }) {
                    continue;
                }
                break;
            }
            _ => {}
        }
    }
    let _ = channel.close().await;
    String::from_utf8(stdout).map_err(|_| "Ответ SSH не в UTF-8".to_string())
}

fn parse_cpu(first: &str, second: &str) -> Option<f64> {
    fn line(text: &str) -> Option<Vec<u64>> {
        let raw = text.lines().find(|line| line.starts_with("cpu "))?;
        let nums: Vec<u64> = raw
            .split_whitespace()
            .skip(1)
            .filter_map(|part| part.parse().ok())
            .collect();
        if nums.len() < 4 { None } else { Some(nums) }
    }
    let a = line(first)?;
    let b = line(second)?;
    let total_a: u64 = a.iter().sum();
    let total_b: u64 = b.iter().sum();
    let idle_a = a.get(3).copied().unwrap_or(0);
    let idle_b = b.get(3).copied().unwrap_or(0);
    let total = total_b.saturating_sub(total_a);
    if total == 0 {
        return Some(0.0);
    }
    let idle = idle_b.saturating_sub(idle_a);
    Some((total.saturating_sub(idle)) as f64 / total as f64)
}

fn parse_ram(text: &str) -> Option<f64> {
    let mut total = None;
    let mut available = None;
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("MemTotal:") {
            total = rest.split_whitespace().next()?.parse::<f64>().ok();
        }
        if let Some(rest) = line.strip_prefix("MemAvailable:") {
            available = rest.split_whitespace().next()?.parse::<f64>().ok();
        }
    }
    let total = total?;
    let available = available?;
    if total <= 0.0 {
        return None;
    }
    Some(((total - available) / total).clamp(0.0, 1.0))
}

fn parse_disk(text: &str) -> Option<f64> {
    for line in text.lines().skip(1) {
        let mut parts = line.split_whitespace();
        let mut cols = Vec::new();
        for part in parts.by_ref() {
            cols.push(part);
        }
        if cols.len() < 6 || cols.last() != Some(&"/") {
            continue;
        }
        let used: f64 = cols[2].parse().ok()?;
        let avail: f64 = cols[3].parse().ok()?;
        let sum = used + avail;
        if sum <= 0.0 {
            return Some(0.0);
        }
        return Some((used / sum).clamp(0.0, 1.0));
    }
    None
}

fn parse_net(text: &str) -> (u64, u64) {
    let mut rx = 0u64;
    let mut tx = 0u64;
    for line in text.lines().skip(2) {
        let Some((name, rest)) = line.split_once(':') else { continue };
        if name.trim() == "lo" {
            continue;
        }
        let cols: Vec<&str> = rest.split_whitespace().collect();
        if cols.len() < 9 {
            continue;
        }
        rx = rx.saturating_add(cols[0].parse().unwrap_or(0));
        tx = tx.saturating_add(cols[8].parse().unwrap_or(0));
    }
    (rx, tx)
}

fn parse_uptime(text: &str) -> u64 {
    text.split_whitespace()
        .next()
        .and_then(|part| part.parse::<f64>().ok())
        .map(|secs| secs as u64)
        .unwrap_or(0)
}

fn parse_services(text: &str) -> Vec<ServiceRow> {
    let mut rows = Vec::new();
    for line in text.lines() {
        if rows.len() >= 80 {
            break;
        }
        let mut parts = line.split_whitespace();
        let Some(unit) = parts.next() else { continue };
        let Some(active) = parts.nth(1) else { continue };
        if unit.len() > 80 || active.len() > 24 {
            continue;
        }
        rows.push(ServiceRow {
            unit: unit.to_string(),
            active: active.to_string(),
        });
    }
    rows
}

async fn authed(auth: SshAuth) -> Result<Handle<SshHandler>, String> {
    let fingerprint = auth.fingerprint.trim().to_string();
    if !fingerprint.starts_with("SHA256:") || fingerprint.len() > 128 {
        return Err("Сначала подтвердите отпечаток хоста".into());
    }
    open_session(&auth, Some(fingerprint)).await
}

#[tauri::command]
pub async fn ssh_probe(auth: SshAuth) -> Result<SshProbe, String> {
    let host = clean_host(&auth.host)?;
    let _user = clean_user(&auth.user)?;
    if auth.port == 0 {
        return Err("Некорректный порт SSH".into());
    }
    let seen = Arc::new(SeenKey {
        fingerprint: Mutex::new(None),
        expected: None,
    });
    let handler = SshHandler { seen: seen.clone() };
    let mut config = client::Config::default();
    config.inactivity_timeout = Some(Duration::from_secs(20));
    let connect = client::connect(Arc::new(config), (host.as_str(), auth.port), handler);
    let connected = tokio::time::timeout(CONNECT_TIMEOUT, connect).await;
    let fingerprint = seen
        .fingerprint
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
        .ok_or_else(|| "Не удалось получить ключ хоста".to_string())?;
    let accepted = auth.fingerprint.trim() == fingerprint && matches!(connected, Ok(Ok(_)));
    Ok(SshProbe { fingerprint, accepted })
}

#[tauri::command]
pub async fn ssh_metrics(auth: SshAuth) -> Result<MetricsOut, String> {
    let session = authed(auth).await?;
    let stat1 = exec_fixed(&session, "cat /proc/stat").await?;
    tokio::time::sleep(Duration::from_millis(250)).await;
    let stat2 = exec_fixed(&session, "cat /proc/stat").await?;
    let mem = exec_fixed(&session, "cat /proc/meminfo").await?;
    let disk = exec_fixed(&session, "df -P").await?;
    let net = exec_fixed(&session, "cat /proc/net/dev").await?;
    let uptime = exec_fixed(&session, "cat /proc/uptime").await?;
    let (rx_bytes, tx_bytes) = parse_net(&net);
    Ok(MetricsOut {
        cpu: parse_cpu(&stat1, &stat2).unwrap_or(0.0),
        ram: parse_ram(&mem).unwrap_or(0.0),
        disk: parse_disk(&disk).unwrap_or(0.0),
        rx_bytes,
        tx_bytes,
        uptime_sec: parse_uptime(&uptime),
    })
}

#[tauri::command]
pub async fn ssh_services(auth: SshAuth) -> Result<Vec<ServiceRow>, String> {
    let session = authed(auth).await?;
    let text = exec_fixed(
        &session,
        "systemctl list-units --type=service --no-pager --no-legend --plain",
    )
    .await?;
    Ok(parse_services(&text))
}

#[tauri::command]
pub async fn ssh_journal(auth: SshAuth) -> Result<Vec<String>, String> {
    let session = authed(auth).await?;
    let text = exec_fixed(&session, "journalctl -n 200 --no-pager -o short-iso").await?;
    Ok(text
        .lines()
        .take(200)
        .map(|line| line.chars().take(400).collect())
        .collect())
}

async fn sftp_session(auth: SshAuth) -> Result<russh_sftp::client::SftpSession, String> {
    let session = authed(auth).await?;
    let channel = session
        .channel_open_session()
        .await
        .map_err(|_| "Не удалось открыть SFTP".to_string())?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|_| "На хосте нет SFTP".to_string())?;
    let stream = channel.into_stream();
    russh_sftp::client::SftpSession::new(stream)
        .await
        .map_err(|_| "SFTP не открылся".to_string())
}

#[tauri::command]
pub async fn ssh_list_dir(auth: SshAuth, path: String) -> Result<Vec<FileRow>, String> {
    let path = posix_path(&path)?;
    let sftp = sftp_session(auth).await?;
    let dir = sftp
        .read_dir(&path)
        .await
        .map_err(|_| "Каталог не читается".to_string())?;
    let mut rows = Vec::new();
    for entry in dir {
        if rows.len() >= LIST_CAP {
            break;
        }
        let name = entry.file_name();
        if name == "." || name == ".." || name.contains('/') || name.contains('\0') {
            continue;
        }
        let meta = entry.metadata();
        rows.push(FileRow {
            name,
            dir: entry.file_type().is_dir(),
            size: meta.len(),
        });
    }
    rows.sort_by(|a, b| b.dir.cmp(&a.dir).then(a.name.cmp(&b.name)));
    Ok(rows)
}

#[tauri::command]
pub async fn ssh_read_file(auth: SshAuth, path: String) -> Result<String, String> {
    let path = posix_path(&path)?;
    let sftp = sftp_session(auth).await?;
    let buf = sftp
        .read(&path)
        .await
        .map_err(|_| "Файл не прочитался".to_string())?;
    if buf.len() > SFTP_CAP {
        return Err("Файл больше 8 МБ".into());
    }
    Ok(b64_nopad(&buf))
}

#[tauri::command]
pub async fn ssh_write_file(auth: SshAuth, path: String, bytes_b64: String) -> Result<(), String> {
    let path = posix_path(&path)?;
    let bytes = decode_b64(&bytes_b64)?;
    if bytes.len() > SFTP_CAP {
        return Err("Файл больше 8 МБ".into());
    }
    let sftp = sftp_session(auth).await?;
    sftp.write(&path, &bytes)
        .await
        .map_err(|_| "Файл не записался".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ssh_mkdir(auth: SshAuth, path: String) -> Result<(), String> {
    let path = posix_path(&path)?;
    let sftp = sftp_session(auth).await?;
    sftp.create_dir(&path)
        .await
        .map_err(|_| "Каталог не создался".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ssh_remove(auth: SshAuth, path: String, dir: bool) -> Result<(), String> {
    let path = posix_path(&path)?;
    if path == "/" {
        return Err("Корневой каталог не удаляется".into());
    }
    let sftp = sftp_session(auth).await?;
    if dir {
        sftp.remove_dir(&path)
            .await
            .map_err(|_| "Каталог не удалился".to_string())?;
    } else {
        sftp.remove_file(&path)
            .await
            .map_err(|_| "Файл не удалился".to_string())?;
    }
    Ok(())
}

fn decode_b64(raw: &str) -> Result<Vec<u8>, String> {
    if raw.len() > SFTP_CAP * 2 {
        return Err("Файл больше 8 МБ".into());
    }
    fn val(ch: u8) -> Option<u8> {
        match ch {
            b'A'..=b'Z' => Some(ch - b'A'),
            b'a'..=b'z' => Some(ch - b'a' + 26),
            b'0'..=b'9' => Some(ch - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let bytes = raw.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'=' {
            break;
        }
        let a = val(bytes[i]).ok_or_else(|| "Некорректные данные файла".to_string())?;
        let b = val(*bytes.get(i + 1).ok_or_else(|| "Некорректные данные файла".to_string())?)
            .ok_or_else(|| "Некорректные данные файла".to_string())?;
        out.push((a << 2) | (b >> 4));
        if i + 2 >= bytes.len() || bytes[i + 2] == b'=' {
            break;
        }
        let c = val(bytes[i + 2]).ok_or_else(|| "Некорректные данные файла".to_string())?;
        out.push((b << 4) | (c >> 2));
        if i + 3 >= bytes.len() || bytes[i + 3] == b'=' {
            break;
        }
        let d = val(bytes[i + 3]).ok_or_else(|| "Некорректные данные файла".to_string())?;
        out.push((c << 6) | d);
        i += 4;
    }
    Ok(out)
}

#[derive(Clone, serde::Deserialize)]
pub struct PtyOpen {
    auth: SshAuth,
    cols: u32,
    rows: u32,
}

#[tauri::command]
pub async fn ssh_pty_open(app: AppHandle, open: PtyOpen) -> Result<String, String> {
    let cols = open.cols.clamp(20, 400);
    let rows = open.rows.clamp(5, 200);
    let session = authed(open.auth).await?;
    let channel = session
        .channel_open_session()
        .await
        .map_err(|_| "Не удалось открыть консоль".to_string())?;
    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await
        .map_err(|_| "Хост не выдал терминал".to_string())?;
    channel
        .request_shell(false)
        .await
        .map_err(|_| "Хост не открыл оболочку".to_string())?;
    let (mut read, write) = channel.split();
    let id = format!("pty-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    let app_read = app.clone();
    let id_read = id.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let Some(msg) = read.wait().await else { break };
            match msg {
                ChannelMsg::Data { data } => {
                    let _ = app_read.emit(
                        "ssh-pty",
                        serde_json::json!({ "id": id_read, "kind": "data", "data": b64_nopad(&data) }),
                    );
                }
                ChannelMsg::Eof | ChannelMsg::Close => break,
                _ => {}
            }
        }
        let _ = app_read.emit(
            "ssh-pty",
            serde_json::json!({ "id": id_read, "kind": "exit" }),
        );
    });
    let hub = app.state::<PtyHub>();
    hub.sessions.lock().await.insert(
        id.clone(),
        PtyLive {
            _session: session,
            write,
        },
    );
    Ok(id)
}

#[tauri::command]
pub async fn ssh_pty_write(app: AppHandle, id: String, bytes_b64: String) -> Result<(), String> {
    let bytes = decode_b64(&bytes_b64)?;
    if bytes.len() > 64_000 {
        return Err("Слишком большой ввод".into());
    }
    let hub = app.state::<PtyHub>();
    let sessions = hub.sessions.lock().await;
    let live = sessions.get(&id).ok_or_else(|| "Консоль закрыта".to_string())?;
    live.write
        .data_bytes(bytes)
        .await
        .map_err(|_| "Консоль не приняла ввод".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ssh_pty_resize(app: AppHandle, id: String, cols: u32, rows: u32) -> Result<(), String> {
    let hub = app.state::<PtyHub>();
    let sessions = hub.sessions.lock().await;
    let live = sessions.get(&id).ok_or_else(|| "Консоль закрыта".to_string())?;
    live.write
        .window_change(cols.clamp(20, 400), rows.clamp(5, 200), 0, 0)
        .await
        .map_err(|_| "Размер терминала не применился".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ssh_pty_close(app: AppHandle, id: String) -> Result<(), String> {
    let hub = app.state::<PtyHub>();
    hub.sessions.lock().await.remove(&id);
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct ResticJob {
    auth: SshAuth,
    action: String,
    repo: String,
    password: String,
    paths: Vec<String>,
    snapshot: String,
    target: String,
    hour: u8,
}

fn shell_quote(path: &str) -> Result<String, String> {
    let path = posix_path(path)?;
    if path.contains('\'') {
        return Err("Некорректный путь".into());
    }
    Ok(format!("'{path}'"))
}

async fn exec_checked(session: &Handle<SshHandler>, command: &str) -> Result<String, String> {
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|_| "Не удалось открыть канал SSH".to_string())?;
    channel
        .exec(false, command.as_bytes().to_vec())
        .await
        .map_err(|_| "Команда SSH отклонена".to_string())?;
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut code = 0u32;
    loop {
        let Some(msg) = channel.wait().await else { break };
        match msg {
            ChannelMsg::Data { data } => stdout.extend_from_slice(&data),
            ChannelMsg::ExtendedData { data, .. } => stderr.extend_from_slice(&data),
            ChannelMsg::ExitStatus { exit_status } => code = exit_status,
            ChannelMsg::Eof | ChannelMsg::Close => break,
            _ => {}
        }
        if stdout.len() > EXEC_CAP {
            break;
        }
    }
    let _ = channel.close().await;
    if code != 0 {
        let text = String::from_utf8_lossy(&stderr);
        let line = text.lines().next().unwrap_or("restic завершился с ошибкой");
        return Err(line.chars().take(200).collect());
    }
    String::from_utf8(stdout).map_err(|_| "Ответ SSH не в UTF-8".to_string())
}

#[tauri::command]
pub async fn ssh_restic(job: ResticJob) -> Result<String, String> {
    if job.password.len() < 12 || job.password.len() > 128 || job.password.chars().any(|ch| ch.is_control()) {
        return Err("Пароль репозитория не подходит".into());
    }
    let repo_raw = posix_path(&job.repo)?;
    let repo = shell_quote(&repo_raw)?;
    let pass_raw = format!("{repo_raw}.password");
    let pass = shell_quote(&pass_raw)?;
    let sftp = sftp_session(job.auth.clone()).await?;
    sftp.write(&pass_raw, job.password.as_bytes())
        .await
        .map_err(|_| "Пароль на сервер не записался".to_string())?;
    let session = authed(job.auth).await?;
    let paths = job
        .paths
        .iter()
        .map(|path| shell_quote(path))
        .collect::<Result<Vec<_>, _>>()?;
    if job.action == "backup" && paths.is_empty() {
        return Err("Нечего копировать".into());
    }
    if job.action == "backup" {
        if exec_checked(&session, &format!("restic -r {repo} --password-file {pass} snapshots"))
            .await
            .is_err()
        {
            exec_checked(&session, &format!("restic -r {repo} --password-file {pass} init")).await?;
        }
    }
    let command = match job.action.as_str() {
        "snapshots" => format!("restic -r {repo} --password-file {pass} snapshots --json"),
        "backup" => format!("restic -r {repo} --password-file {pass} backup {}", paths.join(" ")),
        "restore" => {
            let snap = job.snapshot.trim();
            if snap.len() < 8 || !snap.chars().all(|ch| ch.is_ascii_hexdigit()) {
                return Err("Некорректный снимок".into());
            }
            let target = shell_quote(&job.target)?;
            format!("restic -r {repo} --password-file {pass} restore {snap} --target {target}")
        }
        "timer" => {
            if job.hour > 23 {
                return Err("Час запуска: 0–23".into());
            }
            let service = format!(
                "[Unit]\nDescription=LCC backup\n[Service]\nType=oneshot\nExecStart=/usr/bin/restic -r {repo} --password-file {pass} backup {}\n",
                paths.join(" ")
            );
            let timer = format!(
                "[Unit]\nDescription=LCC backup timer\n[Timer]\nOnCalendar=*-*-* {:02}:00:00\nPersistent=true\n[Install]\nWantedBy=timers.target\n",
                job.hour
            );
            sftp.write("/etc/systemd/system/lcc-backup.service", service.as_bytes())
                .await
                .map_err(|_| "Не удалось записать unit. Нужны права root".to_string())?;
            sftp.write("/etc/systemd/system/lcc-backup.timer", timer.as_bytes())
                .await
                .map_err(|_| "Не удалось записать timer".to_string())?;
            exec_checked(&session, "systemctl daemon-reload").await?;
            exec_checked(&session, "systemctl enable --now lcc-backup.timer").await?;
            return Ok("Таймер включён".into());
        }
        _ => return Err("Неизвестное действие бэкапа".into()),
    };
    exec_checked(&session, &command).await
}

#[derive(serde::Deserialize)]
pub struct TreeJob {
    auth: SshAuth,
    dest: String,
    paths: Vec<String>,
}

fn local_dest(raw: &str) -> Result<std::path::PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 260 || trimmed.contains("..") {
        return Err("Некорректная папка на этом компьютере".into());
    }
    Ok(std::path::PathBuf::from(trimmed))
}

async fn pull_tree(
    sftp: &russh_sftp::client::SftpSession,
    remote: &str,
    local: &std::path::Path,
    files: &mut usize,
    bytes: &mut usize,
) -> Result<(), String> {
    if *files > 2000 || *bytes > 512 * 1024 * 1024 {
        return Err("Копия больше лимита 2000 файлов или 512 МБ".into());
    }
    std::fs::create_dir_all(local).map_err(|_| "Папка на компьютере не создалась".to_string())?;
    let entries = sftp.read_dir(remote).await.map_err(|_| "Каталог не читается".to_string())?;
    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
            continue;
        }
        let remote_child = if remote == "/" {
            format!("/{name}")
        } else {
            format!("{remote}/{name}")
        };
        let local_child = local.join(&name);
        if entry.file_type().is_dir() {
            Box::pin(pull_tree(sftp, &remote_child, &local_child, files, bytes)).await?;
            continue;
        }
        let data = sftp.read(&remote_child).await.map_err(|_| "Файл не прочитался".to_string())?;
        *bytes += data.len();
        *files += 1;
        if *bytes > 512 * 1024 * 1024 {
            return Err("Копия больше 512 МБ".into());
        }
        if let Some(parent) = local_child.parent() {
            std::fs::create_dir_all(parent).map_err(|_| "Папка на компьютере не создалась".to_string())?;
        }
        std::fs::write(&local_child, data).map_err(|_| "Файл на компьютере не записался".to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_pull_tree(job: TreeJob) -> Result<String, String> {
    let dest = local_dest(&job.dest)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let root = dest.join(format!("lcc-copy-{stamp}"));
    let sftp = sftp_session(job.auth).await?;
    let mut files = 0usize;
    let mut bytes = 0usize;
    for path in &job.paths {
        let remote = posix_path(path)?;
        let name = remote.rsplit('/').next().unwrap_or("root");
        pull_tree(&sftp, &remote, &root.join(name), &mut files, &mut bytes).await?;
    }
    Ok(root.to_string_lossy().to_string())
}

fn push_tree(
    sftp_later: (),
    local: &std::path::Path,
    remote: &str,
    files: &mut usize,
    bytes: &mut usize,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let _ = sftp_later;
    let mut out = Vec::new();
    let entries = std::fs::read_dir(local).map_err(|_| "Локальная копия не читается".to_string())?;
    for entry in entries {
        let entry = entry.map_err(|_| "Локальная копия не читается".to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.contains('/') || name.contains('\\') || name == "." || name == ".." {
            continue;
        }
        let remote_child = if remote == "/" { format!("/{name}") } else { format!("{remote}/{name}") };
        if entry.path().is_dir() {
            out.extend(push_tree((), &entry.path(), &remote_child, files, bytes)?);
            continue;
        }
        let data = std::fs::read(entry.path()).map_err(|_| "Файл копии не читается".to_string())?;
        *bytes += data.len();
        *files += 1;
        if *files > 2000 || *bytes > 512 * 1024 * 1024 {
            return Err("Копия больше лимита".into());
        }
        out.push((remote_child, data));
    }
    Ok(out)
}

#[derive(serde::Deserialize)]
pub struct PushJob {
    auth: SshAuth,
    local_root: String,
    remote_root: String,
}

#[tauri::command]
pub async fn ssh_push_tree(job: PushJob) -> Result<(), String> {
    let local = local_dest(&job.local_root)?;
    let remote = posix_path(&job.remote_root)?;
    let mut files = 0usize;
    let mut bytes = 0usize;
    let batch = push_tree((), &local, &remote, &mut files, &mut bytes)?;
    let sftp = sftp_session(job.auth).await?;
    for (path, data) in batch {
        if let Some((dir, _)) = path.rsplit_once('/') {
            if !dir.is_empty() {
                let _ = sftp.create_dir(dir).await;
            }
        }
        sftp.write(&path, &data).await.map_err(|_| "Файл на сервер не записался".to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_delta_is_busy_over_total() {
        let a = "cpu  10 0 0 90 0 0 0 0\n";
        let b = "cpu  20 0 0 180 0 0 0 0\n";
        let load = parse_cpu(a, b).unwrap();
        assert!((load - 0.1).abs() < 0.001);
    }

    #[test]
    fn path_drops_dotdot() {
        assert_eq!(posix_path("/var/www/../etc").unwrap(), "/var/etc");
        assert_eq!(posix_path("/").unwrap(), "/");
        assert!(posix_path("relative").is_err());
    }
}
