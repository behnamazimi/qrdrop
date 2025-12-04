#!/bin/sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect OS and architecture
detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  
  case "$OS" in
    Linux*)
      PLATFORM="linux"
      ;;
    Darwin*)
      PLATFORM="macos"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      PLATFORM="windows"
      ;;
    *)
      echo "${RED}Error: Unsupported operating system: $OS${NC}" >&2
      exit 1
      ;;
  esac
  
  case "$ARCH" in
    x86_64|amd64)
      ARCH="x64"
      ;;
    arm64|aarch64)
      ARCH="arm64"
      ;;
    *)
      if [ "$PLATFORM" = "macos" ] && [ "$ARCH" = "arm64" ]; then
        ARCH="arm64"
      else
        echo "${YELLOW}Warning: Unsupported architecture: $ARCH. Defaulting to x64.${NC}" >&2
        ARCH="x64"
      fi
      ;;
  esac
}

# Get latest release version
get_latest_version() {
  if command -v curl >/dev/null 2>&1; then
    VERSION=$(curl -s https://api.github.com/repos/behnamazimi/qrdrop/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
  elif command -v wget >/dev/null 2>&1; then
    VERSION=$(wget -qO- https://api.github.com/repos/behnamazimi/qrdrop/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
  else
    echo "${RED}Error: curl or wget is required${NC}" >&2
    exit 1
  fi
  
  if [ -z "$VERSION" ]; then
    echo "${RED}Error: Could not determine latest version${NC}" >&2
    exit 1
  fi
  
  echo "$VERSION"
}

# Download binary
download_binary() {
  VERSION=$1
  PLATFORM=$2
  ARCH=$3
  
  if [ "$PLATFORM" = "windows" ]; then
    BINARY_NAME="qrdrop-windows-x64.exe"
    OUTPUT_NAME="qrdrop.exe"
  elif [ "$PLATFORM" = "macos" ] && [ "$ARCH" = "arm64" ]; then
    BINARY_NAME="qrdrop-macos-arm64"
    OUTPUT_NAME="qrdrop"
  elif [ "$PLATFORM" = "macos" ]; then
    BINARY_NAME="qrdrop-macos-x64"
    OUTPUT_NAME="qrdrop"
  else
    BINARY_NAME="qrdrop-linux-x64"
    OUTPUT_NAME="qrdrop"
  fi
  
  URL="https://github.com/behnamazimi/qrdrop/releases/download/${VERSION}/${BINARY_NAME}"
  
  echo "${YELLOW}Downloading qrdrop ${VERSION}...${NC}"
  
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$OUTPUT_NAME" "$URL"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$OUTPUT_NAME" "$URL"
  else
    echo "${RED}Error: curl or wget is required${NC}" >&2
    exit 1
  fi
  
  if [ ! -f "$OUTPUT_NAME" ]; then
    echo "${RED}Error: Failed to download binary${NC}" >&2
    exit 1
  fi
  
  chmod +x "$OUTPUT_NAME"
  echo "$OUTPUT_NAME"
}

# Install binary
install_binary() {
  BINARY=$1
  PLATFORM=$2
  
  if [ "$PLATFORM" = "windows" ]; then
    # Windows: Try to install to a directory in PATH
    if [ -n "$LOCALAPPDATA" ]; then
      INSTALL_DIR="$LOCALAPPDATA/Programs/qrdrop"
    else
      INSTALL_DIR="$HOME/.local/bin"
    fi
    
    mkdir -p "$INSTALL_DIR"
    mv "$BINARY" "$INSTALL_DIR/"
    
    if echo "$PATH" | grep -q "$INSTALL_DIR"; then
      echo "${GREEN}Installed to $INSTALL_DIR${NC}"
      echo "${GREEN}qrdrop is ready to use!${NC}"
    else
      echo "${GREEN}Installed to $INSTALL_DIR${NC}"
      echo "${YELLOW}Please add $INSTALL_DIR to your PATH${NC}"
    fi
  else
    # macOS/Linux: Install to /usr/local/bin (requires sudo) or ~/.local/bin
    if [ -w /usr/local/bin ]; then
      INSTALL_DIR="/usr/local/bin"
      mv "$BINARY" "$INSTALL_DIR/qrdrop"
      echo "${GREEN}Installed to $INSTALL_DIR/qrdrop${NC}"
    elif [ -w "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
      INSTALL_DIR="$HOME/.local/bin"
      mv "$BINARY" "$INSTALL_DIR/qrdrop"
      echo "${GREEN}Installed to $INSTALL_DIR/qrdrop${NC}"
      if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
        echo "${YELLOW}Please add $HOME/.local/bin to your PATH${NC}"
        echo "  Add this to your ~/.bashrc or ~/.zshrc:"
        echo "  ${YELLOW}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
      fi
    else
      echo "${YELLOW}Attempting to install to /usr/local/bin (requires sudo)${NC}"
      sudo mv "$BINARY" /usr/local/bin/qrdrop
      echo "${GREEN}Installed to /usr/local/bin/qrdrop${NC}"
    fi
  fi
}

# Main installation
main() {
  echo "${GREEN}Installing qrdrop...${NC}"
  
  detect_platform
  echo "${YELLOW}Detected platform: $PLATFORM ($ARCH)${NC}"
  
  VERSION=$(get_latest_version)
  echo "${YELLOW}Latest version: $VERSION${NC}"
  
  BINARY=$(download_binary "$VERSION" "$PLATFORM" "$ARCH")
  install_binary "$BINARY" "$PLATFORM"
  
  echo ""
  echo "${GREEN}✓ Installation complete!${NC}"
  echo "${GREEN}Run 'qrdrop --help' to get started.${NC}"
}

main "$@"

