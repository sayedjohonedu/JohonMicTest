const AI_PROVIDER_MODELS = {
  openai: [
    "gpt-5.5-pro", "gpt-5.5", "gpt-5.4-pro", "gpt-5.4",
    "gpt-5.4-mini", "gpt-5.4-nano", "gpt-audio", "gpt-audio-mini",
    "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4-turbo", "gpt-3.5-turbo",
    "o4-mini-deep-research", "o3-deep-research", "o3", "o1"
  ],
  anthropic: [
    "claude-opus-4.7", "claude-opus-4.6", "claude-opus-4.6-fast",
    "claude-sonnet-4.6", "claude-opus-4.5", "claude-sonnet-4.5",
    "claude-haiku-4.5", "claude-opus-4.1", "claude-opus-4",
    "claude-sonnet-4", "claude-3.7-sonnet", "claude-3.7-sonnet:thinking",
    "claude-3.5-haiku", "claude-3-haiku", "claude-opus-latest",
    "claude-sonnet-latest", "claude-haiku-latest"
  ],
  gemini: [
    "gemini-3.1-pro-preview", "gemini-3.1-pro-preview-customtools",
    "gemini-3.1-flash-lite-preview", "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview", "gemini-3-flash-preview",
    "gemini-2.5-pro", "gemini-2.5-pro-preview", "gemini-2.5-flash",
    "gemini-2.5-flash-image", "gemini-2.5-flash-lite",
    "gemini-2.0-flash-001", "gemini-2.0-flash-lite-001",
    "gemini-pro-latest", "gemini-flash-latest"
  ],
  groq: [
    "llama-4-maverick-17b-128e-instruct", "llama-4-scout-17b-16e-instruct",
    "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it",
    "mixtral-8x7b-32768", "whisper-large-v3", "qwen3-32b", "llama-guard-3-8b"
  ],
  openrouter: [
    "openrouter/auto", "openrouter/free", "openrouter/bodybuilder",
    "openrouter/pareto-code", "openrouter/owl-alpha",
    
    "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash", "deepseek/deepseek-v3.2",
    "deepseek/deepseek-r1", "deepseek/deepseek-chat",
    
    "qwen/qwen3.6-max-preview", "qwen/qwen3.6-plus", "qwen/qwen3.6-flash",
    "qwen/qwen3-max", "qwen/qwen3-coder", "qwen/qwen-vl-max", "qwen/qwen-vl-plus",
    
    "meta-llama/llama-4-maverick", "meta-llama/llama-4-scout", "meta-llama/llama-3.3-70b-instruct",
    "meta-llama/llama-3.2-90b-vision-instruct", "meta-llama/llama-3.1-405b-instruct",
    
    "mistralai/mistral-large-2512", "mistralai/mistral-large-2411", "mistralai/mistral-small-2603",
    "mistralai/codestral-2508", "mistralai/pixtral-large-2411", "mistralai/mistral-nemo",
    "mistralai/mixtral-8x22b-instruct",
    
    "x-ai/grok-4.3", "x-ai/grok-4.20", "x-ai/grok-4-fast", "x-ai/grok-3", "x-ai/grok-3-mini",
    
    "cohere/command-r-plus-08-2024", "cohere/command-r7b-12-2024", "cohere/command-a",
    
    "perplexity/sonar-pro-search", "perplexity/sonar-reasoning-pro", "perplexity/sonar-pro",
    
    "z-ai/glm-5.1", "z-ai/glm-5-turbo", "z-ai/glm-4.7-flash",
    
    "microsoft/phi-4", "microsoft/wizardlm-2-8x22b",
    
    "anthropic/claude-3.7-sonnet", "anthropic/claude-3.5-sonnet", "anthropic/claude-3-haiku",
    
    "openai/o3", "openai/o4-mini", "openai/gpt-5.4", "openai/gpt-4o",
    
    "google/gemini-3.1-pro-preview", "google/gemini-2.5-flash",
    
    "liquid/lfm-2-24b-a2b", "nousresearch/hermes-4-70b", "thedrummer/cydonia-24b-v4.1"
  ],
  nvidia: [
    "nemotron-3-nano-omni-30b-a3b-reasoning", "nemotron-3-super-120b-a12b",
    "nemotron-3-nano-30b-a3b", "nemotron-nano-12b-v2-vl",
    "llama-3.3-nemotron-super-49b-v1.5", "nemotron-nano-9b-v2",
    "llama-3.1-nemotron-70b-instruct", "meta/llama-3.3-70b-instruct",
    "meta/llama-3.1-405b-instruct", "meta/llama-3.1-70b-instruct",
    "z-ai/glm4.7", "mistralai/mistral-large-2-instruct", "01-ai/yi-large",
    "abacusai/dracarys-llama-3.1-70b-instruct", "adept/fuyu-8b",
    "ai21labs/jamba-1.5-large-instruct", "aisingapore/sea-lion-7b-instruct",
    "baai/bge-m3", "bigcode/starcoder2-15b", "bytedance/seed-oss-36b-instruct",
    "databricks/dbrx-instruct", "deepseek-ai/deepseek-coder-6.7b-instruct",
    "deepseek-ai/deepseek-v3.1-terminus", "deepseek-ai/deepseek-v3.2",
    "deepseek-ai/deepseek-v4-flash", "deepseek-ai/deepseek-v4-pro",
    "google/codegemma-1.1-7b", "google/codegemma-7b", "google/deplot",
    "google/gemma-2-2b-it", "google/gemma-2b", "google/gemma-3-12b-it",
    "google/gemma-3-27b-it", "google/gemma-3-4b-it", "google/gemma-3n-e2b-it",
    "google/gemma-3n-e4b-it", "google/gemma-4-31b-it", "google/recurrentgemma-2b",
    "ibm/granite-3.0-3b-a800m-instruct", "ibm/granite-3.0-8b-instruct",
    "ibm/granite-34b-code-instruct", "ibm/granite-8b-code-instruct",
    "meta/codellama-70b", "meta/llama-3.1-8b-instruct",
    "meta/llama-3.2-11b-vision-instruct", "meta/llama-3.2-1b-instruct",
    "meta/llama-3.2-3b-instruct", "meta/llama-3.2-90b-vision-instruct",
    "meta/llama-4-maverick-17b-128e-instruct", "meta/llama-guard-4-12b",
    "meta/llama2-70b", "microsoft/kosmos-2", "microsoft/phi-3-vision-128k-instruct",
    "microsoft/phi-3.5-moe-instruct", "microsoft/phi-4-mini-instruct",
    "microsoft/phi-4-multimodal-instruct", "minimaxai/minimax-m2.5",
    "minimaxai/minimax-m2.7", "mistralai/codestral-22b-instruct-v0.1",
    "mistralai/devstral-2-123b-instruct-2512", "mistralai/magistral-small-2506",
    "mistralai/ministral-14b-instruct-2512", "mistralai/mistral-7b-instruct-v0.3",
    "mistralai/mistral-large", "mistralai/mistral-large-3-675b-instruct-2512",
    "mistralai/mistral-medium-3-instruct", "mistralai/mistral-nemotron",
    "mistralai/mistral-small-4-119b-2603", "mistralai/mixtral-8x22b-instruct-v0.1",
    "mistralai/mixtral-8x22b-v0.1", "mistralai/mixtral-8x7b-instruct-v0.1",
    "moonshotai/kimi-k2-instruct", "moonshotai/kimi-k2-instruct-0905",
    "moonshotai/kimi-k2-thinking", "moonshotai/kimi-k2.5",
    "nv-mistralai/mistral-nemo-12b-instruct", "nvidia/ai-synthetic-video-detector",
    "nvidia/cosmos-reason2-8b", "nvidia/embed-qa-4", "nvidia/gliner-pii",
    "nvidia/ising-calibration-1-35b-a3b", "nvidia/llama-3.1-nemoguard-8b-content-safety",
    "nvidia/llama-3.1-nemoguard-8b-topic-control", "nvidia/llama-3.1-nemotron-51b-instruct",
    "nvidia/llama-3.1-nemotron-70b-instruct", "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
    "nvidia/llama-3.1-nemotron-ultra-253b-v1", "nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1",
    "nvidia/llama-3.2-nemoretriever-300m-embed-v1", "nvidia/llama-3.2-nv-embedqa-1b-v1",
    "nvidia/llama-3.2-nv-embedqa-1b-v2", "nvidia/llama-3.3-nemotron-super-49b-v1",
    "nvidia/llama-3.3-nemotron-super-49b-v1.5", "nvidia/llama-nemotron-embed-1b-v2",
    "nvidia/llama-nemotron-embed-vl-1b-v2", "nvidia/llama3-chatqa-1.5-70b",
    "nvidia/mistral-nemo-minitron-8b-8k-instruct", "nvidia/nemoretriever-parse",
    "nvidia/nemotron-3-content-safety", "nvidia/nemotron-3-nano-30b-a3b",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-4-340b-instruct", "nvidia/nemotron-4-340b-reward",
    "nvidia/nemotron-content-safety-reasoning-4b", "nvidia/nemotron-mini-4b-instruct",
    "nvidia/nemotron-nano-12b-v2-vl", "nvidia/nemotron-nano-3-30b-a3b",
    "nvidia/nemotron-parse", "nvidia/neva-22b", "nvidia/nv-embed-v1",
    "nvidia/nv-embedcode-7b-v1", "nvidia/nv-embedqa-e5-v5", "nvidia/nv-embedqa-mistral-7b-v2",
    "nvidia/nvclip", "nvidia/nvidia-nemotron-nano-9b-v2", "nvidia/riva-translate-4b-instruct",
    "nvidia/riva-translate-4b-instruct-v1.1", "nvidia/vila", "openai/gpt-oss-120b",
    "openai/gpt-oss-20b", "qwen/qwen2.5-coder-32b-instruct",
    "qwen/qwen3-coder-480b-a35b-instruct", "qwen/qwen3-next-80b-a3b-instruct",
    "qwen/qwen3-next-80b-a3b-thinking", "qwen/qwen3.5-122b-a10b",
    "qwen/qwen3.5-397b-a17b", "sarvamai/sarvam-m", "snowflake/arctic-embed-l",
    "stepfun-ai/step-3.5-flash", "stockmark/stockmark-2-100b-instruct",
    "upstage/solar-10.7b-instruct", "writer/palmyra-creative-122b",
    "writer/palmyra-fin-70b-32k", "writer/palmyra-med-70b",
    "writer/palmyra-med-70b-32k", "z-ai/glm-5.1", "z-ai/glm5", "zyphra/zamba2-7b-instruct"
  ],
  custom: [],
};
