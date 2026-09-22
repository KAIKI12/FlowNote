#![cfg(windows)]

mod note_support;

use flownote::file_error::{FileError, FileResult};
use flownote::note_files::NoteStore;
use flownote::visual_library;
use flownote::visual_localization::{self, FetchResponse, LocalizationDependency, RemoteFetcher};
use note_support::{draft, folder, FIRST};
use std::collections::BTreeMap;
use std::fs;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::Mutex;

struct FakeFetcher {
    responses: BTreeMap<String, FetchResponse>,
    fail_on: Option<String>,
    calls: Mutex<Vec<String>>,
}

impl FakeFetcher {
    fn new(entries: Vec<(&str, &str, Vec<u8>)>) -> Self {
        Self {
            responses: entries.into_iter().map(|(url, mime, bytes)| (url.into(), FetchResponse {
                final_url: url.into(), mime: mime.into(), bytes,
            })).collect(),
            fail_on: None,
            calls: Mutex::new(Vec::new()),
        }
    }

    fn failing(mut self, url: &str) -> Self {
        self.fail_on = Some(url.into());
        self
    }

    fn final_url(mut self, source: &str, final_url: &str) -> Self {
        self.responses.get_mut(source).unwrap().final_url = final_url.into();
        self
    }

    fn calls(&self) -> Vec<String> { self.calls.lock().unwrap().clone() }
}

impl RemoteFetcher for FakeFetcher {
    fn fetch(&self, source: &str, _kind: &str) -> FileResult<FetchResponse> {
        self.calls.lock().unwrap().push(source.into());
        if self.fail_on.as_deref() == Some(source) {
            return Err(FileError::new("network", "fixture failure"));
        }
        self.responses.get(source).cloned()
            .ok_or_else(|| FileError::new("network", format!("missing fixture {source}")))
    }
}

fn collect_remote_visual(root: &std::path::Path, html: &str) -> (NoteStore, String, visual_library::VisualLibraryItem) {
    let note_path = root.join("source.note");
    let items = root.join("visual-library/items");
    let mut request = draft();
    request.mixed.blocks[0].html = html.into();
    request.mixed.blocks[0].original_html = html.into();
    let mut store = NoteStore::default();
    let source = store.save_as_selected(&note_path, request).unwrap();
    let item = visual_library::collect(&items, "Remote Visual",
        store.block_package(&source.id, &source.revision, FIRST).unwrap()).unwrap();
    (store, source.id, item)
}

