import * as puppeteer from 'puppeteer';

import { ProblemData, CodeforcesApiProblem, TestCase } from "./Interfaces";

export class ProblemScraper {
    public async extractProblemData(url: string): Promise<ProblemData> {
        const urlMatch = url.match(/\/problemset\/problem\/(\d+)\/([A-Z]\d?)/i) ||
            url.match(/\/contest\/(\d+)\/problem\/([A-Z]\d?)/i);

        if (!urlMatch) {
            throw new Error('Invalid Codeforces problem URL format');
        }

        const contestId = parseInt(urlMatch[1]);
        const problemIndex = urlMatch[2].toUpperCase();

        try {
            const apiData = await this.fetchFromCodeforcesAPI(contestId, problemIndex);
            const detailedData = await this.scrapeWithOptimizedPuppeteer(url);

            return {
                title: apiData.name || detailedData.title,
                timeLimit: detailedData.timeLimit,
                memoryLimit: detailedData.memoryLimit,
                description: detailedData.description,
                inputFormat: detailedData.inputFormat,
                outputFormat: detailedData.outputFormat,
                sampleTests: detailedData.sampleTests,
                source: `Contest ${contestId}`,
                difficulty: apiData.rating ? `*${apiData.rating}` : detailedData.difficulty
            };
        } catch (apiError) {
            console.warn('API fetch failed, using scraping only:', apiError);
            return await this.scrapeWithOptimizedPuppeteer(url);
        }
    }

    public async fetchFromCodeforcesAPI(contestId: number, problemIndex: string): Promise<CodeforcesApiProblem> {
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

    public async scrapeWithOptimizedPuppeteer(url: string): Promise<ProblemData> {
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

            await page.setViewport({ width: 800, height: 600 });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            console.log('Loading problem page...');
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            try {
                await page.waitForFunction(() => {
                    return document.querySelector('.problem-statement') !== null ||
                        document.querySelector('.problemindexholder') !== null ||
                        document.body.innerText.includes('Input') ||
                        document.body.innerText.includes('Output');
                }, { timeout: 10000 });
            } catch (e) {
                console.log('Waiting longer for content...');
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

                const title = getTextBySelectors([
                    '.problem-statement .title',
                    '.problemindexholder .title',
                    '.header .title',
                    'h1', 'h2'
                ]).replace(/^[A-Z]\d*\.\s*/, '');

                const timeLimit = getTextBySelectors(['.time-limit', '[class*="time-limit"]'])
                    .replace(/time limit per test/i, '').replace(/time limit/i, '').trim();

                const memoryLimit = getTextBySelectors(['.memory-limit', '[class*="memory-limit"]'])
                    .replace(/memory limit per test/i, '').replace(/memory limit/i, '').trim();

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
                        if (element && element.innerHTML &&
                            !element.classList.contains('section-title') &&
                            !element.querySelector('.time-limit') &&
                            !element.querySelector('.memory-limit') &&
                            element.textContent && element.textContent.trim().length > 20) {
                            description += element.innerHTML + ' ';
                            if (description.length > 1000) {
                                break;
                            }
                        }
                    }
                    if (description.trim()) {
                        break;
                    }
                }

                const inputFormat = (() => {
                    const inputElement = document.querySelector('.input-specification') ||
                        document.querySelector('[class*="input-spec"]');
                    if (inputElement) {
                        return inputElement.innerHTML.replace(/<div[^>]*class="section-title"[^>]*>.*?<\/div>/gi, '').trim();
                    }
                    return 'See problem statement';
                })();

                const outputFormat = (() => {
                    const outputElement = document.querySelector('.output-specification') ||
                        document.querySelector('[class*="output-spec"]');
                    if (outputElement) {
                        return outputElement.innerHTML.replace(/<div[^>]*class="section-title"[^>]*>.*?<\/div>/gi, '').trim();
                    }
                    return 'See problem statement';
                })();

                const sampleTests: TestCase[] = [];

                const sampleTestContainers = document.querySelectorAll('.sample-test');

                for (let i = 0; i < sampleTestContainers.length; i++) {
                    const container = sampleTestContainers[i];

                    const inputContainer = container.querySelector('.input pre');
                    let input = '';

                    if (inputContainer) {
                        const inputLines = inputContainer.querySelectorAll('.test-example-line');
                        if (inputLines.length > 0) {
                            const lines: string[] = [];
                            inputLines.forEach(line => {
                                const lineText = line.textContent?.trim();
                                if (lineText !== undefined && lineText !== '') {
                                    lines.push(lineText);
                                }
                            });
                            input = lines.join('\n');
                        } else {
                            input = inputContainer.textContent?.trim() || '';
                        }
                    }

                    const outputContainer = container.querySelector('.output pre');
                    const output = outputContainer ? (outputContainer.textContent?.trim() || '') : '';

                    if (input && output && input.length < 1000 && output.length < 1000) {
                        sampleTests.push({ input, output });
                    }
                }

                if (sampleTests.length === 0) {
                    const inputSelectors = ['.input pre', '.sample-input pre'];
                    const outputSelectors = ['.output pre', '.sample-output pre'];

                    for (const inputSel of inputSelectors) {
                        const inputs = document.querySelectorAll(inputSel);
                        if (inputs.length > 0) {
                            for (const outputSel of outputSelectors) {
                                const outputs = document.querySelectorAll(outputSel);
                                if (outputs.length > 0) {
                                    for (let i = 0; i < Math.min(inputs.length, outputs.length); i++) {
                                        const inputElement = inputs[i];
                                        let input = '';

                                        const inputLines = inputElement.querySelectorAll('.test-example-line');
                                        if (inputLines.length > 0) {
                                            const lines: string[] = [];
                                            inputLines.forEach(line => {
                                                const lineText = line.textContent?.trim();
                                                if (lineText !== undefined && lineText !== '') {
                                                    lines.push(lineText);
                                                }
                                            });
                                            input = lines.join('\n');
                                        } else {
                                            input = inputElement.textContent?.trim() || '';
                                        }

                                        const output = outputs[i].textContent?.trim() || '';

                                        if (input && output && input.length < 1000 && output.length < 1000) {
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
                }

                return {
                    title: title || 'Problem Title',
                    timeLimit: timeLimit || '1 second',
                    memoryLimit: memoryLimit || '256 megabytes',
                    description: description.trim() || 'Problem description',
                    inputFormat: inputFormat || 'See problem statement',
                    outputFormat: outputFormat || 'See problem statement',
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

    public getDummyProblemData(url?: string): ProblemData {
        return {
            title: "A. Watermelon",
            timeLimit: "1 second",
            memoryLimit: "64 megabytes",
            source: "Codeforces Round #4 (Div. 2)",
            difficulty: "800",
            description: `One hot summer day Pete and his friend Billy decided to buy a watermelon. They chose the biggest and the most beautiful watermelon in the whole store. But to their surprise, the cashier told them that the price of the watermelon is <strong>w</strong> dollars, where <strong>w</strong> is even. Pete and Billy are only able to eat the watermelon if they can divide it into two parts such that each part weighs an even number of kilograms and each part weighs at least 2 kilograms.`,
            inputFormat: "The first line contains a single integer <strong>w</strong> (1 ≤ w ≤ 100) — the weight of the watermelon.",
            outputFormat: "Print <strong>YES</strong> if the watermelon can be divided according to the rules, and <strong>NO</strong> otherwise.",
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
}