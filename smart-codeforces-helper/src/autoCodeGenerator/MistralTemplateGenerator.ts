import { Mistral } from '@mistralai/mistralai';
import { ContentChunk } from '@mistralai/mistralai/models/components';

// Interface matching your existing structure
interface TestCase {
    input: string;
    output: string;
    explanation?: string;
}

interface ProblemData {
    title: string;
    timeLimit: string;
    memoryLimit: string;
    description: string;
    inputFormat: string;
    outputFormat: string;
    sampleTests: TestCase[];
    source: string;
    difficulty?: string;
}

class MistralTemplateGenerator {
    private client: Mistral;

    constructor(apiKey: string) {
        this.client = new Mistral({ apiKey: apiKey });
    }

    /**
     * Generates a C++ template by calling Mistral LLM
     * @param problemData - Complete problem data from Codeforces
     * @returns Promise<string> - Generated C++ template code
     */
    async generateCppTemplateWithLLM(problemData: ProblemData): Promise<string> {
        try {
            const prompt = this.constructPrompt(problemData);
            
            const chatResponse = await this.client.chat.complete({
                model: "mistral-large-latest", // You can change to "mistral-small-latest" for faster/cheaper responses
                messages: [
                    {
                        role: "system",
                        content: "You are an expert competitive programming mentor who specializes in converting Codeforces problems into clean, LeetCode-style C++ templates. Always provide complete, compilable code with proper input parsing and a clean solve function."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1, // Low temperature for consistent, focused output
                maxTokens: 2000,
                stop: ["```\n\n", "---"] // Stop at common delimiters
            });

            const generatedCode = chatResponse.choices[0].message.content;
            
            if (!generatedCode) {
                throw new Error('No response generated from Mistral API');
            }

            // Clean up the response - extract C++ code if wrapped in markdown
            return this.cleanupGeneratedCode(generatedCode.toString());

        } catch (error) {
            console.error('Error calling Mistral API:', error);
            throw new Error(`Failed to generate template: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Constructs the prompt for the LLM
     */
    private constructPrompt(problemData: ProblemData): string {
        const sampleTestsFormatted = problemData.sampleTests.map((test, index) => 
            `Sample ${index + 1}:\nInput:\n${test.input}\nOutput:\n${test.output}${test.explanation ? `\nExplanation: ${test.explanation}` : ''}`
        ).join('\n\n');

        return `Convert the following Codeforces problem into a clean C++ template with LeetCode-style structure. You're job is to just handle the IO and to not right the actual logic to solve the problem:

## Problem Details
**Title**: ${problemData.title}
**Time Limit**: ${problemData.timeLimit}
**Memory Limit**: ${problemData.memoryLimit}
**Difficulty**: ${problemData.difficulty || 'Not specified'}
**Source**: ${problemData.source}

## Problem Description
${problemData.description}

## Input Format
${problemData.inputFormat}

## Output Format  
${problemData.outputFormat}

## Sample Test Cases
${sampleTestsFormatted}

## Requirements for Generated Template:

1. **Include all necessary headers** (iostream, vector, string, algorithm, etc.)
2. **Parse input exactly according to the input format** - handle multiple test cases if needed
3. **Create a clean solve function** with appropriate parameters and return type that follows LeetCode style. BUT MAKE SURE THAT THE FUNCTION IS EMPTY
4. **Handle the main function** to read input, call solve, and output results properly
5. **Add clear comments** explaining the input parsing logic and function signature
6. **Use standard competitive programming optimizations** (fast I/O)
7. **Ensure the template compiles without errors**

## Output Format:
Provide ONLY the complete C++ code without any markdown formatting or explanations. The code should be ready to compile and run.

Generate the C++ template now:`;
    }

    /**
     * Cleans up the generated code from potential markdown formatting
     */
    private cleanupGeneratedCode(code: string): string {
        // Remove markdown code block markers if present
        let cleanCode = code.replace(/^```cpp\n?/gm, '').replace(/^```\n?/gm, '');
        
        // Remove any trailing markdown or extra content
        const lines = cleanCode.split('\n');
        let codeLines: string[] = [];
        let inCodeBlock = false;
        
        for (const line of lines) {
            // If we encounter #include, we're definitely in code
            if (line.trim().startsWith('#include') || line.trim().startsWith('using namespace')) {
                inCodeBlock = true;
            }
            
            if (inCodeBlock) {
                codeLines.push(line);
            }
        }
        
        // If we didn't find clear code markers, return the cleaned version
        if (codeLines.length === 0) {
            return cleanCode.trim();
        }
        
        return codeLines.join('\n').trim();
    }
}

export { MistralTemplateGenerator, ProblemData, TestCase };