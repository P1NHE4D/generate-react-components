import fs from 'graceful-fs';
import path, { join, relative } from 'path';
import { promisify } from 'util';
import prompt from 'prompts';
import exit from 'exit';
import {
    getFunctionalJsxTemplate,
    getFunctionalTsxTemplate,
    getJsxTemplate,
    getTestTemplate,
    getTsxTemplate,
} from './template';
import logSymbols from 'log-symbols';
import { bold, red } from 'kleur';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

/**
 * Generates react component files
 * @param options dictionary containing the arguments set by the user
 * @param components component names provided by the user as an argument
 */
export async function buildReactComponent(options: { [key: string]: any }, components: string[]) {
    const dir = options.path || 'components';
    if (components.length === 0) {
        components = (
            await prompt({
                name: 'components',
                type: 'text',
                message: 'Enter component name(s):',
                format: formatInput,
                validate: (input) => {
                    return validateInput(input, dir);
                },
                onState: handleState,
            })
        ).components as string[];
    } else {
        const inputValid: string | boolean = await validateInput(components.join(' '), dir);
        if (typeof inputValid === 'string') {
            console.log(inputValid);
            exit(-1);
        }
    }

    const language: Extension = await chooseLanguage();

    const stylesheet: Extension = await chooseStylesheet();

    const filesToGenerate: Extension[] = [...(await chooseFilesToGenerate(language, stylesheet))];

    const stylesheetSelected: boolean = filesToGenerate.some((file: string) => {
        return file === 'css' || file === 'scss' || file === 'sass';
    });

    let writtenFiles: any[] = [];
    for (const component of components) {
        const componentName = component.trim();
        const outDir = join(dir, componentName);
        await mkdir(outDir, { recursive: true });

        const createTemplates = options.template;
        const functionalComponent = options.functional;

        writtenFiles = writtenFiles.concat(
            await Promise.all(
                filesToGenerate.map((extension) =>
                    writeFileByExtension(
                        outDir,
                        componentName,
                        extension,
                        createTemplates,
                        functionalComponent,
                        stylesheetSelected ? stylesheet : undefined,
                    ),
                ),
            ),
        );

        if (!writtenFiles) {
            return exit(-1);
        }
    }

    console.log();
    console.log(logSymbols.info, bold('The following files have been generated:'));
    writtenFiles.map((file) => console.log(`- ${relative(dir, file)}`));
    console.log();
    console.log(logSymbols.success, bold('Done'));
}

/**
 * Displays a select prompt to choose the language used by the consumer
 */
const chooseLanguage = async () =>
    (
        await prompt({
            name: 'language',
            type: 'select',
            message: 'Select language',
            choices: [
                { title: 'JavaScript (.jsx)', value: 'jsx' },
                { title: 'TypeScript (.tsx)', value: 'tsx' },
            ],
            initial: 1,
            onState: handleState,
        })
    ).language as Extension;

/**
 * Displays a select prompt to choose the stylesheet language used by the consumer
 */
const chooseStylesheet = async () =>
    (
        await prompt({
            name: 'stylesheet',
            type: 'select',
            message: 'Select stylesheet language',
            choices: [
                { title: 'css', value: 'css' },
                { title: 'scss', value: 'scss' },
                { title: 'sass', value: 'sass' },
            ],
            initial: 1,
            onState: handleState,
        })
    ).stylesheet as Extension;

/**
 * Displays a multi-select prompt to allow the consumer to select/deselect files to be generated
 */
const chooseFilesToGenerate = async (language: Extension, stylesheet: Extension) =>
    (
        await prompt({
            name: 'filesToGenerate',
            type: 'multiselect',
            message: 'Which files would you like to generate?',
            choices: [
                { value: `${language}`, title: `Component file (.${language})`, selected: true },
                { value: `${stylesheet}`, title: `Stylesheet (.${stylesheet})`, selected: true },
                {
                    value: `test.${language === 'jsx' ? 'js' : 'ts'}`,
                    title: `Tests (.test.${language === 'jsx' ? 'js' : 'ts'})`,
                    selected: true,
                },
            ] as any[],
            onState: handleState,
        })
    ).filesToGenerate as Extension[];

/**
 * Parses the component template and writes the files to the disk
 */
const writeFileByExtension = async (
    filePath: string,
    name: string,
    extension: Extension,
    createTemplates: boolean,
    functionalComponent: boolean,
    stylesheet?: Extension,
) => {
    const outFile = join(filePath, `${name}.${extension}`);

    const template = createTemplates ? getTemplateByExtension(name, extension, functionalComponent, stylesheet) : '';

    try {
        await writeFile(outFile, template, { flag: 'wx' });
    } catch (exception) {
        console.error(
            logSymbols.error,
            bold().red(`An unexpected error occured while writing the files. ${exception.message}`),
        );
        exit(-1);
    }

    return outFile;
};

/**
 * Gets the template for the file based on its extension
 */
const getTemplateByExtension = (
    componentName: string,
    extension: Extension,
    functionalComponent: boolean,
    stylesheet?: Extension,
) => {
    switch (extension) {
        case 'jsx':
            return functionalComponent
                ? getFunctionalJsxTemplate(componentName, stylesheet)
                : getJsxTemplate(componentName, stylesheet);
        case 'tsx':
            return functionalComponent
                ? getFunctionalTsxTemplate(componentName, stylesheet)
                : getTsxTemplate(componentName, stylesheet);
        case 'test.js':
            return getTestTemplate(componentName);
        case 'test.ts':
            return getTestTemplate(componentName);
        default:
            return '';
    }
};

/**
 * Removes leading and trailing whitespaces and converts input string to string array
 */
const formatInput = (val: string) => {
    val = val.trim();
    return val.split(' ');
};

/**
 * Terminates script if user interrupted the execution
 */
const handleState = (state: any) => {
    if (state.aborted) {
        exit(-1);
    }
};

/**
 * Validates the input passed by the user
 */
const validateInput = (input: string, outDir: string) => {
    if (input.trim() === '') {
        return 'Name of component may not be empty!';
    }
    const names: string[] = input.trim().split(' ');
    if (new Set(names).size !== names.length) {
        return 'Duplicates not allowed!';
    }
    for (const name of names) {
        if (fs.existsSync(path.join(outDir, name))) {
            return 'Component already exists!';
        }
    }
    return true;
};

export type Extension = 'js' | 'jsx' | 'ts' | 'tsx' | 'css' | 'scss' | 'sass' | 'test.js' | 'test.ts';
