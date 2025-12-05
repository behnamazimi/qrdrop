/**
 * Generate shell completion scripts for various shells
 */

function generateBashCompletion(): string {
  return `# bash completion for qrdrop
_qrdrop() {
  local cur prev opts subcommands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  
  opts="-f --file -d --directory -o --output --secure --cert --key --port --host -i --interface --timeout --keep-alive --zip --url-path --config --copy-url --no-color --allow-ips --rate-limit --rate-limit-window --allow-types -v --verbose --debug --log-file --json-log --interactive -h --help"
  subcommands="completion status config cert"
  
  case "\${prev}" in
    -f|--file|-d|--directory|-o|--output|--cert|--key|--config|--log-file)
      # Complete with files/directories
      COMPREPLY=(\$(compgen -f "\${cur}"))
      return 0
      ;;
    --port|--timeout|--rate-limit|--rate-limit-window)
      # Complete with numbers (no completion)
      return 0
      ;;
    --host|-i|--interface|--url-path|--allow-ips|--allow-types)
      # No completion for these
      return 0
      ;;
    completion)
      COMPREPLY=(\$(compgen -W "bash zsh fish powershell" "\${cur}"))
      return 0
      ;;
    config)
      COMPREPLY=(\$(compgen -W "init" "\${cur}"))
      return 0
      ;;
    cert)
      COMPREPLY=(\$(compgen -W "generate" "\${cur}"))
      return 0
      ;;
  esac
  
  if [[ "\${cur}" == -* ]]; then
    COMPREPLY=(\$(compgen -W "\${opts}" "\${cur}"))
    return 0
  fi
  
  # Complete with subcommands or files
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=(\$(compgen -W "\${subcommands}" "\${cur}"))
    COMPREPLY+=(\$(compgen -f "\${cur}"))
  else
  COMPREPLY=(\$(compgen -f "\${cur}"))
  fi
}

complete -F _qrdrop qrdrop
`;
}

function generateZshCompletion(): string {
  return `#compdef qrdrop

_qrdrop() {
  local context state state_descr line
  typeset -A opt_args
  
  _arguments \\
    '(-f --file)'{-f,--file}'[File(s) to share]:file:_files' \\
    '(-d --directory)'{-d,--directory}'[Share directory]:directory:_directories' \\
    '(-o --output)'{-o,--output}'[Output directory]:directory:_directories' \\
    '--secure[Enable HTTPS/TLS]' \\
    '--cert[Custom TLS certificate file]:file:_files' \\
    '--key[Custom TLS private key file]:file:_files' \\
    '--port[Specify port]:port:' \\
    '--host[Specify host IP or FQDN]:host:' \\
    '(-i --interface)'{-i,--interface}'[Network interface]:interface:' \\
    '--timeout[Set timeout in seconds]:timeout:' \\
    '--keep-alive[Run indefinitely]' \\
    '--zip[Zip files before sharing]' \\
    '--url-path[Custom URL path]:path:' \\
    '--config[Custom config file path]:file:_files' \\
    '--copy-url[Copy URL to clipboard]' \\
    '--no-color[Disable colored output]' \\
    '--allow-ips[Restrict to specific IPs]:ips:' \\
    '--rate-limit[Max requests per window]:number:' \\
    '--rate-limit-window[Rate limit window in seconds]:seconds:' \\
    '--allow-types[Restrict file types]:extensions:' \\
    '(-v --verbose)'{-v,--verbose}'[Verbose logging]' \\
    '--debug[Debug logging]' \\
    '--log-file[Write logs to file]:file:_files' \\
    '--json-log[JSON log format]' \\
    '--interactive[Interactive file picker]' \\
    '(-h --help)'{-h,--help}'[Show help]' \\
    '1:command:->command' \\
    '*:files:_files'
  
  case $state in
    command)
      _values "command" \\
        "completion[Generate shell completion]" \\
        "status[Show server status]" \\
        "config[Configuration commands]" \\
        "cert[Certificate commands]"
      ;;
  esac
}

_qrdrop "$@"
`;
}

