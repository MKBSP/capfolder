//! App lock (F-03): an argon2 hash of the app password, kept in the OS keychain.
//! This locks the app, not the files: the vault stays plain and readable.
use argon2::password_hash::{phc::PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::Argon2;

const SERVICE: &str = "Capfolder";
const ACCOUNT: &str = "app-lock";

pub fn hash(password: &str) -> Result<String, String> {
    // Argon2id with default params and a random salt, as a PHC string.
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

pub fn verify(stored: &str, password: &str) -> bool {
    PasswordHash::new(stored)
        .map(|h| Argon2::default().verify_password(password.as_bytes(), &h).is_ok())
        .unwrap_or(false)
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lock_set(password: String) -> Result<(), String> {
    if password.is_empty() {
        return Err("Choose a password.".into());
    }
    entry()?.set_password(&hash(&password)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lock_verify(password: String) -> Result<bool, String> {
    match entry()?.get_password() {
        Ok(stored) => Ok(verify(&stored, &password)),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn lock_is_set() -> Result<bool, String> {
    match entry()?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn lock_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correct_password_verifies() {
        let h = hash("correct horse").unwrap();
        assert!(h.starts_with("$argon2"));
        assert!(verify(&h, "correct horse"));
    }

    #[test]
    fn wrong_or_empty_password_fails() {
        let h = hash("correct horse").unwrap();
        assert!(!verify(&h, "wrong"));
        assert!(!verify(&h, ""));
    }

    #[test]
    fn garbage_hash_never_verifies() {
        assert!(!verify("not a hash", "anything"));
    }

    #[test]
    fn same_password_gets_a_new_salt() {
        assert_ne!(hash("x").unwrap(), hash("x").unwrap());
    }
}
