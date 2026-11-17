fn main() {
  // Rebuild when OS icons change (otherwise Windows keeps the old .exe resource).
  println!("cargo:rerun-if-changed=icons/icon.ico");
  println!("cargo:rerun-if-changed=icons/icon.png");
  println!("cargo:rerun-if-changed=icons/32x32.png");
  println!("cargo:rerun-if-changed=icons/128x128.png");
  println!("cargo:rerun-if-changed=tauri.conf.json");

  let mut windows = tauri_build::WindowsAttributes::new();
  windows = windows.window_icon_path("icons/icon.ico");

  // Без списка команд allow-local-api-* / allow-apply-app-update в capabilities
  // не появляются в ACL → tauri-build падает с "Permission ... not found".
  tauri_build::try_build(
    tauri_build::Attributes::new()
      .windows_attributes(windows)
      .app_manifest(tauri_build::AppManifest::new().commands(&[
        "local_api_start",
        "local_api_stop",
        "local_api_set_token",
        "local_api_respond",
        "apply_app_update",
      ])),
  )
  .expect("failed to run tauri-build");
}