function generateFishCompletion(): string {
  return `# fish completion for qrdrop

function __qrdrop_complete_files
  set -l files (command ls -A 2>/dev/null | string match -r '.*')
  printf '%s\\n' $files
end

# File options
complete -c qrdrop -s f -l file -d "File(s) to share" -r -a "(__qrdrop_complete_files)"
complete -c qrdrop -s d -l directory -d "Share directory" -r -a "(__qrdrop_complete_files)"
complete -c qrdrop -s o -l output -d "Output directory" -r -a "(__qrdrop_complete_files)"

# TLS options
complete -c qrdrop -l secure -d "Enable HTTPS/TLS"
complete -c qrdrop -l cert -d "Custom TLS certificate file" -r -a "(__qrdrop_complete_files)"
complete -c qrdrop -l key -d "Custom TLS private key file" -r -a "(__qrdrop_complete_files)"

# Network options
complete -c qrdrop -l port -d "Specify port" -r
complete -c qrdrop -l host -d "Specify host IP or FQDN" -r
complete -c qrdrop -s i -l interface -d "Network interface" -r
complete -c qrdrop -l timeout -d "Set timeout in seconds" -r
complete -c qrdrop -l keep-alive -d "Run indefinitely"
complete -c qrdrop -l zip -d "Zip files before sharing"
complete -c qrdrop -l url-path -d "Custom URL path" -r

# Config options
complete -c qrdrop -l config -d "Custom config file path" -r -a "(__qrdrop_complete_files)"
complete -c qrdrop -l copy-url -d "Copy URL to clipboard"
complete -c qrdrop -l no-color -d "Disable colored output"

# Security options
complete -c qrdrop -l allow-ips -d "Restrict to specific IPs" -r
complete -c qrdrop -l rate-limit -d "Max requests per window" -r
complete -c qrdrop -l rate-limit-window -d "Rate limit window in seconds" -r
complete -c qrdrop -l allow-types -d "Restrict file types" -r

# Logging options
complete -c qrdrop -s v -l verbose -d "Verbose logging"
complete -c qrdrop -l debug -d "Debug logging"
complete -c qrdrop -l log-file -d "Write logs to file" -r -a "(__qrdrop_complete_files)"
complete -c qrdrop -l json-log -d "JSON log format"

# Other options
complete -c qrdrop -l interactive -d "Interactive file picker"
complete -c qrdrop -s h -l help -d "Show help"

# Subcommands
complete -c qrdrop -n '__fish_use_subcommand' -a completion -d "Generate shell completion"
complete -c qrdrop -n '__fish_use_subcommand' -a status -d "Show server status"
complete -c qrdrop -n '__fish_use_subcommand' -a config -d "Configuration commands"
complete -c qrdrop -n '__fish_use_subcommand' -a cert -d "Certificate commands"
complete -c qrdrop -n '__fish_seen_subcommand_from completion' -a "bash zsh fish powershell" -d "Shell type"
complete -c qrdrop -n '__fish_seen_subcommand_from config' -a "init" -d "Initialize config file"
complete -c qrdrop -n '__fish_seen_subcommand_from cert' -a "generate" -d "Generate TLS certificate"
`;
}

function generatePowerShellCompletion(): string {
  return `# PowerShell completion for qrdrop
Register-ArgumentCompleter -Native -CommandName qrdrop -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  
  $completions = @(
    # File options
    @{ Name = "-f"; Description = "File(s) to share" }
    @{ Name = "--file"; Description = "File(s) to share" }
    @{ Name = "-d"; Description = "Share directory" }
    @{ Name = "--directory"; Description = "Share directory" }
    @{ Name = "-o"; Description = "Output directory" }
    @{ Name = "--output"; Description = "Output directory" }
    
    # TLS options
    @{ Name = "--secure"; Description = "Enable HTTPS/TLS" }
    @{ Name = "--cert"; Description = "Custom TLS certificate file" }
    @{ Name = "--key"; Description = "Custom TLS private key file" }
    
    # Network options
    @{ Name = "--port"; Description = "Specify port" }
    @{ Name = "--host"; Description = "Specify host IP or FQDN" }
    @{ Name = "-i"; Description = "Network interface" }
    @{ Name = "--interface"; Description = "Network interface" }
    @{ Name = "--timeout"; Description = "Set timeout in seconds" }
    @{ Name = "--keep-alive"; Description = "Run indefinitely" }
    @{ Name = "--zip"; Description = "Zip files before sharing" }
    @{ Name = "--url-path"; Description = "Custom URL path" }
    
    # Config options
    @{ Name = "--config"; Description = "Custom config file path" }
    @{ Name = "--copy-url"; Description = "Copy URL to clipboard" }
    @{ Name = "--no-color"; Description = "Disable colored output" }
    
    # Security options
    @{ Name = "--allow-ips"; Description = "Restrict to specific IPs" }
    @{ Name = "--rate-limit"; Description = "Max requests per window" }
    @{ Name = "--rate-limit-window"; Description = "Rate limit window in seconds" }
    @{ Name = "--allow-types"; Description = "Restrict file types" }
    
    # Logging options
    @{ Name = "-v"; Description = "Verbose logging" }
    @{ Name = "--verbose"; Description = "Verbose logging" }
    @{ Name = "--debug"; Description = "Debug logging" }
    @{ Name = "--log-file"; Description = "Write logs to file" }
    @{ Name = "--json-log"; Description = "JSON log format" }
    
    # Other options
    @{ Name = "--interactive"; Description = "Interactive file picker" }
    @{ Name = "-h"; Description = "Show help" }
    @{ Name = "--help"; Description = "Show help" }
    
    # Subcommands
    @{ Name = "completion"; Description = "Generate shell completion" }
    @{ Name = "status"; Description = "Show server status" }
    @{ Name = "config"; Description = "Configuration commands" }
    @{ Name = "cert"; Description = "Certificate commands" }
  )
  
  $completions | Where-Object {
    $_.Name -like "$wordToComplete*"
  } | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new(
      $_.Name,
      $_.Name,
      'ParameterName',
      $_.Description
    )
  }
}
`;
}

/**
 * Generate shell completion script for the specified shell
 * @param shell - Shell name: "bash", "zsh", "fish", "powershell", or "pwsh"
 * @returns Completion script as a string
 * @throws Error if shell is not supported
 */
export function generateCompletion(shell: string): string {
  switch (shell.toLowerCase()) {
    case "bash":
      return generateBashCompletion();
    case "zsh":
      return generateZshCompletion();
    case "fish":
      return generateFishCompletion();
    case "powershell":
    case "pwsh":
      return generatePowerShellCompletion();
    default:
      throw new Error(`Unsupported shell: ${shell}. Supported shells: bash, zsh, fish, powershell`);
  }
}
