//! Кнопка обновления файлов из git-клона alekseevich47/controlcenter.
//!
//! Никакого произвольного exe и никакой shell-строки: каждый вызов — это
//! `Command::new` с заранее заданными аргументами. Чужой origin, опасный
//! локальный gitconfig, грязное дерево и локальные коммиты останавливают
//! команду до merge.

use serde::Serialize;
use std::env;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const MAX_ASCENT: usize = 8;
const MAX_PACKAGE_BYTES: u64 = 1_048_576;
const QUERY_TIMEOUT: Duration = Duration::from_secs(15);
const FETCH_TIMEOUT: Duration = Duration::from_secs(45);
const MERGE_TIMEOUT: Duration = Duration::from_secs(30);
const NPM_TIMEOUT: Duration = Duration::from_secs(180);

const NOT_A_CLONE: &str = "Эта сборка запущена не из git-клона, обновление кнопкой доступно только для клона репозитория.";
const DIRTY: &str = "Есть несохранённые изменения, автообновление их не затрёт.";
const LOCAL_COMMITS: &str = "Есть локальные коммиты, fast-forward невозможен.";
const ALREADY: &str = "Репозиторий уже совпадает с origin/main";
const BAD_CONFIG: &str =
    "В локальной конфигурации git есть параметры, которые могут подменить команду. Автообновление остановлено.";
const READ_ORIGIN: &str = "Не удалось прочитать origin.";
const READ_PACKAGE: &str = "Не удалось прочитать package.json.";
const BAD_COMMIT: &str = "Не удалось определить коммит.";
const STATUS_FAILED: &str = "Не удалось проверить состояние репозитория.";
const FETCH_FAILED: &str = "Не удалось получить origin/main.";
const FETCH_TIMEOUT_MSG: &str = "Не удалось получить origin/main: превышено время ожидания.";
const MERGE_FAILED: &str = "Не удалось обновить файлы fast-forward.";
const MERGE_TIMEOUT_MSG: &str = "Обновление файлов прервано по таймауту.";
const GIT_TIMEOUT_MSG: &str = "Команда git превысила время ожидания.";
const GIT_SPAWN: &str = "Не удалось запустить git.";
const BUSY: &str = "Обновление уже выполняется.";
const ALLOWED_REPO: &str = "Обновление разрешено только для репозитория alekseevich47/controlcenter.";

const ALLOWED_ORIGINS: &[&str] = &[
    "https://github.com/alekseevich47/controlcenter",
    "https://github.com/alekseevich47/controlcenter.git",
    "git@github.com:alekseevich47/controlcenter.git",
    "ssh://git@github.com/alekseevich47/controlcenter.git",
];

/// Фиксированные `-c` на каждый git: хуки, fsmonitor, ssh, фильтр diff,
/// file/ext-протоколы и credential helper из конфига репозитория не исполняются.
const GIT_LOCKDOWN: &[&str] = &[
    "-c",
    "core.hooksPath=",
    "-c",
    "core.fsmonitor=",
    "-c",
    "core.sshCommand=ssh",
    "-c",
    "diff.external=",
    "-c",
    "protocol.file.allow=never",
    "-c",
    "protocol.ext.allow=never",
    "-c",
    "credential.helper=",
];

static UPDATE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateApplyResult {
    pub ok: bool,
    pub message: String,
    pub version: Option<String>,
}

#[derive(Debug)]
struct Captured {
    code: i32,
    stdout: String,
    truncated: bool,
    invalid_utf8: bool,
}

#[derive(Debug)]
enum ExecError {
    Spawn,
    Timeout,
    Wait,
    Failed,
}

trait Ops {
    fn git(
        &self,
        root: &Path,
        args: &'static [&'static str],
        timeout: Duration,
        capture_limit: Option<usize>,
    ) -> Result<Captured, ExecError>;

    fn npm(&self, root: &Path, timeout: Duration) -> Result<(), ExecError>;
}

struct RealOps;

#[cfg(unix)]
unsafe extern "C" {
    fn setpgid(pid: i32, pgid: i32) -> i32;
    fn kill(pid: i32, sig: i32) -> i32;
}

#[tauri::command]
pub fn apply_app_update() -> Result<UpdateApplyResult, String> {
    let _guard = lock_update()?;
    let root = find_repo_root().ok_or_else(|| clamp_message(NOT_A_CLONE.to_string()))?;
    apply_with(&root, &RealOps)
}

fn lock_update() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    match UPDATE_LOCK.try_lock() {
        Ok(guard) => Ok(guard),
        Err(std::sync::TryLockError::WouldBlock) => Err(BUSY.to_string()),
        Err(std::sync::TryLockError::Poisoned(poisoned)) => Ok(poisoned.into_inner()),
    }
}

fn apply_with(root: &Path, ops: &impl Ops) -> Result<UpdateApplyResult, String> {
    let outcome = apply_inner(root, ops);
    match outcome {
        Ok(mut result) => {
            result.message = clamp_message(result.message);
            Ok(result)
        }
        Err(message) => Err(clamp_message(message)),
    }
}

