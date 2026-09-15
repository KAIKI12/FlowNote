use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_recovery_path: Option<String>,
}

pub type FileResult<T> = Result<T, FileError>;

impl FileError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self { code: code.into(), message: message.into(), recovery_path: None, original_recovery_path: None }
    }

    pub fn io(context: &str, error: impl std::fmt::Display) -> Self {
        Self::new("io", format!("{context}：{error}"))
    }

    pub fn with_recovery(mut self, path: &Path) -> Self {
        if std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.is_file() || metadata.is_dir()) {
            self.recovery_path = Some(path.to_string_lossy().into_owned());
        }
        self
    }

    pub fn with_original_recovery(mut self, path: &Path) -> Self {
        self.original_recovery_path = Some(path.to_string_lossy().into_owned());
        self
    }
}

impl std::fmt::Display for FileError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for FileError {}
