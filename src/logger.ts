import * as vsc from 'vscode';

const output: vsc.OutputChannel = vsc.window.createOutputChannel('Uncrustifyest');

export function show() {
    output.show(true);
}

export function hide() {
    output.hide();
}

export function log(msg: string, line = true) {
    if (line) {
        output.appendLine(msg);
    } else {
        output.append(msg);
    }
}

export function dbg(msg: string, line = true) {
    if (vsc.workspace.getConfiguration('uncrustifyest').get('debug', false)) {
        const dmsg = 'Debug: ' + msg;

        if (line) {
            output.appendLine(dmsg);
        } else {
            output.append(dmsg);
        }
    }
}
