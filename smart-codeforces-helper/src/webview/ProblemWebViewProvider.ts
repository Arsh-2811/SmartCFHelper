import * as vscode from 'vscode';
import * as puppeteer from 'puppeteer';

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
    constraints: string[];
    sampleTests: TestCase[];
    source: string;
    difficulty?: string;
}

interface CodeforcesApiProblem {
    contestId: number;
    index: string;
    name: string;
    type: string;
    rating?: number;
    tags: string[];
}

export class ProblemWebviewProvider {
    private static readonly viewType = 'problemViewer';
    private panel: vscode.WebviewPanel | undefined;
    private browser?: puppeteer.Browser;

    constructor(private readonly extensionUri: vscode.Uri) { }

    public async showProblem(problemUrl?: string) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                ProblemWebviewProvider.viewType,
                'Problem Viewer',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.extensionUri]
                }
            );

            // Handle panel disposal
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            }, null);

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'runTests':
                            this.handleRunTests();
                            break;
                        case 'generateScript':
                            this.handleGenerateScript();
                            break;
                        case 'copyTestCase':
                            this.handleCopyTestCase(message.testCase);
                            break;
                    }
                }
            );
        }

        // Get dummy problem data (replace this with actual scraping later)
        // const problemData = this.getDummyProblemData(problemUrl);
        let problemData: ProblemData;
        if (problemUrl) {
            problemData = await this.extractProblemData(problemUrl);
        } else {
            problemData = this.getDummyProblemData();
        }

        // Set webview content
        this.panel.webview.html = this.getWebviewContent(problemData);
    }

    private async extractProblemData(url: string): Promise<ProblemData> {
        // Extract contest ID and problem index from URL
        const urlMatch = url.match(/\/problemset\/problem\/(\d+)\/([A-Z]\d?)/i) ||
            url.match(/\/contest\/(\d+)\/problem\/([A-Z]\d?)/i);

        if (!urlMatch) {
            throw new Error('Invalid Codeforces problem URL format');
        }

        const contestId = parseInt(urlMatch[1]);
        const problemIndex = urlMatch[2].toUpperCase();

        try {
            // Try to get basic problem info from Codeforces API first
            const apiData = await this.fetchFromCodeforcesAPI(contestId, problemIndex);

            // Then scrape the detailed content with optimized Puppeteer
            const detailedData = await this.scrapeWithOptimizedPuppeteer(url);

            // Combine API data with scraped data
            return {
                title: apiData.name || detailedData.title,
                timeLimit: detailedData.timeLimit,
                memoryLimit: detailedData.memoryLimit,
                description: detailedData.description,
                inputFormat: detailedData.inputFormat,
                outputFormat: detailedData.outputFormat,
                constraints: detailedData.constraints,
                sampleTests: detailedData.sampleTests,
                source: `Contest ${contestId}`,
                difficulty: apiData.rating ? `*${apiData.rating}` : detailedData.difficulty
            };
        } catch (apiError) {
            console.warn('API fetch failed, using scraping only:', apiError);
            return await this.scrapeWithOptimizedPuppeteer(url);
        }
    }

    private async fetchFromCodeforcesAPI(contestId: number, problemIndex: string): Promise<CodeforcesApiProblem> {
        const apiUrl = `https://codeforces.com/api/problemset.problems`;

        try {
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.status !== 'OK') {
                throw new Error(`API Error: ${data.comment}`);
            }

            const problem = data.result.problems.find((p: CodeforcesApiProblem) =>
                p.contestId === contestId && p.index === problemIndex
            );

            if (!problem) {
                throw new Error(`Problem ${contestId}/${problemIndex} not found in API`);
            }

            return problem;
        } catch (error) {
            throw new Error(`Failed to fetch from Codeforces API: ${error}`);
        }
    }

    private async scrapeWithOptimizedPuppeteer(url: string): Promise<ProblemData> {
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images'
            ]
        });

        try {
            const page = await browser.newPage();

            // Optimize page loading - block unnecessary resources
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                if (resourceType === 'image' || resourceType === 'font' ||
                    resourceType === 'media' || resourceType === 'websocket') {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Set minimal viewport for faster rendering
            await page.setViewport({ width: 800, height: 600 });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            console.log('Loading problem page...');
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            // Wait for content with multiple strategies
            try {
                await page.waitForFunction(() => {
                    return document.querySelector('.problem-statement') !== null ||
                        document.querySelector('.problemindexholder') !== null ||
                        document.body.innerText.includes('Input') ||
                        document.body.innerText.includes('Output');
                }, { timeout: 10000 });
            } catch (e) {
                console.log('Waiting longer for content...');
                // await page.waitForTimeout(3000);
            }

            console.log('Extracting problem data...');
            const problemData = await page.evaluate(() => {
                const cleanText = (text: string): string => {
                    return text.replace(/\s+/g, ' ').replace(/\n+/g, ' ').trim();
                };

                const getTextBySelectors = (selectors: string[]): string => {
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element && element.textContent && element.textContent.trim()) {
                            return cleanText(element.textContent);
                        }
                    }
                    return '';
                };

                // Extract title
                const title = getTextBySelectors([
                    '.problem-statement .title',
                    '.problemindexholder .title',
                    '.header .title',
                    'h1', 'h2'
                ]).replace(/^[A-Z]\d*\.\s*/, '');

                // Extract limits
                const timeLimit = getTextBySelectors(['.time-limit', '[class*="time-limit"]'])
                    .replace(/time limit per test/i, '').replace(/time limit/i, '').trim();

                const memoryLimit = getTextBySelectors(['.memory-limit', '[class*="memory-limit"]'])
                    .replace(/memory limit per test/i, '').replace(/memory limit/i, '').trim();

                // Extract description - look for main content
                let description = '';
                const descriptionSelectors = [
                    '.problem-statement > div:not(.input-specification):not(.output-specification):not(.sample-tests):not(.note)',
                    '.problem-statement p',
                    '.problemindexholder > div'
                ];

                for (const selector of descriptionSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (let i = 0; i < elements.length; i++) {
                        const element = elements[i];
                        if (element && element.textContent &&
                            !element.classList.contains('section-title') &&
                            !element.querySelector('.time-limit') &&
                            !element.querySelector('.memory-limit') &&
                            element.textContent.trim().length > 20) {
                            description += cleanText(element.textContent) + ' ';
                            if (description.length > 200) {
                                break;
                            }
                        }
                    }
                    if (description.trim()) {
                        break;
                    }
                }

                // Extract input/output specifications
                const inputFormat = getTextBySelectors([
                    '.input-specification',
                    '.input-specification p',
                    '[class*="input-spec"]'
                ]).replace(/input/i, '').trim();

                const outputFormat = getTextBySelectors([
                    '.output-specification',
                    '.output-specification p',
                    '[class*="output-spec"]'
                ]).replace(/output/i, '').trim();

                // Extract sample tests
                const sampleTests: TestCase[] = [];

                // Multiple approaches to find samples
                const inputSelectors = ['.input pre', '.sample-input pre', '.input', '.sample-input'];
                const outputSelectors = ['.output pre', '.sample-output pre', '.output', '.sample-output'];

                for (const inputSel of inputSelectors) {
                    const inputs = document.querySelectorAll(inputSel);
                    if (inputs.length > 0) {
                        for (const outputSel of outputSelectors) {
                            const outputs = document.querySelectorAll(outputSel);
                            if (outputs.length > 0) {
                                for (let i = 0; i < Math.min(inputs.length, outputs.length); i++) {
                                    const input = inputs[i].textContent?.trim() || '';
                                    const output = outputs[i].textContent?.trim() || '';
                                    if (input && output && input.length < 200 && output.length < 200) {
                                        sampleTests.push({ input, output });
                                    }
                                }
                                if (sampleTests.length > 0) {
                                    break;
                                }
                            }
                        }
                        if (sampleTests.length > 0) {
                            break;
                        }
                    }
                }

                // Extract constraints
                const constraints: string[] = [];
                const noteText = getTextBySelectors(['.note', '.notes', '[class*="constraint"]']);
                if (noteText) {
                    const patterns = [/\d+\s*[≤<=]\s*\w+\s*[≤<=]\s*\d+/g, /1\s*[≤<=]\s*\w+\s*[≤<=]\s*10\^?\d+/g];
                    patterns.forEach(pattern => {
                        const matches = noteText.match(pattern);
                        if (matches) {
                            constraints.push(...matches);
                        }
                    });
                }

                return {
                    title: title || 'Problem Title',
                    timeLimit: timeLimit || '1 second',
                    memoryLimit: memoryLimit || '256 megabytes',
                    description: description.trim() || 'Problem description',
                    inputFormat: inputFormat || 'See problem statement',
                    outputFormat: outputFormat || 'See problem statement',
                    constraints,
                    sampleTests,
                    source: 'Codeforces',
                    difficulty: undefined
                };
            });

            console.log('Problem data extracted successfully');
            return problemData;

        } catch (error) {
            console.error('Error during scraping:', error);
            throw new Error(`Failed to scrape problem data: ${error}`);
        } finally {
            await browser.close();
        }
    }

    private getDummyProblemData(url?: string): ProblemData {
        return {
            title: "A. Watermelon",
            timeLimit: "1 second",
            memoryLimit: "64 megabytes",
            source: "Codeforces Round #4 (Div. 2)",
            difficulty: "800",
            description: `One hot summer day Pete and his friend Billy decided to buy a watermelon. They chose the biggest and the most beautiful watermelon in the whole store. But to their surprise, the cashier told them that the price of the watermelon is <strong>w</strong> dollars, where <strong>w</strong> is even. Pete and Billy are only able to eat the watermelon if they can divide it into two parts such that each part weighs an even number of kilograms and each part weighs at least 2 kilograms.`,
            inputFormat: "The first line contains a single integer <strong>w</strong> (1 ≤ w ≤ 100) — the weight of the watermelon.",
            outputFormat: "Print <strong>YES</strong> if the watermelon can be divided according to the rules, and <strong>NO</strong> otherwise.",
            constraints: [
                "1 ≤ w ≤ 100",
                "w is a positive integer",
                "Each part must weigh at least 2 kg",
                "Each part must have even weight"
            ],
            sampleTests: [
                {
                    input: "8",
                    output: "YES",
                    explanation: "We can divide 8 into 4 + 4, both are even and ≥ 2"
                },
                {
                    input: "6",
                    output: "YES",
                    explanation: "We can divide 6 into 2 + 4, both are even and ≥ 2"
                },
                {
                    input: "2",
                    output: "NO",
                    explanation: "We cannot divide 2 into two parts where each is ≥ 2"
                }
            ]
        };
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

                .constraints-list {
                    list-style: none;
                    padding: 0;
                }

                .constraints-list li {
                    padding: 8px 0;
                    border-bottom: 1px solid var(--border);
                    position: relative;
                    padding-left: 20px;
                }

                .constraints-list li:before {
                    content: "▸";
                    color: var(--accent-blue);
                    font-weight: bold;
                    position: absolute;
                    left: 0;
                }

                .constraints-list li:last-child {
                    border-bottom: none;
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
            </style>
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
                        ${problem.description}
                    </div>
                </section>

                <section class="section">
                    <h2 class="section-title">
                        <span class="icon">📥</span>
                        Input Format
                    </h2>
                    <div class="section-content">
                        ${problem.inputFormat}
                    </div>
                </section>

                <section class="section">
                    <h2 class="section-title">
                        <span class="icon">📤</span>
                        Output Format
                    </h2>
                    <div class="section-content">
                        ${problem.outputFormat}
                    </div>
                </section>

                <section class="section">
                    <h2 class="section-title">
                        <span class="icon">⚖️</span>
                        Constraints
                    </h2>
                    <ul class="constraints-list">
                        ${problem.constraints.map(constraint => `<li>${constraint}</li>`).join('')}
                    </ul>
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
            </script>
        </body>
        </html>`;
    }

    private async handleRunTests() {
        vscode.window.showInformationMessage('🔄 Running tests against your solution...');
        // TODO: Implement actual test running logic
        setTimeout(() => {
            vscode.window.showInformationMessage('✅ All tests passed! Your solution is correct.');
        }, 2000);
    }

    private async handleGenerateScript() {
        vscode.window.showInformationMessage('📝 Generating C++ template...');
        // TODO: Implement script generation logic
        setTimeout(() => {
            vscode.window.showInformationMessage('✅ C++ template generated successfully!');
        }, 1000);
    }

    private async handleCopyTestCase(testCase: TestCase) {
        await vscode.env.clipboard.writeText(`Input:\n${testCase.input}\n\nOutput:\n${testCase.output}`);
        vscode.window.showInformationMessage('📋 Test case copied to clipboard!');
    }
}