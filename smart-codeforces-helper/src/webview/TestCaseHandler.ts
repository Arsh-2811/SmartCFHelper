import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { TestCase, ProblemData, TestResult } from './Interfaces';

export class TestCaseHandler {
    async handleRunTests(problemData: ProblemData | undefined): Promise<void> {
        if (problemData === undefined) {
            vscode.window.showErrorMessage('No problem data exisis');
            return;
        }
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || !activeEditor.document.fileName.endsWith('.cpp')) {
                vscode.window.showErrorMessage('Please open a C++ file to run tests');
                return;
            }

            const cppFilePath = activeEditor.document.fileName;

            if (activeEditor.document.isDirty) {
                await activeEditor.document.save();
            }

            vscode.window.showInformationMessage('🔄 Compiling and running tests...');

            const executablePath = await this.compileCppFile(cppFilePath);
            const results = await this.runTestCases(executablePath, problemData.sampleTests);
            this.showTestResults(results);
            this.cleanup(executablePath);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Test execution failed: ${errorMessage}`);
        }
    }

    private async compileCppFile(cppFilePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const fileName = path.basename(cppFilePath, '.cpp');
            const executablePath = path.join(path.dirname(cppFilePath), `${fileName}.exe`);

            const compileCommand = `g++ -o "${executablePath}" "${cppFilePath}" -std=c++17 -O2`;

            cp.exec(compileCommand, (error, stdout, stderr) => {
                if (error) {
                    reject(`Compilation failed: ${stderr || error.message}`);
                    return;
                }
                resolve(executablePath);
            });
        });
    }

    private async runTestCases(executablePath: string, testCases: TestCase[]): Promise<TestResult[]> {
        const results: TestResult[] = [];

        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            try {
                const result = await this.runSingleTest(executablePath, testCase, i + 1);
                results.push(result);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                results.push({
                    testNumber: i + 1,
                    passed: false,
                    input: testCase.input,
                    expectedOutput: testCase.output,
                    actualOutput: '',
                    error: errorMessage,
                    executionTime: 0
                });
            }
        }

        return results;
    }

    private async runSingleTest(executablePath: string, testCase: TestCase, testNumber: number): Promise<TestResult> {
        return new Promise((resolve) => {
            const startTime = Date.now();

            console.log(`Running test ${testNumber}`);
            console.log(`Input: "${testCase.input}"`);
            console.log(`Expected Output: "${testCase.output}"`);

            const process = cp.spawn(executablePath, [], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            process.stdin.write(testCase.input + '\n');
            process.stdin.end();

            process.stdout.on('data', (data) => {
                const chunk = data.toString();
                console.log(`Stdout chunk: "${chunk}"`);
                stdout += chunk;
            });

            process.stderr.on('data', (data) => {
                const chunk = data.toString();
                console.log(`Stderr chunk: "${chunk}"`);
                stderr += chunk;
            });

            const timeout = setTimeout(() => {
                process.kill();
                resolve({
                    testNumber,
                    passed: false,
                    input: testCase.input,
                    expectedOutput: testCase.output,
                    actualOutput: stdout,
                    error: 'Time Limit Exceeded',
                    executionTime: Date.now() - startTime
                });
            }, 5000);

            process.on('close', (code) => {
                clearTimeout(timeout);
                const executionTime = Date.now() - startTime;

                if (code === null) {
                    resolve({
                        testNumber,
                        passed: false,
                        input: testCase.input,
                        expectedOutput: testCase.output,
                        actualOutput: stdout,
                        error: `Process terminated unexpectedly. Program may be waiting for input or stuck in infinite loop.\nStderr: ${stderr}`,
                        executionTime
                    });
                    return;
                }

                if (code !== 0) {
                    resolve({
                        testNumber,
                        passed: false,
                        input: testCase.input,
                        expectedOutput: testCase.output,
                        actualOutput: stdout,
                        error: `Runtime Error (Exit code: ${code})\n${stderr}`,
                        executionTime
                    });
                    return;
                }

                const passed = this.compareOutputs(stdout, testCase.output);

                resolve({
                    testNumber,
                    passed,
                    input: testCase.input,
                    expectedOutput: testCase.output,
                    actualOutput: stdout,
                    error: passed ? null : 'Wrong Answer',
                    executionTime
                });
            });
        });
    }

    private compareOutputs(actual: string, expected: string): boolean {
        const normalizeOutput = (output: string): string => {
            return output
                .split('\n')                    // Split into lines
                .map(line => line.trimEnd())    // Remove trailing spaces from each line
                .join('\n')                     // Rejoin
                .trim();                        // Remove leading/trailing newlines
        };

        const normalizedActual = normalizeOutput(actual);
        const normalizedExpected = normalizeOutput(expected);

        return normalizedActual === normalizedExpected;
    }

    private showTestResults(results: TestResult[]): void {
        const passedTests = results.filter(r => r.passed).length;
        const totalTests = results.length;

        if (passedTests === totalTests) {
            vscode.window.showInformationMessage(`✅ All ${totalTests} tests passed!`);
        } else {
            vscode.window.showWarningMessage(`❌ ${passedTests}/${totalTests} tests passed`);
        }

        const outputChannel = vscode.window.createOutputChannel('Test Results');
        outputChannel.clear();
        outputChannel.show();

        outputChannel.appendLine('='.repeat(60));
        outputChannel.appendLine(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
        outputChannel.appendLine('='.repeat(60));

        results.forEach(result => {
            outputChannel.appendLine(`\nTest ${result.testNumber}: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
            outputChannel.appendLine(`Execution Time: ${result.executionTime}ms`);

            if (!result.passed) {
                outputChannel.appendLine(`\nInput:`);
                outputChannel.appendLine(result.input);
                outputChannel.appendLine(`\nExpected Output:`);
                outputChannel.appendLine(result.expectedOutput);
                outputChannel.appendLine(`\nActual Output:`);
                outputChannel.appendLine(result.actualOutput);
                if (result.error) {
                    outputChannel.appendLine(`\nError: ${result.error}`);
                }
                outputChannel.appendLine('-'.repeat(40));
            }
        });
    }

    private cleanup(executablePath: string): void {
        try {
            if (fs.existsSync(executablePath)) {
                fs.unlinkSync(executablePath);
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    public async handleCopyTestCase(testCase: TestCase) {
        await vscode.env.clipboard.writeText(`Input:\n${testCase.input}\n\nOutput:\n${testCase.output}`);
        vscode.window.showInformationMessage('📋 Test case copied to clipboard!');
    }
}