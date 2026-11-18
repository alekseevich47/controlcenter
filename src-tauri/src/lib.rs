mod hosting;
mod local_api;
mod ssh;
mod updater;

use hosting::{hosting_get_token, hosting_request};
use ssh::{
    ssh_journal, ssh_list_dir, ssh_metrics, ssh_mkdir, ssh_probe, ssh_pty_close, ssh_pty_open,
    ssh_pty_resize, ssh_pty_write, ssh_pull_tree, ssh_push_tree, ssh_read_file, ssh_remove, ssh_restic,
    ssh_services,
    ssh_write_file,
    PtyHub,
};
use local_api::{local_api_respond, local_api_set_token, local_api_start, local_api_stop, LocalApi};
use updater::apply_app_update;
use tauri::{include_image, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Logical mins from `tauri.conf.json` → windows.minWidth / minHeight.
const CONF_MIN_WIDTH: f64 = 1200.0;
const CONF_MIN_HEIGHT: f64 = 720.0;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .manage(LocalApi::new())
    .manage(PtyHub::new())
    .invoke_handler(tauri::generate_handler![
      local_api_start,
      local_api_stop,
      local_api_set_token,
      local_api_respond,
      apply_app_update,
      hosting_get_token,
      hosting_request,
      ssh_probe,
      ssh_metrics,
      ssh_services,
      ssh_journal,
      ssh_list_dir,
      ssh_read_file,
      ssh_write_file,
      ssh_mkdir,
      ssh_remove,
      ssh_restic,
      ssh_pull_tree,
      ssh_push_tree,
      ssh_pty_open,
      ssh_pty_write,
      ssh_pty_resize,
      ssh_pty_close
    ])
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_icon(include_image!("icons/128x128.png"));
        // Обычное окно: без auto-fullscreen (см. tauri.conf windows.*).
        let _ = window.set_fullscreen(false);
        let _ = window.set_decorations(true);
        let _ = window.unmaximize();

        // Work area (без панели задач / dock) → clamp size + безопасная позиция.
        fit_window_to_work_area(&window);

        let _ = window.show();
        let _ = window.set_focus();
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

/// Подгоняет окно под work area текущего (или первого доступного) монитора.
/// Не паникует: при ошибке метрик — тихий no-op.
fn fit_window_to_work_area(window: &WebviewWindow) {
  let Some(monitor) = resolve_monitor(window) else {
    return;
  };

  let work = monitor.work_area();
  let work_w = work.size.width;
  let work_h = work.size.height;
  if work_w == 0 || work_h == 0 {
    return;
  }

  let scale = monitor.scale_factor().max(0.5);
  let work_x = work.position.x;
  let work_y = work.position.y;

  let Ok(outer) = window.outer_size() else {
    return;
  };
  let Ok(inner) = window.inner_size() else {
    return;
  };

  // Outer (с title bar) сравниваем с work area; set_size меняет inner.
  let chrome_w = outer.width.saturating_sub(inner.width);
  let chrome_h = outer.height.saturating_sub(inner.height);

  let target_outer_w = outer.width.min(work_w).max(1);
  let target_outer_h = outer.height.min(work_h).max(1);
  let target_inner_w = target_outer_w.saturating_sub(chrome_w).max(1);
  let target_inner_h = target_outer_h.saturating_sub(chrome_h).max(1);

  // Min не должен превышать доступный inner — иначе ОС/tao может игнорировать set_size.
  let conf_min_w = ((CONF_MIN_WIDTH * scale).round() as u32).max(1);
  let conf_min_h = ((CONF_MIN_HEIGHT * scale).round() as u32).max(1);
  let min_w = conf_min_w.min(target_inner_w);
  let min_h = conf_min_h.min(target_inner_h);
  let _ = window.set_min_size(Some(PhysicalSize::new(min_w, min_h)));

  if target_inner_w != inner.width || target_inner_h != inner.height {
    let _ = window.set_size(PhysicalSize::new(target_inner_w, target_inner_h));
  }

  let Ok(fitted_outer) = window.outer_size() else {
    return;
  };

  // Редкий race chrome: outer всё ещё больше work — поджать ещё раз.
  let (fw, fh) = if fitted_outer.width > work_w || fitted_outer.height > work_h {
    let retry_w = work_w.saturating_sub(chrome_w).max(1);
    let retry_h = work_h.saturating_sub(chrome_h).max(1);
    let _ = window.set_size(PhysicalSize::new(retry_w, retry_h));
    match window.outer_size() {
      Ok(o) => (o.width.min(work_w), o.height.min(work_h)),
      Err(_) => return,
    }
  } else {
    (
      fitted_outer.width.min(work_w),
      fitted_outer.height.min(work_h),
    )
  };

  // Центр внутри work area; clamp не даёт уехать под taskbar/dock.
  let max_x = work_x.saturating_add(work_w as i32).saturating_sub(fw as i32);
  let max_y = work_y.saturating_add(work_h as i32).saturating_sub(fh as i32);
  let x = work_x.saturating_add(((work_w.saturating_sub(fw)) / 2) as i32);
  let y = work_y.saturating_add(((work_h.saturating_sub(fh)) / 2) as i32);
  let x = x.clamp(work_x, max_x.max(work_x));
  let y = y.clamp(work_y, max_y.max(work_y));

  let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn resolve_monitor(window: &WebviewWindow) -> Option<tauri::Monitor> {
  if let Ok(Some(monitor)) = window.current_monitor() {
    return Some(monitor);
  }
  window
    .available_monitors()
    .ok()
    .and_then(|list| list.into_iter().next())
}
