# Multi-Provider API Support

The Gemini CLI now supports multiple AI providers beyond Google's Gemini. You can use API keys from any of the top 4 providers:

## Supported Providers

### 1. OpenAI (GPT Models)
Set your OpenAI API key:
```bash
export OPENAI_API_KEY="your-openai-api-key"
```

### 2. Anthropic (Claude Models)  
Set your Anthropic API key:
```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

### 3. Meta/Llama Models
Set your Meta/Llama API key (works with Together.ai and other providers):
```bash
export META_API_KEY="your-meta-api-key"
# or
export LLAMA_API_KEY="your-llama-api-key"
```

### 4. Google (Gemini/Vertex AI)
Existing authentication methods continue to work:
```bash
export GEMINI_API_KEY="your-gemini-api-key"
export GOOGLE_API_KEY="your-google-api-key"
```

## Usage

The CLI will automatically detect which provider to use based on the available API keys. You can also specify models directly:

```bash
# Use OpenAI GPT-4o
gemini --model gpt-4o "Your prompt here"

# Use Anthropic Claude
gemini --model claude-3-5-sonnet-20241022 "Your prompt here"

# Use Meta Llama
gemini --model llama-3.1-70b-instruct "Your prompt here"
```

## Default Models

When using a Gemini-specific model name with other providers, the CLI automatically selects appropriate defaults:

- **OpenAI**: `gpt-4o`
- **Anthropic**: `claude-3-5-sonnet-20241022`  
- **Meta/Llama**: `llama-3.1-70b-instruct`

# System Prompt Management

The `/sysprompt` command allows you to customize the system prompt that guides the AI's behavior.

## Available Commands

### View Current System Prompt
```
/sysprompt show
```
Displays the current system prompt with character and word count.

### Edit System Prompt
```
/sysprompt edit
```
Opens the system prompt in your default editor. Creates `.gemini/system.md` if it doesn't exist.

### Save Custom System Prompt
```
/sysprompt save Your custom system prompt here...
```
Saves a custom system prompt to `.gemini/system.md`.

### Reset to Default
```
/sysprompt reset
```
Removes any custom system prompt and returns to the default.

### Reload System Prompt
```
/sysprompt reload
```
Reloads the system prompt (useful after making external changes).

## Custom System Prompts

Custom system prompts are stored in `.gemini/system.md` in your project directory. You can also set the `GEMINI_SYSTEM_MD` environment variable to use a different file:

```bash
# Use default location (.gemini/system.md)
export GEMINI_SYSTEM_MD=true

# Use custom file
export GEMINI_SYSTEM_MD="/path/to/your/system-prompt.md"

# Disable custom system prompt
export GEMINI_SYSTEM_MD=false
```

## Enhanced Default System Prompt

The default system prompt has been enhanced with:

- **Comprehensive tool descriptions**: Clear explanations of all available tools
- **Provider-agnostic language**: Works optimally with any supported AI provider
- **Better organization**: Tools are categorized (File System, Execution, Utility, etc.)
- **Improved workflows**: Enhanced guidance for software engineering tasks

The system prompt now includes detailed descriptions of tools like:
- File operations (`read-file`, `write-file`, `edit`)
- Search capabilities (`grep`, `glob`)
- Code execution (`shell`)
- Web access (`web-fetch`)
- Memory management (`save_memory`)