fn apply_inner(root: &Path, ops: &impl Ops) -> Result<UpdateApplyResult, String> {
    let remote = call_git(
        ops,
        root,
        &["remote", "get-url", "origin"],
        QUERY_TIMEOUT,
        Some(4_096),
    )?;
    if remote.code != 0 {
        return Err(READ_ORIGIN.to_string());
    }
    let url = if remote.invalid_utf8 || remote.truncated {
        ""
    } else {
        remote.stdout.trim()
    };
    if !is_allowed_origin(url) {
        return Err(remote_rejected(url));
    }

    let config = call_git(
        ops,
        root,
        &["config", "--local", "--list"],
        QUERY_TIMEOUT,
        Some(65_536),
    )?;
    if config.code != 0 || config.invalid_utf8 || config.truncated || !local_config_allowed(&config.stdout)
    {
        return Err(BAD_CONFIG.to_string());
    }

    let status = call_git(
        ops,
        root,
        &["status", "--porcelain"],
        QUERY_TIMEOUT,
        Some(65_536),
    )?;
    if status.code != 0 {
        return Err(STATUS_FAILED.to_string());
    }
    if status.invalid_utf8 || status.truncated || !status.stdout.trim().is_empty() {
        return Err(DIRTY.to_string());
    }

    let fetch = call_git(
        ops,
        root,
        &["fetch", "--prune", "origin", "main"],
        FETCH_TIMEOUT,
        None,
    )?;
    if fetch.code != 0 {
        return Err(FETCH_FAILED.to_string());
    }

    let head = read_commit(ops, root, &["rev-parse", "HEAD"])?;
    let upstream = read_commit(ops, root, &["rev-parse", "origin/main"])?;
    if head == upstream {
        return Ok(UpdateApplyResult {
            ok: true,
            message: ALREADY.to_string(),
            version: read_version(root)?,
        });
    }

    let ancestor = call_git(
        ops,
        root,
        &["merge-base", "--is-ancestor", "HEAD", "origin/main"],
        QUERY_TIMEOUT,
        None,
    )?;
    if ancestor.code != 0 {
        return Err(LOCAL_COMMITS.to_string());
    }

    let merged = call_git(
        ops,
        root,
        &["merge", "--ff-only", "origin/main"],
        MERGE_TIMEOUT,
        None,
    )?;
    if merged.code != 0 {
        return Err(MERGE_FAILED.to_string());
    }

    let diff = call_git(
        ops,
        root,
        &["diff", "--name-only", "HEAD@{1}", "HEAD"],
        QUERY_TIMEOUT,
        Some(1_048_576),
    )?;
    let need_npm =
        diff.code != 0 || diff.invalid_utf8 || diff.truncated || diff_needs_npm(&diff.stdout);
    if need_npm {
        if let Err(error) = ops.npm(root, NPM_TIMEOUT) {
            return Ok(UpdateApplyResult {
                ok: false,
                message: npm_failure_message(error),
                version: read_version(root).ok().flatten(),
            });
        }
    }

    let version = read_version(root)?;
    let message = match &version {
        Some(version) => updated_message(version),
        None => "Файлы обновлены. Закройте LCC и снова запустите npm run desktop.".to_string(),
    };
    Ok(UpdateApplyResult {
        ok: true,
        message,
        version,
    })
}

fn call_git(
    ops: &impl Ops,
    root: &Path,
    args: &'static [&'static str],
    timeout: Duration,
    capture_limit: Option<usize>,
) -> Result<Captured, String> {
    ops.git(root, args, timeout, capture_limit)
        .map_err(|error| git_exec_message(args, error))
}

fn git_exec_message(args: &[&str], error: ExecError) -> String {
    match error {
        ExecError::Timeout => match args.first().copied() {
            Some("fetch") => FETCH_TIMEOUT_MSG.to_string(),
            Some("merge") => MERGE_TIMEOUT_MSG.to_string(),
            _ => GIT_TIMEOUT_MSG.to_string(),
        },
        ExecError::Spawn | ExecError::Wait | ExecError::Failed => GIT_SPAWN.to_string(),
    }
}

fn npm_failure_message(error: ExecError) -> String {
    match error {
        ExecError::Timeout => {
            "Файлы уже обновлены, но npm install превысил время ожидания. Запустите npm install и снова откройте приложение."
                .to_string()
        }
        ExecError::Spawn | ExecError::Wait | ExecError::Failed => {
            "Файлы уже обновлены, но npm install не завершился. Запустите npm install и снова откройте приложение."
                .to_string()
        }
    }
}

fn read_commit(ops: &impl Ops, root: &Path, args: &'static [&'static str]) -> Result<String, String> {
    let captured = call_git(ops, root, args, QUERY_TIMEOUT, Some(128))?;
    if captured.code != 0 || captured.invalid_utf8 || captured.truncated {
        return Err(BAD_COMMIT.to_string());
    }
    let hash = captured.stdout.trim();
    if is_commit_hash(hash) {
        Ok(hash.to_string())
    } else {
        Err(BAD_COMMIT.to_string())
    }
}

fn updated_message(version: &str) -> String {
    format!("Файлы обновлены до v{version}. Закройте LCC и снова запустите npm run desktop.")
}

fn find_repo_root() -> Option<PathBuf> {
    find_root_from(&candidate_starts())
}

fn candidate_starts() -> Vec<PathBuf> {
    let mut starts = Vec::new();
    if let Ok(cwd) = env::current_dir() {
        starts.push(cwd);
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let parent = parent.to_path_buf();
            if !starts.iter().any(|have| have == &parent) {
                starts.push(parent);
            }
        }
    }
    starts
}

