import * as vscode from 'vscode';
import { ProblemWebviewProvider } from './webview/ProblemWebViewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "smart-codeforces-helper" is now active!');

	const problemWebviewProvider = new ProblemWebviewProvider(context.extensionUri);

	const helloWorld = vscode.commands.registerCommand('smart-codeforces-helper.helloWorld', () => {
		vscode.window.showInformationMessage('Hey from Smart Codeforces Helper!');
	});

	const showTime = vscode.commands.registerCommand('smart-codeforces-helper.getTime', () => {
		let dateTime = new Date();
		vscode.window.showInformationMessage("Current time : " + dateTime);
	});

	const loadProblem = vscode.commands.registerCommand(
		'smart-codeforces-helper.loadProblem',
        async () => {
            const input = await vscode.window.showInputBox({
                placeHolder: 'Enter the url to your problem here',
                prompt: 'Please enter a valid Codeforces problem URL'
            });

            if (input) {
                await problemWebviewProvider.showProblem(input);
                vscode.window.showInformationMessage(`Loading problem from: ${input}`);
            } else {
                vscode.window.showErrorMessage('No problem URL provided');
            }
	});

	const openProblemViewer = vscode.commands.registerCommand(
        'smart-codeforces-helper.openProblemViewer',
        async () => {
            await problemWebviewProvider.showProblem();
            vscode.window.showInformationMessage('Problem viewer opened with sample data');
        }
    );

	context.subscriptions.push(helloWorld, showTime, loadProblem, openProblemViewer);
}

export function deactivate() {}
