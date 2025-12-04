class Qrdrop < Formula
  desc "A two-way LAN file-sharing CLI tool built with Bun"
  homepage "https://github.com/behnamazimi/qrdrop"
  version "0.1.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/behnamazimi/qrdrop/releases/latest/download/qrdrop-macos-arm64"
      sha256 ""
    else
      url "https://github.com/behnamazimi/qrdrop/releases/latest/download/qrdrop-macos-x64"
      sha256 ""
    end
  end

  def install
    if Hardware::CPU.arm?
      bin.install "qrdrop-macos-arm64" => "qrdrop"
    else
      bin.install "qrdrop-macos-x64" => "qrdrop"
    end
  end

  test do
    system "#{bin}/qrdrop", "--help"
  end
end