/// Стартовый каталог и не больше восьми подъёмов к родителю.
fn find_root_from(starts: &[PathBuf]) -> Option<PathBuf> {
    for start in starts {
        let mut dir = start.clone();
        for level in 0..=MAX_ASCENT {
            if is_repo_root(&dir) {
                return Some(dir);
            }
            if level == MAX_ASCENT || !dir.pop() {
                break;
            }
        }
    }
    None
}

fn is_repo_root(dir: &Path) -> bool {
    let git_meta = match fs::symlink_metadata(dir.join(".git")) {
        Ok(meta) => meta,
        Err(_) => return false,
    };
    let kind = git_meta.file_type();
    if kind.is_symlink() || !(kind.is_dir() || kind.is_file()) {
        return false;
    }
    match read_package(dir) {
        Some(value) => package_name(&value) == Some("controlcenter"),
        None => false,
    }
}

fn read_package(dir: &Path) -> Option<serde_json::Value> {
    let path = dir.join("package.json");
    let meta = fs::symlink_metadata(&path).ok()?;
    if !meta.file_type().is_file() || meta.len() > MAX_PACKAGE_BYTES {
        return None;
    }
    let file = File::open(&path).ok()?;
    let mut buf = Vec::new();
    file.take(MAX_PACKAGE_BYTES + 1).read_to_end(&mut buf).ok()?;
    parse_package(&buf)
}

fn parse_package(bytes: &[u8]) -> Option<serde_json::Value> {
    if bytes.len() > MAX_PACKAGE_BYTES as usize {
        return None;
    }
    let text = std::str::from_utf8(bytes).ok()?;
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    if !value.is_object() {
        return None;
    }
    Some(value)
}

fn package_name(value: &serde_json::Value) -> Option<&str> {
    value.get("name").and_then(|name| name.as_str())
}

fn read_version(root: &Path) -> Result<Option<String>, String> {
    let value = read_package(root).ok_or_else(|| READ_PACKAGE.to_string())?;
    if package_name(&value) != Some("controlcenter") {
        return Err("package.json не принадлежит controlcenter.".to_string());
    }
    Ok(value
        .get("version")
        .and_then(|version| version.as_str())
        .and_then(sanitize_version))
}

fn sanitize_version(raw: &str) -> Option<String> {
    if raw.len() > 40 {
        return None;
    }
    let mut chars = raw.chars();
    if !chars.next().is_some_and(|ch| ch.is_ascii_digit()) {
        return None;
    }
    if raw
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '+' | '_'))
    {
        Some(raw.to_string())
    } else {
        None
    }
}

fn is_allowed_origin(url: &str) -> bool {
    ALLOWED_ORIGINS.iter().any(|allowed| *allowed == url)
}

fn remote_rejected(url: &str) -> String {
    if origin_safe_to_show(url) {
        format!("{ALLOWED_REPO} Сейчас origin: {url}")
    } else {
        ALLOWED_REPO.to_string()
    }
}

/// Показываем чужой origin только если в нём нет управляющих символов,
/// метасимволов shell и userinfo (токен в URL).
fn origin_safe_to_show(url: &str) -> bool {
    if url.is_empty() || url.len() > 200 || !url.is_ascii() {
        return false;
    }
    if url.chars().any(|ch| {
        ch.is_control()
            || matches!(
                ch,
                ';' | '|' | '&' | '`' | '$' | ' ' | '\t' | '\\' | '"' | '\'' | '<' | '>' | '('
                    | ')' | '{' | '}' | '!' | '*'
            )
    }) {
        return false;
    }
    userinfo_is_public(url)
}

fn userinfo_is_public(url: &str) -> bool {
    let Some(scheme_end) = url.find("://") else {
        return url.starts_with("git@github.com:");
    };
    let rest = &url[scheme_end + 3..];
    match rest.find('@') {
        None => true,
        Some(at) => &rest[..at] == "git",
    }
}

fn local_config_allowed(stdout: &str) -> bool {
    for line in stdout.split('\n') {
        let line = line.trim_end_matches('\r').trim();
        if line.is_empty() {
            continue;
        }
        let key = line.split_once('=').map(|(key, _)| key).unwrap_or(line);
        let key = key.trim().to_ascii_lowercase();
        if key.starts_with("filter.")
            || key.starts_with("url.")
            || key.starts_with("protocol.")
            || key.starts_with("include.")
            || key.starts_with("includeif.")
            || key.starts_with("credential.helper")
            || key == "core.sshcommand"
            || key == "core.fsmonitor"
            || key == "core.hookspath"
            || key == "diff.external"
        {
            return false;
        }
    }
    true
}

fn is_commit_hash(value: &str) -> bool {
    let len = value.len();
    (len == 40 || len == 64)
        && value
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

fn diff_needs_npm(stdout: &str) -> bool {
    stdout.split('\n').any(|line| {
        let line = line.trim_end_matches('\r').trim();
        let line = line
            .strip_prefix('"')
            .and_then(|rest| rest.strip_suffix('"'))
            .unwrap_or(line);
        let name = line.rsplit(['/', '\\']).next().unwrap_or(line);
        name == "package.json" || name == "package-lock.json"
    })
}

fn clamp_message(message: String) -> String {
    message
        .chars()
        .filter(|ch| *ch != '\n' && *ch != '\r')
        .take(400)
        .collect()
}

fn lockdown_argv(op: &'static [&'static str]) -> Vec<&'static str> {
    let mut args = Vec::with_capacity(GIT_LOCKDOWN.len() + op.len());
    args.extend_from_slice(GIT_LOCKDOWN);
    args.extend_from_slice(op);
    args
}

