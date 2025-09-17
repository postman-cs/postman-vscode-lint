//@ts-check
'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
const clientConfig = {
    target: 'node', // VS Code extensions run in Node.js context
    mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

    entry: './src/extension.ts', // the entry point of the extension
    output: {
        path: path.resolve(__dirname, 'lib'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },

    externals: {
        vscode: 'commonjs vscode' // the vscode-module is excluded from bundling
    },

    resolve: {
        // support reading TypeScript and JavaScript files
        extensions: ['.ts', '.js']
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    },

    devtool: 'source-map',
    infrastructureLogging: {
        level: "log", // enables logging required for problem matchers
    },
};

/**@type {import('webpack').Configuration}*/
const clientModuleConfig = {
    target: 'node',
    mode: 'none',

    entry: './src/client.ts', // the language client module
    output: {
        path: path.resolve(__dirname, 'lib'),
        filename: 'client.js',
        libraryTarget: 'commonjs2'
    },

    externals: {
        vscode: 'commonjs vscode'
    },

    resolve: {
        extensions: ['.ts', '.js']
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    },

    devtool: 'source-map'
};

module.exports = [clientConfig, clientModuleConfig];