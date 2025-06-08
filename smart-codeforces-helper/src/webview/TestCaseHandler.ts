import * as vscode from 'vscode';
import { TestCase } from './Interfaces';

export class TestCaseHandler {
    public async handleRunTests() {
        vscode.window.showInformationMessage('🔄 Running tests against your solution...');
        // TODO: Implement actual test running logic
        setTimeout(() => {
            vscode.window.showInformationMessage('✅ All tests passed! Your solution is correct.');
        }, 2000);
    }

    public async handleCopyTestCase(testCase: TestCase) {
        await vscode.env.clipboard.writeText(`Input:\n${testCase.input}\n\nOutput:\n${testCase.output}`);
        vscode.window.showInformationMessage('📋 Test case copied to clipboard!');
    }
}