fn npm_program() -> &'static str {
    if cfg!(windows) { "npm.cmd" } else { "npm" }
}

fn empty_config_path() -> &'static str {
    if cfg!(windows) { "NUL" } else { "/dev/null" }
}

impl Ops for RealOps {
    fn git(
        &self,
        root: &Path,
        args: &'static [&'static str],
        timeout: Duration,
        capture_limit: Option<usize>,
    ) -> Result<Captured, ExecError> {
        let argv = lockdown_argv(args);
        run_program(root, "git", &argv, timeout, capture_limit)
    }

    fn npm(&self, root: &Path, timeout: Duration) -> Result<(), ExecError> {
        let program = npm_program();
        let captured = run_program(root, program, &["install"], timeout, None)?;
        if captured.code == 0 {
            Ok(())
        } else {
            Err(ExecError::Failed)
        }
    }
}

fn run_program(
    root: &Path,
    program: &str,
    args: &[&str],
    timeout: Duration,
    capture_limit: Option<usize>,
) -> Result<Captured, ExecError> {
    let mut cmd = Command::new(program);
    cmd.current_dir(root).args(args);
    match program {
        "git" => prepare_git(&mut cmd),
        "npm" | "npm.cmd" => prepare_npm(&mut cmd),
        _ => {
            cmd.stdin(Stdio::null());
        }
    }
    isolate_process_group(&mut cmd);
    if capture_limit.is_some() {
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    } else {
        cmd.stdout(Stdio::null()).stderr(Stdio::null());
    }

    let mut child = cmd.spawn().map_err(|_| ExecError::Spawn)?;
    let stdout_handle = child
        .stdout
        .take()
        .map(|pipe| read_pipe(pipe, capture_limit.unwrap_or(0)));
    let stderr_handle = child.stderr.take().map(|pipe| read_pipe(pipe, 65_536));

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if started.elapsed() >= timeout {
                    kill_child(&mut child);
                    let _ = child.wait();
                    join_pipes(stdout_handle, stderr_handle);
                    return Err(ExecError::Timeout);
                }
                thread::sleep(Duration::from_millis(200));
            }
            Err(_) => {
                kill_child(&mut child);
                let _ = child.wait();
                join_pipes(stdout_handle, stderr_handle);
                return Err(ExecError::Wait);
            }
        }
    };

    let (bytes, truncated) = match stdout_handle {
        Some(handle) => handle.join().map_err(|_| ExecError::Wait)?,
        None => (Vec::new(), false),
    };
    if let Some(handle) = stderr_handle {
        let _ = handle.join();
    }
    Ok(captured_from(status, bytes, truncated))
}

fn captured_from(status: ExitStatus, bytes: Vec<u8>, truncated: bool) -> Captured {
    let code = status.code().unwrap_or(1);
    match String::from_utf8(bytes) {
        Ok(stdout) => Captured {
            code,
            stdout,
            truncated,
            invalid_utf8: false,
        },
        Err(_) => Captured {
            code,
            stdout: String::new(),
            truncated,
            invalid_utf8: true,
        },
    }
}

fn read_pipe(mut pipe: impl Read + Send + 'static, max: usize) -> thread::JoinHandle<(Vec<u8>, bool)> {
    thread::spawn(move || {
        let mut stored = Vec::new();
        let mut buf = [0u8; 8192];
        let mut truncated = false;
        loop {
            match pipe.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if stored.len() < max {
                        let room = max - stored.len();
                        let take = n.min(room);
                        stored.extend_from_slice(&buf[..take]);
                        if take < n {
                            truncated = true;
                        }
                    } else if n > 0 {
                        truncated = true;
                    }
                }
                Err(err) if err.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
        (stored, truncated)
    })
}

fn join_pipes(
    stdout: Option<thread::JoinHandle<(Vec<u8>, bool)>>,
    stderr: Option<thread::JoinHandle<(Vec<u8>, bool)>>,
) {
    if let Some(handle) = stdout {
        let _ = handle.join();
    }
    if let Some(handle) = stderr {
        let _ = handle.join();
    }
}

fn prepare_git(cmd: &mut Command) {
    let empty = empty_config_path();
    cmd.stdin(Stdio::null())
        .env("GIT_CONFIG_GLOBAL", empty)
        .env("GIT_CONFIG_SYSTEM", empty)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_COUNT", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_MERGE_AUTOEDIT", "no")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_NAMESPACE")
        .env_remove("GIT_PREFIX")
        .env_remove("GIT_COMMON_DIR")
        .env_remove("GIT_OBJECT_DIRECTORY")
        .env_remove("GIT_ALTERNATE_OBJECT_DIRECTORIES")
        .env_remove("GIT_SSH_COMMAND")
        .env_remove("GIT_ASKPASS")
        .env_remove("SSH_ASKPASS")
        .env_remove("GIT_EXTERNAL_DIFF")
        .env_remove("GIT_EXEC_PATH");
}

