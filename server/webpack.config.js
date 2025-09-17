//@ts-check
'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
const serverConfig = {
    target: 'node',
    mode: 'none',

    entry: './src/server.ts',
    output: {
        path: path.resolve(__dirname),
        filename: 'server.js',
        libraryTarget: 'commonjs2'
    },

    externals: {
        // vscode is not available in language server
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

module.exports = serverConfig;