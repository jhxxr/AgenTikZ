#[tokio::main]
async fn main() {
    if let Err(error) = agentikz_mcp::run_stdio().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
