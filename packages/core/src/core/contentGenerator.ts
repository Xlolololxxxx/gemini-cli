/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';
import { getEffectiveModel } from './modelCheck.js';
import { UserTierId } from '../code_assist/types.js';
import { OpenAIAdapter } from './providers/openai-adapter.js';
import { AnthropicAdapter } from './providers/anthropic-adapter.js';
import { MetaLlamaAdapter } from './providers/meta-llama-adapter.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  getTier?(): Promise<UserTierId | undefined>;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_OPENAI = 'openai-api-key',
  USE_ANTHROPIC = 'anthropic-api-key',
  USE_META_LLAMA = 'meta-llama-api-key',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  proxy?: string | undefined;
  provider?: 'google' | 'openai' | 'anthropic' | 'meta' | undefined;
};

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const googleApiKey = process.env.GOOGLE_API_KEY || undefined;
  const openaiApiKey = process.env.OPENAI_API_KEY || undefined;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || undefined;
  const metaApiKey = process.env.META_API_KEY || process.env.LLAMA_API_KEY || undefined;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || undefined;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config.getModel() || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
    proxy: config?.getProxy(),
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    contentGeneratorConfig.provider = 'google';
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;
    contentGeneratorConfig.provider = 'google';
    getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
      contentGeneratorConfig.proxy,
    );

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;
    contentGeneratorConfig.provider = 'google';

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_OPENAI && openaiApiKey) {
    contentGeneratorConfig.apiKey = openaiApiKey;
    contentGeneratorConfig.provider = 'openai';
    // Use GPT-4o as default for OpenAI if model is Gemini-specific
    if (contentGeneratorConfig.model.includes('gemini')) {
      contentGeneratorConfig.model = 'gpt-4o';
    }
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_ANTHROPIC && anthropicApiKey) {
    contentGeneratorConfig.apiKey = anthropicApiKey;
    contentGeneratorConfig.provider = 'anthropic';
    // Use Claude 3.5 Sonnet as default for Anthropic if model is Gemini-specific
    if (contentGeneratorConfig.model.includes('gemini')) {
      contentGeneratorConfig.model = 'claude-3-5-sonnet-20241022';
    }
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_META_LLAMA && metaApiKey) {
    contentGeneratorConfig.apiKey = metaApiKey;
    contentGeneratorConfig.provider = 'meta';
    // Use Llama 3.1 as default for Meta if model is Gemini-specific
    if (contentGeneratorConfig.model.includes('gemini')) {
      contentGeneratorConfig.model = 'llama-3.1-70b-instruct';
    }
    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };

  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    return createCodeAssistContentGenerator(
      httpOptions,
      config.authType,
      gcConfig,
      sessionId,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_OPENAI) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required but not provided');
    }
    return new OpenAIAdapter(config.apiKey, config.proxy);
  }

  if (config.authType === AuthType.USE_ANTHROPIC) {
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required but not provided');
    }
    return new AnthropicAdapter(config.apiKey);
  }

  if (config.authType === AuthType.USE_META_LLAMA) {
    if (!config.apiKey) {
      throw new Error('Meta Llama API key is required but not provided');
    }
    // Default to Together.ai for Llama, but allow custom base URL via proxy
    const baseURL = config.proxy || 'https://api.together.xyz/v1';
    return new MetaLlamaAdapter(config.apiKey, baseURL);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
