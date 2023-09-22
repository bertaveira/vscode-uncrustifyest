import * as cp from 'child_process';
import * as vsc from 'vscode';
import * as logger from './logger';
import * as util from './util';
import Formatter from './formatter';
import * as fs from 'fs';

let extContext: vsc.ExtensionContext;

const supportedLanguages = [
    'c',
    'cpp',
    'csharp',
    'd',
    'java',
    'objective-c',
    'pawn',
    'pde',
    'vala'
  ];

export function activate(context: vsc.ExtensionContext) {
    logger.dbg('extension started');
    extContext = context;

    const formatter = new Formatter();
    const modes = util.modes();
    context.subscriptions.push(vsc.languages.registerDocumentFormattingEditProvider(supportedLanguages, formatter));
    context.subscriptions.push(vsc.languages.registerDocumentRangeFormattingEditProvider(supportedLanguages, formatter));
    context.subscriptions.push(vsc.languages.registerOnTypeFormattingEditProvider(supportedLanguages, formatter, ';', '}'));
    logger.dbg('registered formatter for modes: ' + modes);

    vsc.commands.registerCommand('uncrustify.create', () => {
        logger.dbg('command: create');

        if (!vsc.workspace.workspaceFolders || !vsc.workspace.workspaceFolders.length) {
            return vsc.window.showWarningMessage('No folder is open');
        }

        let output = '';
        const error = new Error('Configuration file already exists');

        return fs.access(util.configPath(), fs.constants.F_OK)
            .then(() => vsc.window.showWarningMessage('Configuration file already exists', 'Overwrite')
                .then(choice => {
                    if (choice !== 'Overwrite') {
                        throw error;
                    }
                })
            )
            .catch(e => {
                if (e === error) {
                    throw e;
                } else {
                    return fs.ensureFile(util.configPath());
                }
            })
            .then(() => new Promise(resolve =>
                cp.spawn(util.executablePath(), ['-c', util.configPath(), '--update-config-with-doc'])
                    .stdout
                    .on('data', data => output += data.toString())
                    .on('end', () => resolve(output.replace(/\?\?\?:.*/g, '')))
            ))
            .then((config: string) => {
                if (config.length > 0) {
                    fs.writeFile(util.configPath(), config);
                } else {
                    vsc.window.showErrorMessage('Configuration could not be created; is Uncrustify correctly installed and configured?');
                }
            })
            .catch(reason => logger.dbg(reason));
    });

    vsc.commands.registerCommand('uncrustify.open', () =>
        vsc.commands.executeCommand('vscode.open', vsc.Uri.file(util.configPath())));

    vsc.commands.registerCommand('uncrustify.save', async config => {
        logger.dbg('command: save');

        if (!config) {
            logger.dbg('error saving config: no config passed');
            return;
        }

        try {
            const data = await new Promise((resolve, reject) => fs.readFile(util.configPath(), (err, data) => {
                if (err) {
                    reject(err);
                }
                resolve(data);
            }));

            let result = data.toString();

            for (const key in config) {
                result = result.replace(new RegExp(`^(${key}\\s*=\\s*)\\S+(.*)`, 'm'), `$1${config[key]}$2`);
            }

            return await new Promise<void>((resolve, reject) => fs.writeFile(util.configPath(), result, err => {
                if (err) {
                    reject(err);
                }

                resolve();
                logger.dbg('saved config file');
            }));
        }
        catch (reason) {
            return logger.dbg('error saving config file: ' + reason);
        }
    });

    vsc.commands.registerCommand('uncrustify.savePreset', async (config, name) => {
        logger.dbg('command: savePreset');

        if (!config) {
            logger.dbg('error saving preset: no config passed');
            return;
        }

        const promise: Thenable<string> = name !== undefined
            ? Promise.resolve(name)
            : vsc.window.showInputBox({ placeHolder: 'Name of the preset' });

        const chosenName = await promise;

        if (!chosenName && name === undefined) {
            vsc.window.showErrorMessage('Name can\'t be empty !');
            throw new Error('Name is empty');
        }

        const presets = extContext.globalState.get('presets', {});
        presets[chosenName] = config;
        logger.dbg('saved preset ' + chosenName);

        await extContext.globalState.update('presets', presets);
        return await ((name === undefined) && vsc.window.showInformationMessage('Preset saved !'));
    });

    presetCommand('loadPreset', async (presets, name, internal) => {
        logger.dbg('command: loadPreset');

        if (!presets || (!name && name !== '')) {
            logger.dbg('error loading presets');
            return;
        }

        await vsc.commands.executeCommand('uncrustify.create');
        await vsc.commands.executeCommand('uncrustify.save', presets[name]);

        if (!internal) {
            vsc.window.showInformationMessage('Preset loaded !');
        }
    });

    presetCommand('deletePreset', async (presets, name, internal) => {
        logger.dbg('command: deletePreset');

        if (!presets || (!name && name !== '')) {
            logger.dbg('error loading presets');
            return;
        }

        delete presets[name];
        await extContext.globalState.update('presets', presets);
        return await (!internal && vsc.window.showInformationMessage('Preset deleted !'));
    });

    vsc.commands.registerCommand('uncrustify.upgrade', async config => {
        logger.dbg('command: upgrade');

        if (!config) {
            logger.dbg('error upgrading config: no config passed');
            return;
        }

        await vsc.commands.executeCommand('uncrustify.savePreset', config, '');
        await vsc.commands.executeCommand('uncrustify.loadPreset', '');
        await vsc.commands.executeCommand('uncrustify.deletePreset', '');
        return await vsc.commands.executeCommand('vscode.open', vsc.Uri.file(util.configPath()));
    });
}

export function deactivate() {
    // do nothing
}

export { extContext };

function presetCommand(commandName: string, callback: (presets: any, name: string, internal: boolean) => any) {
    vsc.commands.registerCommand('uncrustify.' + commandName, async name => {
        logger.dbg('command: ' + commandName);

        const presets = extContext.globalState.get('presets', {});
        const names: string[] = [];

        for (const name in presets) {
            names.push(name);
        }

        if (names.length === 0) {
            vsc.window.showErrorMessage('No presets saved');
            return;
        }

        const promise: Thenable<string> = name !== undefined
            ? Promise.resolve(name)
            : vsc.window.showQuickPick(names);

        const chosenName = await promise;

        if (!chosenName && name === undefined) {
            throw new Error('No preset selected');
        }

        return callback(presets, chosenName, name !== undefined);
    });
}
