mod lock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        // Folders picked in a dialog join the fs scope; this keeps them across restarts (recent vaults).
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![lock::lock_set, lock::lock_verify, lock::lock_is_set, lock::lock_clear])
        .run(tauri::generate_context!())
        .expect("error while running Capfolder");
}
