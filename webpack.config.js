var webpack = require('webpack'),
    path = require('path'),
    yargs = require('yargs');

var libraryName = 'hdr',
    plugins = [],
    outputFile;

if (yargs.argv.p) {
  plugins.push(new webpack.optimize.UglifyJsPlugin({ minimize: true }));
  outputFile = 'hdrhistogram.min.js';
} else {
  outputFile = 'hdrhistogram.js';
}

var config = {
  entry: [
    __dirname + '/src/index.ts'
  ],
  devtool: 'source-map',
  output: {
    path: path.join(__dirname, '/dist'),
    filename: outputFile,
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  module: {
    loaders: [
      { test: /\.tsx?$/, loader: 'ts', exclude: /node_modules/ }
    ]
  },
  resolve: {
    root: path.resolve('./src'),
    extensions: [ '', '.js', '.ts', '.jsx', '.tsx' ]
  },

  externals: {
    "pako": "pako",
    "pako/lib/deflate": "pako",
    "pako/lib/inflate": "pako"
  },

  plugins: plugins
};

module.exports = config;
