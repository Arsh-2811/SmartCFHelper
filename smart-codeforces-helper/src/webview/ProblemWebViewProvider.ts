import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';

import { ProblemData } from './Interfaces';
import { TestCaseHandler } from './TestCaseHandler';
import { ProblemScraper } from './ProblemScraper';
import { TemplateGenerator } from './TemplateGenerator';

export class ProblemWebviewProvider {
    private static readonly viewType = 'problemViewer';
    private panel: vscode.WebviewPanel | undefined;
    private currentProblemData: ProblemData | undefined;

    testCaseHandler = new TestCaseHandler();
    problemScraper = new ProblemScraper();
    templateGenerator = new TemplateGenerator();

    constructor(private readonly extensionUri: vscode.Uri) { }

    public async showProblem(problemUrl?: string) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                ProblemWebviewProvider.viewType,
                'Problem Viewer',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.extensionUri]
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            }, null);

            this.panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'runTests':
                            this.testCaseHandler.handleRunTests(this.currentProblemData);
                            break;
                        case 'generateScript':
                            this.handleGenerateScript();
                            break;
                        case 'copyTestCase':
                            this.testCaseHandler.handleCopyTestCase(message.testCase);
                            break;
                    }
                }
            );
        }

        let problemData: ProblemData;
        if (problemUrl) {
            problemData = await this.problemScraper.extractProblemData(problemUrl);
        } else {
            problemData = this.problemScraper.getDummyProblemData();
        }

        this.currentProblemData = problemData;
        this.panel.webview.html = this.getWebviewContent(problemData);
    }

    private async createAndOpenFile(fileName: string, content: string, language: string = 'cpp'): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder is open. Please open a folder first.');
                return;
            }

            const filePath = path.join(workspaceFolder.uri.fsPath, fileName);

            if (fs.existsSync(filePath)) {
                const overwrite = await vscode.window.showWarningMessage(
                    `File "${fileName}" already exists. Do you want to overwrite it?`,
                    'Yes', 'No'
                );
                if (overwrite !== 'Yes') {
                    return;
                }
            }

            fs.writeFileSync(filePath, content, 'utf-8');

            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.One,
                preview: false
            });

            if (this.panel) {
                this.panel.reveal(vscode.ViewColumn.Beside, false);
            }

            vscode.window.showInformationMessage(`✅ File "${fileName}" created and opened successfully!`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create file: ${error}`);
        }
    }

    private processMathExpressions(text: string): string {
        text = text.replace(/\$\$\$([^$]+)\$\$\$/g, (match, mathContent) => {
            const cleanMath = mathContent.trim();
            return `<span class="math-inline">\\(${cleanMath}\\)</span>`;
        });

        text = text.replace(/\$([^$\n]+)\$/g, (match, mathContent) => {
            const cleanMath = mathContent.trim();
            return `<span class="math-inline">\\(${cleanMath}\\)</span>`;
        });

        return text;
    }


    private getWebviewContent(problem: ProblemData): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Problem Viewer</title>
            <style>
                :root {
                    --bg-primary: #1e1e1e;
                    --bg-secondary: #252526;
                    --bg-tertiary: #2d2d30;
                    --text-primary: #cccccc;
                    --text-secondary: #9d9d9d;
                    --accent-blue: #007acc;
                    --accent-green: #4caf50;
                    --accent-orange: #ff9800;
                    --border: #3e3e42;
                    --success: #4caf50;
                    --error: #f44336;
                }

                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    line-height: 1.6;
                    overflow-x: hidden;
                }

                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }

                .header {
                    background: linear-gradient(135deg, var(--accent-blue), #005a9e);
                    padding: 20px;
                    border-radius: 12px;
                    margin-bottom: 24px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }

                .header h1 {
                    font-size: 1.8em;
                    margin-bottom: 8px;
                    font-weight: 600;
                }

                .header-meta {
                    display: flex;
                    gap: 20px;
                    flex-wrap: wrap;
                    font-size: 0.9em;
                    opacity: 0.9;
                }

                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .difficulty-badge {
                    background: var(--accent-orange);
                    color: white;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 0.8em;
                    font-weight: 600;
                }

                .section {
                    background: var(--bg-secondary);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 20px;
                    border: 1px solid var(--border);
                    transition: transform 0.2s ease;
                }

                .section:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                }

                .section-title {
                    font-size: 1.2em;
                    color: var(--accent-blue);
                    margin-bottom: 12px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .section-content {
                    color: var(--text-primary);
                }

                .test-cases {
                    display: grid;
                    gap: 16px;
                }

                .test-case {
                    background: var(--bg-tertiary);
                    border-radius: 8px;
                    padding: 16px;
                    border-left: 4px solid var(--accent-blue);
                    position: relative;
                }

                .test-case-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }

                .test-case-title {
                    font-weight: 600;
                    color: var(--accent-blue);
                }

                .copy-btn {
                    background: var(--accent-blue);
                    color: white;
                    border: none;
                    padding: 4px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.8em;
                    transition: background 0.2s ease;
                }

                .copy-btn:hover {
                    background: #005a9e;
                }

                .io-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }

                .io-block {
                    background: var(--bg-primary);
                    border-radius: 6px;
                    padding: 12px;
                    border: 1px solid var(--border);
                }

                .io-label {
                    font-size: 0.8em;
                    color: var(--text-secondary);
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .io-content {
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 0.9em;
                    white-space: pre-wrap;
                    word-break: break-all;
                }

                .explanation {
                    margin-top: 12px;
                    padding: 10px;
                    background: rgba(76, 175, 80, 0.1);
                    border-radius: 6px;
                    border-left: 3px solid var(--success);
                    font-size: 0.9em;
                    color: var(--text-secondary);
                }

                .actions {
                    position: sticky;
                    bottom: 20px;
                    background: var(--bg-secondary);
                    padding: 20px;
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.2);
                }

                .action-btn {
                    background: linear-gradient(135deg, var(--accent-green), #388e3c);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1em;
                    font-weight: 600;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 140px;
                    justify-content: center;
                }

                .action-btn.secondary {
                    background: linear-gradient(135deg, var(--accent-blue), #005a9e);
                }

                .action-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }

                .action-btn:active {
                    transform: translateY(0);
                }

                .icon {
                    font-size: 1.1em;
                }

                @media (max-width: 768px) {
                    .container {
                        padding: 12px;
                    }
                    
                    .io-container {
                        grid-template-columns: 1fr;
                    }
                    
                    .actions {
                        flex-direction: column;
                    }
                    
                    .header-meta {
                        flex-direction: column;
                        gap: 8px;
                    }
                }

                /* Smooth animations */
                .section, .test-case, .action-btn {
                    animation: fadeInUp 0.3s ease forwards;
                }

                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .math-inline {
                    display: inline-block;
                    margin: 0 2px;
                }

                .math-display {
                    display: block;
                    text-align: center;
                    margin: 10px 0;
                }

                .section-content {
                    color: var(--text-primary);
                    line-height: 1.8;
                }

                .section-content p {
                    margin-bottom: 12px;
                }

                .section-content ul, .section-content ol {
                    margin: 10px 0;
                    padding-left: 20px;
                }

                .section-content li {
                    margin-bottom: 6px;
                }
            </style>

            <script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.min.js"></script>
            <script>
                window.MathJax = {
                    tex: {
                        inlineMath: [['\\(', '\\)']],
                        displayMath: [['\\[', '\\]']],
                        processEscapes: true,
                        processEnvironments: true
                    },
                    options: {
                        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
                    }
                };
            </script>
        </head>
        <body>
            <div class="container">
                <header class="header">
                    <h1>${problem.title}</h1>
                    <div class="header-meta">
                        <div class="meta-item">
                            <span class="icon">⏱️</span>
                            <span>Time: ${problem.timeLimit}</span>
                        </div>
                        <div class="meta-item">
                            <span class="icon">💾</span>
                            <span>Memory: ${problem.memoryLimit}</span>
                        </div>
                        <div class="meta-item">
                            <span class="icon">📚</span>
                            <span>${problem.source}</span>
                        </div>
                        ${problem.difficulty ? `<span class="difficulty-badge">${problem.difficulty}</span>` : ''}
                    </div>
                </header>

                <section class="section">
                    <h2 class="section-title">
                        <span class="icon">📋</span>
                        Problem Statement
                    </h2>
                    <div class="section-content">
                        ${this.processMathExpressions(problem.description)}
                    </div>
                </section>

                <section class="section">
                    <h2 class="section-title">
                        <span class="icon">📥</span>
                        Input Format
                    </h2>
                    <div class="section-content">
                        ${this.processMathExpressions(problem.inputFormat)}
                    </div>
                </section>

                <section class="section">
                    <h2 class="section-title">
                        <span class="icon">📤</span>
                        Output Format
                    </h2>
                    <div class="section-content">
                        ${this.processMathExpressions(problem.outputFormat)}
                    </div>
                </section>

                <section class="section">
                    <h2 class="section-title">
                        <span class="icon">🧪</span>
                        Sample Test Cases
                    </h2>
                    <div class="test-cases">
                        ${problem.sampleTests.map((testCase, index) => `
                            <div class="test-case">
                                <div class="test-case-header">
                                    <span class="test-case-title">Test Case ${index + 1}</span>
                                    <button class="copy-btn" onclick="copyTestCase(${index})">Copy</button>
                                </div>
                                <div class="io-container">
                                    <div class="io-block">
                                        <div class="io-label">Input</div>
                                        <div class="io-content">${testCase.input}</div>
                                    </div>
                                    <div class="io-block">
                                        <div class="io-label">Output</div>
                                        <div class="io-content">${testCase.output}</div>
                                    </div>
                                </div>
                                ${testCase.explanation ? `<div class="explanation">${testCase.explanation}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </section>

                <div class="actions">
                    <button class="action-btn" onclick="runTests()">
                        <span class="icon">▶️</span>
                        Run Tests
                    </button>
                    <button class="action-btn secondary" onclick="generateScript()">
                        <span class="icon">📝</span>
                        Generate Script
                    </button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function runTests() {
                    vscode.postMessage({
                        command: 'runTests'
                    });
                }

                function generateScript() {
                    vscode.postMessage({
                        command: 'generateScript'
                    });
                }

                function copyTestCase(index) {
                    const testCase = ${JSON.stringify(problem.sampleTests)};
                    vscode.postMessage({
                        command: 'copyTestCase',
                        testCase: testCase[index]
                    });
                }

                // Add smooth scroll behavior
                document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                    anchor.addEventListener('click', function (e) {
                        e.preventDefault();
                        document.querySelector(this.getAttribute('href')).scrollIntoView({
                            behavior: 'smooth'
                        });
                    });
                });

                if (window.MathJax) {
                    MathJax.typesetPromise().then(() => {
                        console.log('MathJax rendering completed');
                    }).catch((err) => {
                        console.error('MathJax rendering failed:', err);
                    });
                }
            </script>
        </body>
        </html>`;
    }

    private async handleGenerateScript() {
        try {
            if (!this.currentProblemData) {
                vscode.window.showErrorMessage('No problem data available. Please load a problem first.');
                return;
            }
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Generating C++ Template",
                cancellable: true
            }, async (progress, token) => {
                progress.report({increment: 0, message: "Preparing Generation..."});

                const language = 'C++';

                if (!this.currentProblemData) {
                    vscode.window.showErrorMessage('No problem data available. Please load a problem first.');
                    return;
                }

                const sanitizedTitle = this.currentProblemData.title
                    .replace(/[^a-zA-Z0-9\s]/g, '')
                    .replace(/\s+/g, '_')
                    .toLowerCase();
                
                    if(token.isCancellationRequested){
                        throw new Error('Cancelled by user');
                    }

                    progress.report({increment: 20, message: "Calling Mistral AI..."});

                    let fileName: string;
                    let content: string;
                    let vscodeLanguage: string;

                    switch (language) {
                        case 'C++':
                            fileName = `${sanitizedTitle}.cpp`;
                            progress.report({increment: 30, message: "AI is analyzing problem..."});
                            content = await this.templateGenerator.mistralGenerator.generateCppTemplateWithLLM(this.currentProblemData);
                            vscodeLanguage = 'cpp';
                            break;
                        default:
                            return;
                    }

                    progress.report({increment: 90, message: "Creating file..."});

                    await this.createAndOpenFile(fileName, content, vscodeLanguage);

                    progress.report({increment: 100, message: "Temple Generated!"});
                });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate script: ${error}`);
        }
    }
}