//! Releases a vault's cross-process save lock (<vault>/.capfolder.lock, see packages/vault withFileLock).
//! The webview gets this one command instead of fs:allow-remove, which would let it delete whole folders.
use std::path::Path;

const LOCK_FILE: &str = ".capfolder.lock";

fn release(lock: &Path) -> Result<(), String> {
    if lock.file_name().and_then(|n| n.to_str()) != Some(LOCK_FILE) {
        return Err("only .capfolder.lock can be removed".into());
    }
    let meta = match std::fs::symlink_metadata(lock) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    if meta.file_type().is_symlink() || meta.is_dir() {
        return Err(".capfolder.lock isn't a plain file".into());
    }
    match std::fs::remove_file(lock) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn release_vault_lock(root: String) -> Result<(), String> {
    release(&Path::new(&root).join(LOCK_FILE))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_only_a_plain_lock_file() {
        let d = std::env::temp_dir().join(format!("capfolder-vaultlock-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let lock = d.join(LOCK_FILE);
        std::fs::write(&lock, "1").unwrap();
        assert_eq!(release_vault_lock(d.to_string_lossy().into()), Ok(()));
        assert!(!lock.exists());
        // missing is fine
        assert_eq!(release_vault_lock(d.to_string_lossy().into()), Ok(()));
        // another file name is refused
        std::fs::write(d.join("events.jsonl"), "x").unwrap();
        assert!(release(&d.join("events.jsonl")).is_err());
        assert!(d.join("events.jsonl").exists());
        // a symlink is refused, and its target survives
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(d.join("events.jsonl"), &lock).unwrap();
            assert!(release_vault_lock(d.to_string_lossy().into()).is_err());
            assert!(d.join("events.jsonl").exists());
            std::fs::remove_file(&lock).unwrap();
        }
        // a directory is refused
        std::fs::create_dir(&lock).unwrap();
        assert!(release_vault_lock(d.to_string_lossy().into()).is_err());
        assert!(lock.is_dir());
        std::fs::remove_dir_all(&d).unwrap();
    }
}
