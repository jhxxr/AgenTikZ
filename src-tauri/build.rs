fn main() {
    println!("cargo:rerun-if-changed=binaries");
    tauri_build::build()
}