fn prepare_npm(cmd: &mut Command) {
    cmd.stdin(Stdio::null())
        .env_remove("NODE_OPTIONS")
        .env_remove("npm_config_global")
        .env_remove("NPM_CONFIG_GLOBAL")
        .env_remove("npm_config_prefix")
        .env_remove("NPM_CONFIG_PREFIX")
        .env_remove("npm_config_script_shell")
        .env_remove("NPM_CONFIG_SCRIPT_SHELL");
}

#[cfg(unix)]
fn isolate_process_group(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    unsafe {
        cmd.pre_exec(|| {
            let _ = setpgid(0, 0);
            Ok(())
        });
    }
}

#[cfg(not(unix))]
fn isolate_process_group(_cmd: &mut Command) {}

fn kill_child(child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        if pid > 0 {
            unsafe {
                let _ = kill(-pid, 9);
            }
        }
    }
    let _ = child.kill();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::sync::MutexGuard;

    const HASH_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const HASH_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const OURS: &str = "https://github.com/alekseevich47/controlcenter.git";

    struct Script {
        git_calls: RefCell<Vec<(&'static [&'static str], Duration)>>,
        npm_calls: Cell<u32>,
        npm_timeout: Cell<Option<Duration>>,
        git_results: RefCell<Vec<Result<Captured, ExecError>>>,
        npm_result: RefCell<Option<Result<(), ExecError>>>,
    }

    impl Script {
        fn git_only(results: Vec<Result<Captured, ExecError>>) -> Self {
            Self {
                git_calls: RefCell::new(Vec::new()),
                npm_calls: Cell::new(0),
                npm_timeout: Cell::new(None),
                git_results: RefCell::new(results),
                npm_result: RefCell::new(None),
            }
        }
    }

    impl Ops for Script {
        fn git(
            &self,
            _root: &Path,
            args: &'static [&'static str],
            timeout: Duration,
            _capture_limit: Option<usize>,
        ) -> Result<Captured, ExecError> {
            self.git_calls.borrow_mut().push((args, timeout));
            self.git_results
                .borrow_mut()
                .drain(..1)
                .next()
                .expect("unexpected git call")
        }

        fn npm(&self, _root: &Path, timeout: Duration) -> Result<(), ExecError> {
            self.npm_calls.set(self.npm_calls.get() + 1);
            self.npm_timeout.set(Some(timeout));
            self.npm_result
                .borrow_mut()
                .take()
                .expect("unexpected npm call")
        }
    }

    fn ok_out(stdout: &str) -> Result<Captured, ExecError> {
        Ok(Captured {
            code: 0,
            stdout: stdout.to_string(),
            truncated: false,
            invalid_utf8: false,
        })
    }

    fn code_out(code: i32) -> Result<Captured, ExecError> {
        Ok(Captured {
            code,
            stdout: String::new(),
            truncated: false,
            invalid_utf8: false,
        })
    }

    fn hold_lock() -> MutexGuard<'static, ()> {
        UPDATE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn temp_dir() -> PathBuf {
        let dir = env::temp_dir().join(format!(
            "lcc-update-{}-{}",
            std::process::id(),
            unique_suffix()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn unique_suffix() -> u64 {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(1);
        NEXT.fetch_add(1, Ordering::Relaxed)
    }

    fn write_package(dir: &Path, version: &str) {
        fs::write(
            dir.join("package.json"),
            format!(r#"{{"name":"controlcenter","version":"{version}"}}"#),
        )
        .unwrap();
    }

    fn git_ok(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .current_dir(dir)
            .args(args)
            .stdin(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?}");
    }

    fn init_repo(origin: &str) -> PathBuf {
        let dir = temp_dir();
        git_ok(&dir, &["init", "-q", "-b", "main"]);
        git_ok(&dir, &["config", "user.email", "t@example.com"]);
        git_ok(&dir, &["config", "user.name", "test"]);
        write_package(&dir, "0.2.0");
        fs::write(dir.join("readme.txt"), "a\n").unwrap();
        git_ok(&dir, &["add", "."]);
        git_ok(&dir, &["commit", "-q", "-m", "init"]);
        git_ok(&dir, &["remote", "add", "origin", origin]);
        dir
    }

    fn head_of(dir: &Path) -> String {
        let output = Command::new("git")
            .current_dir(dir)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        assert!(output.status.success());
        String::from_utf8(output.stdout).unwrap().trim().to_string()
    }

    #[test]
    fn allows_only_exact_origins() {
        for origin in ALLOWED_ORIGINS {
            assert!(is_allowed_origin(origin));
        }
        assert!(!is_allowed_origin(
            "https://github.com/alekseevich47/controlcenter.git/"
        ));
        assert!(!is_allowed_origin(
            "https://github.com/alekseevich47/controlcenter.git "
        ));
        assert!(!is_allowed_origin(
            "https://GitHub.com/alekseevich47/controlcenter.git"
        ));
        assert!(!is_allowed_origin(
            "https://github.com/alekseevich47/controlcenter.git\nhttps://evil.example/x"
        ));
        assert!(!is_allowed_origin("file:///tmp/repo"));
        assert!(!is_allowed_origin("ext::sh"));
    }

    #[test]
    fn refusal_hides_metacharacters_and_credentials() {
        let nasty = "https://evil.example/a;b|c&d`e$f\nmore";
        let hidden = remote_rejected(nasty);
        assert_eq!(hidden, ALLOWED_REPO);
        assert!(!hidden.contains("evil"));
        assert!(!hidden.contains(';'));
        assert!(!hidden.contains('|'));
        assert!(!hidden.contains('&'));
        assert!(!hidden.contains('`'));
        assert!(!hidden.contains('$'));
        assert!(!hidden.contains('\n'));

        let token = "https://x-access-token:ghp_secret@github.com/other/repo.git";
        let hidden_token = remote_rejected(token);
        assert!(!hidden_token.contains("ghp_secret"));
        assert!(!hidden_token.contains('@'));

        let other = "https://github.com/other/controlcenter.git";
        let shown = remote_rejected(other);
        assert!(shown.contains(other));
        assert!(!shown.contains('\n'));
    }

    #[test]
    fn package_identity_and_version_are_strict() {
        let ok = parse_package(br#"{"name":"controlcenter","version":"0.2.0"}"#).unwrap();
        assert_eq!(package_name(&ok), Some("controlcenter"));
        assert_eq!(sanitize_version("0.2.0").as_deref(), Some("0.2.0"));
        assert_eq!(sanitize_version("1.0.0-beta.1").as_deref(), Some("1.0.0-beta.1"));

        let nested = parse_package(br#"{"name":"other","dependencies":{"controlcenter":"1.0.0"}}"#).unwrap();
        assert_ne!(package_name(&nested), Some("controlcenter"));
        assert!(parse_package(br#"["controlcenter"]"#).is_none());
        assert!(sanitize_version("1.0\n0").is_none());
        assert!(sanitize_version("$(id)").is_none());
        assert!(sanitize_version("v1.2.3").is_none());
    }

    #[test]
    fn diff_selects_manifests_only() {
        assert!(diff_needs_npm("package.json\n"));
        assert!(diff_needs_npm("src/app.ts\npackage-lock.json\n"));
        assert!(diff_needs_npm("\"package.json\"\n"));
        assert!(diff_needs_npm("nested/package.json\n"));
        assert!(!diff_needs_npm("src/App.tsx\n"));
        assert!(!diff_needs_npm("package.json.bak\n"));
        assert!(!diff_needs_npm("notpackage.json\n"));
    }

    #[test]
    fn commit_hash_is_full_lowercase_hex() {
        assert!(is_commit_hash(HASH_A));
        assert!(is_commit_hash(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ));
        assert!(!is_commit_hash(&HASH_A[..39]));
        assert!(!is_commit_hash(&format!("{HASH_A}\n{HASH_B}")));
        assert!(!is_commit_hash(&HASH_A.to_ascii_uppercase()));
    }

    #[test]
    fn local_config_denylist_ignores_ordinary_keys() {
        let ordinary = "\
core.repositoryformatversion=0
user.email=t@example.com
remote.origin.url=https://github.com/alekseevich47/controlcenter.git
remote.origin.fetch=+refs/heads/*:refs/remotes/origin/*
branch.main.remote=origin
";
        assert!(local_config_allowed(ordinary));
        assert!(!local_config_allowed(
            "url.https://evil.example/.insteadof=https://github.com/\n"
        ));
        assert!(!local_config_allowed("credential.helper=!echo pwned\n"));
        assert!(!local_config_allowed("filter.evil.smudge=cat\n"));
        assert!(!local_config_allowed("core.hooksPath=/tmp/hooks\n"));
        assert!(!local_config_allowed("include.path=/tmp/evil\n"));
    }

    #[test]
    fn lockdown_argv_is_static_and_does_not_rewrite_history() {
        let args = lockdown_argv(&["merge", "--ff-only", "origin/main"]);
        assert!(args.windows(2).any(|pair| pair == ["-c", "core.hooksPath="]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["-c", "protocol.file.allow=never"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["-c", "protocol.ext.allow=never"]));
        for forbidden in [
            "reset", "rebase", "clean", "push", "checkout", "--force", "-f", "sh", "bash", "cmd",
        ] {
            assert!(!args.contains(&forbidden), "{forbidden}");
        }
        assert!(args.ends_with(&["merge", "--ff-only", "origin/main"]));
        assert_eq!(npm_program(), if cfg!(windows) { "npm.cmd" } else { "npm" });
    }

    #[test]
    fn rejects_foreign_origin_before_any_mutation() {
        let root = temp_dir();
        write_package(&root, "0.2.0");
        let script = Script::git_only(vec![ok_out("https://evil.example/a;b$c\n")]);
        let err = apply_with(&root, &script).unwrap_err();
        assert_eq!(err, ALLOWED_REPO);
        assert!(!err.contains("evil"));
        assert!(!err.contains('$'));
        assert_eq!(script.git_calls.borrow().len(), 1);
        assert_eq!(script.git_calls.borrow()[0].0, &["remote", "get-url", "origin"]);
        assert_eq!(script.npm_calls.get(), 0);
    }

    #[test]
    fn shows_a_plain_wrong_github_origin() {
        let root = temp_dir();
        write_package(&root, "0.2.0");
        let script = Script::git_only(vec![ok_out(
            "https://github.com/other/controlcenter.git\n",
        )]);
        let err = apply_with(&root, &script).unwrap_err();
        assert!(err.contains("https://github.com/other/controlcenter.git"));
        assert!(!err.contains('\n'));
    }

    #[test]
    fn stops_on_dangerous_local_config_before_status() {
        let root = temp_dir();
        write_package(&root, "0.2.0");
        let script = Script::git_only(vec![
            ok_out(&format!("{OURS}\n")),
            ok_out("credential.helper=!echo pwned\n"),
        ]);
        let err = apply_with(&root, &script).unwrap_err();
        assert_eq!(err, BAD_CONFIG);
        assert_eq!(script.git_calls.borrow().len(), 2);
        assert_eq!(script.npm_calls.get(), 0);
    }

    #[test]
    fn dirty_tree_stops_before_fetch() {
        let root = temp_dir();
        write_package(&root, "0.2.0");
        let script = Script::git_only(vec![
            ok_out(&format!("{OURS}\n")),
            ok_out("user.email=t@example.com\n"),
            ok_out(" M src/main.rs\n"),
        ]);
        let err = apply_with(&root, &script).unwrap_err();
        assert_eq!(err, DIRTY);
        let calls = script.git_calls.borrow();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[2].0, &["status", "--porcelain"]);
        assert!(calls.iter().all(|(args, _)| args[0] != "fetch"));
        assert!(calls.iter().all(|(args, _)| args[0] != "merge"));
    }

    #[test]
    fn already_matching_head_does_not_merge() {
        let root = temp_dir();
        write_package(&root, "0.2.0");
        let script = Script::git_only(vec![
            ok_out(&format!("{OURS}\n")),
            ok_out("user.email=t@example.com\n"),
            ok_out(""),
            code_out(0),
            ok_out(&format!("{HASH_A}\n")),
            ok_out(&format!("{HASH_A}\n")),
        ]);
        let result = apply_with(&root, &script).unwrap();
        assert!(result.ok);
        assert_eq!(result.message, ALREADY);
        assert_eq!(result.version.as_deref(), Some("0.2.0"));
        let calls = script.git_calls.borrow();
        assert_eq!(calls[3].0, &["fetch", "--prune", "origin", "main"]);
        assert_eq!(calls[3].1, FETCH_TIMEOUT);
        assert!(calls.iter().all(|(args, _)| args[0] != "merge"));
        assert!(calls.iter().all(|(args, _)| args[0] != "merge-base"));
        assert_eq!(script.npm_calls.get(), 0);
    }

    #[test]
    fn local_commits_stop_before_merge() {
        let root = temp_dir();
        write_package(&root, "0.2.0");
        let script = Script::git_only(vec![
            ok_out(&format!("{OURS}\n")),
            ok_out("user.email=t@example.com\n"),
            ok_out(""),
            code_out(0),
            ok_out(&format!("{HASH_A}\n")),
            ok_out(&format!("{HASH_B}\n")),
            code_out(1),
        ]);
        let err = apply_with(&root, &script).unwrap_err();
        assert_eq!(err, LOCAL_COMMITS);
        let calls = script.git_calls.borrow();
        assert_eq!(
            calls.last().unwrap().0,
            &["merge-base", "--is-ancestor", "HEAD", "origin/main"]
        );
        assert!(calls.iter().all(|(args, _)| args[0] != "merge"));
        assert!(calls.iter().all(|(args, _)| args[0] != "reset"));
        assert!(calls.iter().all(|(args, _)| args[0] != "rebase"));
        assert_eq!(script.npm_calls.get(), 0);
    }

    #[test]
    fn fast_forward_runs_npm_only_when_manifests_change() {
        let root = temp_dir();
        write_package(&root, "0.3.0");
        let script = Script {
            npm_result: RefCell::new(Some(Ok(()))),
            ..Script::git_only(vec![
                ok_out(&format!("{OURS}\n")),
                ok_out("user.email=t@example.com\n"),
                ok_out(""),
                code_out(0),
                ok_out(&format!("{HASH_A}\n")),
                ok_out(&format!("{HASH_B}\n")),
                code_out(0),
                code_out(0),
                ok_out("src/App.tsx\npackage.json\n"),
            ])
        };
        let result = apply_with(&root, &script).unwrap();
        assert!(result.ok);
        assert_eq!(
            result.message,
            "Файлы обновлены до v0.3.0. Закройте LCC и снова запустите npm run desktop."
        );
        assert_eq!(result.version.as_deref(), Some("0.3.0"));
        let calls = script.git_calls.borrow();
        assert_eq!(calls[6].0, &["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
        assert_eq!(calls[7].0, &["merge", "--ff-only", "origin/main"]);
        assert_eq!(calls[7].1, MERGE_TIMEOUT);
        assert_eq!(calls[8].0, &["diff", "--name-only", "HEAD@{1}", "HEAD"]);
        assert_eq!(script.npm_calls.get(), 1);
        assert_eq!(script.npm_timeout.get(), Some(NPM_TIMEOUT));
        for (args, _) in calls.iter() {
            assert!(!args.contains(&"sh"));
            assert!(!args.contains(&"-c") || args[0] != "sh");
            assert!(!args.iter().any(|arg| arg.contains("package.json")));
        }
    }

    #[test]
    fn skips_npm_when_manifests_are_unchanged() {
        let root = temp_dir();
        write_package(&root, "0.2.0");
        let script = Script::git_only(vec![
            ok_out(&format!("{OURS}\n")),
            ok_out("user.email=t@example.com\n"),
            ok_out(""),
            code_out(0),
            ok_out(&format!("{HASH_A}\n")),
            ok_out(&format!("{HASH_B}\n")),
            code_out(0),
            code_out(0),
            ok_out("src/App.tsx\n"),
        ]);
        let result = apply_with(&root, &script).unwrap();
        assert!(result.ok);
        assert_eq!(script.npm_calls.get(), 0);
        assert!(result.message.contains("v0.2.0"));
    }

    #[test]
    fn fetch_stdout_is_not_returned_to_the_user() {
        let root = temp_dir();
        write_package(&root, "0.2.0");
        let script = Script::git_only(vec![
            ok_out(&format!("{OURS}\n")),
            ok_out("user.email=t@example.com\n"),
            ok_out(""),
            Ok(Captured {
                code: 1,
                stdout: "SECRET_FETCH_LOG /home/user/.ssh/id_rsa".to_string(),
                truncated: false,
                invalid_utf8: false,
            }),
        ]);
        let err = apply_with(&root, &script).unwrap_err();
        assert_eq!(err, FETCH_FAILED);
        assert!(!err.contains("SECRET"));
        assert!(!err.contains("id_rsa"));
    }

    #[test]
    fn root_search_stops_after_eight_ascents() {
        let tmp = temp_dir();
        let root = tmp.join("repo");
        fs::create_dir_all(&root).unwrap();
        write_package(&root, "1.2.3");
        fs::create_dir(root.join(".git")).unwrap();

        let mut deep = root.clone();
        for index in 0..8 {
            deep.push(format!("d{index}"));
        }
        fs::create_dir_all(&deep).unwrap();
        assert_eq!(find_root_from(&[deep.clone()]).as_ref(), Some(&root));

        let mut too_deep = deep;
        too_deep.push("too-far");
        fs::create_dir_all(&too_deep).unwrap();
        assert!(find_root_from(&[too_deep]).is_none());
    }

    #[test]
    fn root_search_rejects_symlinks_and_wrong_name() {
        let tmp = temp_dir();
        let root = tmp.join("repo");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("package.json"), r#"{"name":"other"}"#).unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        assert!(find_root_from(&[root.clone()]).is_none());

        #[cfg(unix)]
        {
            let linked = tmp.join("linked");
            fs::create_dir_all(&linked).unwrap();
            write_package(&linked, "1.0.0");
            std::os::unix::fs::symlink(root.join(".git"), linked.join(".git")).unwrap();
            assert!(find_root_from(&[linked]).is_none());
        }

        let file_git = tmp.join("worktree");
        fs::create_dir_all(&file_git).unwrap();
        write_package(&file_git, "1.0.0");
        fs::write(file_git.join(".git"), "gitdir: /nowhere\n").unwrap();
        assert_eq!(find_root_from(&[file_git.clone()]).as_ref(), Some(&file_git));
    }

    #[test]
    fn real_repo_with_foreign_origin_is_not_fetched() {
        let dir = init_repo("https://github.com/other/controlcenter.git");
        let before = head_of(&dir);
        let err = apply_with(&dir, &RealOps).unwrap_err();
        assert!(err.contains("https://github.com/other/controlcenter.git"));
        assert!(err.contains("alekseevich47/controlcenter"));
        assert!(!err.contains('\n'));
        assert_eq!(head_of(&dir), before);
        assert!(!dir.join(".git/FETCH_HEAD").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn real_dirty_repo_is_not_fetched_or_merged() {
        let dir = init_repo(OURS);
        fs::write(dir.join("notes.txt"), "dirty\n").unwrap();
        let before = head_of(&dir);
        let err = apply_with(&dir, &RealOps).unwrap_err();
        assert_eq!(err, DIRTY);
        assert_eq!(head_of(&dir), before);
        assert!(!dir.join(".git/FETCH_HEAD").exists());
        assert!(dir.join("notes.txt").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn real_credential_helper_stops_before_fetch() {
        let dir = init_repo(OURS);
        git_ok(&dir, &["config", "credential.helper", "!echo pwned"]);
        let err = apply_with(&dir, &RealOps).unwrap_err();
        assert_eq!(err, BAD_CONFIG);
        assert!(!err.contains("pwned"));
        assert!(!dir.join(".git/FETCH_HEAD").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_clone_uses_the_agreed_message() {
        let dir = temp_dir();
        assert!(find_root_from(&[dir.clone()]).is_none());
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(
            clamp_message(NOT_A_CLONE.to_string()),
            NOT_A_CLONE
        );
    }

    #[cfg(unix)]
    #[test]
    fn timeout_kills_the_child() {
        let dir = temp_dir();
        let started = Instant::now();
        let error = run_program(&dir, "sleep", &["5"], Duration::from_millis(350), None).unwrap_err();
        assert!(matches!(error, ExecError::Timeout));
        assert!(started.elapsed() < Duration::from_secs(3));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn second_update_is_rejected_while_the_lock_is_held() {
        let _guard = hold_lock();
        let err = lock_update().unwrap_err();
        assert_eq!(err, BUSY);
    }
}
