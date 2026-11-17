//! Запросы к Spaceweb. Адрес собирается здесь: UI не передаёт URL.
//! `hosting_get_token` ходит только на `/notAuthorized/`.
//! `hosting_request` требует токен и класс из allowlist. Пароль в эту команду не входит.
//! В текст ошибки не попадают тело ответа, пароль, токен и заголовок Authorization.

use serde_json::{json, Value};

const TOKEN_URL: &str = "https://api.sweb.ru/notAuthorized/";
const AUTH_DENIED: &str = "Spaceweb отклонил авторизацию";
const MAX_BODY: usize = 1_048_576;
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

fn allowed(class_name: &str, method: &str) -> bool {
  matches!(
    (class_name, method),
    ("vps", "index")
      | ("vps", "isRunning")
      | ("vps", "getCurrentAction")
      | ("vps", "powerOn")
      | ("vps", "powerOff")
      | ("vps", "reboot")
      | ("vps", "logs")
      | ("vps/ip", "index")
      | ("vps/ip", "getAllIpList")
  )
}

fn class_url(class_name: &str) -> Result<String, String> {
  if class_name.is_empty()
    || class_name.contains("..")
    || class_name.contains('\\')
    || class_name.contains(':')
    || class_name.contains("//")
    || class_name.starts_with('/')
    || class_name.ends_with('/')
    || class_name.contains(' ')
  {
    return Err("Класс Spaceweb не разрешён".into());
  }
  let class = match class_name {
    "vps" => "vps",
    "vps/ip" => "vps/ip",
    _ => return Err("Класс Spaceweb не разрешён".into()),
  };
  let url = format!("https://api.sweb.ru/{class}");
  assert_sweb_url(&url)?;
  Ok(url)
}

fn assert_sweb_url(raw: &str) -> Result<reqwest::Url, String> {
  if !raw.starts_with("https://api.sweb.ru/") || raw.contains('@') || raw.contains('\\') || raw.contains('?') {
    return Err("Запрос к Spaceweb отклонён".into());
  }
  let url = reqwest::Url::parse(raw).map_err(|_| "Запрос к Spaceweb отклонён".to_string())?;
  if url.scheme() != "https" || url.host_str() != Some("api.sweb.ru") || url.port().is_some() {
    return Err("Запрос к Spaceweb отклонён".into());
  }
  if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
    return Err("Запрос к Spaceweb отклонён".into());
  }
  match url.path() {
    "/vps" | "/vps/ip" | "/notAuthorized/" => Ok(url),
    _ => Err("Запрос к Spaceweb отклонён".into()),
  }
}

fn bearer(token: &str) -> Option<&str> {
  let token = token.trim();
  if token.len() < 8 || token.len() > 400 {
    return None;
  }
  if token.contains("://") || token.chars().any(|ch| ch.is_whitespace() || ch.is_control()) {
    return None;
  }
  Some(token)
}

fn rpc_id() -> String {
  let nanos = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|elapsed| elapsed.as_nanos())
    .unwrap_or(0);
  format!("lcc-{nanos}")
}

fn sanitize_message(message: &str, secrets: &[&str]) -> String {
  let mut out = message.replace(['\r', '\n', '\u{0000}'], " ");
  for secret in secrets {
    if secret.len() >= 4 {
      out = out.replace(secret, "");
    }
  }
  let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
  collapsed.chars().take(200).collect::<String>().trim().to_string()
}

fn rpc_id_value(value: &Value) -> Value {
  match value.get("id") {
    Some(Value::String(id)) if id.chars().count() <= 80 && !id.chars().any(|ch| ch.is_control()) => {
      Value::String(id.clone())
    }
    Some(Value::Number(number)) => Value::Number(number.clone()),
    _ => Value::Null,
  }
}

fn redact(value: &mut Value, secret: &str) {
  if secret.len() < 8 {
    return;
  }
  match value {
    Value::String(text) => {
      if text.contains(secret) {
        *text = text.replace(secret, "");
      }
    }
    Value::Array(items) => {
      for item in items {
        redact(item, secret);
      }
    }
    Value::Object(map) => {
      for item in map.values_mut() {
        redact(item, secret);
      }
    }
    _ => {}
  }
}

fn error_text(error: &Value, secrets: &[&str], fallback: &str) -> String {
  let code = error.get("code").and_then(|item| item.as_i64());
  let message = error.get("message").and_then(|item| item.as_str()).unwrap_or("");
  if code == Some(-32401) || message.to_lowercase().contains("2fa") || message.to_lowercase().contains("двухфактор")
  {
    return "Для Spaceweb нужен код двухфакторной аутентификации".into();
  }
  let clean = sanitize_message(message, secrets);
  if clean.is_empty() { fallback.to_string() } else { clean }
}

