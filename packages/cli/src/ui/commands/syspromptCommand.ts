/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCoreSystemPrompt, GEMINI_CONFIG_DIR } from '@google/gemini-cli-core';
import fs from 'node:fs';
import path from 'node:path';
import { MessageType } from '../types.js';
import { SlashCommand, SlashCommandActionReturn } from './types.js';

export const syspromptCommand: SlashCommand = {
  name: 'sysprompt',
  description: 'Commands for managing system prompts.',
  subCommands: [
    {
      name: 'show',
      description: 'Show the current system prompt.',
      action: async (context) => {
        try {
          const systemPrompt = getCoreSystemPrompt();
          const currentLength = systemPrompt.length;
          const currentWordCount = systemPrompt.split(/\s+/).length;
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Current system prompt (${currentLength} characters, ~${currentWordCount} words):\n\n---\n${systemPrompt}\n---`,
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error retrieving system prompt: ${error}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'edit',
      description: 'Open the system prompt for editing in your default editor.',
      action: async (context) => {
        try {
          const systemMdPath = path.resolve(path.join(GEMINI_CONFIG_DIR, 'system.md'));
          
          // Create the .gemini directory if it doesn't exist
          if (!fs.existsSync(GEMINI_CONFIG_DIR)) {
            fs.mkdirSync(GEMINI_CONFIG_DIR, { recursive: true });
          }
          
          // Create system.md with current system prompt if it doesn't exist
          if (!fs.existsSync(systemMdPath)) {
            const currentPrompt = getCoreSystemPrompt();
            fs.writeFileSync(systemMdPath, currentPrompt, 'utf8');
          }
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Opening system prompt for editing: ${systemMdPath}`,
            },
            Date.now(),
          );

          return {
            type: 'tool',
            toolName: 'editor',
            toolArgs: { 
              file_path: systemMdPath,
              line: 1 
            },
          };
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Error opening system prompt for editing: ${error}`,
          };
        }
      },
    },
    {
      name: 'reset',
      description: 'Reset the system prompt to the default.',
      action: async (context) => {
        try {
          const systemMdPath = path.resolve(path.join(GEMINI_CONFIG_DIR, 'system.md'));
          
          // Remove the custom system.md file if it exists
          if (fs.existsSync(systemMdPath)) {
            fs.unlinkSync(systemMdPath);
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: `System prompt reset to default. Removed custom system prompt file: ${systemMdPath}`,
              },
              Date.now(),
            );
          } else {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'System prompt is already using the default configuration.',
              },
              Date.now(),
            );
          }
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Error resetting system prompt: ${error}`,
          };
        }
      },
    },
    {
      name: 'save',
      description: 'Save a custom system prompt from the provided text.',
      action: (context, args): SlashCommandActionReturn | void => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /sysprompt save <custom system prompt text>',
          };
        }

        try {
          const systemMdPath = path.resolve(path.join(GEMINI_CONFIG_DIR, 'system.md'));
          
          // Create the .gemini directory if it doesn't exist
          if (!fs.existsSync(GEMINI_CONFIG_DIR)) {
            fs.mkdirSync(GEMINI_CONFIG_DIR, { recursive: true });
          }
          
          // Save the custom system prompt
          fs.writeFileSync(systemMdPath, args.trim(), 'utf8');
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Custom system prompt saved to: ${systemMdPath}`,
            },
            Date.now(),
          );
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Error saving custom system prompt: ${error}`,
          };
        }
      },
    },
    {
      name: 'reload',
      description: 'Reload the system prompt (useful after making changes).',
      action: async (context) => {
        try {
          // The system prompt will be automatically reloaded on the next request
          // since getCoreSystemPrompt() reads from the file system each time
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: 'System prompt will be reloaded on the next conversation turn.',
            },
            Date.now(),
          );
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Error reloading system prompt: ${error}`,
          };
        }
      },
    },
  ],
};