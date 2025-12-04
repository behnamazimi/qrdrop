#!/usr/bin/env bash
set -euo pipefail

# Colors for output (only if output is to a terminal)
RED=''
GREEN=''
YELLOW=''
NC=''

if [[ -t 1 ]]; then
    # Reset
    NC='\033[0m' # No Color
    
    # Regular Colors
    RED='\033[0;31m'   # Red
    GREEN='\033[0;32m' # Green
    YELLOW='\033[1;33m' # Yellow
fi

# Detect OS and architecture
detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  
  case "$OS" in
    Linux*)
      # Check if running in WSL (Windows Subsystem for Linux)
      if [ -f /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; then
        # WSL: Treat as Linux, but note it's Windows-hosted
        PLATFORM="linux"
      else
        PLATFORM="linux"
      fi
      ;;
    Darwin*)
      PLATFORM="macos"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      PLATFORM="windows"
      ;;
    *)
      printf "%b\n" "${RED}Error: Unsupported operating system: $OS${NC}" >&2
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
        printf "%b\n" "${YELLOW}Warning: Unsupported architecture: $ARCH. Defaulting to x64.${NC}" >&2
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
    printf "%b\n" "${RED}Error: curl or wget is required${NC}" >&2
    exit 1
  fi
  
  if [ -z "$VERSION" ]; then
    printf "%b\n" "${RED}Error: Could not determine latest version${NC}" >&2
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
  
  printf "%b\n" "${YELLOW}Downloading qrdrop ${VERSION}...${NC}" >&2
  
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$OUTPUT_NAME" "$URL" || {
      printf "%b\n" "${RED}Error: Failed to download binary${NC}" >&2
      exit 1
    }
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$OUTPUT_NAME" "$URL" || {
      printf "%b\n" "${RED}Error: Failed to download binary${NC}" >&2
      exit 1
    }
  else
    printf "%b\n" "${RED}Error: curl or wget is required${NC}" >&2
    exit 1
  fi
  
  if [ ! -f "$OUTPUT_NAME" ]; then
      printf "%b\n" "${RED}Error: Failed to download binary${NC}" >&2
    exit 1
  fi
  
  chmod +x "$OUTPUT_NAME" || {
    printf "%b\n" "${RED}Error: Failed to set permissions on downloaded binary${NC}" >&2
    exit 1
  }
  
  # Return only the filename (no other output)
  echo "$OUTPUT_NAME"
}