fn project_token(value: &Value, secrets: &[&str]) -> Result<Value, String> {
  if let Some(error) = value.get("error").filter(|item| !item.is_null()) {
    return Err(error_text(error, secrets, "Не удалось войти в Spaceweb"));
  }
  let token = match value.get("result") {
    Some(Value::String(token)) => token.clone(),
    Some(Value::Object(map)) => match map.get("token") {
      Some(Value::String(token)) => token.clone(),
      _ => return Err("Spaceweb не вернул токен".into()),
    },
    _ => return Err("Spaceweb не вернул токен".into()),
  };
  if token.len() < 8
    || token.len() > 400
    || token.contains("://")
    || token.chars().any(|ch| ch.is_whitespace() || ch.is_control())
  {
    return Err("Spaceweb не вернул токен".into());
  }
  Ok(json!({
    "jsonrpc": "2.0",
    "result": token,
    "id": rpc_id_value(value),
  }))
}

fn project_rpc(value: &Value, token: &str) -> Result<Value, String> {
  let id = rpc_id_value(value);
  if let Some(error) = value.get("error").filter(|item| !item.is_null()) {
    let code = error.get("code").cloned().unwrap_or(Value::Null);
    let message = error_text(error, &[token], "Spaceweb вернул ошибку");
    return Ok(json!({
      "jsonrpc": "2.0",
      "error": { "code": code, "message": message },
      "id": id,
    }));
  }
  let Some(result) = value.get("result") else {
    return Err("Spaceweb вернул ответ без результата".into());
  };
  let mut result = result.clone();
  redact(&mut result, token);
  Ok(json!({
    "jsonrpc": "2.0",
    "result": result,
    "id": id,
  }))
}

fn http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(TIMEOUT)
    .redirect(reqwest::redirect::Policy::none())
    .user_agent("LoomixxControlCenter")
    .build()
    .map_err(|_| "Не удалось подготовить запрос к Spaceweb".to_string())
}

async fn post_json(
  url: &str,
  body: &Value,
  token: Option<&str>,
  secrets: &[&str],
  auth_message: &str,
) -> Result<Value, String> {
  let parsed = assert_sweb_url(url)?;
  let client = http_client()?;
  let mut request = client
    .post(parsed)
    .header("Accept", "application/json")
    .header("Content-Type", "application/json; charset=utf-8");
  if let Some(bearer) = token {
    request = request.header("Authorization", format!("Bearer {bearer}"));
  }
  let response = request.json(body).send().await.map_err(|err| {
    if err.is_timeout() {
      "Spaceweb не ответил вовремя".to_string()
    } else {
      "Нет соединения со Spaceweb".to_string()
    }
  })?;

  let status = response.status();
  let final_url = response.url().clone();
  if final_url.scheme() != "https" || final_url.host_str() != Some("api.sweb.ru") {
    return Err("Ответ Spaceweb пришёл с чужого адреса".into());
  }
  if status.is_redirection() {
    return Err("Spaceweb прислал перенаправление".into());
  }
  if status.as_u16() == 401 {
    return Err(auth_message.to_string());
  }
  if let Some(len) = response.content_length() {
    if len > MAX_BODY as u64 {
      return Err("Слишком большой ответ Spaceweb".into());
    }
  }
  let bytes = response.bytes().await.map_err(|_| "Spaceweb не ответил".to_string())?;
  if bytes.len() > MAX_BODY {
    return Err("Слишком большой ответ Spaceweb".into());
  }
  if !status.is_success() {
    if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
      if let Some(error) = value.get("error").filter(|item| !item.is_null()) {
        return Err(error_text(error, secrets, &format!("Spaceweb ответил ошибкой {}", status.as_u16())));
      }
    }
    return Err(format!("Spaceweb ответил ошибкой {}", status.as_u16()));
  }
  serde_json::from_slice(&bytes).map_err(|_| "Spaceweb вернул некорректный ответ".to_string())
}

#[tauri::command]
pub async fn hosting_get_token(login: String, password: String) -> Result<Value, String> {
  let login = login.trim();
  if login.is_empty() || login.chars().count() > 80 || login.chars().any(|ch| ch.is_control()) {
    return Err("Укажите логин Spaceweb".into());
  }
  if password.is_empty() || password.chars().count() > 200 || password.chars().any(|ch| ch.is_control()) {
    return Err("Укажите пароль Spaceweb".into());
  }
  let body = json!({
    "jsonrpc": "2.0",
    "method": "getToken",
    "params": { "login": login, "password": password.as_str() },
    "id": rpc_id(),
  });
  let payload = post_json(
    TOKEN_URL,
    &body,
    None,
    &[&password],
    "Spaceweb отклонил логин или пароль",
  )
  .await?;
  project_token(&payload, &[&password])
}

