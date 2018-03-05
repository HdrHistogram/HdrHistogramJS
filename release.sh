#!/bin/bash
rm -Rf dist
mkdir dist
cp -R node_modules dist/node_modules
cp -R src dist/src
cp *.json dist/
cp webpack.config.js dist/webpack.config.js
cd dist
yarn prepare-publish
