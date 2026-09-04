class Pinemail < Formula
  desc "Tiny single-binary SMTP & SMS catcher for development and AI agents"
  homepage "https://github.com/yoosuf/pinemail"
  url "https://github.com/yoosuf/pinemail/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000" # Updated dynamically on release
  license "MIT"
  head "https://github.com/yoosuf/pinemail.git", branch: "main"

  depends_on "node" => :build
  depends_on "rust" => :build

  def install
    if build.head? || File.exist?("Cargo.toml")
      cd "apps/web" do
        system "npm", "install"
        system "npm", "run", "build"
      end
      system "cargo", "install", *std_cargo_args(path: "crates/server")
      system "cargo", "install", *std_cargo_args(path: "crates/mcp")
    else
      bin.install "pinemail"
      bin.install "pinemail-mcp" if File.exist?("pinemail-mcp")
    end
  end

  service do
    run [opt_bin/"pinemail"]
    keep_alive true
    working_dir var
    log_path var/"log/pinemail.log"
    error_log_path var/"log/pinemail.log"
    environment_variables SMTP_PORT: "1025", HTTP_PORT: "8025", BIND_ADDR: "127.0.0.1"
  end

  test do
    assert_match "Pine Mail", shell_output("#{bin}/pinemail --help 2>&1 || true")
  end
end
