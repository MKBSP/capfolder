//! Cloud AI API keys (docs/18): kept in the OS keychain, never in the vault or settings.json.
const SERVICE: &str = "Capfolder";
const PROVIDERS: [&str; 3] = ["anthropic", "openai", "gemini"];

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    if !PROVIDERS.contains(&provider) {
        return Err("unknown AI provider".into());
    }
    keyring::Entry::new(SERVICE, &format!("ai-key-{provider}")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_key_set(provider: String, key: String) -> Result<(), String> {
    let e = entry(&provider)?;
    if key.trim().is_empty() {
        return match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        };
    }
    e.set_password(key.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_key_get(provider: String) -> Result<String, String> {
    match entry(&provider)?.get_password() {
        Ok(k) => Ok(k),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_known_providers() {
        assert!(super::entry("anthropic").is_ok());
        assert!(super::entry("../evil").is_err());
    }
}
