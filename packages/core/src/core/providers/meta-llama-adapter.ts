/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';
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

export class MetaLlamaAdapter implements ContentGenerator {
  private client: OpenAI;

  constructor(apiKey: string, baseURL: string = 'https://api.together.xyz/v1') {
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    try {
      const messages = this.convertGeminiToOpenAIMessages(request);
      
      const response = await this.client.chat.completions.create({
        model: request.model || 'meta-llama/Llama-3.1-70B-Instruct-Turbo',
        messages,
        temperature: request.config?.temperature,
        max_tokens: request.config?.maxOutputTokens,
        top_p: request.config?.topP,
        stop: request.config?.stopSequences,
        // Note: Most Llama providers don't support function calling yet
      });

      return this.convertOpenAIToGeminiResponse(response);
    } catch (error) {
      throw new Error(`Meta Llama API error: ${error}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const self = this;
    async function* streamGenerator(): AsyncGenerator<GenerateContentResponse> {
      try {
        const messages = self.convertGeminiToOpenAIMessages(request);
        
        const stream = await self.client.chat.completions.create({
          model: request.model || 'meta-llama/Llama-3.1-70B-Instruct-Turbo',
          messages,
          temperature: request.config?.temperature,
          max_tokens: request.config?.maxOutputTokens,
          top_p: request.config?.topP,
          stop: request.config?.stopSequences,
          stream: true,
        });

        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta) {
            yield self.convertOpenAIStreamChunkToGemini(chunk);
          }
        }
      } catch (error) {
        throw new Error(`Meta Llama API error: ${error}`);
      }
    }

    return streamGenerator();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    const text = this.extractTextFromContents(request.contents);
    // Llama typically uses similar tokenization to other models
    const estimatedTokens = Math.ceil(text.length / 4);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Most Llama providers don't offer embedding APIs
    throw new Error('Meta Llama providers typically do not support embeddings. Please use a different provider for embedding tasks.');
  }

  private convertGeminiToOpenAIMessages(request: GenerateContentParameters): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    
    // Add system prompt if present
    if (request.config?.systemInstruction) {
      messages.push({
        role: 'system',
        content: typeof request.config.systemInstruction === 'string' 
          ? request.config.systemInstruction 
          : this.extractTextFromContents(request.config.systemInstruction)
      });
    }

    // Convert contents to messages
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
            content: this.convertGeminiPartsToText(content.parts || []),
          });
        } else if (content.role === 'model') {
          messages.push({
            role: 'assistant',
            content: this.convertGeminiPartsToText(content.parts || []),
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

  private convertGeminiPartsToText(parts: any[]): string {
    return parts
      .map(part => {
        if (part.text) {
          return part.text;
        }
        // Most Llama providers don't support images yet
        if (part.inlineData) {
          return '[Image data not supported by this provider]';
        }
        return '';
      })
      .join(' ');
  }

  private convertOpenAIToGeminiResponse(response: OpenAI.Chat.ChatCompletion): GenerateContentResponse {
    const choice = response.choices[0];
    const content = choice.message.content || '';
    
    const result = new GenerateContentResponse();
    result.candidates = [
      {
        content: {
          parts: [{ text: content }],
          role: 'model',
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
        index: 0,
      },
    ];
    result.usageMetadata = {
      promptTokenCount: response.usage?.prompt_tokens || 0,
      candidatesTokenCount: response.usage?.completion_tokens || 0,
      totalTokenCount: response.usage?.total_tokens || 0,
    };
    return result;
  }

  private convertOpenAIStreamChunkToGemini(chunk: OpenAI.Chat.ChatCompletionChunk): GenerateContentResponse {
    const choice = chunk.choices[0];
    const content = choice.delta.content || '';
    
    const result = new GenerateContentResponse();
    result.candidates = [
      {
        content: {
          parts: [{ text: content }],
          role: 'model',
        },
        finishReason: choice.finish_reason ? this.mapFinishReason(choice.finish_reason) : undefined,
        index: 0,
      },
    ];
    return result;
  }

  private mapFinishReason(reason: string | null): FinishReason {
    switch (reason) {
      case 'stop':
        return FinishReason.STOP;
      case 'length':
        return FinishReason.MAX_TOKENS;
      case 'content_filter':
        return FinishReason.SAFETY;
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