/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { AuthType, createContentGeneratorConfig } from './contentGenerator.js';

describe('Multi-provider support', () => {
  it('should support OpenAI authentication', () => {
    const mockConfig = {
      getModel: () => 'gpt-4o',
      getProxy: () => undefined,
    };

    process.env.OPENAI_API_KEY = 'test-key';
    
    const config = createContentGeneratorConfig(
      mockConfig as any,
      AuthType.USE_OPENAI
    );

    expect(config.authType).toBe(AuthType.USE_OPENAI);
    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('test-key');
    expect(config.model).toBe('gpt-4o');
    
    delete process.env.OPENAI_API_KEY;
  });

  it('should support Anthropic authentication', () => {
    const mockConfig = {
      getModel: () => 'claude-3-5-sonnet-20241022',
      getProxy: () => undefined,
    };

    process.env.ANTHROPIC_API_KEY = 'test-key';
    
    const config = createContentGeneratorConfig(
      mockConfig as any,
      AuthType.USE_ANTHROPIC
    );

    expect(config.authType).toBe(AuthType.USE_ANTHROPIC);
    expect(config.provider).toBe('anthropic');
    expect(config.apiKey).toBe('test-key');
    expect(config.model).toBe('claude-3-5-sonnet-20241022');
    
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should support Meta Llama authentication', () => {
    const mockConfig = {
      getModel: () => 'llama-3.1-70b-instruct',
      getProxy: () => undefined,
    };

    process.env.META_API_KEY = 'test-key';
    
    const config = createContentGeneratorConfig(
      mockConfig as any,
      AuthType.USE_META_LLAMA
    );

    expect(config.authType).toBe(AuthType.USE_META_LLAMA);
    expect(config.provider).toBe('meta');
    expect(config.apiKey).toBe('test-key');
    expect(config.model).toBe('llama-3.1-70b-instruct');
    
    delete process.env.META_API_KEY;
  });

  it('should use default models for each provider when Gemini model is specified', () => {
    const mockConfig = {
      getModel: () => 'gemini-2.5-pro',
      getProxy: () => undefined,
    };

    // Test OpenAI fallback
    process.env.OPENAI_API_KEY = 'test-key';
    const openaiConfig = createContentGeneratorConfig(
      mockConfig as any,
      AuthType.USE_OPENAI
    );
    expect(openaiConfig.model).toBe('gpt-4o');
    delete process.env.OPENAI_API_KEY;

    // Test Anthropic fallback
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const anthropicConfig = createContentGeneratorConfig(
      mockConfig as any,
      AuthType.USE_ANTHROPIC
    );
    expect(anthropicConfig.model).toBe('claude-3-5-sonnet-20241022');
    delete process.env.ANTHROPIC_API_KEY;

    // Test Meta fallback
    process.env.META_API_KEY = 'test-key';
    const metaConfig = createContentGeneratorConfig(
      mockConfig as any,
      AuthType.USE_META_LLAMA
    );
    expect(metaConfig.model).toBe('llama-3.1-70b-instruct');
    delete process.env.META_API_KEY;
  });
});