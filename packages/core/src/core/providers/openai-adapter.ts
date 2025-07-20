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

export class OpenAIAdapter implements ContentGenerator {
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    try {
      // Convert Gemini format to OpenAI format
      const messages = this.convertGeminiToOpenAIMessages(request);
      
      const response = await this.client.chat.completions.create({
        model: request.model || 'gpt-4o',
        messages,
        temperature: request.config?.temperature,
        max_tokens: request.config?.maxOutputTokens,
        top_p: request.config?.topP,
        stop: request.config?.stopSequences,
        tools: request.config?.tools ? this.convertGeminiToolsToOpenAI(request.config.tools) : undefined,
      });

      return this.convertOpenAIToGeminiResponse(response);
    } catch (error) {
      throw new Error(`OpenAI API error: ${error}`);
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
          model: request.model || 'gpt-4o',
          messages,
          temperature: request.config?.temperature,
          max_tokens: request.config?.maxOutputTokens,
          top_p: request.config?.topP,
          stop: request.config?.stopSequences,
          tools: request.config?.tools ? self.convertGeminiToolsToOpenAI(request.config.tools) : undefined,
          stream: true,
        });

        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta) {
            yield self.convertOpenAIStreamChunkToGemini(chunk);
          }
        }
      } catch (error) {
        throw new Error(`OpenAI API error: ${error}`);
      }
    }

    return streamGenerator();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // OpenAI doesn't have a direct token counting API, so we'll estimate
    // This is a simplified estimation - in practice you might want to use tiktoken
    const text = this.extractTextFromContents(request.contents);
    const estimatedTokens = Math.ceil(text.length / 4); // Rough estimation
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    try {
      const text = this.extractTextFromContents(request.contents);
      
      const response = await this.client.embeddings.create({
        model: request.model || 'text-embedding-3-small',
        input: text,
      });

      return {
        embeddings: [
          {
            values: response.data[0].embedding,
          },
        ],
      };
    } catch (error) {
      throw new Error(`OpenAI Embeddings API error: ${error}`);
    }
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
            content: this.convertGeminiPartsToOpenAI(content.parts || []),
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

  private convertGeminiPartsToOpenAI(parts: any[]): string | OpenAI.Chat.ChatCompletionContentPart[] {
    if (parts.length === 1 && parts[0].text) {
      return parts[0].text;
    }

    const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const part of parts) {
      if (part.text) {
        contentParts.push({
          type: 'text',
          text: part.text,
        });
      } else if (part.inlineData) {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          },
        });
      }
    }

    return contentParts.length === 1 && contentParts[0].type === 'text'
      ? (contentParts[0] as any).text
      : contentParts;
  }

  private convertGeminiPartsToText(parts: any[]): string {
    return parts
      .map(part => {
        if (part.text) {
          return part.text;
        }
        if (part.inlineData) {
          return '[Image data]';
        }
        return '';
      })
      .join(' ');
  }

  private convertGeminiToolsToOpenAI(tools: any[]): OpenAI.Chat.ChatCompletionTool[] {
    const toolsArray = Array.isArray(tools) ? tools : [tools];
    return toolsArray.map(tool => ({
      type: 'function',
      function: {
        name: tool.functionDeclaration.name,
        description: tool.functionDeclaration.description,
        parameters: tool.functionDeclaration.parameters,
      },
    }));
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
      case 'tool_calls':
        return FinishReason.STOP;
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