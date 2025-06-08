export interface TestCase {
    input: string;
    output: string;
    explanation?: string;
}

export interface ProblemData {
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

export interface CodeforcesApiProblem {
    contestId: number;
    index: string;
    name: string;
    type: string;
    rating?: number;
    tags: string[];
}

export interface TestResult {
    testNumber: number;
    passed: boolean;
    input: string;
    expectedOutput: string;
    actualOutput: string;
    error: string | null;
    executionTime: number;
}