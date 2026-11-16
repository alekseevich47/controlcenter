fn main() {
  // Rebuild when OS icons change (otherwise Windows keeps the old .exe resource).
  println!("cargo:rerun-if-changed=icons/icon.ico");
  println!("cargo:rerun-if-changed=icons/icon.png");
  println!("cargo:rerun-if-changed=icons/32x32.png");
  println!("cargo:rerun-if-changed=icons/128x128.png");
  println!("cargo:rerun-if-changed=tauri.conf.json");

  let mut windows = tauri_build::WindowsAttributes::new();
  windows = windows.window_icon_path("icons/icon.ico");

  tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
    .expect("failed to run tauri-build");
}
