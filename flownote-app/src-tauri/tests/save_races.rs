#![cfg(windows)]

use flownote::markdown_files::{FileStore, SaveRequest};
use std::fs::{self, OpenOptions};
use std::os::windows::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::thread;
use std::time::{Duration, Instant};
use uuid::Uuid;

const LARGE_CONTENT_BYTES: usize = 1024 * 1024;
const SHARE_WRITE_DELETE: u32 = 0x00000002 | 0x00000004;
const ATTEMPTS: usize = 12;

fn race_directory() -> PathBuf {
    let path = std::env::temp_dir().join(format!("flownote-save-race-{}", Uuid::new_v4()));
    fs::create_dir(&path).unwrap();
    path
}

fn staging_finished(directory: &Path) -> bool {
    fs::read_dir(directory).unwrap().filter_map(Result::ok).any(|entry| {
        let path = entry.path();
        path.extension().and_then(|value| value.to_str()) == Some("tmp")
            && OpenOptions::new().write(true).open(path).is_ok()
    })
}

fn replace_while_reading(directory: PathBuf, done: Arc<AtomicBool>) -> bool {
    let deadline = Instant::now() + Duration::from_secs(3);
    let target = directory.join("note.md");
    while !done.load(Ordering::Acquire) && Instant::now() < deadline {
        if !staging_finished(&directory) { thread::yield_now(); continue; }
        // Excluding read sharing detects an active reader of the target.
        if OpenOptions::new().read(true).share_mode(SHARE_WRITE_DELETE).open(&target).is_err() {
            return fs::rename(directory.join("external.md"), &target).is_ok();
        }
        thread::yield_now();
    }
    false
}

#[test]
fn an_external_replace_during_save_is_never_silently_lost() {
    for _ in 0..ATTEMPTS {
        let directory = race_directory();
        let target = directory.join("note.md");
        fs::write(&target, "A".repeat(LARGE_CONTENT_BYTES)).unwrap();
        fs::write(directory.join("external.md"), "B".repeat(LARGE_CONTENT_BYTES)).unwrap();
        let mut store = FileStore::default();
        let file = store.open_selected(&target).unwrap();
        let done = Arc::new(AtomicBool::new(false));
        let observer_done = done.clone();
        let actor = thread::spawn(move || replace_while_reading(directory, observer_done));
        let result = store.save(SaveRequest { id: file.id, revision: file.revision,
            content: "L".repeat(LARGE_CONTENT_BYTES) });
        done.store(true, Ordering::Release);
        let external_succeeded = actor.join().unwrap();
        let actual = fs::read(&target).unwrap();
        assert!(!(external_succeeded && result.is_ok() && actual[0] == b'L'),
            "An external replacement succeeded but was overwritten by a successful local save");
    }
}