#[test]
fn localization_preserves_current_original_and_maps_css_nested_assets() {
    let root = folder();
    let items = root.join("visual-library/items");
    let trash = root.join("visual-library/trash");
    let html = r#"<link rel="stylesheet" href="https://cdn.example/css/theme.css"><script src="https://cdn.example/app.js"></script>"#;
    let (store, source_id, item) = collect_remote_visual(&root, html);
    let original_index = fs::read(items.join(&item.id).join("index.html")).unwrap();
    let original_provenance = fs::read(items.join(&item.id).join("original.html")).unwrap();

    let fetcher = FakeFetcher::new(vec![
        ("https://cdn.example/css/theme.css", "text/css",
            br#".card{font-face:url("../fonts/font.woff2")} @import url("https://cdn.example/import.css");"#.to_vec()),
        ("https://cdn.example/fonts/font.woff2", "font/woff2", vec![1, 2, 3, 4]),
        ("https://cdn.example/app.js", "application/javascript", b"window.local=1".to_vec()),
    ]);
    let updated = visual_localization::localize_with_fetcher(&items, &trash, &item.id, vec![
        LocalizationDependency { source: "https://cdn.example/css/theme.css".into(), kind: "stylesheet".into() },
        LocalizationDependency { source: "https://cdn.example/app.js".into(), kind: "script".into() },
    ], &fetcher).unwrap();

    assert_eq!(fs::read(items.join(&item.id).join("index.html")).unwrap(), original_index);
    assert_eq!(fs::read(items.join(&item.id).join("original.html")).unwrap(), original_provenance);
    let localized = updated.config["resources"]["localized"].as_array().unwrap();
    let sources: Vec<_> = localized.iter().map(|entry| entry["source"].as_str().unwrap()).collect();
    assert!(sources.contains(&"https://cdn.example/css/theme.css"));
    assert!(sources.contains(&"https://cdn.example/fonts/font.woff2"));
    assert!(sources.contains(&"https://cdn.example/app.js"));
    assert!(updated.config["resources"]["localizationIssues"].as_array().unwrap()
        .iter().any(|entry| entry["reason"] == "css-import-not-supported"));
    for entry in localized {
        assert!(!visual_library::read_asset(&items, &item.id, entry["path"].as_str().unwrap()).unwrap().bytes.is_empty());
    }
    assert_eq!(fetcher.calls().len(), 3);
    assert!(!store.probe(&source_id).unwrap().changed);
}

#[test]
fn redirected_stylesheet_persists_final_url_for_nested_runtime_resolution() {
    let root = folder();
    let items = root.join("visual-library/items");
    let trash = root.join("visual-library/trash");
    let html = r#"<link rel="stylesheet" href="https://cdn.example/theme.css">"#;
    let (_store, _source_id, item) = collect_remote_visual(&root, html);

    let fetcher = FakeFetcher::new(vec![
        ("https://cdn.example/theme.css", "text/css", br#".x{src:url("./fonts/font.woff2")}"#.to_vec()),
        ("https://static.example/v2/fonts/font.woff2", "font/woff2", vec![1, 2, 3]),
    ]).final_url("https://cdn.example/theme.css", "https://static.example/v2/theme.css");
    let updated = visual_localization::localize_with_fetcher(&items, &trash, &item.id, vec![
        LocalizationDependency { source: "https://cdn.example/theme.css".into(), kind: "stylesheet".into() },
    ], &fetcher).unwrap();

    let localized = updated.config["resources"]["localized"].as_array().unwrap();
    let stylesheet = localized.iter().find(|entry| entry["source"] == "https://cdn.example/theme.css").unwrap();
    assert_eq!(stylesheet["resolvedSource"], "https://static.example/v2/theme.css");
    assert!(localized.iter().any(|entry| entry["source"] == "https://static.example/v2/fonts/font.woff2"));
}

#[test]
fn localization_failure_is_atomic_and_repeat_is_idempotent() {
    let root = folder();
    let items = root.join("visual-library/items");
    let trash = root.join("visual-library/trash");
    let html = r#"<script src="https://cdn.example/a.js"></script><img src="https://cdn.example/b.png">"#;
    let (_store, _source_id, item) = collect_remote_visual(&root, html);
    let block_before = fs::read(items.join(&item.id).join("block.json")).unwrap();

    let failing = FakeFetcher::new(vec![
        ("https://cdn.example/a.js", "text/javascript", b"a".to_vec()),
        ("https://cdn.example/b.png", "image/png", vec![137, 80, 78, 71]),
    ]).failing("https://cdn.example/b.png");
    assert_eq!(visual_localization::localize_with_fetcher(&items, &trash, &item.id, vec![
        LocalizationDependency { source: "https://cdn.example/a.js".into(), kind: "script".into() },
        LocalizationDependency { source: "https://cdn.example/b.png".into(), kind: "image".into() },
    ], &failing).unwrap_err().code, "network");
    assert_eq!(fs::read(items.join(&item.id).join("block.json")).unwrap(), block_before);
    assert!(!items.join(&item.id).join("assets/localized").exists());

    let success = FakeFetcher::new(vec![
        ("https://cdn.example/a.js", "text/javascript", b"a".to_vec()),
        ("https://cdn.example/b.png", "image/png", vec![137, 80, 78, 71]),
    ]);
    visual_localization::localize_with_fetcher(&items, &trash, &item.id, vec![
        LocalizationDependency { source: "https://cdn.example/a.js".into(), kind: "script".into() },
        LocalizationDependency { source: "https://cdn.example/b.png".into(), kind: "image".into() },
    ], &success).unwrap();
    assert_eq!(success.calls().len(), 2);

    let no_network = FakeFetcher::new(Vec::new()).failing("https://cdn.example/a.js");
    visual_localization::localize_with_fetcher(&items, &trash, &item.id, vec![
        LocalizationDependency { source: "https://cdn.example/a.js".into(), kind: "script".into() },
        LocalizationDependency { source: "https://cdn.example/b.png".into(), kind: "image".into() },
    ], &no_network).unwrap();
    assert!(no_network.calls().is_empty());
}

#[test]
fn localization_rejects_insecure_mime_and_oversize() {
    let root = folder();
    let items = root.join("visual-library/items");
    let trash = root.join("visual-library/trash");
    let (_store, _source_id, item) = collect_remote_visual(&root, r#"<script src="https://cdn.example/app.js"></script>"#);

    assert_eq!(visual_localization::localize_with_fetcher(&items, &trash, &item.id, vec![
        LocalizationDependency { source: "http://cdn.example/app.js".into(), kind: "script".into() },
    ], &FakeFetcher::new(Vec::new())).unwrap_err().code, "network");

    let wrong_mime = FakeFetcher::new(vec![("https://cdn.example/app.js", "text/html", b"<html/>".to_vec())]);
    assert_eq!(visual_localization::localize_with_fetcher(&items, &trash, &item.id, vec![
        LocalizationDependency { source: "https://cdn.example/app.js".into(), kind: "script".into() },
    ], &wrong_mime).unwrap_err().code, "network");

    let oversized = FakeFetcher::new(vec![
        ("https://cdn.example/app.js", "application/javascript", vec![0; 4 * 1024 * 1024 + 1]),
    ]);
    assert_eq!(visual_localization::localize_with_fetcher(&items, &trash, &item.id, vec![
        LocalizationDependency { source: "https://cdn.example/app.js".into(), kind: "script".into() },
    ], &oversized).unwrap_err().code, "tooLarge");
}

#[test]
fn public_ip_policy_rejects_local_private_and_link_local_targets() {
    for ip in [
        IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)),
        IpAddr::V4(Ipv4Addr::new(169, 254, 1, 1)),
        IpAddr::V6(Ipv6Addr::LOCALHOST),
        IpAddr::V6("fc00::1".parse().unwrap()),
        IpAddr::V6("fe80::1".parse().unwrap()),
    ] {
        assert!(!visual_localization::is_public_ip(ip), "{ip} must be rejected");
    }
    assert!(visual_localization::is_public_ip(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))));
    assert!(visual_localization::is_public_ip("2606:4700:4700::1111".parse().unwrap()));
}