# Tildify path (replace $HOME with ~)
tildify() {
  if [[ "$1" = "$HOME"/* ]]; then
    echo "${1/$HOME\//~/}"
  else
    echo "$1"
  fi
}

# Install binary and add to PATH
install_binary() {
  BINARY=$1
  PLATFORM=$2
  
  # Export platform for add_to_path to use
  export QRDROP_PLATFORM="$PLATFORM"
  
  # Determine install directory
  if [ "$PLATFORM" = "windows" ]; then
    # Windows: Use LOCALAPPDATA or HOME
    # Git Bash/MSYS automatically converts Windows env vars to Unix paths
    # (e.g., C:\Users\... becomes /c/Users/...)
    if [ -n "$LOCALAPPDATA" ]; then
      # If LOCALAPPDATA still contains backslashes (Windows format), convert it
      if [[ "$LOCALAPPDATA" == *"\\"* ]]; then
        # Try cygpath first (Cygwin), then manual conversion
        INSTALL_DIR=$(cygpath -u "$LOCALAPPDATA" 2>/dev/null || echo "$LOCALAPPDATA" | sed -e 's|\\|/|g' -e 's|^\([A-Za-z]\):|/\1|' | tr '[:upper:]' '[:lower:]')
        INSTALL_DIR="$INSTALL_DIR/qrdrop"
      else
        # Already in Unix format (Git Bash/MSYS auto-conversion)
        INSTALL_DIR="$LOCALAPPDATA/qrdrop"
      fi
    else
      # Fallback to HOME (works in Git Bash/MSYS)
      INSTALL_DIR="$HOME/.qrdrop"
    fi
    BIN_DIR="$INSTALL_DIR/bin"
    EXE="$BIN_DIR/qrdrop.exe"
  else
    # macOS/Linux: Use ~/.local/bin or ~/.qrdrop/bin
    INSTALL_DIR="${QRDROP_INSTALL:-$HOME/.qrdrop}"
    BIN_DIR="$INSTALL_DIR/bin"
    EXE="$BIN_DIR/qrdrop"
  fi
  
  # Create install directory (must exist before moving file)
  mkdir -p "$BIN_DIR" || {
    printf "%b\n" "${RED}Error: Failed to create install directory \"$BIN_DIR\"${NC}" >&2
    exit 1
  }
  
  # Verify binary exists before moving
  if [ ! -f "$BINARY" ]; then
    printf "%b\n" "${RED}Error: Binary file not found at \"$BINARY\"${NC}" >&2
    exit 1
  fi
  
  # Move binary to install directory
  mv "$BINARY" "$EXE" || {
    printf "%b\n" "${RED}Error: Failed to move binary to \"$EXE\"${NC}" >&2
    exit 1
  }
  
  chmod +x "$EXE" || {
    printf "%b\n" "${RED}Error: Failed to set permissions on qrdrop executable${NC}" >&2
    exit 1
  }
  
  printf "%b\n" "${GREEN}Installed qrdrop to $(tildify "$EXE")${NC}"
  
  # Add to PATH in shell config
  add_to_path "$BIN_DIR" "$INSTALL_DIR"
  
  # Try to add to current session PATH (won't persist but allows immediate use)
  export PATH="$BIN_DIR:$PATH"
  
  # Check if now available
  if command -v qrdrop >/dev/null 2>&1; then
    printf "%b\n" "${GREEN}qrdrop is now available in this session!${NC}"
  fi
}

# Add to PATH in shell config
add_to_path() {
  BIN_DIR=$1
  INSTALL_DIR=$2
  
  TILDE_BIN_DIR=$(tildify "$BIN_DIR")
  QUOTED_BIN_DIR="\"${BIN_DIR//\"/\\\"}\""
  
  # Determine shell
  SHELL_NAME=$(basename "$SHELL" 2>/dev/null || echo "bash")
  
  # On Windows (Git Bash/MSYS/Cygwin), always use bash config files
  if [ "${QRDROP_PLATFORM:-}" = "windows" ]; then
    # Windows bash environments: use .bashrc (preferred) or .bash_profile
    BASH_CONFIGS="$HOME/.bashrc $HOME/.bash_profile"
    
    SET_MANUALLY=true
    BASH_CONFIG=""
    for config in $BASH_CONFIGS; do
      TILDE_BASH_CONFIG=$(tildify "$config")
      
      if [ -w "$config" ] 2>/dev/null || [ ! -f "$config" ]; then
        {
          echo ""
          echo "# qrdrop"
          echo "export PATH=\"$BIN_DIR:\$PATH\""
        } >> "$config"
        printf "%b\n" "${GREEN}Added \"$TILDE_BIN_DIR\" to PATH in \"$TILDE_BASH_CONFIG\"${NC}"
        BASH_CONFIG="$config"
        SET_MANUALLY=false
        export QRDROP_CONFIG_FILE="$config"
        break
      fi
    done
    
    if [ "$SET_MANUALLY" = "true" ]; then
      printf "%b\n" "${YELLOW}Manually add the directory to your ~/.bashrc or ~/.bash_profile:${NC}"
      printf "%b\n" "  ${YELLOW}export PATH=\"$BIN_DIR:\\\$PATH\"${NC}"
    fi
    
    return 0
  fi
  
  case "$SHELL_NAME" in
    fish)
      FISH_CONFIG="$HOME/.config/fish/config.fish"
      TILDE_FISH_CONFIG=$(tildify "$FISH_CONFIG")
      
      if [ -w "$FISH_CONFIG" ] 2>/dev/null || [ ! -f "$FISH_CONFIG" ]; then
        {
          echo ""
          echo "# qrdrop"
          echo "set --export PATH $QUOTED_BIN_DIR \$PATH"
        } >> "$FISH_CONFIG"
        printf "%b\n" "${GREEN}Added \"$TILDE_BIN_DIR\" to PATH in \"$TILDE_FISH_CONFIG\"${NC}"
        export QRDROP_CONFIG_FILE="$FISH_CONFIG"
      else
        printf "%b\n" "${YELLOW}Manually add the directory to $TILDE_FISH_CONFIG:${NC}"
        printf "%b\n" "  ${YELLOW}set --export PATH $QUOTED_BIN_DIR \$PATH${NC}"
      fi
      ;;
    zsh)
      ZSH_CONFIG="$HOME/.zshrc"
      TILDE_ZSH_CONFIG=$(tildify "$ZSH_CONFIG")
      
      if [ -w "$ZSH_CONFIG" ] 2>/dev/null || [ ! -f "$ZSH_CONFIG" ]; then
        {
          echo ""
          echo "# qrdrop"
          echo "export PATH=\"$BIN_DIR:\$PATH\""
        } >> "$ZSH_CONFIG"
        printf "%b\n" "${GREEN}Added \"$TILDE_BIN_DIR\" to PATH in \"$TILDE_ZSH_CONFIG\"${NC}"
        export QRDROP_CONFIG_FILE="$ZSH_CONFIG"
      else
        printf "%b\n" "${YELLOW}Manually add the directory to $TILDE_ZSH_CONFIG:${NC}"
        printf "%b\n" "  ${YELLOW}export PATH=\"$BIN_DIR:\\\$PATH\"${NC}"
      fi
      ;;
    bash)
      # Try multiple bash config files
      BASH_CONFIGS="$HOME/.bash_profile $HOME/.bashrc"
      
      if [ -n "${XDG_CONFIG_HOME:-}" ]; then
        BASH_CONFIGS="$BASH_CONFIGS $XDG_CONFIG_HOME/.bash_profile $XDG_CONFIG_HOME/.bashrc"
      fi
      
      SET_MANUALLY=true
      BASH_CONFIG=""
      for config in $BASH_CONFIGS; do
        TILDE_BASH_CONFIG=$(tildify "$config")
        
        if [ -w "$config" ] 2>/dev/null || [ ! -f "$config" ]; then
          {
            echo ""
            echo "# qrdrop"
            echo "export PATH=\"$BIN_DIR:\$PATH\""
          } >> "$config"
          printf "%b\n" "${GREEN}Added \"$TILDE_BIN_DIR\" to PATH in \"$TILDE_BASH_CONFIG\"${NC}"
          BASH_CONFIG="$config"
          SET_MANUALLY=false
          export QRDROP_CONFIG_FILE="$config"
          break
        fi
      done
      
      if [ "$SET_MANUALLY" = "true" ]; then
        printf "%b\n" "${YELLOW}Manually add the directory to your shell config:${NC}"
        printf "%b\n" "  ${YELLOW}export PATH=\"$BIN_DIR:\\\$PATH\"${NC}"
      fi
      ;;
    *)
      printf "%b\n" "${YELLOW}Manually add the directory to your shell config (~/.bashrc, ~/.zshrc, etc.):${NC}"
      printf "%b\n" "  ${YELLOW}export PATH=\"$BIN_DIR:\\\$PATH\"${NC}"
      ;;
  esac
  
  # Store platform for main() to use
  export QRDROP_PLATFORM="$PLATFORM"
}

# Main installation
main() {
  printf "%b\n" "${GREEN}Installing qrdrop...${NC}"
  
  detect_platform
  printf "%b\n" "${YELLOW}Detected platform: $PLATFORM ($ARCH)${NC}"
  
  VERSION=$(get_latest_version)
  printf "%b\n" "${YELLOW}Latest version: $VERSION${NC}"
  
  BINARY=$(download_binary "$VERSION" "$PLATFORM" "$ARCH")
  install_binary "$BINARY" "$PLATFORM"
  
  echo ""
  printf "%b\n" "${GREEN}✓ Installation complete!${NC}"
  echo ""
  
  # Provide next steps
  if [ -n "${QRDROP_CONFIG_FILE:-}" ]; then
    TILDE_CONFIG=$(tildify "$QRDROP_CONFIG_FILE")
    if [ "${QRDROP_PLATFORM:-}" = "windows" ]; then
      printf "%b\n" "${GREEN}To start using qrdrop:${NC}"
      printf "%b\n" "  ${YELLOW}Open a new terminal window${NC}"
      printf "%b\n" "  ${YELLOW}Or restart your current terminal${NC}"
    else
      printf "%b\n" "${GREEN}To start using qrdrop:${NC}"
      printf "%b\n" "  ${YELLOW}Open a new terminal window${NC}"
      printf "%b\n" "  ${YELLOW}Or run: source $TILDE_CONFIG${NC}"
    fi
  else
    printf "%b\n" "${GREEN}To start using qrdrop, add the bin directory to your PATH and run:${NC}"
    printf "%b\n" "  ${YELLOW}qrdrop --help${NC}"
  fi
}

main "$@"