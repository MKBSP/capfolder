mod localai;
mod lock;

use tauri::Emitter;
use tauri_plugin_fs::FsExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        // Folders picked in a dialog join the fs scope; this keeps them across restarts (recent vaults).
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // F-38: signed updates from GitHub Releases, and relaunch after installing one
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Files or folders dropped on the window: Rust expands folders itself and lets the page read only the
        // documents found (pdf/png/jpg, at most 500, 6 levels deep), never a whole dropped tree.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let mut files = Vec::new();
                for p in paths {
                    collect_documents(p, 0, &mut files);
                }
                let scope = window.fs_scope();
                for f in &files {
                    let _ = scope.allow_file(f);
                }
                let _ = window.emit("files-dropped", &files);
            }
        })
        .invoke_handler(tauri::generate_handler![lock::lock_set, lock::lock_verify, lock::lock_is_set, lock::lock_clear, localai::local_ai])
        .run(tauri::generate_context!())
        .expect("error while running Capfolder");
}

const MAX_DROPPED: usize = 500;

fn collect_documents(p: &std::path::Path, depth: usize, out: &mut Vec<std::path::PathBuf>) {
    if out.len() >= MAX_DROPPED || depth > 6 {
        return;
    }
    let meta = match std::fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(_) => return,
    };
    if meta.file_type().is_symlink() {
        return;
    }
    if meta.is_dir() {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if depth > 0 && (name.starts_with('.') || name == "node_modules") {
            return;
        }
        if let Ok(rd) = std::fs::read_dir(p) {
            let mut entries: Vec<_> = rd.filter_map(|e| e.ok().map(|e| e.path())).collect();
            entries.sort();
            for e in entries {
                collect_documents(&e, depth + 1, out);
            }
        }
    } else if is_document(p) {
        out.push(p.to_path_buf());
    }
}

fn is_document(p: &std::path::Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("pdf" | "png" | "jpg" | "jpeg")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drop_expands_folders_to_documents_only() {
        let d = std::env::temp_dir().join(format!("capfolder-drop-{}", std::process::id()));
        std::fs::create_dir_all(d.join("sub/.hidden")).unwrap();
        for f in ["a.pdf", "b.txt", "sub/c.JPG", "sub/.hidden/d.pdf"] {
            std::fs::write(d.join(f), b"x").unwrap();
        }
        let mut out = Vec::new();
        collect_documents(&d, 0, &mut out);
        let names: Vec<_> = out.iter().map(|p| p.strip_prefix(&d).unwrap().to_string_lossy().replace('\\', "/")).collect();
        assert_eq!(names, vec!["a.pdf", "sub/c.JPG"]);
        std::fs::remove_dir_all(&d).unwrap();
    }
}