#[tauri::command]
pub async fn hosting_request(class_name: String, body: Value, token: String) -> Result<Value, String> {
  let Some(token) = bearer(&token) else {
    return Err("Нет токена Spaceweb".into());
  };
  let method = body.get("method").and_then(|item| item.as_str()).unwrap_or("");
  if !allowed(&class_name, method) {
    return Err("Метод Spaceweb не разрешён".into());
  }
  let url = class_url(&class_name)?;
  let payload = post_json(&url, &body, Some(token), &[token], AUTH_DENIED).await?;
  project_rpc(&payload, token)
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn allowlist_is_only_read_power_and_host_logs() {
    for method in ["index", "isRunning", "getCurrentAction", "powerOn", "powerOff", "reboot", "logs"] {
      assert!(allowed("vps", method), "{method}");
    }
    assert!(allowed("vps/ip", "index"));
    assert!(allowed("vps/ip", "getAllIpList"));

    for method in [
      "remove",
      "removeFirst",
      "reinstallOs",
      "changePlan",
      "create",
      "createFirst",
      "copy",
      "rename",
      "load",
      "remoteBackup",
      "backup",
      "getToken",
    ] {
      assert!(!allowed("vps", method), "{method}");
      assert!(!allowed("vps/ip", method), "{method}");
    }
    assert!(!allowed("notAuthorized", "getToken"));
    assert!(!allowed("remoteBackup", "index"));
    assert!(!allowed("vps/backup", "index"));
    assert!(!allowed("VPS", "index"));
    assert!(!allowed("vps/", "index"));
    assert!(!allowed("../vps", "index"));
    assert!(!allowed("vps/../vps", "index"));
    assert!(!allowed("https://api.sweb.ru/vps", "index"));
    assert!(!allowed("vps//ip", "index"));
  }

  #[test]
  fn class_url_is_fixed_host() {
    assert_eq!(class_url("vps").expect("vps"), "https://api.sweb.ru/vps");
    assert_eq!(class_url("vps/ip").expect("ip"), "https://api.sweb.ru/vps/ip");
    assert!(class_url("notAuthorized").is_err());
    assert!(class_url("../vps").is_err());
    assert!(class_url("vps/").is_err());
    assert!(class_url("/vps").is_err());
    assert!(class_url("https://evil.example/vps").is_err());
    assert!(class_url("vps/ip/extra").is_err());
    assert!(assert_sweb_url("https://api.sweb.ru/notAuthorized/").is_ok());
    assert!(assert_sweb_url("http://api.sweb.ru/vps").is_err());
    assert!(assert_sweb_url("https://api.sweb.ru.evil/vps").is_err());
    assert!(assert_sweb_url("https://user:pass@api.sweb.ru/vps").is_err());
    assert!(assert_sweb_url("https://api.sweb.ru:443/vps").is_err());
  }

  #[test]
  fn errors_drop_token_password_and_long_text() {
    let token = "hdlhcdkd0bid6c29fhfu1s7123.202357ec-d5ca-4a0a-846c-2dabe0266ef4";
    let password = "secret-password";
    let noisy = format!("сбой {token} bearer {token} {password} {}", "я".repeat(400));
    let clean = sanitize_message(&noisy, &[token, password]);
    assert!(!clean.contains(token));
    assert!(!clean.contains(password));
    assert!(clean.chars().count() <= 200);

    let leaked = json!({
      "jsonrpc": "2.0",
      "error": { "code": -1, "message": format!("нет доступа {token}"), "debug": token },
      "id": "1",
    });
    let projected = project_rpc(&leaked, token).expect("error envelope");
    let text = projected.to_string();
    assert!(!text.contains(token));
    assert!(projected.pointer("/error/debug").is_none());

    let echoed = json!({
      "jsonrpc": "2.0",
      "result": { "token": token, "password": password, "extra": "nope" },
      "id": "2",
    });
    let from_object = project_token(&echoed, &[password]).expect("object token");
    assert_eq!(from_object.get("result").and_then(|item| item.as_str()), Some(token));
    assert!(!from_object.to_string().contains(password));
    assert!(from_object.get("password").is_none());

    let unexpected = json!({ "jsonrpc": "2.0", "result": { "password": password }, "id": "x" });
    assert_eq!(
      project_token(&unexpected, &[password]).expect_err("shape"),
      "Spaceweb не вернул токен"
    );

    let ok = json!({
      "jsonrpc": "2.0",
      "result": token,
      "password": password,
      "id": "3",
    });
    let issued = project_token(&ok, &[password]).expect("token");
    assert_eq!(issued.get("result").and_then(|item| item.as_str()), Some(token));
    assert!(issued.get("password").is_none());
  }
}
