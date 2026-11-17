//! Кнопка «Обновить» больше не вызывает git.
//!
//! Установщик релиза ставит только приложение. Эта команда остаётся явным
//! отказом, если её ещё вызовут: репозиторий не перезаписывается.
//! `git reset`, `git clean` и `checkout --force` запрещены и отсюда не запускаются.

use serde::Serialize;

const RELEASE_INSTALLER_ONLY: &str =
    "Обновление идёт установщиком релиза, репозиторий не перезаписывается.";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateApplyResult {
    pub ok: bool,
    pub message: String,
    pub version: Option<String>,
}

#[tauri::command]
pub fn apply_app_update() -> Result<UpdateApplyResult, String> {
    Ok(UpdateApplyResult {
        ok: false,
        message: RELEASE_INSTALLER_ONLY.to_string(),
        version: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn button_command_refuses_and_does_not_rewrite_the_repository() {
        let result = apply_app_update().expect("refusal");
        assert!(!result.ok);
        assert_eq!(result.version, None);
        assert_eq!(result.message, RELEASE_INSTALLER_ONLY);
        assert!(result.message.contains("установщиком релиза"));
        assert!(result.message.contains("не перезаписывается"));
    }
}
