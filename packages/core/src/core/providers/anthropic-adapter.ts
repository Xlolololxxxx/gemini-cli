/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  FinishReason,
} from '@google/genai';
import { ContentGenerator } from '../contentGenerator.js';

export class AnthropicAdapter implements ContentGenerator {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    try {
      const messages = this.convertGeminiToAnthropicMessages(request);
      const systemPrompt = this.extractSystemPrompt(request);
      
      const response = await this.client.messages.create({
        model: request.model || 'claude-3-5-sonnet-20241022',
        max_tokens: request.config?.maxOutputTokens || 4096,
        messages,
        system: systemPrompt,
        temperature: request.config?.temperature,
        top_p: request.config?.topP,
        stop_sequences: request.config?.stopSequences,
        tools: request.config?.tools ? this.convertGeminiToolsToAnthropic(request.config.tools) : undefined,
      });

      return this.convertAnthropicToGeminiResponse(response);
    } catch (error) {
      throw new Error(`Anthropic API error: ${error}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const self = this;
    async function* streamGenerator(): AsyncGenerator<GenerateContentResponse> {
      try {
        const messages = self.convertGeminiToAnthropicMessages(request);
        const systemPrompt = self.extractSystemPrompt(request);
        
        const stream = await self.client.messages.create({
          model: request.model || 'claude-3-5-sonnet-20241022',
          max_tokens: request.config?.maxOutputTokens || 4096,
          messages,
          system: systemPrompt,
          temperature: request.config?.temperature,
          top_p: request.config?.topP,
          stop_sequences: request.config?.stopSequences,
          tools: request.config?.tools ? self.convertGeminiToolsToAnthropic(request.config.tools) : undefined,
          stream: true,
        });

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            yield self.convertAnthropicStreamChunkToGemini(chunk);
          }
        }
      } catch (error) {
        throw new Error(`Anthropic API error: ${error}`);
      }
    }

    return streamGenerator();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Anthropic doesn't have a direct token counting API, estimate based on character count
    const text = this.extractTextFromContents(request.contents);
    // Claude typically uses ~3.5 characters per token
    const estimatedTokens = Math.ceil(text.length / 3.5);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Anthropic doesn't provide embeddings API
    throw new Error('Anthropic does not support embeddings. Please use a different provider for embedding tasks.');
  }

  private convertGeminiToAnthropicMessages(request: GenerateContentParameters): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    if (request.contents) {
      const contentsArray = this.normalizeContents(request.contents);
      for (const content of contentsArray) {
        if (typeof content === 'string') {
          // Handle string content as user message
          messages.push({
            role: 'user',
            content: content,
          });
        } else if (content.role === 'user') {
          messages.push({
            role: 'user',
            content: this.convertGeminiPartsToAnthropic(content.parts || []),
          });
        } else if (content.role === 'model') {
          messages.push({
            role: 'assistant',
            content: this.convertGeminiPartsToAnthropic(content.parts || []),
          });
        }
      }
    }

    return messages;
  }

  private normalizeContents(contents: any): any[] {
    if (Array.isArray(contents)) {
      return contents;
    }
    if (typeof contents === 'object' && contents.parts) {
      return [contents];
    }
    return [contents];
  }

  private convertGeminiPartsToAnthropic(parts: any[]): string | Anthropic.MessageParam['content'] {
    if (parts.length === 1 && parts[0].text && !parts[0].inlineData) {
      return parts[0].text;
    }

    const contentBlocks: any[] = [];
    for (const part of parts) {
      if (part.text) {
        contentBlocks.push({
          type: 'text',
          text: part.text,
        });
      } else if (part.inlineData) {
        // For now, represent images as text descriptions since Claude doesn't support base64 images in the same way
        contentBlocks.push({
          type: 'text',
          text: '[Image content - not supported in this adapter]',
        });
      }
    }

    return contentBlocks.length === 1 && contentBlocks[0].type === 'text'
      ? contentBlocks[0].text
      : contentBlocks;
  }

  private convertGeminiToolsToAnthropic(tools: any): Anthropic.Tool[] {
    const toolsArray = Array.isArray(tools) ? tools : [tools];
    return toolsArray.map(tool => ({
      name: tool.functionDeclaration.name,
      description: tool.functionDeclaration.description,
      input_schema: tool.functionDeclaration.parameters,
    }));
  }

  private extractSystemPrompt(request: GenerateContentParameters): string | undefined {
    if (request.config?.systemInstruction) {
      return typeof request.config.systemInstruction === 'string'
        ? request.config.systemInstruction
        : this.extractTextFromContents([request.config.systemInstruction]);
    }
    return undefined;
  }

  private convertAnthropicToGeminiResponse(response: Anthropic.Message): GenerateContentResponse {
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');
    
    const result = new GenerateContentResponse();
    result.candidates = [
      {
        content: {
          parts: [{ text: textContent }],
          role: 'model',
        },
        finishReason: this.mapFinishReason(response.stop_reason),
        index: 0,
      },
    ];
    result.usageMetadata = {
      promptTokenCount: response.usage.input_tokens,
      candidatesTokenCount: response.usage.output_tokens,
      totalTokenCount: response.usage.input_tokens + response.usage.output_tokens,
    };
    return result;
  }

  private convertAnthropicStreamChunkToGemini(chunk: any): GenerateContentResponse {
    const text = chunk.delta?.text || '';
    
    const result = new GenerateContentResponse();
    result.candidates = [
      {
        content: {
          parts: [{ text }],
          role: 'model',
        },
        index: 0,
      },
    ];
    return result;
  }

  private mapFinishReason(reason: string | null): FinishReason {
    switch (reason) {
      case 'end_turn':
        return FinishReason.STOP;
      case 'max_tokens':
        return FinishReason.MAX_TOKENS;
      case 'stop_sequence':
        return FinishReason.STOP;
      case 'tool_use':
        return FinishReason.STOP;
      default:
        return FinishReason.OTHER;
    }
  }

  private extractTextFromContents(contents: any): string {
    if (typeof contents === 'string') return contents;
    if (Array.isArray(contents)) {
      return contents
        .map(content => {
          if (typeof content === 'string') return content;
          if (content.parts) {
            return content.parts
              .map((part: any) => part.text || '')
              .join(' ');
          }
          return '';
        })
        .join(' ');
    }
    if (contents.parts) {
      return contents.parts
        .map((part: any) => part.text || '')
        .join(' ');
    }
    return '';
  }
}