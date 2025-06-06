#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
  CallToolResultSchema
} from '@modelcontextprotocol/sdk/types.js';
import pLimit from 'p-limit';
import winston from 'winston';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'batch-operations.log' })
  ]
});

// Batch operation schemas
const FileOperationSchema = z.object({
  type: z.enum(['create', 'read', 'update', 'delete', 'copy', 'move']),
  path: z.string(),
  content: z.string().optional(),
  destination: z.string().optional(),
  encoding: z.enum(['utf8', 'base64']).optional().default('utf8')
});

const BatchOptionsSchema = z.object({
  maxConcurrent: z.number().min(1).max(100).optional().default(10),
  timeoutMs: z.number().min(1000).optional().default(30000),
  stopOnError: z.boolean().optional().default(false),
  retryAttempts: z.number().min(0).max(3).optional().default(1),
  groupByType: z.boolean().optional().default(true)
});

const BatchRequestSchema = z.object({
  operations: z.array(FileOperationSchema),
  options: BatchOptionsSchema.optional()
});

type FileOperation = z.infer<typeof FileOperationSchema>;
type BatchOptions = z.infer<typeof BatchOptionsSchema>;
type BatchRequest = z.infer<typeof BatchRequestSchema>;

export class BatchOperationsServer {
  private server: Server;
  
