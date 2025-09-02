const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  target: 'web',
  entry: {
    'background/service-worker': './src/background/service-worker.ts',
    'content/main-content-script': './src/content/content-script.ts',
    'content/iframe-script': './src/content/iframe-script.ts',
    'popup/popup': './src/popup/popup.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
          'postcss-loader'
        ]
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    },
    fallback: {
      "process": false,
      "buffer": false,
      "util": false,
      "assert": false,
      "stream": false,
      "path": false,
      "fs": false,
      "os": false
    }
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      'process.env': '{}'
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '.' },
        { from: 'src/manifest.json', to: 'manifest.json' }
      ]
    }),
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup/popup.html',
      chunks: ['popup/popup']
    })
  ],
  optimization: {
    // CRITICAL: Disable chunking to ensure single file outputs
    splitChunks: false,
    runtimeChunk: false
  },
  devtool: 'source-map'
};