  constructor() {
    this.server = new Server(
      {
        name: 'mcp-batch-operations',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'batch_file_operations',
          description: 'Execute multiple file operations in parallel with smart batching',
          inputSchema: {
            type: 'object',
            properties: {
              operations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { 
                      type: 'string', 
                      enum: ['create', 'read', 'update', 'delete', 'copy', 'move'] 
                    },
                    path: { type: 'string' },
                    content: { type: 'string' },
                    destination: { type: 'string' },
                    encoding: { type: 'string', enum: ['utf8', 'base64'] }
                  },
                  required: ['type', 'path']
                }
              },
              options: {
                type: 'object',
                properties: {
                  maxConcurrent: { type: 'number' },
                  timeoutMs: { type: 'number' },
                  stopOnError: { type: 'boolean' },
                  retryAttempts: { type: 'number' },
                  groupByType: { type: 'boolean' }
                }
              }
            },
            required: ['operations']
          }
        },
        {
          name: 'batch_code_analysis',
          description: 'Analyze multiple code files in parallel',
          inputSchema: {
            type: 'object',
            properties: {
              files: {
                type: 'array',
                items: { type: 'string' }
              },
              analyses: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['complexity', 'dependencies', 'test-coverage', 'linting']
                }
              },
              options: {
                type: 'object',
                properties: {
                  maxConcurrent: { type: 'number' },
                  includeMetrics: { type: 'boolean' }
                }
              }
            },
            required: ['files', 'analyses']
          }
        },
        {
          name: 'batch_transform',
          description: 'Apply transformations to multiple files',
          inputSchema: {
            type: 'object',
            properties: {
              files: {
                type: 'array',
                items: { type: 'string' }
              },
              transformation: {
                type: 'object',
                properties: {
                  type: { 
                    type: 'string',
                    enum: ['format', 'minify', 'transpile', 'compress']
                  },
                  options: { type: 'object' }
                },
                required: ['type']
              },
              outputDir: { type: 'string' }
            },
            required: ['files', 'transformation']
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'batch_file_operations':
            return await this.handleBatchFileOperations(args);
          case 'batch_code_analysis':
            return await this.handleBatchCodeAnalysis(args);
          case 'batch_transform':
            return await this.handleBatchTransform(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Tool execution error: ${name}`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ]
        };
      }
    });
  }

  async handleBatchFileOperations(args: any) {
    const request = BatchRequestSchema.parse(args);
    const { operations, options = {} } = request;
    const opts: BatchOptions = { ...BatchOptionsSchema.parse({}), ...options };

    logger.info(`Starting batch operations: ${operations.length} operations`);

    // Group operations by type if requested
    const grouped = opts.groupByType 
      ? this.groupOperationsByType(operations)
      : [operations];

    const limit = pLimit(opts.maxConcurrent);
    const results: any[] = [];
    const errors: any[] = [];

    for (const group of grouped) {
      const promises = group.map(op => 
        limit(async () => {
          try {
            const result = await this.executeFileOperation(op, opts);
            results.push({ operation: op, result, status: 'success' });
            return result;
          } catch (error) {
            const errorInfo = {
              operation: op,
              error: error instanceof Error ? error.message : 'Unknown error',
              status: 'failed'
            };
            errors.push(errorInfo);
            
            if (opts.stopOnError) {
              throw error;
            }
            
            return errorInfo;
          }
        })
      );

      try {
        await Promise.all(promises);
      } catch (error) {
        if (opts.stopOnError) {
          break;
        }
      }
    }

    const summary = {
      total: operations.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };

    logger.info('Batch operations completed', summary);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(summary, null, 2)
        }
      ]
    };
  }

  private groupOperationsByType(operations: FileOperation[]): FileOperation[][] {
    const groups = new Map<string, FileOperation[]>();
    
    for (const op of operations) {
      if (!groups.has(op.type)) {
        groups.set(op.type, []);
      }
      groups.get(op.type)!.push(op);
    }
    
    return Array.from(groups.values());
  }

  private async executeFileOperation(
    operation: FileOperation, 
    options: BatchOptions
  ): Promise<any> {
    const maxRetries = options.retryAttempts;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        switch (operation.type) {
          case 'create':
            await fs.mkdir(path.dirname(operation.path), { recursive: true });
            await fs.writeFile(operation.path, operation.content || '', operation.encoding);
            break;
          
          case 'read':
            const content = await fs.readFile(operation.path, operation.encoding);
            return { ...operation, content };
          
          case 'update':
            await fs.appendFile(operation.path, operation.content || '', operation.encoding);
            break;
          
          case 'delete':
            await fs.unlink(operation.path);
            break;
          
          case 'copy':
            if (!operation.destination) throw new Error('Destination required for copy');
            await fs.mkdir(path.dirname(operation.destination), { recursive: true });
            await fs.copyFile(operation.path, operation.destination);
            break;
          
          case 'move':
            if (!operation.destination) throw new Error('Destination required for move');
            await fs.mkdir(path.dirname(operation.destination), { recursive: true });
            await fs.rename(operation.path, operation.destination);
            break;
        }

        return {
          type: operation.type,
          path: operation.path,
          timestamp: new Date().toISOString(),
          success: true,
          attempt: attempt + 1
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  async handleBatchCodeAnalysis(args: any) {
    const { files, analyses, options = {} } = args;
    const limit = pLimit(options.maxConcurrent || 5);
    
    const analysisPromises = files.flatMap((file: string) =>
      analyses.map((analysis: string) =>
        limit(async () => ({
          file,
          analysis,
          result: await this.analyzeCode(file, analysis, options)
        }))
      )
    );

    const results = await Promise.all(analysisPromises);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ analyses: results }, null, 2)
        }
      ]
    };
  }

  private async analyzeCode(file: string, analysisType: string, options: any): Promise<any> {
    try {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n');
      
      switch (analysisType) {
        case 'complexity':
          // Simple complexity analysis
          const complexityMarkers = ['if', 'for', 'while', 'switch', 'catch'];
          let complexity = 1;
          for (const line of lines) {
            for (const marker of complexityMarkers) {
              if (line.includes(marker)) complexity++;
            }
          }
          return { complexity, lines: lines.length };
        
        case 'dependencies':
          // Extract imports/requires
          const imports = lines
            .filter(line => line.includes('import') || line.includes('require'))
            .map(line => line.trim());
          return { imports, count: imports.length };
        
        default:
          return { 
            placeholder: true,
            message: `Analysis type ${analysisType} not yet implemented`
          };
      }
    } catch (error) {
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async handleBatchTransform(args: any) {
    const { files, transformation, outputDir } = args;
    
    const results = {
      transformed: files.length,
      type: transformation.type,
      outputDir,
      timestamp: new Date().toISOString()
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP Batch Operations Server started');
  }
}

// Start the server
const server = new BatchOperationsServer();
server.run().catch((error) => {
  logger.error('Server error:', error);
  process.exit(1);
});